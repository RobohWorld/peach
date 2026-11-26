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

  async dashboard(userId: string, daysRaw?: number) {
  const days = daysRaw === 30 ? 30 : 7;
  const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
  const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });

  const DAY = 86_400_000;
  const now = Date.now();
  const since = new Date(now - days * DAY);
  const kinds = ['GIFT_RECEIVED', 'CONTENT_SALE', 'SUBSCRIPTION_EARNING', 'CONTENT_CLAWBACK'] as const;
  const where = { walletId: wallet.id, kind: { in: [...kinds] } };

  const [lifetimeRows, periodRows, entries, subs, followers, newFollowers, items, streams, openRefunds] =
    await Promise.all([
      this.prisma.ledgerEntry.groupBy({ by: ['kind'], where, _sum: { amount: true } }),
      this.prisma.ledgerEntry.groupBy({ by: ['kind'], where: { ...where, createdAt: { gte: since } }, _sum: { amount: true } }),
      this.prisma.ledgerEntry.findMany({
        where: { ...where, createdAt: { gte: since } }, select: { amount: true, createdAt: true }, take: 10000,
      }),
      this.prisma.subscription.findMany({
        where: { creatorId: userId }, select: { tier: true, status: true, currentPeriodEnd: true, createdAt: true }, take: 5000,
      }),
      this.prisma.follow.count({ where: { creatorId: userId } }),
      this.prisma.follow.count({ where: { creatorId: userId, createdAt: { gte: since } } }),
      this.prisma.mediaItem.findMany({
        where: { creatorId: userId, status: { not: 'REMOVED' } },
        select: { id: true, title: true, type: true, status: true }, take: 300,
      }),
      this.prisma.stream.findMany({ where: { creatorId: userId }, orderBy: { startedAt: 'desc' }, take: 8 }),
      this.prisma.refundRequest.count({ where: { creatorId: userId, status: 'PENDING' } }),
    ]);

  const pick = (rows: { kind: string; _sum: { amount: number | null } }[], k: string) =>
    rows.find((r) => r.kind === k)?._sum.amount ?? 0;
  const bySource = (rows: { kind: string; _sum: { amount: number | null } }[]) => {
    const o = {
      gifts: pick(rows, 'GIFT_RECEIVED'),
      content: pick(rows, 'CONTENT_SALE'),
      subscriptions: pick(rows, 'SUBSCRIPTION_EARNING'),
      refunds: pick(rows, 'CONTENT_CLAWBACK'), // negative: diamonds taken back after refunds
    };
    return { ...o, total: o.gifts + o.content + o.subscriptions + o.refunds };
  };

  const daily = Array.from({ length: days }, (_, i) => ({
    date: new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10),
    diamonds: 0,
  }));
  const dayIndex = new Map(daily.map((d, i) => [d.date, i]));
  for (const e of entries) {
    const i = dayIndex.get(e.createdAt.toISOString().slice(0, 10));
    if (i !== undefined) daily[i].diamonds += e.amount;
  }

  const live = subs.filter((x) => x.currentPeriodEnd.getTime() > now);
  const subscribers = {
    active: live.filter((x) => x.status === 'ACTIVE').length,
    cancelling: live.filter((x) => x.status !== 'ACTIVE').length,
    byTier: [1, 2, 3].map((tier) => ({ tier, count: live.filter((x) => x.tier === tier).length })),
    new: subs.filter((x) => x.createdAt >= since).length,
    lapsed: subs.filter((x) => x.currentPeriodEnd.getTime() <= now && x.currentPeriodEnd >= since).length,
  };

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const topSales = items.length
    ? await this.prisma.mediaPurchase.groupBy({
        by: ['mediaId'],
        where: { mediaId: { in: items.map((i) => i.id) }, createdAt: { gte: since } },
        _count: { _all: true },
        _sum: { coinsPaid: true },
        orderBy: { _sum: { coinsPaid: 'desc' } },
        take: 5,
      })
    : [];

  const streamIds = streams.map((s) => s.id);
  const streamGifts = streamIds.length
    ? await this.prisma.ledgerEntry.groupBy({
        by: ['streamId'],
        where: { walletId: wallet.id, kind: 'GIFT_RECEIVED', streamId: { in: streamIds } },
        _sum: { amount: true },
        _count: { _all: true },
      })
    : [];
  const giftsByStream = new Map(streamGifts.map((g) => [g.streamId, g]));

  return {
    days,
    diamondBalance: wallet.diamondBalance,
    period: bySource(periodRows),
    lifetime: bySource(lifetimeRows),
    daily,
    audience: { followers, newFollowers },
    subscribers,
    topContent: topSales.map((t) => ({
      mediaId: t.mediaId,
      title: itemMap.get(t.mediaId)?.title ?? 'Item',
      type: itemMap.get(t.mediaId)?.type ?? 'IMAGE',
      sales: t._count._all,
      coins: t._sum.coinsPaid ?? 0,
    })),
    streamHistory: streams.map((s) => ({
      streamId: s.id,
      title: s.title,
      startedAt: s.startedAt,
      live: s.status === 'LIVE',
      minutes: Math.max(1, Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60_000)),
      diamonds: giftsByStream.get(s.id)?._sum.amount ?? 0,
      gifts: giftsByStream.get(s.id)?._count._all ?? 0,
    })),
    needsAttention: {
      openRefundCases: openRefunds,
      flaggedItems: items.filter((i) => i.status === 'FLAGGED').length,
      pendingReview: items.filter((i) => i.status === 'PENDING').length,
    },
  };
}
}
