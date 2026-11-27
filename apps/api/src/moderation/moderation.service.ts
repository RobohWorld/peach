import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { PushService } from '../push/push.service';

export const REPORT_REASONS = [
  'NUDITY_SEXUAL',
  'HARASSMENT',
  'VIOLENCE',
  'SELF_HARM',
  'UNDERAGE',
  'ILLEGAL',
  'SPAM',
  'OTHER',
];

const SEVERE = new Set(['NUDITY_SEXUAL', 'VIOLENCE', 'SELF_HARM', 'UNDERAGE', 'ILLEGAL', 'NONCONSENSUAL']);

const MAX_REPORTS_PER_DAY = 20;
const FLAG_AFTER_REPORTERS = 5;

@Injectable()
export class ModerationService {
  constructor(
    private prisma: PrismaService,
    private livekit: LivekitService,
    private push: PushService,
  ) {}

  private async liveStream(streamId: string) {
    const stream = await this.prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream || stream.status !== 'LIVE') {
      throw new NotFoundException('Stream not live');
    }

    return stream;
  }

  private async isAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    return u?.role === 'ADMIN';
  }

  async requireAdmin(userId: string) {
    if (!(await this.isAdmin(userId))) {
      throw new ForbiddenException('Admin only');
    }
  }

  private async requireModerator(
    userId: string,
    stream: { creatorId: string },
  ) {
    if (stream.creatorId === userId) return;

    if (!(await this.isAdmin(userId))) {
      throw new ForbiddenException('Moderator only');
    }
  }

  // ---------- chat ----------

  async chat(userId: string, streamId: string, raw: string) {
    const stream = await this.liveStream(streamId);

    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 200);

    if (!text) {
      throw new BadRequestException('Empty message');
    }

    const restriction = await this.prisma.streamRestriction.findUnique({
      where: {
        streamId_userId: { streamId, userId },
      },
    });

    if (restriction?.kind === 'KICKED') {
      throw new ForbiddenException('You were removed from this stream');
    }

    if (restriction?.kind === 'MUTED') {
      throw new ForbiddenException('You are muted in this stream');
    }

    const isHost = stream.creatorId === userId;

    if (!isHost) {
      const wait = Math.max(stream.slowModeSeconds, 1);

      const last = await this.prisma.chatMessage.findFirst({
        where: { streamId, userId },
        orderBy: { createdAt: 'desc' },
      });

      if (last) {
        const elapsed =
          (Date.now() - last.createdAt.getTime()) / 1000;

        if (elapsed < wait) {
          throw new HttpException(
            `Slow mode: wait ${Math.ceil(wait - elapsed)}s`,
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    const [msg, user] = await Promise.all([
      this.prisma.chatMessage.create({
        data: { streamId, userId, text },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
    ]);

    await this.livekit.broadcast(stream.roomName, 'chat', {
      type: 'chat',
      id: msg.id,
      userId,
      from: user?.name ?? 'Someone',
      text,
      host: isHost,
    });

    return { ok: true, id: msg.id };
  }

  // ---------- host / admin tools ----------

  async setSlowMode(actorId: string, streamId: string, seconds: number) {
    const stream = await this.liveStream(streamId);

    await this.requireModerator(actorId, stream);

    await this.prisma.stream.update({
      where: { id: streamId },
      data: { slowModeSeconds: seconds },
    });

    await this.livekit.broadcast(stream.roomName, 'system', {
      type: 'slow',
      seconds,
    });

    return { ok: true, seconds };
  }

  async mute(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);

    await this.requireModerator(actorId, stream);

    if (targetUserId === stream.creatorId) {
      throw new BadRequestException('Cannot moderate the host');
    }

    const existing = await this.prisma.streamRestriction.findUnique({
      where: {
        streamId_userId: { streamId, userId: targetUserId },
      },
    });

    if (existing?.kind !== 'KICKED') {
      await this.prisma.streamRestriction.upsert({
        where: {
          streamId_userId: { streamId, userId: targetUserId },
        },
        update: { kind: 'MUTED' },
        create: {
          streamId,
          userId: targetUserId,
          kind: 'MUTED',
        },
      });
    }

    await this.livekit.broadcast(stream.roomName, 'system', {
      type: 'muted',
      userId: targetUserId,
    });

    return { ok: true };
  }

  async unmute(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);

    await this.requireModerator(actorId, stream);

    await this.prisma.streamRestriction.deleteMany({
      where: {
        streamId,
        userId: targetUserId,
        kind: 'MUTED',
      },
    });

    await this.livekit.broadcast(stream.roomName, 'system', {
      type: 'unmuted',
      userId: targetUserId,
    });

    return { ok: true };
  }

  async kick(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);

    await this.requireModerator(actorId, stream);

    if (targetUserId === stream.creatorId) {
      throw new BadRequestException('Cannot moderate the host');
    }

    await this.prisma.streamRestriction.upsert({
      where: {
        streamId_userId: { streamId, userId: targetUserId },
      },
      update: { kind: 'KICKED' },
      create: {
        streamId,
        userId: targetUserId,
        kind: 'KICKED',
      },
    });

    await this.livekit.broadcast(stream.roomName, 'system', {
      type: 'kicked',
      userId: targetUserId,
    });

    // await this.livekit.removeParticipant(stream.roomName, targetUserId);

    return { ok: true };
  }

  // ---------- reports ----------

  async report(
    reporterId: string,
    dto: {
      targetUserId?: string;
      streamId?: string;
      messageId?: string;
      mediaId?: string;
      reason: string;
      details?: string;
    },
  ) {
    let targetUserId = dto.targetUserId;

    let media: {
      id: string;
      creatorId: string;
      status: string;
      title: string;
    } | null = null;

    if (dto.mediaId) {
      media = await this.prisma.mediaItem.findUnique({
        where: { id: dto.mediaId },
        select: {
          id: true,
          creatorId: true,
          status: true,
          title: true,
        },
      });

      if (!media || media.status === 'REMOVED') {
        throw new NotFoundException('Content not found');
      }

      targetUserId = media.creatorId;
    }

    if (!targetUserId) {
      throw new BadRequestException('Nothing to report');
    }

    if (targetUserId === reporterId) {
      throw new BadRequestException('You cannot report yourself');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('User not found');
    }

    // Maximum 20 reports per user in the last 24 hours.
    const sentToday = await this.prisma.report.count({
      where: {
        reporterId,
        createdAt: {
          gt: new Date(Date.now() - 86_400_000),
        },
      },
    });

    if (sentToday >= MAX_REPORTS_PER_DAY) {
      throw new HttpException(
        'You have sent too many reports today',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Prevent duplicate open reports against the same target.
    const dup = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetUserId,
        status: 'OPEN',
        mediaId: dto.mediaId ?? null,
        streamId: dto.streamId ?? null,
        messageId: dto.messageId ?? null,
      },
      select: { id: true },
    });

    if (dup) {
      return {
        ok: true,
        id: dup.id,
        duplicate: true,
      };
    }

    const r = await this.prisma.report.create({
      data: {
        reporterId,
        targetUserId,
        streamId: dto.streamId,
        messageId: dto.messageId,
        mediaId: dto.mediaId,
        reason: dto.reason,
        details: dto.details,
      },
    });

    // Automatically hide flagged content when required.
    if (media && media.status === 'APPROVED') {
      await this.flagIfNeeded(media, dto.reason);
    }

    return {
      ok: true,
      id: r.id,
    };
  }

  // ---------- automatic content flagging ----------

  private async flagIfNeeded(
    media: {
      id: string;
      creatorId: string;
      title: string;
    },
    reason: string,
  ) {
    let flag = SEVERE.has(reason);

    // Non-severe content requires 5 different reporters.
    if (!flag) {
      const reporters = await this.prisma.report.findMany({
        where: {
          mediaId: media.id,
          status: 'OPEN',
        },
        select: { reporterId: true },
        distinct: ['reporterId'],
      });

      flag = reporters.length >= FLAG_AFTER_REPORTERS;
    }

    if (!flag) return;

    // Only update approved content.
    const res = await this.prisma.mediaItem.updateMany({
      where: {
        id: media.id,
        status: 'APPROVED',
      },
      data: {
        status: 'FLAGGED',
      },
    });

    if (res.count === 0) return;

    const p = await this.prisma.creatorProfile
      .findUnique({
        where: { userId: media.creatorId },
        select: { username: true },
      })
      .catch(() => null);

    // Notify the creator without blocking the report flow indefinitely.
    await Promise.race([
      this.push
        .notifyUser(
          media.creatorId,
          'Content hidden for review',
          `"${media.title}" is hidden while we review a report.`,
          {
            type: 'media',
            username: p?.username ?? null,
          },
          'default',
          'media',
        )
        .catch(() => undefined),

      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  // ---------- admin ----------

  async listReports(adminId: string) {
    await this.requireAdmin(adminId);

    const reports = await this.prisma.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const userIds = [
      ...new Set(
        reports.flatMap((r) => [r.reporterId, r.targetUserId]),
      ),
    ];

    const mediaIds = [
      ...new Set(
        reports
          .map((r) => r.mediaId)
          .filter(Boolean),
      ),
    ] as string[];

    const [users, media, counts] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          id: { in: userIds },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      }),

      mediaIds.length
        ? this.prisma.mediaItem.findMany({
            where: {
              id: { in: mediaIds },
            },
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
            },
          })
        : Promise.resolve([]),

      this.prisma.report.groupBy({
        by: ['targetUserId'],
        where: {
          status: 'OPEN',
          targetUserId: {
            in: [
              ...new Set(reports.map((r) => r.targetUserId)),
            ],
          },
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const byId = new Map(users.map((u) => [u.id, u]));
    const mById = new Map(media.map((m) => [m.id, m]));
    const cById = new Map(
      counts.map((c) => [c.targetUserId, c._count._all]),
    );

    return reports
      .map((r) => ({
        ...r,
        reporter: byId.get(r.reporterId),
        target: byId.get(r.targetUserId),
        severe: SEVERE.has(r.reason),
        media: r.mediaId
          ? mById.get(r.mediaId) ?? null
          : null,
        openAgainstTarget: cById.get(r.targetUserId) ?? 0,
      }))
      .sort(
        (a, b) => Number(b.severe) - Number(a.severe),
      );
  }

  async resolveReport(adminId: string, id: string) {
    await this.requireAdmin(adminId);

    await this.prisma.report.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    return { ok: true };
  }

  async adminEndStream(adminId: string, streamId: string) {
    await this.requireAdmin(adminId);

    const stream = await this.prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      throw new NotFoundException();
    }

    await this.prisma.stream.update({
      where: { id: streamId },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
      },
    });

    // await this.livekit.deleteRoom(stream.roomName);

    return { ok: true };
  }
}
