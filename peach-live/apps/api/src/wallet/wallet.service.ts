import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  getWallet(userId: string) {
    return this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
  }

  listGifts() {
    return this.prisma.gift.findMany({ orderBy: { coinPrice: 'asc' } });
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

    const rate = Number(process.env.GIFT_DIAMOND_RATE ?? 0.5);
    const diamonds = Math.floor(gift.coinPrice * rate);

    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const sender = await tx.wallet.findUniqueOrThrow({ where: { userId: senderId } });
        const receiver = await tx.wallet.findUniqueOrThrow({ where: { userId: stream.creatorId } });

        // Guarded decrement: count 0 if balance is insufficient, even under concurrency.
        const debited = await tx.wallet.updateMany({
          where: { id: sender.id, coinBalance: { gte: gift.coinPrice } },
          data: { coinBalance: { decrement: gift.coinPrice } },
        });
        if (debited.count === 0) throw new BadRequestException('Insufficient coins');

        await tx.wallet.update({ where: { id: receiver.id }, data: { diamondBalance: { increment: diamonds } } });

        await tx.ledgerEntry.createMany({
          data: [
            { walletId: sender.id, currency: 'COIN', amount: -gift.coinPrice, kind: 'GIFT_SENT',
              idempotencyKey: `${idempotencyKey}:out`, streamId, giftId },
            { walletId: receiver.id, currency: 'DIAMOND', amount: diamonds, kind: 'GIFT_RECEIVED',
              idempotencyKey: `${idempotencyKey}:in`, streamId, giftId },
          ],
        });

        const updated = await tx.wallet.findUniqueOrThrow({ where: { id: sender.id } });
        return { ok: true, coinBalance: updated.coinBalance, gift, diamondsToCreator: diamonds };
      });
    } catch (e) {
      // Unique violation on idempotencyKey = this exact tap was already processed.
      if ((e as { code?: string })?.code === 'P2002') {
        const w = await this.getWallet(senderId);
        return { ok: true, duplicate: true, coinBalance: w.coinBalance };
      }
      throw e;
    }
  }
}
