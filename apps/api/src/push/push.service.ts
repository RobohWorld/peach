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
    await this.prisma.pushToken.deleteMany({
      where: { token, userId },
    });

    return { ok: true };
  }

  /**
   * Store notifications in the user's inbox.
   */
  private async store(
    userIds: string[],
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) {
    if (userIds.length === 0) return;

    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type,
        title,
        body,
        data: data as any,
      })),
    });
  }

  private async send(messages: any[]) {
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);

      try {
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(chunk),
        });

        const json: any = await res.json();
        const dead: string[] = [];

        (json?.data ?? []).forEach((t: any, idx: number) => {
          if (
            t?.status === 'error' &&
            t?.details?.error === 'DeviceNotRegistered'
          ) {
            dead.push(chunk[idx].to);
          }
        });

        if (dead.length) {
          await this.prisma.pushToken.deleteMany({
            where: { token: { in: dead } },
          });
        }
      } catch (e) {
        this.log.warn(`push send failed: ${(e as Error).message}`);
      }
    }
  }

  /**
   * Push to all of one user's registered devices
   * (friend requests, chat messages).
   *
   * Optionally stores the notification in the inbox.
   */
  async notifyUser(
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    channelId = 'default',
    storeAs?: string,
  ) {
    if (storeAs) {
      await this.store([userId], storeAs, title, body, data)
        .catch((e) =>
          this.log.warn(`inbox store failed: ${(e as Error).message}`),
        );
    }

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId },
      select: { token: true },
      take: 20,
    });

    if (tokens.length === 0) return;

    await this.send(
      tokens.map((t) => ({
        to: t.token,
        title,
        body,
        sound: 'default',
        channelId,
        data,
      })),
    );
  }

  /**
   * One inbox row per user plus a single batched push.
   * Use this instead of looping notifyUser.
   */
  async notifyMany(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, unknown> = {},
    opts: { storeAs?: string; channelId?: string } = {},
  ) {
    const ids = [...new Set(userIds)].slice(0, 5000);

    if (ids.length === 0) {
      return { users: 0, devices: 0 };
    }

    if (opts.storeAs) {
      await this.store(ids, opts.storeAs, title, body, data)
        .catch((e) =>
          this.log.warn(`inbox store failed: ${(e as Error).message}`),
        );
    }

    const tokens = await this.prisma.pushToken.findMany({
      where: { userId: { in: ids } },
      select: { token: true },
      take: 10000,
    });

    await this.send(
      tokens.map((t) => ({
        to: t.token,
        title,
        body,
        sound: 'default',
        channelId: opts.channelId ?? 'default',
        data,
      })),
    );

    return {
      users: ids.length,
      devices: tokens.length,
    };
  }

  async notifyFollowersLive(
    creatorId: string,
    creatorName: string,
    streamId: string,
    title: string,
  ) {
    const claimed = await this.prisma.creatorProfile.updateMany({
      where: {
        userId: creatorId,
        OR: [
          { lastNotifiedAt: null },
          {
            lastNotifiedAt: {
              lt: new Date(Date.now() - THROTTLE_MS),
            },
          },
        ],
      },
      data: { lastNotifiedAt: new Date() },
    });

    if (claimed.count === 0) return;

    // Exclude followers who muted live notifications.
    const follows = await this.prisma.follow.findMany({
      where: {
        creatorId,
        muteLive: false,
      },
      select: { followerId: true },
      take: 5000,
    });

    if (follows.length === 0) return;

    // Store live notifications in the inbox.
    await this.store(
      follows.map((f) => f.followerId),
      'live',
      `${creatorName} is live`,
      title,
      { type: 'live', streamId },
    ).catch((e) =>
      this.log.warn(`inbox store failed: ${(e as Error).message}`),
    );

    // Existing push-token lookup remains unchanged.
    const tokens = await this.prisma.pushToken.findMany({
      where: {
        userId: { in: follows.map((f) => f.followerId) },
      },
      select: { token: true },
      take: 5000,
    });

    // Send push notifications.
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