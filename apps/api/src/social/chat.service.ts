import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { DirectMessage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import { FriendsService } from './friends.service';

const MAX_TEXT = 500;

const toDto = (m: DirectMessage) => ({
  id: m.id, senderId: m.senderId, text: m.text, createdAt: m.createdAt, readAt: m.readAt,
});

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private friends: FriendsService,
    private push: PushService,
  ) {}

  private async acceptedIds(me: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: me }, { addresseeId: me }] },
      select: { id: true, requesterId: true, addresseeId: true, createdAt: true },
      take: 500,
    });
    return rows;
  }

  /** Friends with their last message and unread count, newest activity first. */
  async conversations(me: string) {
    const friendships = await this.acceptedIds(me);
    if (friendships.length === 0) return [];
    const ids = friendships.map((f) => f.id);
    const otherOf = (f: { requesterId: string; addresseeId: string }) =>
      f.requesterId === me ? f.addresseeId : f.requesterId;

    const [cards, last, unread] = await Promise.all([
      this.friends.cards(friendships.map(otherOf)),
      this.prisma.directMessage.findMany({
        where: { friendshipId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        distinct: ['friendshipId'],
      }),
      this.prisma.directMessage.groupBy({
        by: ['friendshipId'],
        where: { friendshipId: { in: ids }, senderId: { not: me }, readAt: null },
        _count: { _all: true },
      }),
    ]);
    const lastBy = new Map(last.map((m) => [m.friendshipId, m]));
    const unreadBy = new Map(unread.map((u) => [u.friendshipId, u._count._all]));

    return friendships
      .map((f) => {
        const m = lastBy.get(f.id);
        return {
          friendshipId: f.id,
          user: cards.get(otherOf(f)) ?? null,
          lastMessage: m ? { text: m.text, createdAt: m.createdAt, mine: m.senderId === me } : null,
          unread: unreadBy.get(f.id) ?? 0,
          sortAt: m?.createdAt ?? f.createdAt,
        };
      })
      .filter((c) => !!c.user)
      .sort((a, b) => +new Date(b.sortAt) - +new Date(a.sortAt))
      .map(({ sortAt, ...rest }) => rest);
  }

  /** No `after`: the latest messages. With `after` (ISO time): messages from that moment on, for polling. */
  async messages(me: string, friendshipId: string, after?: string, limit = 50) {
    await this.friends.acceptedFriendship(me, friendshipId);
    const take = Math.min(Math.max(limit, 1), 100);

    if (after) {
      const since = new Date(after);
      if (Number.isNaN(+since)) throw new BadRequestException('Invalid "after" time');
      // gte, not gt: two messages can share a millisecond. The client skips ids it already has.
      const rows = await this.prisma.directMessage.findMany({
        where: { friendshipId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        take,
      });
      return { items: rows.map(toDto) };
    }
    const rows = await this.prisma.directMessage.findMany({
      where: { friendshipId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return { items: rows.reverse().map(toDto) };
  }

  async send(me: string, friendshipId: string, rawText: string) {
    const text = (rawText ?? '').trim();
    if (!text) throw new BadRequestException('Message is empty');
    if (text.length > MAX_TEXT) throw new BadRequestException(`Messages can be up to ${MAX_TEXT} characters`);

    // Checked on every send, so unfriending or blocking stops the chat immediately.
    const { otherId } = await this.friends.acceptedFriendship(me, friendshipId);
    const [self, other] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: me }, select: { name: true, ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
      }),
      this.prisma.user.findUnique({
        where: { id: otherId }, select: { ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
      }),
    ]);
    if (!this.friends.isEligible(self)) throw new ForbiddenException('You cannot send messages right now');
    if (!other || !this.friends.isEligible(other)) throw new ForbiddenException('This user is unavailable');

    // Only alert the other person at the start of a burst, not for every message.
    const pending = await this.prisma.directMessage.count({
      where: { friendshipId, senderId: me, readAt: null },
    });
    const msg = await this.prisma.directMessage.create({ data: { friendshipId, senderId: me, text } });

    if (pending === 0) {
      await Promise.race([
        this.push
          .notifyUser(otherId, self.name, text.length > 100 ? `${text.slice(0, 97)}...` : text,
            { type: 'chat', friendshipId }, 'chat')
          .catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }
    return toDto(msg);
  }

  async markRead(me: string, friendshipId: string) {
    await this.friends.acceptedFriendship(me, friendshipId);
    const r = await this.prisma.directMessage.updateMany({
      where: { friendshipId, senderId: { not: me }, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, marked: r.count };
  }

  /** For the tab badge: unread messages plus incoming friend requests. */
  async unread(me: string) {
    const ids = (await this.acceptedIds(me)).map((f) => f.id);
    const [messages, requests] = await Promise.all([
      ids.length
        ? this.prisma.directMessage.count({ where: { friendshipId: { in: ids }, senderId: { not: me }, readAt: null } })
        : Promise.resolve(0),
      this.prisma.friendship.count({ where: { addresseeId: me, status: 'PENDING' } }),
    ]);
    return { messages, requests, total: messages + requests };
  }
}
