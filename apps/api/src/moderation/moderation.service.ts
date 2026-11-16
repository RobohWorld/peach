import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';

export const REPORT_REASONS = ['SPAM', 'HARASSMENT', 'UNDERAGE', 'NONCONSENSUAL', 'ILLEGAL', 'OTHER'];
const SEVERE = new Set(['UNDERAGE', 'NONCONSENSUAL', 'ILLEGAL']);

@Injectable()
export class ModerationService {
  constructor(private prisma: PrismaService, private livekit: LivekitService) {}

  private async liveStream(streamId: string) {
    const stream = await this.prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream || stream.status !== 'LIVE') throw new NotFoundException('Stream not live');
    return stream;
  }

  private async isAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return u?.role === 'ADMIN';
  }

  async requireAdmin(userId: string) {
    if (!(await this.isAdmin(userId))) throw new ForbiddenException('Admin only');
  }

  private async requireModerator(userId: string, stream: { creatorId: string }) {
    if (stream.creatorId === userId) return;
    if (!(await this.isAdmin(userId))) throw new ForbiddenException('Moderator only');
  }

  // ---------- chat ----------
  async chat(userId: string, streamId: string, raw: string) {
    const stream = await this.liveStream(streamId);
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!text) throw new BadRequestException('Empty message');

    const restriction = await this.prisma.streamRestriction.findUnique({
      where: { streamId_userId: { streamId, userId } },
    });
    if (restriction?.kind === 'KICKED') throw new ForbiddenException('You were removed from this stream');
    if (restriction?.kind === 'MUTED') throw new ForbiddenException('You are muted in this stream');

    const isHost = stream.creatorId === userId;
    if (!isHost) {
      const wait = Math.max(stream.slowModeSeconds, 1); // always at least 1 message/second
      const last = await this.prisma.chatMessage.findFirst({
        where: { streamId, userId },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
        if (elapsed < wait) {
          throw new HttpException(`Slow mode: wait ${Math.ceil(wait - elapsed)}s`, HttpStatus.TOO_MANY_REQUESTS);
        }
      }
    }

    const [msg, user] = await Promise.all([
      this.prisma.chatMessage.create({ data: { streamId, userId, text } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    ]);

    await this.livekit.broadcast(stream.roomName, 'chat', {
      type: 'chat', id: msg.id, userId, from: user?.name ?? 'Someone', text, host: isHost,
    });
    return { ok: true, id: msg.id };
  }

  // ---------- host / admin tools ----------
  async setSlowMode(actorId: string, streamId: string, seconds: number) {
    const stream = await this.liveStream(streamId);
    await this.requireModerator(actorId, stream);
    await this.prisma.stream.update({ where: { id: streamId }, data: { slowModeSeconds: seconds } });
    await this.livekit.broadcast(stream.roomName, 'system', { type: 'slow', seconds });
    return { ok: true, seconds };
  }

  async mute(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);
    await this.requireModerator(actorId, stream);
    if (targetUserId === stream.creatorId) throw new BadRequestException('Cannot moderate the host');

    const existing = await this.prisma.streamRestriction.findUnique({
      where: { streamId_userId: { streamId, userId: targetUserId } },
    });
    if (existing?.kind !== 'KICKED') {
      await this.prisma.streamRestriction.upsert({
        where: { streamId_userId: { streamId, userId: targetUserId } },
        update: { kind: 'MUTED' },
        create: { streamId, userId: targetUserId, kind: 'MUTED' },
      });
    }
    await this.livekit.broadcast(stream.roomName, 'system', { type: 'muted', userId: targetUserId });
    return { ok: true };
  }

  async unmute(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);
    await this.requireModerator(actorId, stream);
    await this.prisma.streamRestriction.deleteMany({ where: { streamId, userId: targetUserId, kind: 'MUTED' } });
    await this.livekit.broadcast(stream.roomName, 'system', { type: 'unmuted', userId: targetUserId });
    return { ok: true };
  }

  async kick(actorId: string, streamId: string, targetUserId: string) {
    const stream = await this.liveStream(streamId);
    await this.requireModerator(actorId, stream);
    if (targetUserId === stream.creatorId) throw new BadRequestException('Cannot moderate the host');

    await this.prisma.streamRestriction.upsert({
      where: { streamId_userId: { streamId, userId: targetUserId } },
      update: { kind: 'KICKED' },
      create: { streamId, userId: targetUserId, kind: 'KICKED' },
    });
    await this.livekit.broadcast(stream.roomName, 'system', { type: 'kicked', userId: targetUserId });
    //await this.livekit.removeParticipant(stream.roomName, targetUserId);
    return { ok: true };
  }

  // ---------- reports ----------
  async report(
    reporterId: string,
    dto: { targetUserId: string; streamId?: string; messageId?: string; reason: string; details?: string },
  ) {
    if (dto.targetUserId === reporterId) throw new BadRequestException('You cannot report yourself');
    const target = await this.prisma.user.findUnique({ where: { id: dto.targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    const r = await this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        streamId: dto.streamId,
        messageId: dto.messageId,
        reason: dto.reason,
        details: dto.details,
      },
    });
    return { ok: true, id: r.id };
  }

  // ---------- admin ----------
  async listReports(adminId: string) {
    await this.requireAdmin(adminId);
    const reports = await this.prisma.report.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const ids = [...new Set(reports.flatMap((r) => [r.reporterId, r.targetUserId]))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return reports
      .map((r) => ({ ...r, reporter: byId.get(r.reporterId), target: byId.get(r.targetUserId), severe: SEVERE.has(r.reason) }))
      .sort((a, b) => Number(b.severe) - Number(a.severe));
  }

  async resolveReport(adminId: string, id: string) {
    await this.requireAdmin(adminId);
    await this.prisma.report.update({ where: { id }, data: { status: 'RESOLVED' } });
    return { ok: true };
  }

  async adminEndStream(adminId: string, streamId: string) {
    await this.requireAdmin(adminId);
    const stream = await this.prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream) throw new NotFoundException();
    await this.prisma.stream.update({ where: { id: streamId }, data: { status: 'ENDED', endedAt: new Date() } });
    //await this.livekit.deleteRoom(stream.roomName);
    return { ok: true };
  }
}
