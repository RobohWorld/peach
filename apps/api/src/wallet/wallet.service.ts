import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerKind, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { SIGNUP_COINS } from './wallet.constants';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService, private livekit: LivekitService) {}

  private diamondRate() {
    return Number(process.env.GIFT_DIAMOND_RATE ?? 0.5);
  }

  /**
   * One-time signup grant (100,000 coins). Safe to call on every login:
   * the ledger idempotencyKey "signup:<userId>" guarantees it only ever lands once.
   */
  async grantSignupCoins(userId: string) {
    const key = `signup:${userId}`;
    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const already = await this.prisma.ledgerEntry.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    if (already) return wallet;

    try {
      await this.prisma.$transaction([
        this.prisma.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            currency: 'COIN',
            amount: SIGNUP_COINS,
            kind: 'SIGNUP_GRANT',
            idempotencyKey: key,
          },
        }),
        this.prisma.wallet.update({
          where: { id: wallet.id },
          data: { coinBalance: { increment: SIGNUP_COINS } },
        }),
      ]);
    } catch (e) {
      // P2002 = a parallel request already granted it. Anything else is a real error.
      if ((e as { code?: string })?.code !== 'P2002') throw e;
    }
    return this.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  }

  /** Returns the wallet, creating it and granting the signup coins first if needed. */
  async getWallet(userId: string) {
    await this.grantSignupCoins(userId);
    return this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  /** Newest first. Pass the last item's id as `cursor` to load the next page. */
  async listTransactions(userId: string, limit = 30, cursor?: string) {
    const wallet = await this.getWallet(userId);
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, currency: true, amount: true, kind: true,
        streamId: true, giftId: true, createdAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  listGifts() {
    return this.prisma.gift.findMany({ orderBy: { coinPrice: 'asc' } });
  }

  /**
   * Buyer pays coins, seller earns diamonds. Runs inside the caller's transaction so the caller
   * can add its own writes (e.g. the purchase record) and everything commits or rolls back together.
   * `idempotencyKey` must be unique per payment; two ledger rows are written as `<key>:out` / `<key>:in`.
   * Throws a Prisma P2002 error when the same key was already used.
   */
  async transferCoinsForDiamonds(
    tx: Prisma.TransactionClient,
    p: { buyerId: string; sellerId: string; coins: number; kindOut: LedgerKind; kindIn: LedgerKind; idempotencyKey: string },
  ) {
    if (!Number.isInteger(p.coins) || p.coins <= 0) throw new BadRequestException('Invalid amount');
    if (p.buyerId === p.sellerId) throw new BadRequestException('You cannot pay yourself');
    const diamonds = Math.floor(p.coins * this.diamondRate());

    const buyer = await tx.wallet.findUniqueOrThrow({ where: { userId: p.buyerId } });
    const seller = await tx.wallet.upsert({
      where: { userId: p.sellerId }, update: {}, create: { userId: p.sellerId },
    });

    // Guarded debit: only succeeds while the balance is sufficient
    const debited = await tx.wallet.updateMany({
      where: { id: buyer.id, coinBalance: { gte: p.coins } },
      data: { coinBalance: { decrement: p.coins } },
    });
    if (debited.count === 0) throw new BadRequestException('Insufficient coins');

    await tx.wallet.update({ where: { id: seller.id }, data: { diamondBalance: { increment: diamonds } } });

    await tx.ledgerEntry.createMany({
      data: [
        { walletId: buyer.id, currency: 'COIN', amount: -p.coins, kind: p.kindOut,
          idempotencyKey: `${p.idempotencyKey}:out`, counterpartyUserId: p.sellerId },
        { walletId: seller.id, currency: 'DIAMOND', amount: diamonds, kind: p.kindIn,
          idempotencyKey: `${p.idempotencyKey}:in`, counterpartyUserId: p.buyerId },
      ],
    });

    const updated = await tx.wallet.findUniqueOrThrow({ where: { id: buyer.id } });
    return { diamonds, coinBalance: updated.coinBalance };
  }

  /** Atomic: debit viewer coins, credit creator diamonds, write 2 ledger rows. Idempotent. */
  async sendGift(senderId: string, streamId: string, giftId: string, idempotencyKey: string) {
    const [stream, gift] = await Promise.all([
      this.prisma.stream.findUnique({ where: { id: streamId } }),
      this.prisma.gift.findUnique({ where: { id: giftId } }),
    ]);
    if (!stream || stream.status !== 'LIVE') throw new NotFoundException('Stream not live');
    if (!gift) throw new NotFoundException('Gift not found');
    if (stream.creatorId === senderId) throw new BadRequestException('Cannot gift yourself');

    const diamonds = Math.floor(gift.coinPrice * this.diamondRate());

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const sender = await tx.wallet.findUniqueOrThrow({ where: { userId: senderId } });
        const receiver = await tx.wallet.findUniqueOrThrow({ where: { userId: stream.creatorId } });

        const debited = await tx.wallet.updateMany({
          where: { id: sender.id, coinBalance: { gte: gift.coinPrice } },
          data: { coinBalance: { decrement: gift.coinPrice } },
        });
        if (debited.count === 0) throw new BadRequestException('Insufficient coins');

        await tx.wallet.update({ where: { id: receiver.id }, data: { diamondBalance: { increment: diamonds } } });

        await tx.ledgerEntry.createMany({
          data: [
            { walletId: sender.id, currency: 'COIN', amount: -gift.coinPrice, kind: 'GIFT_SENT',
              idempotencyKey: `${idempotencyKey}:out`, streamId, giftId, counterpartyUserId: stream.creatorId },
            { walletId: receiver.id, currency: 'DIAMOND', amount: diamonds, kind: 'GIFT_RECEIVED',
              idempotencyKey: `${idempotencyKey}:in`, streamId, giftId, counterpartyUserId: senderId },
          ],
        });

        const updated = await tx.wallet.findUniqueOrThrow({ where: { id: sender.id } });
        return { ok: true, coinBalance: updated.coinBalance, gift, diamondsToCreator: diamonds };
      });

      const user = await this.prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
      await this.livekit.broadcast(stream.roomName, 'gift', {
        type: 'gift',
        from: user?.name ?? 'Someone',
        userId: senderId,
        gift: gift.name,
        emoji: gift.emoji,
        coins: gift.coinPrice,
      });

      return result;
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        const w = await this.getWallet(senderId);
        return { ok: true, duplicate: true, coinBalance: w.coinBalance };
      }
      throw e;
    }
  }
}
