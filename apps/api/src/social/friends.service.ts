import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Friendship } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';

export type Target = { userId?: string; username?: string };

type Eligible = { ageVerified: boolean; ageDeclaredAt: Date | null; suspendedAt: Date | null };
const isEligible = (u: Eligible) => !u.suspendedAt && (u.ageVerified || !!u.ageDeclaredAt);
const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002';

@Injectable()
export class FriendsService {
  constructor(private prisma: PrismaService, private push: PushService) {}

  // ---------- helpers (also used by ChatService) ----------

  isEligible = isEligible;

  /** Returns the friendship only if `userId` is part of it and it is ACCEPTED. */
  async acceptedFriendship(userId: string, friendshipId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f || f.status !== 'ACCEPTED' || (f.requesterId !== userId && f.addresseeId !== userId)) {
      throw new NotFoundException('Conversation not found');
    }
    return { friendship: f, otherId: f.requesterId === userId ? f.addresseeId : f.requesterId };
  }

  /** Public card (name, avatar, username) for a set of users. */
  async cards(ids: string[]) {
    if (ids.length === 0) return new Map<string, { id: string; name: string; avatarUrl: string | null; username: string | null }>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, avatarUrl: true, creator: { select: { username: true } } },
    });
    return new Map(users.map((u) => [u.id, { id: u.id, name: u.name, avatarUrl: u.avatarUrl, username: u.creator?.username ?? null }]));
  }

  private async resolveTarget(t: Target) {
    let userId = t.userId;
    if (!userId && t.username) {
      const p = await this.prisma.creatorProfile.findUnique({
        where: { username: t.username.toLowerCase() },
        select: { userId: true },
      });
      userId = p?.userId;
    }
    if (!userId) throw new BadRequestException('Specify userId or username');
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
    });
    if (!user || !isEligible(user)) throw new NotFoundException('User not found');
    return user;
  }

  private findBetween(a: string, b: string) {
    return this.prisma.friendship.findFirst({
      where: { OR: [{ requesterId: a, addresseeId: b }, { requesterId: b, addresseeId: a }] },
    });
  }

  private describe(me: string, targetId: string, f: Friendship | null) {
    if (!f) return { status: 'NONE', userId: targetId };
    switch (f.status) {
      case 'ACCEPTED':
        return { status: 'FRIENDS', friendshipId: f.id, userId: targetId };
      case 'BLOCKED':
        return { status: 'BLOCKED', byMe: f.requesterId === me, userId: targetId };
      case 'PENDING':
        return f.requesterId === me
          ? { status: 'OUTGOING', friendshipId: f.id, userId: targetId }
          : { status: 'INCOMING', friendshipId: f.id, userId: targetId };
      default: // DECLINED: the sender keeps seeing "request sent" so declining stays quiet
        return f.requesterId === me
          ? { status: 'OUTGOING', friendshipId: f.id, userId: targetId }
          : { status: 'NONE', userId: targetId };
    }
  }

  private async notify(userId: string, title: string, body: string) {
    // Never let a slow push service block the API response.
    await Promise.race([
      this.push.notifyUser(userId, title, body, { type: 'friend' }, 'chat').catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }

  // ---------- queries ----------

  async status(me: string, t: Target) {
    const target = await this.resolveTarget(t);
    if (target.id === me) return { status: 'SELF', userId: me };
    return this.describe(me, target.id, await this.findBetween(me, target.id));
  }

  async list(me: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const otherIds = rows.map((f) => (f.requesterId === me ? f.addresseeId : f.requesterId));
    const cards = await this.cards(otherIds);
    return rows
      .map((f, i) => ({ friendshipId: f.id, user: cards.get(otherIds[i]) }))
      .filter((x) => !!x.user);
  }

  async incoming(me: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { addresseeId: me, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const cards = await this.cards(rows.map((f) => f.requesterId));
    return rows
      .map((f) => ({ friendshipId: f.id, createdAt: f.createdAt, user: cards.get(f.requesterId) }))
      .filter((x) => !!x.user);
  }

  // ---------- actions ----------

  async request(me: string, t: Target) {
    const [self, target] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: me },
        select: { name: true, ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
      }),
      this.resolveTarget(t),
    ]);
    if (!isEligible(self)) throw new ForbiddenException('Age verification required');
    if (target.id === me) throw new BadRequestException('You cannot add yourself');

    const existing = await this.findBetween(me, target.id);

    if (!existing) {
      try {
        await this.prisma.friendship.create({ data: { requesterId: me, addresseeId: target.id } });
      } catch (e) {
        if (!isUnique(e)) throw e; // a parallel request created it first
      }
      await this.notify(target.id, 'New friend request', `${self.name} wants to be your friend`);
      return this.describe(me, target.id, await this.findBetween(me, target.id));
    }

    if (existing.status === 'ACCEPTED') return this.describe(me, target.id, existing);
    if (existing.status === 'BLOCKED') throw new ForbiddenException('You cannot send a friend request to this user');

    if (existing.status === 'PENDING') {
      if (existing.requesterId === me) return this.describe(me, target.id, existing); // already sent
      // They already asked me: adding them back accepts the request.
      const accepted = await this.prisma.friendship.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
      await this.notify(target.id, 'Friend request accepted', `${self.name} is now your friend`);
      return this.describe(me, target.id, accepted);
    }

    // DECLINED
    if (existing.requesterId === me) return this.describe(me, target.id, existing); // quiet: no new alert
    // I declined them before, now I am the one asking.
    await this.prisma.friendship.delete({ where: { id: existing.id } });
    await this.prisma.friendship.create({ data: { requesterId: me, addresseeId: target.id } });
    await this.notify(target.id, 'New friend request', `${self.name} wants to be your friend`);
    return this.describe(me, target.id, await this.findBetween(me, target.id));
  }

  async accept(me: string, friendshipId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f || f.addresseeId !== me || f.status !== 'PENDING') throw new NotFoundException('Request not found');
    const updated = await this.prisma.friendship.update({ where: { id: f.id }, data: { status: 'ACCEPTED' } });
    const self = await this.prisma.user.findUnique({ where: { id: me }, select: { name: true } });
    await this.notify(f.requesterId, 'Friend request accepted', `${self?.name ?? 'Someone'} is now your friend`);
    return this.describe(me, f.requesterId, updated);
  }

  async decline(me: string, friendshipId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f || f.addresseeId !== me || f.status !== 'PENDING') throw new NotFoundException('Request not found');
    await this.prisma.friendship.update({ where: { id: f.id }, data: { status: 'DECLINED' } });
    return { ok: true };
  }

  /** Unfriend, or cancel a request you sent. Messages are kept (not deleted) for moderation. */
  async remove(me: string, friendshipId: string) {
    const f = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!f || (f.requesterId !== me && f.addresseeId !== me)) throw new NotFoundException('Not found');
    const canCancel = f.status === 'PENDING' && f.requesterId === me;
    if (f.status !== 'ACCEPTED' && !canCancel) throw new BadRequestException('Nothing to remove');
    await this.prisma.friendship.delete({ where: { id: f.id } });
    return { ok: true };
  }

  async block(me: string, targetId: string) {
    if (targetId === me) throw new BadRequestException('You cannot block yourself');
    const exists = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!exists) throw new NotFoundException('User not found');

    const existing = await this.findBetween(me, targetId);
    if (existing?.status === 'BLOCKED') return { ok: true }; // already blocked, by me or by them
    await this.prisma.$transaction(async (tx) => {
      if (existing) await tx.friendship.delete({ where: { id: existing.id } });
      await tx.friendship.create({ data: { requesterId: me, addresseeId: targetId, status: 'BLOCKED' } });
    });
    return { ok: true };
  }

  async unblock(me: string, targetId: string) {
    await this.prisma.friendship.deleteMany({
      where: { requesterId: me, addresseeId: targetId, status: 'BLOCKED' },
    });
    return { ok: true };
  }
}
