import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessToken } from 'livekit-server-sdk';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StreamsService {
  constructor(private prisma: PrismaService) {}

  private async token(identity: string, name: string, room: string, canPublish: boolean) {
    const at = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity,
      name,
      ttl: '2h',
    });
    at.addGrant({ room, roomJoin: true, canPublish, canPublishData: true, canSubscribe: true });
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
    // Production rule: creators must be age-verified + KYC approved.
    if (process.env.NODE_ENV === 'production' && (!user.ageVerified || user.creator?.kycStatus !== 'APPROVED')) {
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
    // Adult platform: viewers must be age-verified in production.
    if (process.env.NODE_ENV === 'production' && !user.ageVerified) {
      throw new ForbiddenException('Age verification required');
    }
    return {
      stream,
      livekitUrl: process.env.LIVEKIT_URL,
      token: await this.token(userId, user.name, stream.roomName, false),
    };
  }

  async end(userId: string, streamId: string) {
    const stream = await this.prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream) throw new NotFoundException();
    if (stream.creatorId !== userId) throw new ForbiddenException();
    return this.prisma.stream.update({ where: { id: streamId }, data: { status: 'ENDED', endedAt: new Date() } });
  }
}
