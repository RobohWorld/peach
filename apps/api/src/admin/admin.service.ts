import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LivekitService } from '../livekit/livekit.service';
import { ModerationService } from '../moderation/moderation.service';

const SEVERE = ['UNDERAGE', 'NONCONSENSUAL', 'ILLEGAL'];

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private livekit: LivekitService,
    private mod: ModerationService,
  ) {}

  private audit(adminId: string, action: string, targetType: string, targetId: string, note?: string) {
    return this.prisma.adminAction.create({ data: { adminId, action, targetType, targetId, note } });
  }

  async overview(adminId: string) {
    await this.mod.requireAdmin(adminId);
    const [openReports, severeReports, liveStreams, pendingPayouts, pendingAgg] = await Promise.all([
      this.prisma.report.count({ where: { status: 'OPEN' } }),
      this.prisma.report.count({ where: { status: 'OPEN', reason: { in: SEVERE } } }),
      this.prisma.stream.count({ where: { status: 'LIVE' } }),
      this.prisma.payoutRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.payoutRequest.aggregate({ where: { status: 'PENDING' }, _sum: { diamonds: true, amountCents: true } }),
    ]);
    return {
      openReports,
      severeReports,
      liveStreams,
      pendingPayouts,
      pendingPayoutDiamonds: pendingAgg._sum.diamonds ?? 0,
      pendingPayoutCents: pendingAgg._sum.amountCents ?? 0,
    };
  }

  reports(adminId: string) {
    return this.mod.listReports(adminId);
  }

  async resolveReport(adminId: string, id: string, note?: string) {
    const r = await this.mod.resolveReport(adminId, id);
    await this.audit(adminId, 'REPORT_RESOLVE', 'Report', id, note);
    return r;
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

  async suspend(adminId: string, userId: string, reason: string) {
    await this.mod.requireAdmin(adminId);
    if (userId === adminId) throw new BadRequestException('You cannot suspend yourself');
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new ForbiddenException('Cannot suspend an admin');

    await this.prisma.user.update({ where: { id: userId }, data: { suspendedAt: new Date(), suspendReason: reason } });

    // End anything they are streaming right now.
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
