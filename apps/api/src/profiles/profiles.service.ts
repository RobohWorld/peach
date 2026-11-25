import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProfilesService {
  constructor(private prisma: PrismaService) {}

  private async profileByUsername(username: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { username: username.toLowerCase() },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
            suspendedAt: true,
          },
        },
      },
    });

    if (!profile || profile.user.suspendedAt) {
      throw new NotFoundException('Creator not found');
    }

    return profile;
  }

  async getProfile(viewerId: string, username: string) {
    const profile = await this.profileByUsername(username);

    const [followers, follow, live] = await Promise.all([
      this.prisma.follow.count({
        where: { creatorId: profile.userId },
      }),
      this.prisma.follow.findUnique({
        where: {
          followerId_creatorId: {
            followerId: viewerId,
            creatorId: profile.userId,
          },
        },
      }),
      this.prisma.stream.findFirst({
        where: {
          creatorId: profile.userId,
          status: 'LIVE',
        },
        select: { id: true, title: true },
      }),
    ]);

    return {
      username: profile.username,
      name: profile.user.name,
      avatarUrl: profile.user.avatarUrl,
      bio: profile.bio,
      followers,
      isFollowing: !!follow,
      isMe: viewerId === profile.userId,
      live,
      muteLive: follow?.muteLive ?? false,
    };
  }

  async follow(viewerId: string, username: string) {
    const profile = await this.profileByUsername(username);

    if (profile.userId === viewerId) {
      throw new BadRequestException('You cannot follow yourself');
    }

    await this.prisma.follow.upsert({
      where: {
        followerId_creatorId: {
          followerId: viewerId,
          creatorId: profile.userId,
        },
      },
      update: {},
      create: {
        followerId: viewerId,
        creatorId: profile.userId,
      },
    });

    return {
      ok: true,
      followers: await this.prisma.follow.count({
        where: { creatorId: profile.userId },
      }),
    };
  }

  async unfollow(viewerId: string, username: string) {
    const profile = await this.profileByUsername(username);

    await this.prisma.follow.deleteMany({
      where: {
        followerId: viewerId,
        creatorId: profile.userId,
      },
    });

    return {
      ok: true,
      followers: await this.prisma.follow.count({
        where: { creatorId: profile.userId },
      }),
    };
  }

  async muteLive(viewerId: string, username: string, muted: boolean) {
    const profile = await this.profileByUsername(username);

    const r = await this.prisma.follow.updateMany({
      where: {
        followerId: viewerId,
        creatorId: profile.userId,
      },
      data: {
        muteLive: muted,
      },
    });

    if (r.count === 0) {
      throw new BadRequestException('Follow this creator first');
    }

    return {
      ok: true,
      muteLive: muted,
    };
  }

  async search(q: string) {
    const term = (q ?? '').trim();

    if (term.length < 2) return [];

    const profiles = await this.prisma.creatorProfile.findMany({
      where: {
        kycStatus: 'APPROVED',
        user: { suspendedAt: null },
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { user: { name: { contains: term, mode: 'insensitive' } } },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      take: 20,
    });

    const counts = await this.prisma.follow.groupBy({
      by: ['creatorId'],
      where: {
        creatorId: { in: profiles.map((p) => p.userId) },
      },
      _count: { _all: true },
    });

    const byId = new Map(
      counts.map((c) => [c.creatorId, c._count._all]),
    );

    return profiles.map((p) => ({
      username: p.username,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      followers: byId.get(p.userId) ?? 0,
    }));
  }

  async following(viewerId: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const ids = follows.map((f) => f.creatorId);

    const [profiles, live] = await Promise.all([
      this.prisma.creatorProfile.findMany({
        where: {
          userId: { in: ids },
          user: { suspendedAt: null },
        },
        include: {
          user: {
            select: {
              name: true,
              avatarUrl: true,
            },
          },
        },
      }),
      this.prisma.stream.findMany({
        where: {
          creatorId: { in: ids },
          status: 'LIVE',
        },
        select: {
          id: true,
          creatorId: true,
        },
      }),
    ]);

    const liveBy = new Map(
      live.map((s) => [s.creatorId, s.id]),
    );

    return profiles.map((p) => ({
      username: p.username,
      name: p.user.name,
      avatarUrl: p.user.avatarUrl,
      liveStreamId: liveBy.get(p.userId) ?? null,
    }));
  }

  async updateBio(userId: string, bio: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new ForbiddenException('Creator account required');
    }

    await this.prisma.creatorProfile.update({
      where: { userId },
      data: { bio: bio.trim() || null },
    });

    return { ok: true };
  }
}
