import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

export const ROOT_CAUSES = [
  'CREATOR_VIOLATION', 'CONTENT_MISMATCH', 'TECHNICAL_ISSUE', 'CREATOR_REQUEST', 'BUYER_ABUSE', 'OTHER',
] as const;
const CLAWBACK_DEFAULT = new Set<string>(['CREATOR_VIOLATION', 'CONTENT_MISMATCH']);
const STATUSES = ['PENDING', 'APPROVED', 'DENIED'] as const;
type Decision = 'APPROVED' | 'DENIED';
type DecideInput = { rootCause: string; note?: string; clawback?: boolean };

@Injectable()
export class RefundsService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  /** Called when an item is removed. Opens one PENDING case per buyer. Nothing is paid back yet. */
  async openCases(
    item: { id: string; creatorId: string; title: string },
    source: 'CREATOR_REMOVED' | 'ADMIN_REMOVED',
    reason?: string | null,
  ) {
    const purchases = await this.prisma.mediaPurchase.findMany({
      where: { mediaId: item.id }, select: { id: true, userId: true, coinsPaid: true }, take: 5000,
    });
    if (purchases.length === 0) return;
    const made = await this.prisma.refundRequest.createMany({
      data: purchases.map((p) => ({
        purchaseId: p.id, userId: p.userId, mediaId: item.id, creatorId: item.creatorId,
        coins: p.coinsPaid, source, reason: reason?.trim() || null,
      })),
      skipDuplicates: true,
    });
    if (made.count === 0) return;
    await Promise.race([
      this.push.notifyMany(
        purchases.map((p) => p.userId), 'Content removed',
        `"${item.title}" was removed. Your refund is under review.`,
        { type: 'refund' }, { storeAs: 'refund' },
      ),
      new Promise((r) => setTimeout(r, 8000)),
    ]).catch(() => undefined);
  }

  /** Cases grouped by item, with the context an admin needs to find the root cause. */
  async list(status = 'PENDING') {
    const st = (STATUSES as readonly string[]).includes(status) ? (status as (typeof STATUSES)[number]) : 'PENDING';
    const cases = await this.prisma.refundRequest.findMany({
      where: { status: st }, orderBy: { createdAt: 'asc' }, take: 500,
    });
    if (cases.length === 0) return [];

    const mediaIds = [...new Set(cases.map((c) => c.mediaId))];
    const creatorIds = [...new Set(cases.map((c) => c.creatorId))];
    const buyerIds = [...new Set(cases.map((c) => c.userId))];
    const since = new Date(Date.now() - 90 * 86_400_000);

    const [items, creators, profiles, buyers, caseCounts, removedCounts] = await Promise.all([
      this.prisma.mediaItem.findMany({ where: { id: { in: mediaIds } }, select: { id: true, title: true, type: true } }),
      this.prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } }),
      this.prisma.creatorProfile.findMany({ where: { userId: { in: creatorIds } }, select: { userId: true, username: true } }),
      this.prisma.user.findMany({ where: { id: { in: buyerIds } }, select: { id: true, name: true } }),
      this.prisma.refundRequest.groupBy({
        by: ['creatorId'], where: { creatorId: { in: creatorIds }, createdAt: { gte: since } }, _count: { _all: true },
      }),
      this.prisma.mediaItem.groupBy({
        by: ['creatorId'], where: { creatorId: { in: creatorIds }, status: 'REMOVED' }, _count: { _all: true },
      }),
    ]);

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const creatorMap = new Map(creators.map((u) => [u.id, u.name]));
    const usernameMap = new Map(profiles.map((p) => [p.userId, p.username]));
    const buyerMap = new Map(buyers.map((u) => [u.id, u.name]));
    const caseCount = new Map(caseCounts.map((r) => [r.creatorId, r._count._all]));
    const removedCount = new Map(removedCounts.map((r) => [r.creatorId, r._count._all]));

    const groups = new Map<string, any>();
    for (const c of cases) {
      let g = groups.get(c.mediaId);
      if (!g) {
        const it = itemMap.get(c.mediaId);
        g = {
          mediaId: c.mediaId, title: it?.title ?? '(deleted)', type: it?.type ?? null,
          source: c.source, reason: c.reason, createdAt: c.createdAt,
          rootCause: c.rootCause, adminNote: c.adminNote,
          creator: { id: c.creatorId, name: creatorMap.get(c.creatorId) ?? null, username: usernameMap.get(c.creatorId) ?? null },
          creatorStats: { refundCases90d: caseCount.get(c.creatorId) ?? 0, removedItems: removedCount.get(c.creatorId) ?? 0 },
          cases: 0, coins: 0, buyers: [] as { id: string; name: string | null; coins: number }[],
        };
        groups.set(c.mediaId, g);
      }
      g.cases += 1;
      g.coins += c.coins;
      if (g.buyers.length < 5) g.buyers.push({ id: c.userId, name: buyerMap.get(c.userId) ?? null, coins: c.coins });
    }
    return [...groups.values()];
  }

  /** One buyer (for exceptions, e.g. a suspected abuser). */
  async decide(adminId: string, id: string, decision: Decision, dto: DecideInput) {
    this.validate(decision, dto);
    const r = await this.decideOne(adminId, id, decision, dto.rootCause, dto.note, this.wantsClawback(dto));
    if (r.result !== 'skipped') await this.tell([r.userId], decision, r.mediaId, dto.note);
    return { ok: true, result: r.result };
  }

  /** Every pending buyer of one item. The root cause is a property of the item, so this is the normal path. */
  async decideForItem(adminId: string, mediaId: string, decision: Decision, dto: DecideInput) {
    this.validate(decision, dto);
    const clawback = this.wantsClawback(dto);
    const pending = await this.prisma.refundRequest.findMany({
      where: { mediaId, status: 'PENDING' }, select: { id: true }, orderBy: { createdAt: 'asc' }, take: 300,
    });
    const started = Date.now();
    const decided: string[] = [];
    let failed = 0;
    for (const c of pending) {
      if (Date.now() - started > 35_000) break;   // stay inside the function time limit; press again for the rest
      try {
        const r = await this.decideOne(adminId, c.id, decision, dto.rootCause, dto.note, clawback);
        if (r.result !== 'skipped') decided.push(r.userId);
      } catch { failed++; }
    }
    if (decided.length) await this.tell(decided, decision, mediaId, dto.note);
    const remaining = await this.prisma.refundRequest.count({ where: { mediaId, status: 'PENDING' } });
    return { ok: true, decided: decided.length, failed, remaining };
  }

  private validate(decision: Decision, dto: DecideInput) {
    if (!(ROOT_CAUSES as readonly string[]).includes(dto.rootCause)) throw new BadRequestException('Pick a root cause');
    if (decision === 'DENIED' && (dto.note ?? '').trim().length < 3) {
      throw new BadRequestException('Add a short reason: the buyer will see it');
    }
  }
  private wantsClawback(dto: DecideInput) {
    return dto.clawback ?? CLAWBACK_DEFAULT.has(dto.rootCause);
  }

  private async decideOne(
    adminId: string, id: string, decision: Decision, rootCause: string, note: string | undefined, clawback: boolean,
  ) {
    const rr = await this.prisma.refundRequest.findUnique({ where: { id } });
    if (!rr) throw new NotFoundException('Refund case not found');
    const base = { userId: rr.userId, mediaId: rr.mediaId };
    if (rr.status !== 'PENDING') return { ...base, result: 'skipped' as const };

    let clawed = 0;
    const done = await this.prisma.$transaction(async (tx) => {
      // Claim first: two admins pressing at once can never pay twice.
      const claim = await tx.refundRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: decision, rootCause, adminNote: note?.trim() || null, decidedAt: new Date(), decidedBy: adminId },
      });
      if (claim.count === 0) return false;

      if (decision === 'APPROVED') {
        const buyer = await tx.wallet.upsert({ where: { userId: rr.userId }, update: {}, create: { userId: rr.userId } });
        await tx.wallet.update({ where: { id: buyer.id }, data: { coinBalance: { increment: rr.coins } } });
        const entries: Prisma.LedgerEntryCreateManyInput[] = [{
          walletId: buyer.id, currency: 'COIN', amount: rr.coins, kind: 'CONTENT_REFUND',
          idempotencyKey: `refund:${id}:in`, counterpartyUserId: rr.creatorId,
        }];

        if (clawback) {
          // The exact diamonds the creator earned from this sale (key written by the unlock flow).
          const sale = await tx.ledgerEntry.findUnique({
            where: { idempotencyKey: `media:${rr.mediaId}:${rr.userId}:in` }, select: { amount: true },
          });
          const seller = await tx.wallet.findUnique({ where: { userId: rr.creatorId } });
          const take = seller && sale ? Math.min(sale.amount, seller.diamondBalance) : 0;  // never below zero
          if (seller && take > 0) {
            const d = await tx.wallet.updateMany({
              where: { id: seller.id, diamondBalance: { gte: take } }, data: { diamondBalance: { decrement: take } },
            });
            if (d.count === 0) throw new ConflictException('Balance changed, please try again');
            entries.push({
              walletId: seller.id, currency: 'DIAMOND', amount: -take, kind: 'CONTENT_CLAWBACK',
              idempotencyKey: `refund:${id}:out`, counterpartyUserId: rr.userId,
            });
            clawed = take;
          }
        }
        await tx.ledgerEntry.createMany({ data: entries });
        await tx.refundRequest.update({ where: { id }, data: { clawbackDiamonds: clawed } });
      }

      await tx.adminAction.create({
        data: {
          adminId, targetType: 'RefundRequest', targetId: id,
          action: decision === 'APPROVED' ? 'REFUND_APPROVE' : 'REFUND_DENY',
          note: `${rootCause}${decision === 'APPROVED' ? ` · ${rr.coins} coins back, ${clawed} diamonds clawed back` : ''}${note ? ` · ${note}` : ''}`,
        },
      });
      return true;
    });
    return { ...base, result: done ? (decision === 'APPROVED' ? 'approved' : 'denied') : ('skipped' as const) };
  }

  private async tell(userIds: string[], decision: Decision, mediaId: string, note?: string) {
    const item = await this.prisma.mediaItem.findUnique({ where: { id: mediaId }, select: { title: true } });
    const title = item?.title ?? 'your purchase';
    await Promise.race([
      this.push.notifyMany(
        userIds,
        decision === 'APPROVED' ? 'Refund approved' : 'Refund request closed',
        decision === 'APPROVED' ? `Your coins for "${title}" were returned.` : `No refund for "${title}".${note ? ` ${note.trim()}` : ''}`,
        { type: 'refund' }, { storeAs: 'refund' },
      ),
      new Promise((r) => setTimeout(r, 8000)),
    ]).catch(() => undefined);
  }

  pendingCount() { return this.prisma.refundRequest.count({ where: { status: 'PENDING' } }); }
}