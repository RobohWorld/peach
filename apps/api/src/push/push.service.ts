import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const THROTTLE_MS = 30 * 60 * 1000; // at most one "is live" alert per creator per 30 minutes

@Injectable()
export class PushService {
  private log = new Logger('Push');
  constructor(private prisma: PrismaService) {}

  async register(userId: string, token: string, platform: string) {
    await this.prisma.pushToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    return { ok: true };
  }

  async unregister(userId: string, token: string) {
    await this.prisma.pushToken.deleteMany({ where: { token, userId } });
    return { ok: true };
  }

  private async send(messages: any[]) {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(chunk),
        });
        const json: any = await res.json();
        const dead: string[] = [];
        (json?.data ?? []).forEach((t: any, idx: number) => {
          if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') dead.push(chunk[idx].to);
        });
        if (dead.length) await this.prisma.pushToken.deleteMany({ where: { token: { in: dead } } });
      } catch (e) {
        this.log.warn(`push send failed: ${(e as Error).message}`);
      }
    }
  }

  /** Push to all of one user's registered devices (friend requests, chat messages). */
  async notifyUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    channelId = 'default',
  ) {
    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
      take: 20,
    });
    if (tokens.length === 0) return;
    await this.send(tokens.map((t) => ({ to: t.token, title, body, sound: 'default', channelId, data })));
  }

  async notifyFollowersLive(creatorId: string, creatorName: string, streamId: string, title: string) {
    const claimed = await this.prisma.creatorProfile.updateMany({
      where: {
        userId: creatorId,
        OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: new Date(Date.now() - THROTTLE_MS) } }],
      },
      data: { lastNotifiedAt: new Date() },
    });
    if (claimed.count === 0) return;

    const follows = await this.prisma.follow.findMany({
      where: { creatorId },
      select: { followerId: true },
      take: 5000,
    });
    if (follows.length === 0) return;

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: follows.map((f) => f.followerId) } },
      select: { token: true },
      take: 5000,
    });

    await this.send(
      tokens.map((t) => ({
        to: t.token,
        title: `${creatorName} is live`,
        body: title,
        sound: 'default',
        channelId: 'live',
        data: { type: 'live', streamId },
      })),
    );
  }
}
