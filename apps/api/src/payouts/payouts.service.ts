import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const STATUSES = ['PENDING', 'APPROVED', 'PAID', 'REJECTED'];

@Injectable()
export class PayoutsService {
  constructor(private prisma: PrismaService) {}

  private get minDiamonds() { return Number(process.env.PAYOUT_MIN_DIAMONDS ?? 100); }
  private get centsPerDiamond() { return Number(process.env.DIAMOND_VALUE_CENTS ?? 1); }

  private async requireAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (u?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  // ---------- creator ----------
  async listMine(userId: string) {
    const requests = await this.prisma.payoutRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { minDiamonds: this.minDiamonds, centsPerDiamond: this.centsPerDiamond, requests };
  }

  async create(userId: string, dto: { diamonds: number; method: string; destination: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });
    if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
    if (process.env.ALLOW_DEV_ENDPOINTS !== 'true' && user.creator?.kycStatus !== 'APPROVED') {
      throw new ForbiddenException('KYC approval required before payouts');
    }
    if (dto.diamonds < this.minDiamonds) {
      throw new BadRequestException(`Minimum payout is ${this.minDiamonds} diamonds`);
    }
    const open = await this.prisma.payoutRequest.count({
      where: { userId, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (open >= 3) throw new BadRequestException('You already have 3 open payout requests');

    const amountCents = Math.floor(dto.diamonds * this.centsPerDiamond);

    // Diamonds are held (debited) immediately so a request can never be double-spent.
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const debited = await tx.wallet.updateMany({
        where: { id: wallet.id, diamondBalance: { gte: dto.diamonds } },
        data: { diamondBalance: { decrement: dto.diamonds } },
      });
      if (debited.count === 0) throw new BadRequestException('Not enough diamonds');

      const request = await tx.payoutRequest.create({
        data: { userId, diamonds: dto.diamonds, amountCents, method: dto.method, destination: dto.destination.trim() },
      });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id, currency: 'DIAMOND', amount: -dto.diamonds,
          kind: 'PAYOUT', idempotencyKey: `payout:${request.id}`,
        },
      });
      return request;
    });
  }

  // ---------- admin ----------
  async adminList(adminId: string, status?: string) {
    await this.requireAdmin(adminId);
    if (status && !STATUSES.includes(status)) throw new BadRequestException('Bad status');
    const rows = await this.prisma.payoutRequest.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, user: byId.get(r.userId) }));
  }

  private async transition(adminId: string, id: string, from: string[], to: 'APPROVED' | 'PAID', note?: string) {
    await this.requireAdmin(adminId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const res = await tx.payoutRequest.updateMany({
        where: { id, status: { in: from as any } },
        data: { status: to, adminNote: note ?? null, processedAt: new Date(), processedBy: adminId },
      });
      if (res.count === 0) throw new BadRequestException(`Request must be ${from.join(' or ')}`);
      await tx.adminAction.create({
        data: { adminId, action: `PAYOUT_${to}`, targetType: 'PayoutRequest', targetId: id, note },
      });
      return { ok: true };
    });
  }

  approve(adminId: string, id: string, note?: string) { return this.transition(adminId, id, ['PENDING'], 'APPROVED', note); }
  markPaid(adminId: string, id: string, note?: string) { return this.transition(adminId, id, ['APPROVED'], 'PAID', note); }

  async reject(adminId: string, id: string, note?: string) {
    await this.requireAdmin(adminId);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const res = await tx.payoutRequest.updateMany({
        where: { id, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'REJECTED', adminNote: note ?? null, processedAt: new Date(), processedBy: adminId },
      });
      if (res.count === 0) throw new BadRequestException('Request was already processed');

      // Give the held diamonds back.
      const req = await tx.payoutRequest.findUniqueOrThrow({ where: { id } });
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: req.userId } });
      await tx.wallet.update({ where: { id: wallet.id }, data: { diamondBalance: { increment: req.diamonds } } });
      await tx.ledgerEntry.create({
        data: {
          walletId: wallet.id, currency: 'DIAMOND', amount: req.diamonds,
          kind: 'ADJUSTMENT', idempotencyKey: `payout-refund:${id}`,
        },
      });
      await tx.adminAction.create({
        data: { adminId, action: 'PAYOUT_REJECTED', targetType: 'PayoutRequest', targetId: id, note },
      });
      return { ok: true };
    });
  }
}
