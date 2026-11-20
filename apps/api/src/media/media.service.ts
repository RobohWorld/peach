import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { R2Service } from './r2.service';

export type MediaType = 'IMAGE' | 'VIDEO';

const LIMITS = {
  IMAGE: { types: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as Record<string, string>, maxBytes: 5 * 1024 * 1024 },
  VIDEO: { types: { 'video/mp4': 'mp4', 'video/quicktime': 'mov' } as Record<string, string>, maxBytes: 25 * 1024 * 1024 },
};
const MAX_VIDEO_SECONDS = 15;
const PREVIEW_MAX_BYTES = 30 * 1024; // a tiny blurred thumbnail, never a full-size copy
const MIN_PRICE = 1;
const MAX_PRICE = 100_000;
const VIEW_URL_SECONDS = 15 * 60;
const PREVIEW_URL_SECONDS = 60 * 60;

const isUnique = (e: unknown) => (e as { code?: string })?.code === 'P2002';

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private wallet: WalletService,
    private r2: R2Service,
  ) {}

  // ---------- creator side ----------

  private async assertCreator(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { creator: true } });
    if (user.role !== 'CREATOR') throw new ForbiddenException('Creator account required');
    if (user.suspendedAt) throw new ForbiddenException('Account suspended');
    if (!user.ageVerified || user.creator?.kycStatus !== 'APPROVED') {
      throw new ForbiddenException('Age verification and KYC required');
    }
    return user;
  }

  /** Step 1: the creator asks where to upload. Nothing is stored or visible yet. */
  async createUploadUrl(userId: string, p: { type: MediaType; contentType: string; size: number; previewSize?: number }) {
    await this.assertCreator(userId);
    const limit = LIMITS[p.type];
    if (!limit) throw new BadRequestException('Unsupported media type');
    const ext = limit.types[p.contentType];
    if (!ext) throw new BadRequestException(`Allowed file types: ${Object.keys(limit.types).join(', ')}`);
    if (!Number.isInteger(p.size) || p.size <= 0 || p.size > limit.maxBytes) {
      throw new BadRequestException(`File must be at most ${Math.floor(limit.maxBytes / 1024 / 1024)} MB`);
    }

    const id = randomUUID();
    const mediaKey = `media/${userId}/${id}.${ext}`;
    const out: Record<string, unknown> = {
      mediaKey,
      uploadUrl: await this.r2.presignPut(mediaKey, p.contentType, p.size),
    };

    if (p.type === 'IMAGE') {
      if (!Number.isInteger(p.previewSize) || (p.previewSize as number) <= 0 || (p.previewSize as number) > PREVIEW_MAX_BYTES) {
        throw new BadRequestException('A small preview image is required');
      }
      const previewKey = `previews/${userId}/${id}.jpg`;
      out.previewKey = previewKey;
      out.previewUploadUrl = await this.r2.presignPut(previewKey, 'image/jpeg', p.previewSize as number);
    }
    return out;
  }

  /** Step 2: after uploading, the creator confirms. We check the files really are in storage. */
  async create(userId: string, p: {
    type: MediaType; mediaKey: string; previewKey?: string; title: string; priceCoins: number; durationSec?: number;
  }) {
    await this.assertCreator(userId);
    const limit = LIMITS[p.type];
    if (!limit) throw new BadRequestException('Unsupported media type');

    const title = (p.title ?? '').trim();
    if (!title || title.length > 80) throw new BadRequestException('Title must be 1 to 80 characters');
    if (!Number.isInteger(p.priceCoins) || p.priceCoins < MIN_PRICE || p.priceCoins > MAX_PRICE) {
      throw new BadRequestException(`Price must be between ${MIN_PRICE} and ${MAX_PRICE} coins`);
    }
    if (!p.mediaKey.startsWith(`media/${userId}/`)) throw new ForbiddenException('Invalid file');

    let durationSec: number | null = null;
    if (p.type === 'VIDEO') {
      // The duration comes from the app: the server cannot read video length without processing the file.
      // The 25 MB size cap is the hard limit that is actually enforced here.
      if (!Number.isInteger(p.durationSec) || (p.durationSec as number) < 1 || (p.durationSec as number) > MAX_VIDEO_SECONDS) {
        throw new BadRequestException(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds`);
      }
      durationSec = p.durationSec as number;
    }

    const head = await this.r2.head(p.mediaKey);
    if (!head) throw new BadRequestException('The file was not uploaded');
    if (head.size > limit.maxBytes || !limit.types[head.contentType]) {
      throw new BadRequestException('The uploaded file is not allowed');
    }

    let previewKey: string | null = null;
    if (p.type === 'IMAGE') {
      if (!p.previewKey || !p.previewKey.startsWith(`previews/${userId}/`)) throw new BadRequestException('Preview missing');
      const ph = await this.r2.head(p.previewKey);
      if (!ph || ph.size > PREVIEW_MAX_BYTES || ph.contentType !== 'image/jpeg') {
        throw new BadRequestException('The preview was not uploaded');
      }
      previewKey = p.previewKey;
    }

    if (await this.prisma.mediaItem.findFirst({ where: { r2Key: p.mediaKey }, select: { id: true } })) {
      throw new ConflictException('This file was already added');
    }

    // With MEDIA_AUTO_APPROVE=true new items go live immediately (testing).
    // Otherwise they wait as PENDING until an admin approves them.
    const status = process.env.MEDIA_AUTO_APPROVE === 'true' ? 'APPROVED' : 'PENDING';
    const item = await this.prisma.mediaItem.create({
      data: { creatorId: userId, type: p.type, r2Key: p.mediaKey, previewKey, title, priceCoins: p.priceCoins, durationSec, status },
    });
    return { id: item.id, status: item.status };
  }

  /** Soft delete: the item disappears and buyers lose access. Files stay in storage for moderation. */
  async remove(userId: string, mediaId: string) {
    const item = await this.prisma.mediaItem.findUnique({ where: { id: mediaId } });
    if (!item || item.creatorId !== userId || item.status === 'REMOVED') throw new NotFoundException('Not found');
    await this.prisma.mediaItem.update({ where: { id: mediaId }, data: { status: 'REMOVED' } });
    return { ok: true };
  }

  // ---------- viewing ----------

  /** A creator's items. Visitors see approved items; the creator also sees pending ones. */
  async listForCreator(viewerId: string, username: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { username: username.toLowerCase() },
      select: { userId: true },
    });
    if (!profile) throw new NotFoundException('Creator not found');
    const isMe = profile.userId === viewerId;

    if (!isMe) {
      const c = await this.prisma.user.findUnique({ where: { id: profile.userId }, select: { suspendedAt: true } });
      if (!c || c.suspendedAt) return [];
    }

    const items = await this.prisma.mediaItem.findMany({
      where: { creatorId: profile.userId, ...(isMe ? { status: { not: 'REMOVED' } } : { status: 'APPROVED' }) },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
    const ids = items.map((i) => i.id);

    const [mine, sales] = await Promise.all([
      isMe || ids.length === 0
        ? Promise.resolve([])
        : this.prisma.mediaPurchase.findMany({ where: { userId: viewerId, mediaId: { in: ids } }, select: { mediaId: true } }),
      isMe && ids.length
        ? this.prisma.mediaPurchase.groupBy({ by: ['mediaId'], where: { mediaId: { in: ids } }, _count: { _all: true } })
        : Promise.resolve([]),
    ]);
    const owned = new Set(mine.map((m) => m.mediaId));
    const sold = new Map(sales.map((s) => [s.mediaId, s._count._all]));

    return Promise.all(items.map(async (i) => ({
      id: i.id,
      type: i.type,
      title: i.title,
      priceCoins: i.priceCoins,
      durationSec: i.durationSec,
      createdAt: i.createdAt,
      owned: isMe || owned.has(i.id),
      previewUrl: i.previewKey ? await this.r2.presignGet(i.previewKey, PREVIEW_URL_SECONDS) : null,
      ...(isMe ? { status: i.status, sales: sold.get(i.id) ?? 0 } : {}),
    })));
  }

  /** Items the user has bought (still available), newest purchase first. */
  async library(userId: string) {
    const purchases = await this.prisma.mediaPurchase.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    if (purchases.length === 0) return [];
    const items = await this.prisma.mediaItem.findMany({
      where: { id: { in: purchases.map((p) => p.mediaId) }, status: 'APPROVED' },
    });
    const byId = new Map<string, (typeof items)[number]>();
    for (const i of items) byId.set(i.id, i);
    const creators = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.creatorId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(creators.map((c) => [c.id, c.name]));

    return Promise.all(purchases
      .filter((p) => byId.has(p.mediaId))
      .map(async (p) => {
        const i = byId.get(p.mediaId)!;
        return {
          id: i.id, type: i.type, title: i.title, durationSec: i.durationSec,
          creatorName: names.get(i.creatorId) ?? '',
          purchasedAt: p.createdAt,
          previewUrl: i.previewKey ? await this.r2.presignGet(i.previewKey, PREVIEW_URL_SECONDS) : null,
        };
      }));
  }

  /** Full-size file: only for the creator or someone who bought it. The link expires after 15 minutes. */
  async access(userId: string, mediaId: string) {
    const item = await this.prisma.mediaItem.findUnique({ where: { id: mediaId } });
    if (!item || item.status === 'REMOVED') throw new NotFoundException('Not found');

    if (item.creatorId !== userId) {
      if (item.status !== 'APPROVED') throw new NotFoundException('Not found');
      const bought = await this.prisma.mediaPurchase.findUnique({
        where: { userId_mediaId: { userId, mediaId } }, select: { id: true },
      });
      if (!bought) throw new ForbiddenException('Unlock this content first');
    }
    return { type: item.type, url: await this.r2.presignGet(item.r2Key, VIEW_URL_SECONDS), expiresInSeconds: VIEW_URL_SECONDS };
  }

  // ---------- buying ----------

  async purchase(userId: string, mediaId: string) {
    const [item, buyer] = await Promise.all([
      this.prisma.mediaItem.findUnique({ where: { id: mediaId } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId }, select: { ageVerified: true, ageDeclaredAt: true, suspendedAt: true },
      }),
    ]);
    if (!item || item.status !== 'APPROVED') throw new NotFoundException('Not found');
    if (buyer.suspendedAt || (!buyer.ageVerified && !buyer.ageDeclaredAt)) {
      throw new ForbiddenException('Age verification required');
    }
    if (item.creatorId === userId) throw new BadRequestException('This is your own content');
    const seller = await this.prisma.user.findUnique({ where: { id: item.creatorId }, select: { suspendedAt: true } });
    if (!seller || seller.suspendedAt) throw new NotFoundException('Not found');
    const price = item.priceCoins ?? 0;
    if (price < MIN_PRICE) throw new BadRequestException('This item is not for sale');

    const existing = await this.prisma.mediaPurchase.findUnique({
      where: { userId_mediaId: { userId, mediaId } }, select: { id: true },
    });
    if (existing) return { ok: true, duplicate: true };

    try {
      const paid = await this.prisma.$transaction(async (tx) => {
        const r = await this.wallet.transferCoinsForDiamonds(tx, {
          buyerId: userId, sellerId: item.creatorId, coins: price,
          kindOut: 'CONTENT_PURCHASE', kindIn: 'CONTENT_SALE',
          idempotencyKey: `media:${mediaId}:${userId}`, // one purchase per person per item, so retries never double-charge
        });
        await tx.mediaPurchase.create({ data: { userId, mediaId, coinsPaid: price } });
        return r;
      });
      return { ok: true, coinBalance: paid.coinBalance };
    } catch (e) {
      if (isUnique(e)) return { ok: true, duplicate: true }; // a parallel request bought it first
      throw e;
    }
  }

  // ---------- admin review ----------

  async pending() {
    const items = await this.prisma.mediaItem.findMany({
      where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 50,
    });
    return Promise.all(items.map(async (i) => ({
      id: i.id, creatorId: i.creatorId, type: i.type, title: i.title, priceCoins: i.priceCoins, createdAt: i.createdAt,
      url: await this.r2.presignGet(i.r2Key, VIEW_URL_SECONDS),
      previewUrl: i.previewKey ? await this.r2.presignGet(i.previewKey, VIEW_URL_SECONDS) : null,
    })));
  }

  async review(adminId: string, mediaId: string, decision: 'APPROVED' | 'REMOVED', note?: string) {
    const item = await this.prisma.mediaItem.findUnique({ where: { id: mediaId } });
    if (!item) throw new NotFoundException('Not found');
    await this.prisma.$transaction([
      this.prisma.mediaItem.update({ where: { id: mediaId }, data: { status: decision } }),
      this.prisma.adminAction.create({
        data: {
          adminId, action: decision === 'APPROVED' ? 'MEDIA_APPROVE' : 'MEDIA_REMOVE',
          targetType: 'MediaItem', targetId: mediaId, note: note ?? null,
        },
      }),
    ]);
    return { ok: true };
  }
}
