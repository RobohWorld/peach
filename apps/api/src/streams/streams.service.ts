import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { PushService } from '../push/push.service';

@Injectable()
export class StreamsService {
  constructor(
    private prisma: PrismaService,
    private livekit: LivekitService,
    private push: PushService,
  ) {}

  // Clients can never publish data into a room. Chat goes through the API.
  private async token(identity: string, name: string, room: string, canPublish: boolean) {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      name,
      ttl: '2h',
    });
    at.addGrant({ room, roomJoin: true, canPublish, canPublishData: false, canSubscribe: true });
    return at.toJwt();
  }

  async listLive(userId: string, sort: string = 'popular', q?: string) {
    const term = q?.trim();
    let only: string[] | undefined;
    if (sort === 'following') {
      const f = await this.prisma.follow.findMany({ where: { followerId: userId }, select: { creatorId: true }, take: 1000 });
      only = f.map((x) => x.creatorId);
    }

    const streams = await this.prisma.stream.findMany({
      where: {
        status: 'LIVE',
        creator: { suspendedAt: null },
        ...(only ? { creatorId: { in: only } } : {}),
        ...(term && term.length >= 2
          ? {
              OR: [
                { title: { contains: term, mode: 'insensitive' as const } },
                { creator: { name: { contains: term, mode: 'insensitive' as const } } },
                { creator: { creator: { username: { contains: term, mode: 'insensitive' as const } } } },
              ],
            }
          : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 60,
      include: { creator: { select: { id: true, name: true, avatarUrl: true, creator: { select: { username: true } } } } },
    });

    const creatorIds = streams.map((s) => s.creatorId);
    const [viewers, counts, mine] = await Promise.all([
      this.livekit.viewerCounts(streams.map((s) => s.roomName)),
      this.prisma.follow.groupBy({ by: ['creatorId'], where: { creatorId: { in: creatorIds } }, _count: { _all: true } }),
      this.prisma.follow.findMany({ where: { followerId: userId, creatorId: { in: creatorIds } }, select: { creatorId: true } }),
    ]);
    const followers = new Map(counts.map((c) => [c.creatorId, c._count._all]));
    const following = new Set(mine.map((m) => m.creatorId));

    const out = streams.map((s) => ({
      id: s.id,
      title: s.title,
      startedAt: s.startedAt,
      creator: { id: s.creator.id, name: s.creator.name, avatarUrl: s.creator.avatarUrl, username: s.creator.creator?.username ?? null },
      viewers: viewers.get(s.roomName) ?? 0,
      followers: followers.get(s.creatorId) ?? 0,
      isFollowing: following.has(s.creatorId),
    }));

    if (sort === 'popular') {
      out.sort((a, b) => b.viewers - a.viewers || b.followers - a.followers || +new Date(b.startedAt) - +new Date(a.startedAt));
    }
    return out;
  }

  async start(userId: string, title: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });
    if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
    if (!user.ageVerified || user.creator?.kycStatus !== 'APPROVED') {
      throw new ForbiddenException('Age verification and KYC required');
    }
    const roomName = `room_${randomUUID()}`;
    const stream = await this.prisma.stream.create({ data: { creatorId: userId, title, roomName } });

    // Alert followers ("X is live"), but never let a slow push service block going live.
    await Promise.race([
      this.push.notifyFollowersLive(userId, user.name, stream.id, title).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]);

    return {
      stream,
      livekitUrl: process.env.LIVEKIT_URL,
      token: await this.token(userId, user.name, roomName, true),
    };
  }

  async join(userId: string, streamId: string) {
    const stream = await this.prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream || stream.status !== 'LIVE') throw new NotFoundException('Stream not live');
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const restriction = await this.prisma.streamRestriction.findUnique({
      where: { streamId_userId: { streamId, userId } },
    });
    if (restriction?.kind === 'KICKED') throw new ForbiddenException('You were removed from this stream');

    if (!user.ageVerified && !user.ageDeclaredAt) throw new ForbiddenException('Age verification required');

    const [profile, follow] = await Promise.all([
      this.prisma.creatorProfile.findUnique({ where: { userId: stream.creatorId }, select: { username: true } }),
      this.prisma.follow.findUnique({
        where: { followerId_creatorId: { followerId: userId, creatorId: stream.creatorId } },
      }),
    ]);

    return {
      stream,
      creator: { id: stream.creatorId, username: profile?.username ?? null, isFollowing: !!follow },
      muted: restriction?.kind === 'MUTED',
      livekitUrl: process.env.LIVEKIT_URL,
      token: await this.token(userId, user.name, stream.roomName, false),
    };
  }

  async end(userId: string, streamId: string) {
    const stream = await this.prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream) throw new NotFoundException();
    if (stream.creatorId !== userId) throw new ForbiddenException();
    const updated = await this.prisma.stream.update({
      where: { id: streamId },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    await this.livekit.deleteRoom(stream.roomName);
    return updated;
  }
}
