import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  private async requireAdmin(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (u?.role !== 'ADMIN') throw new ForbiddenException('Admin only');
  }

  mine(userId: string) {
    return this.prisma.creatorApplication.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async apply(userId: string, dto: { username: string; bio?: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.ageVerified && !user.ageDeclaredAt) throw new ForbiddenException('Confirm your age first');
    if (user.role !== 'VIEWER') throw new BadRequestException('Your account is already a creator or admin account');

    const username = dto.username.toLowerCase();
    const [open, profile, pendingName] = await Promise.all([
      this.prisma.creatorApplication.findFirst({ where: { userId, status: 'PENDING' } }),
      this.prisma.creatorProfile.findUnique({ where: { username } }),
      this.prisma.creatorApplication.findFirst({ where: { username, status: 'PENDING' } }),
    ]);
    if (open) throw new BadRequestException('You already have a pending application');
    if (profile || pendingName) throw new BadRequestException('That username is taken');

    return this.prisma.creatorApplication.create({
      data: { userId, username, bio: dto.bio?.trim() || null },
    });
  }

  // ---------- admin ----------
  async adminList(adminId: string, status = 'PENDING') {
    await this.requireAdmin(adminId);
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) throw new BadRequestException('Bad status');
    const rows = await this.prisma.creatorApplication.findMany({
      where: { status: status as any },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true, ageDeclaredAt: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({ ...r, user: byId.get(r.userId) }));
  }

  /** Approving means YOU checked this person is 18+ and who they say they are (manual placeholder for ID verification). */
  async approve(adminId: string, id: string, note?: string) {
    await this.requireAdmin(adminId);
    try {
      return await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const res = await tx.creatorApplication.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', adminNote: note ?? null, reviewedAt: new Date(), reviewedBy: adminId },
        });
        if (res.count === 0) throw new BadRequestException('Application was already processed');

        const app = await tx.creatorApplication.findUniqueOrThrow({ where: { id } });
        await tx.user.update({ where: { id: app.userId }, data: { role: 'CREATOR', ageVerified: true } });
        await tx.creatorProfile.upsert({
          where: { userId: app.userId },
          update: { username: app.username, bio: app.bio, kycStatus: 'APPROVED' },
          create: { userId: app.userId, username: app.username, bio: app.bio, kycStatus: 'APPROVED' },
        });
        await tx.adminAction.create({
          data: { adminId, action: 'CREATOR_APPROVE', targetType: 'CreatorApplication', targetId: id, note },
        });
        return { ok: true };
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new BadRequestException('That username is already taken');
      throw e;
    }
  }

  async reject(adminId: string, id: string, note?: string) {
    await this.requireAdmin(adminId);
    const res = await this.prisma.creatorApplication.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', adminNote: note ?? null, reviewedAt: new Date(), reviewedBy: adminId },
    });
    if (res.count === 0) throw new BadRequestException('Application was already processed');
    await this.prisma.adminAction.create({
      data: { adminId, action: 'CREATOR_REJECT', targetType: 'CreatorApplication', targetId: id, note },
    });
    return { ok: true };
  }
}
