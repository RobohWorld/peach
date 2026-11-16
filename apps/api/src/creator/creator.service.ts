import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CreatorService {
  constructor(private prisma: PrismaService) {}

  async earnings(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });

    const now = Date.now();
    const DAY = 86400000;
    const [lifetime, entries] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { walletId: wallet.id, kind: 'GIFT_RECEIVED' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.ledgerEntry.findMany({
        where: { walletId: wallet.id, kind: 'GIFT_RECEIVED', createdAt: { gte: new Date(now - 30 * DAY) } },
        orderBy: { createdAt: 'desc' },
        take: 5000,
      }),
    ]);

    const last30Days = entries.reduce((a, e) => a + e.amount, 0);
    const last7Days = entries
      .filter((e) => e.createdAt.getTime() >= now - 7 * DAY)
      .reduce((a, e) => a + e.amount, 0);

    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: new Date(now - (6 - i) * DAY).toISOString().slice(0, 10),
      diamonds: 0,
    }));
    for (const e of entries) {
      const row = daily.find((d) => d.date === e.createdAt.toISOString().slice(0, 10));
      if (row) row.diamonds += e.amount;
    }

    const byGifter = new Map<string, number>();
    const byStream = new Map<string, number>();
    for (const e of entries) {
      if (e.counterpartyUserId) byGifter.set(e.counterpartyUserId, (byGifter.get(e.counterpartyUserId) ?? 0) + e.amount);
      if (e.streamId) byStream.set(e.streamId, (byStream.get(e.streamId) ?? 0) + e.amount);
    }
    const topG = [...byGifter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topS = [...byStream.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recentRaw = entries.slice(0, 15);

    const userIds = [...new Set([...topG.map((g) => g[0]), ...recentRaw.map((e) => e.counterpartyUserId).filter(Boolean) as string[]])];
    const streamIds = [...new Set([...topS.map((s) => s[0]), ...recentRaw.map((e) => e.streamId).filter(Boolean) as string[]])];
    const giftIds = [...new Set(recentRaw.map((e) => e.giftId).filter(Boolean) as string[])];

    const [users, streams, gifts] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      this.prisma.stream.findMany({ where: { id: { in: streamIds } }, select: { id: true, title: true } }),
      this.prisma.gift.findMany({ where: { id: { in: giftIds } }, select: { id: true, name: true, emoji: true } }),
    ]);
    const uName = new Map(users.map((u) => [u.id, u.name]));
    const sTitle = new Map(streams.map((s) => [s.id, s.title]));
    const gInfo = new Map(gifts.map((g) => [g.id, g]));

    return {
      diamondBalance: wallet.diamondBalance,
      lifetimeDiamonds: lifetime._sum.amount ?? 0,
      lifetimeGifts: lifetime._count,
      last7Days,
      last30Days,
      giftCount30d: entries.length,
      daily,
      topGifters: topG.map(([id, diamonds]) => ({ userId: id, name: uName.get(id) ?? 'Unknown', diamonds })),
      topStreams: topS.map(([id, diamonds]) => ({ streamId: id, title: sTitle.get(id) ?? 'Stream', diamonds })),
      recent: recentRaw.map((e) => ({
        at: e.createdAt,
        diamonds: e.amount,
        from: e.counterpartyUserId ? uName.get(e.counterpartyUserId) ?? 'Someone' : 'Someone',
        gift: e.giftId ? gInfo.get(e.giftId)?.name ?? 'Gift' : 'Gift',
        emoji: e.giftId ? gInfo.get(e.giftId)?.emoji ?? '🎁' : '🎁',
        stream: e.streamId ? sTitle.get(e.streamId) ?? '' : '',
      })),
    };
  }
}
