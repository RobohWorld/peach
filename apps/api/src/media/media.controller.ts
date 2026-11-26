
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MediaService } from './media.service';
import { RefundsService, ROOT_CAUSES } from './refunds.service';

import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class UploadUrlDto {
  @IsIn(['IMAGE', 'VIDEO'])
  type: 'IMAGE' | 'VIDEO';

  @IsString()
  @MaxLength(64)
  contentType: string;

  @IsInt()
  @Min(1)
  @Max(50 * 1024 * 1024)
  size: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1024 * 1024)
  previewSize?: number;
}

class CreateMediaDto {
  @IsIn(['IMAGE', 'VIDEO'])
  type: 'IMAGE' | 'VIDEO';

  @IsString()
  @MaxLength(300)
  mediaKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  previewKey?: string;

  @IsString()
  @MaxLength(120)
  title: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  priceCoins?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  minTier?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  durationSec?: number;
}

class ReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

class DecideRefundDto {
  @IsIn([...ROOT_CAUSES])
  rootCause: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsBoolean()
  clawback?: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class MediaController {
  constructor(
    private media: MediaService,
    private refunds: RefundsService,
  ) {}

  private requireAdmin(u: AuthUser) {
    if (u.role !== 'ADMIN') {
      throw new ForbiddenException('Admin only');
    }
  }

  // Creator

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('media/upload-url')
  uploadUrl(
    @CurrentUser() u: AuthUser,
    @Body() dto: UploadUrlDto,
  ) {
    return this.media.createUploadUrl(u.id, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('media')
  create(
    @CurrentUser() u: AuthUser,
    @Body() dto: CreateMediaDto,
  ) {
    return this.media.create(u.id, dto);
  }

  @Post('media/:id/delete')
  remove(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
  ) {
    return this.media.remove(u.id, id);
  }

  // Viewers

  @Get('creators/:username/media')
  forCreator(
    @CurrentUser() u: AuthUser,
    @Param('username') username: string,
  ) {
    return this.media.listForCreator(u.id, username);
  }

  @Get('me/library')
  library(@CurrentUser() u: AuthUser) {
    return this.media.library(u.id);
  }

  @Get('media/:id/access')
  access(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
  ) {
    return this.media.access(u.id, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('media/:id/purchase')
  purchase(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
  ) {
    return this.media.purchase(u.id, id);
  }

  // Admin media review

  @Get('admin/media/pending')
  pending(@CurrentUser() u: AuthUser) {
    this.requireAdmin(u);
    return this.media.pending();
  }

  @Post('admin/media/:id/approve')
  approve(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    this.requireAdmin(u);
    return this.media.review(u.id, id, 'APPROVED', dto.note);
  }

  @Post('admin/media/:id/remove')
  adminRemove(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDto,
  ) {
    this.requireAdmin(u);
    return this.media.review(u.id, id, 'REMOVED', dto.note);
  }

  // Admin media viewer (pending or removed content)

  @Get('admin/media/:id/view')
  adminView(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
  ) {
    this.requireAdmin(u);
    return this.media.adminView(id);
  }

  // Admin refunds

  @Get('admin/refunds')
  refundList(
    @CurrentUser() u: AuthUser,
    @Query('status') status?: string,
  ) {
    this.requireAdmin(u);
    return this.refunds.list(status);
  }

  @Post('admin/refunds/item/:mediaId/approve')
  approveItem(
    @CurrentUser() u: AuthUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: DecideRefundDto,
  ) {
    this.requireAdmin(u);
    return this.refunds.decideForItem(
      u.id,
      mediaId,
      'APPROVED',
      dto,
    );
  }

  @Post('admin/refunds/item/:mediaId/deny')
  denyItem(
    @CurrentUser() u: AuthUser,
    @Param('mediaId') mediaId: string,
    @Body() dto: DecideRefundDto,
  ) {
    this.requireAdmin(u);
    return this.refunds.decideForItem(
      u.id,
      mediaId,
      'DENIED',
      dto,
    );
  }

  @Post('admin/refunds/:id/approve')
  approveOne(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideRefundDto,
  ) {
    this.requireAdmin(u);
    return this.refunds.decide(
      u.id,
      id,
      'APPROVED',
      dto,
    );
  }

  @Post('admin/refunds/:id/deny')
  denyOne(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideRefundDto,
  ) {
    this.requireAdmin(u);
    return this.refunds.decide(
      u.id,
      id,
      'DENIED',
      dto,
    );
  }
}
