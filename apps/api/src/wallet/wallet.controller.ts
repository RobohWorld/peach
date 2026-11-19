import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class SendGiftDto {
  @IsString() streamId: string;
  @IsString() giftId: string;
  // Client generates a UUID per tap so retries never double-charge.
  @IsString() @MaxLength(64) idempotencyKey: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get('wallet')
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.getWallet(user.id);
  }

  @Get('wallet/transactions')
  transactions(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const n = Number(limit);
    return this.wallet.listTransactions(user.id, Number.isFinite(n) && n > 0 ? n : 30, cursor || undefined);
  }

  @Get('gifts')
  gifts() {
    return this.wallet.listGifts();
  }

  @Post('gifts/send')
  send(@CurrentUser() user: AuthUser, @Body() dto: SendGiftDto) {
    return this.wallet.sendGift(user.id, dto.streamId, dto.giftId, dto.idempotencyKey);
  }
}
