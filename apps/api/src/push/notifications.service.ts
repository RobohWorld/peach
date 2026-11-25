import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, limit = 30, cursor?: string) {
    // keep each user's inbox bounded
    this.prisma.notification
      .deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - KEEP_MS) } } })
      .catch(() => undefined);

    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }
}