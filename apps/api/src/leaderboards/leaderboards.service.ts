import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

type Row = { walletId: string; _sum: { amount: number | null } };

@Injectable()
export class LeaderboardsService {
  constructor(private prisma: PrismaService) {}

  async top(period: string) {
    const span = period === 'day' ? DAY : period === 'month' ? 30 * DAY : period === 'all' ? 0 : 7 * DAY;
    const when = span ? { createdAt: { gte: new Date(Date.now() - span) } } : {};

    const [spent, earned] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['walletId'],
        where: { kind: 'GIFT_SENT', ...when },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'asc' } }, // amounts are negative: most negative = biggest spender
        take: 10,
      }),
      this.prisma.ledgerEntry.groupBy({
        by: ['walletId'],
        where: { kind: 'GIFT_RECEIVED', ...when },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
    ]);

    const wallets = await this.prisma.wallet.findMany({
      where: { id: { in: [...spent, ...earned].map((r) => r.walletId) } },
      select: { id: true, userId: true },
    });
    const walletUser = new Map(wallets.map((w) => [w.id, w.userId]));
    const users = await this.prisma.user.findMany({
      where: { id: { in: wallets.map((w) => w.userId) }, suspendedAt: null },
      select: { id: true, name: true, creator: { select: { username: true } } },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    const build = (list: Row[], sign: number) =>
      list
        .map((r) => {
          const u = byId.get(walletUser.get(r.walletId) ?? '');
          return u ? { name: u.name, username: u.creator?.username ?? null, total: sign * (r._sum.amount ?? 0) } : null;
        })
        .filter((x): x is { name: string; username: string | null; total: number } => !!x)
        .map((x, i) => ({ rank: i + 1, ...x }));

    return { period, gifters: build(spent as Row[], -1), creators: build(earned as Row[], 1) };
  }
}
