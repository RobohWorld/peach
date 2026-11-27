import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { ModerationService } from '../moderation/moderation.service';
import { MediaService } from '../media/media.service';
import { PushService } from '../push/push.service';

const SEVERE = ['NUDITY_SEXUAL', 'VIOLENCE', 'SELF_HARM', 'UNDERAGE', 'ILLEGAL', 'NONCONSENSUAL'];

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
  private livekit: LivekitService,
  private mod: ModerationService,
  private media: MediaService,
  private push: PushService,
  ) {}

  private audit(adminId: string, action: string, targetType: string, targetId: string, note?: string) {
    return this.prisma.adminAction.create({ data: { adminId, action, targetType, targetId, note } });
  }

  async overview(adminId: string) {
  await this.mod.requireAdmin(adminId);
  const [
    openReports, severeReports, liveStreams, pendingPayouts, pendingAgg,
    pendingApplications, pendingRefunds, flaggedContent,
  ] = await Promise.all([
    this.prisma.report.count({ where: { status: 'OPEN' } }),
    this.prisma.report.count({ where: { status: 'OPEN', reason: { in: SEVERE } } }),
    this.prisma.stream.count({ where: { status: 'LIVE' } }),
    this.prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
    this.prisma.payoutRequest.aggregate({ where: { status: 'PENDING' }, _sum: { diamonds: true, amountCents: true } }),
    this.prisma.creatorApplication.count({ where: { status: 'PENDING' } }),
    this.prisma.refundRequest.count({ where: { status: 'PENDING' } }),
    this.prisma.mediaItem.count({ where: { status: 'FLAGGED' } }),
  ]);
  return {
    openReports,
    severeReports,
    liveStreams,
    pendingPayouts,
    pendingApplications,
    pendingRefunds,
    flaggedContent,
    pendingPayoutDiamonds: pendingAgg._sum.diamonds ?? 0,
    pendingPayoutCents: pendingAgg._sum.amountCents ?? 0,
  };
}

  reports(adminId: string) {
    return this.mod.listReports(adminId);
  }

async resolveReport(adminId: string, id: string, dto: { action?: string; note?: string } = {}) {
  await this.mod.requireAdmin(adminId);
  const report = await this.prisma.report.findUnique({ where: { id } });
  if (!report) throw new NotFoundException('Report not found');
  if (report.status !== 'OPEN') return { ok: true, already: true };

  const action = dto.action ?? 'DISMISS';
  const note = dto.note?.trim() || undefined;
  let resolution: string;

  switch (action) {
    case 'REMOVE_CONTENT':
      if (!report.mediaId) throw new BadRequestException('This report is not about a piece of content');
      // Removal also opens refund cases for buyers and tells the creator.
      await this.media.review(adminId, report.mediaId, 'REMOVED', note ?? `Report: ${report.reason}`);
      resolution = 'CONTENT_REMOVED';
      break;
    case 'END_STREAM':
      if (!report.streamId) throw new BadRequestException('This report is not about a stream');
      await this.mod.adminEndStream(adminId, report.streamId);
      resolution = 'STREAM_ENDED';
      break;
    case 'SUSPEND':
      await this.suspend(adminId, report.targetUserId, note ?? `Report: ${report.reason}`);
      resolution = 'USER_SUSPENDED';
      break;
    case 'WARN':
      await this.push
        .notifyUser(
          report.targetUserId, 'Community guidelines warning',
          note ?? 'A report about your account or content was reviewed. Please follow the community guidelines.',
          { type: 'warning' }, 'default', 'warning',
        )
        .catch(() => undefined);
      resolution = 'WARNED';
      break;
    case 'DISMISS':
      resolution = 'DISMISSED';
      break;
    default:
      throw new BadRequestException('Unknown action');
  }

  // Removing content closes every open report about that item; other actions close just this one.
  const scope =
    action === 'REMOVE_CONTENT' && report.mediaId
      ? { mediaId: report.mediaId, status: 'OPEN' as const }
      : { id, status: 'OPEN' as const };
  const closing = await this.prisma.report.findMany({ where: scope, select: { reporterId: true } });
  await this.prisma.report.updateMany({
    where: scope,
    data: { status: 'RESOLVED', resolution, adminNote: note ?? null, resolvedBy: adminId, resolvedAt: new Date() },
  });

  // Hidden content comes back when nothing else is open against it.
  if (report.mediaId && (action === 'DISMISS' || action === 'WARN')) {
    const stillOpen = await this.prisma.report.count({ where: { mediaId: report.mediaId, status: 'OPEN' } });
    if (stillOpen === 0) {
      await this.prisma.mediaItem.updateMany({
        where: { id: report.mediaId, status: 'FLAGGED' }, data: { status: 'APPROVED' },
      });
    }
  }

  await this.audit(adminId, 'REPORT_RESOLVE', 'Report', id, `${resolution}${note ? `: ${note}` : ''}`);

  await Promise.race([
    this.push.notifyMany(
      [...new Set(closing.map((c) => c.reporterId))],
      'Report reviewed',
      resolution === 'DISMISSED'
        ? 'We reviewed your report and found no violation.'
        : 'We reviewed your report and took action. Thank you for helping keep Peach Live safe.',
      { type: 'report' }, { storeAs: 'report' },
    ),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]).catch(() => undefined);

  return { ok: true, resolution };
}

  async liveStreams(adminId: string) {
    await this.mod.requireAdmin(adminId);
    return this.prisma.stream.findMany({
      where: { status: 'LIVE' },
      orderBy: { startedAt: 'desc' },
      include: { creator: { select: { id: true, name: true, email: true } } },
    });
  }

  async endStream(adminId: string, streamId: string) {
    const r = await this.mod.adminEndStream(adminId, streamId);
    await this.audit(adminId, 'STREAM_END', 'Stream', streamId);
    return r;
  }

  async searchUsers(adminId: string, q: string) {
    await this.mod.requireAdmin(adminId);
    const term = (q ?? '').trim();
    if (term.length < 2) throw new BadRequestException('Type at least 2 characters');
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { wallet: true },
    });
    return users.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      suspendedAt: u.suspendedAt, suspendReason: u.suspendReason,
      ageVerified: u.ageVerified, ageDeclaredAt: u.ageDeclaredAt,
      coinBalance: u.wallet?.coinBalance ?? 0, diamondBalance: u.wallet?.diamondBalance ?? 0,
    }));
  }

  /** Test coins until real purchases exist. Logged in the ledger and the admin audit trail. */
  async grantCoins(adminId: string, userId: string, coins: number, note?: string) {
    await this.mod.requireAdmin(adminId);
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('User not found');
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.wallet.update({ where: { id: wallet.id }, data: { coinBalance: { increment: coins } } });
      await tx.ledgerEntry.create({
        data: { walletId: wallet.id, currency: 'COIN', amount: coins, kind: 'ADJUSTMENT', idempotencyKey: `grant:${randomUUID()}` },
      });
      await tx.adminAction.create({
        data: { adminId, action: 'COINS_GRANT', targetType: 'User', targetId: userId, note: `${coins} coins${note ? `: ${note}` : ''}` },
      });
    });
    return { ok: true };
  }

  async suspend(adminId: string, userId: string, reason: string) {
    await this.mod.requireAdmin(adminId);
    if (userId === adminId) throw new BadRequestException('You cannot suspend yourself');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot suspend an admin');

    await this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: new Date(), suspendReason: reason } });

    const live = await this.prisma.stream.findMany({ where: { creatorId: userId, status: 'LIVE' } });
    for (const st of live) {
      await this.prisma.stream.update({ where: { id: st.id }, data: { status: 'ENDED', endedAt: new Date() } });
      await this.livekit.deleteRoom(st.roomName);
    }
    await this.audit(adminId, 'USER_SUSPEND', 'User', userId, reason);
    return { ok: true, endedStreams: live.length };
  }

  async unsuspend(adminId: string, userId: string) {
    await this.mod.requireAdmin(adminId);
    await this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: null, suspendReason: null } });
    await this.audit(adminId, 'USER_UNSUSPEND', 'User', userId);
    return { ok: true };
  }
}
