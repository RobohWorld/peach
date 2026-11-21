import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Subscription } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { WalletService } from '../wallet/wallet.service';
import { PERIOD_MS, TIERS, TIER_NUMBERS } from './subscriptions.constants';

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002';
const validTier = (t: unknown): t is number => Number.isInteger(t) && TIER_NUMBERS.includes(t as number);

// Subscription lifecycle
//   ACTIVE     renews automatically at currentPeriodEnd (charged in coins)
//   CANCELLED  keeps access until currentPeriodEnd, then becomes EXPIRED
//   EXPIRED    no access (cancelled and ended, or renewal failed)
// A higher tier is charged right away (prorated difference); a lower tier starts at the next renewal.
@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private push: PushService,
  ) {}

  private async notify(userId: string, title: string, body: string) {
    await Promise.race([
      this.push.notifyUser(userId, title, body, { type: 'subscription' }, 'chat').catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  private findSub(subscriberId: string, creatorId: string) {
    return this.prisma.subscription.findUnique({ where: { subscriberId_creatorId: { subscriberId, creatorId } } });
  }

  // ---------- access ----------

  /** The tier (1-3) this user currently has with the creator, or 0. Renews on the spot if a renewal is due. */
  async activeTier(userId: string, creatorId: string): Promise<number> {
    let sub = await this.findSub(userId, creatorId);
    if (!sub) return 0;
    if (sub.status !== 'EXPIRED' && sub.currentPeriodEnd <= new Date()) {
      await this.renewIfDue(sub); // renews an ACTIVE one, closes a CANCELLED one
      sub = await this.findSub(userId, creatorId);
      if (!sub) return 0;
    }
    const live = (sub.status === 'ACTIVE' || sub.status === 'CANCELLED') && sub.currentPeriodEnd > new Date();
    return live ? sub.tier : 0;
  }

  // ---------- renewals ----------

  /** Renews one subscription whose period ended. Safe to call from several places at once. */
  async renewIfDue(sub: Subscription): Promise<'renewed' | 'expired' | 'skipped'> {
    const now = new Date();
    if (sub.currentPeriodEnd > now) return 'skipped';

    if (sub.status !== 'ACTIVE') {
      if (sub.status === 'CANCELLED') {
        await this.prisma.subscription.updateMany({
          where: { id: sub.id, status: 'CANCELLED', currentPeriodEnd: sub.currentPeriodEnd },
          data: { status: 'EXPIRED' },
        });
        return 'expired';
      }
      return 'skipped';
    }

    const [subscriber, creator] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: sub.subscriberId }, select: { suspendedAt: true } }),
      this.prisma.user.findUnique({ where: { id: sub.creatorId }, select: { suspendedAt: true, name: true } }),
    ]);
    const expire = async (why: string) => {
      const r = await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE', currentPeriodEnd: sub.currentPeriodEnd },
        data: { status: 'EXPIRED' },
      });
      if (r.count > 0) await this.notify(sub.subscriberId, 'Subscription ended', why);
      return 'expired' as const;
    };
    if (!subscriber || subscriber.suspendedAt || !creator || creator.suspendedAt) return expire('Your subscription has ended.');

    const tier = sub.nextTier && validTier(sub.nextTier) ? sub.nextTier : sub.tier;
    const price = TIERS[tier].price;
    const prevEnd = sub.currentPeriodEnd;
    // Keep the renewal date steady; only restart from today if the renewal is more than a period late.
    const start = now.getTime() - prevEnd.getTime() > PERIOD_MS ? now : prevEnd;
    const newEnd = new Date(start.getTime() + PERIOD_MS);

    try {
      const renewed = await this.prisma.$transaction(async (tx) => {
        // Claim first: if another request already renewed it, nothing is charged twice.
        const claim = await tx.subscription.updateMany({
          where: { id: sub.id, status: 'ACTIVE', currentPeriodEnd: prevEnd },
          data: { tier, nextTier: null, currentPeriodEnd: newEnd },
        });
        if (claim.count === 0) return false;
        await this.wallet.transferCoinsForDiamonds(tx, {
          buyerId: sub.subscriberId, sellerId: sub.creatorId, coins: price,
          kindOut: 'SUBSCRIPTION_CHARGE', kindIn: 'SUBSCRIPTION_EARNING',
          idempotencyKey: `sub:${sub.id}:${newEnd.getTime()}`,
        });
        return true;
      });
      return renewed ? 'renewed' : 'skipped';
    } catch (e) {
      if (e instanceof BadRequestException) {
        return expire(`Not enough coins to renew your ${TIERS[tier].name} subscription to ${creator.name}.`);
      }
      if (isUnique(e)) return 'skipped';
      throw e;
    }
  }

  /** Called daily by the cron endpoint: renews what is due and closes cancelled subscriptions. */
  async runRenewals() {
    const startedAt = Date.now();
    const due = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'CANCELLED'] }, currentPeriodEnd: { lte: new Date() } },
      orderBy: { currentPeriodEnd: 'asc' },
      take: 300,
    });
    const out = { checked: due.length, renewed: 0, expired: 0, skipped: 0, failed: 0 };
    for (const sub of due) {
      if (Date.now() - startedAt > 40_000) break; // stay inside the function time limit; the rest runs tomorrow
      try { out[await this.renewIfDue(sub)]++; } catch { out.failed++; }
    }
    return out;
  }

  // ---------- creator settings ----------

  private async assertCreator(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });
    if (user.role !== 'CREATOR' || !user.creator) throw new ForbiddenException('Creator account required');
    return user;
  }

  async setEnabledTiers(userId: string, tiers: number[]) {
    await this.assertCreator(userId);
    const clean = [...new Set(tiers)].filter(validTier).sort();
    if (clean.length !== new Set(tiers).size) throw new BadRequestException('Tiers must be 1, 2 or 3');
    await this.prisma.creatorProfile.update({ where: { userId }, data: { enabledTiers: clean } });
    return { enabledTiers: clean };
  }

  // ---------- subscribing ----------

  private async resolveCreator(username: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { username: username.toLowerCase() },
      select: { userId: true, enabledTiers: true, username: true },
    });
    if (!profile) throw new NotFoundException('Creator not found');
    const user = await this.prisma.user.findUnique({ where: { id: profile.userId }, select: { suspendedAt: true, name: true } });
    if (!user || user.suspendedAt) throw new NotFoundException('Creator not found');
    return { ...profile, name: user.name };
  }

  private view(sub: Subscription | null) {
    if (!sub) return null;
    return {
      id: sub.id, tier: sub.tier, tierName: TIERS[sub.tier]?.name, status: sub.status,
      nextTier: sub.nextTier, currentPeriodEnd: sub.currentPeriodEnd,
      active: (sub.status === 'ACTIVE' || sub.status === 'CANCELLED') && sub.currentPeriodEnd > new Date(),
    };
  }

  async tierInfo(viewerId: string, username: string) {
    const c = await this.resolveCreator(username);
    const isMe = c.userId === viewerId;
    const tiers = TIER_NUMBERS.map((t) => ({
      tier: t, name: TIERS[t].name, price: TIERS[t].price, enabled: c.enabledTiers.includes(t),
    }));
    if (isMe) {
      const subscribers = await this.prisma.subscription.count({
        where: { creatorId: c.userId, status: { in: ['ACTIVE', 'CANCELLED'] }, currentPeriodEnd: { gt: new Date() } },
      });
      return { isMe, tiers, subscribers, mine: null };
    }
    let sub = await this.findSub(viewerId, c.userId);
    if (sub && sub.status !== 'EXPIRED' && sub.currentPeriodEnd <= new Date()) {
      await this.renewIfDue(sub);
      sub = await this.findSub(viewerId, c.userId);
    }
    return { isMe, tiers, mine: this.view(sub) };
  }

  async subscribe(userId: string, username: string, tier: number) {
    if (!validTier(tier)) throw new BadRequestException('Choose tier 1, 2 or 3');
    const [creator, self] = await Promise.all([
      this.resolveCreator(username),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId }, select: { name: true, ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
      }),
    ]);
    if (creator.userId === userId) throw new BadRequestException('You cannot subscribe to yourself');
    if (self.suspendedAt || (!self.ageVerified && !self.ageDeclaredAt)) throw new ForbiddenException('Age verification required');

    const now = new Date();
    const existing = await this.findSub(userId, creator.userId);
    const live = !!existing && (existing.status === 'ACTIVE' || existing.status === 'CANCELLED') && existing.currentPeriodEnd > now;

    // Changing to a tier the creator no longer offers is not allowed. Keeping your current tier always is.
    if (!(live && existing!.tier === tier) && !creator.enabledTiers.includes(tier)) {
      throw new BadRequestException('This creator does not offer that tier');
    }

    // ---- Existing, still running ----
    if (live && existing) {
      if (tier === existing.tier) {
        if (existing.status === 'CANCELLED' || existing.nextTier) {
          const r = await this.prisma.subscription.updateMany({
            where: { id: existing.id, currentPeriodEnd: existing.currentPeriodEnd },
            data: { status: 'ACTIVE', nextTier: null },
          });
          if (r.count === 0) throw new ConflictException('Please try again');
        }
        return this.view(await this.findSub(userId, creator.userId));
      }

      if (tier < existing.tier) {
        // Downgrade starts at the next renewal: no charge, no refund.
        const r = await this.prisma.subscription.updateMany({
          where: { id: existing.id, currentPeriodEnd: existing.currentPeriodEnd },
          data: { status: 'ACTIVE', nextTier: tier },
        });
        if (r.count === 0) throw new ConflictException('Please try again');
        return this.view(await this.findSub(userId, creator.userId));
      }

      // Upgrade: pay the price difference for the time left in this period.
      const remaining = existing.currentPeriodEnd.getTime() - now.getTime();
      const charge = Math.max(1, Math.ceil(((TIERS[tier].price - TIERS[existing.tier].price) * remaining) / PERIOD_MS));
      try {
        await this.prisma.$transaction(async (tx) => {
          const claim = await tx.subscription.updateMany({
            where: { id: existing.id, tier: existing.tier, currentPeriodEnd: existing.currentPeriodEnd },
            data: { tier, status: 'ACTIVE', nextTier: null },
          });
          if (claim.count === 0) throw new ConflictException('Please try again');
          await this.wallet.transferCoinsForDiamonds(tx, {
            buyerId: userId, sellerId: creator.userId, coins: charge,
            kindOut: 'SUBSCRIPTION_CHARGE', kindIn: 'SUBSCRIPTION_EARNING',
            idempotencyKey: `sub:${existing.id}:up${tier}:${existing.currentPeriodEnd.getTime()}`,
          });
        });
      } catch (e) {
        if (isUnique(e)) throw new ConflictException('You already upgraded to this tier in this period');
        throw e;
      }
      await this.notify(creator.userId, 'Subscriber upgraded', `${self.name} upgraded to ${TIERS[tier].name}`);
      return this.view(await this.findSub(userId, creator.userId));
    }

    // ---- New, or the old one ended: full price, a fresh 30 day period ----
    const price = TIERS[tier].price;
    const newEnd = new Date(now.getTime() + PERIOD_MS);
    const id = existing?.id ?? randomUUID();
    try {
      await this.prisma.$transaction(async (tx) => {
        if (existing) {
          const claim = await tx.subscription.updateMany({
            where: { id: existing.id, status: existing.status, currentPeriodEnd: existing.currentPeriodEnd },
            data: { tier, status: 'ACTIVE', nextTier: null, currentPeriodEnd: newEnd },
          });
          if (claim.count === 0) throw new ConflictException('Please try again');
        } else {
          await tx.subscription.create({
            data: { id, subscriberId: userId, creatorId: creator.userId, tier, currentPeriodEnd: newEnd },
          });
        }
        await this.wallet.transferCoinsForDiamonds(tx, {
          buyerId: userId, sellerId: creator.userId, coins: price,
          kindOut: 'SUBSCRIPTION_CHARGE', kindIn: 'SUBSCRIPTION_EARNING',
          idempotencyKey: `sub:${id}:${newEnd.getTime()}`,
        });
      });
    } catch (e) {
      if (isUnique(e)) throw new ConflictException('Already subscribed. Please refresh.');
      throw e;
    }
    await this.notify(creator.userId, 'New subscriber', `${self.name} subscribed (${TIERS[tier].name})`);
    return this.view(await this.findSub(userId, creator.userId));
  }

  /** Stops auto-renewal. Access continues until the period ends. */
  async cancel(userId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId } });
    if (!sub || sub.subscriberId !== userId) throw new NotFoundException('Subscription not found');
    if (sub.status === 'ACTIVE') {
      await this.prisma.subscription.updateMany({
        where: { id: sub.id, status: 'ACTIVE' }, data: { status: 'CANCELLED', nextTier: null },
      });
    }
    return this.view(await this.prisma.subscription.findUnique({ where: { id: sub.id } }));
  }

  /** The user's current subscriptions (running or cancelled but still valid). */
  async mine(userId: string) {
    let subs = await this.prisma.subscription.findMany({
      where: { subscriberId: userId, status: { in: ['ACTIVE', 'CANCELLED'] } },
      orderBy: { currentPeriodEnd: 'desc' },
      take: 100,
    });
    // Renew anything that is due before showing it
    const due = subs.filter((s) => s.currentPeriodEnd <= new Date());
    if (due.length) {
      for (const s of due) { try { await this.renewIfDue(s); } catch { /* shown as-is */ } }
      subs = await this.prisma.subscription.findMany({
        where: { subscriberId: userId, status: { in: ['ACTIVE', 'CANCELLED'] }, currentPeriodEnd: { gt: new Date() } },
        orderBy: { currentPeriodEnd: 'desc' },
        take: 100,
      });
    }
    const profiles = await this.prisma.creatorProfile.findMany({
      where: { userId: { in: subs.map((s) => s.creatorId) } },
      select: { userId: true, username: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: subs.map((s) => s.creatorId) } },
      select: { id: true, name: true },
    });
    const uname = new Map<string, string>();
    for (const p of profiles) uname.set(p.userId, p.username);
    const dname = new Map<string, string>();
    for (const u of users) dname.set(u.id, u.name);
    return subs.map((s) => ({
      ...this.view(s),
      creatorName: dname.get(s.creatorId) ?? '',
      creatorUsername: uname.get(s.creatorId) ?? null,
    }));
  }
}
