import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';

@Injectable()
export class StreamsService {
  constructor(private prisma: PrismaService, private livekit: LivekitService) {}

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

  listLive() {
    return this.prisma.stream.findMany({
      where: { status: 'LIVE' },
      orderBy: { startedAt: 'desc' },
      include: { creator: { select: { id: true, name: true, avatarUrl: true } } },
    });
  }

  async start(userId: string, title: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });
    if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
    if (process.env.ALLOW_DEV_ENDPOINTS !== 'true' && (!user.ageVerified || user.creator?.kycStatus !== 'APPROVED')) {
      throw new ForbiddenException('Age verification and KYC required');
    }
    const roomName = `room_${randomUUID()}`;
    const stream = await this.prisma.stream.create({ data: { creatorId: userId, title, roomName } });
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

    if (process.env.ALLOW_DEV_ENDPOINTS !== 'true' && !user.ageVerified) {
      throw new ForbiddenException('Age verification required');
    }
    return {
      stream,
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
