import {
  Body, Controller, Get, Headers, Param, Post, Put, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { ArrayMaxSize, IsArray, IsInt, Max, Min } from 'class-validator';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class SubscribeDto { @IsInt() @Min(1) @Max(3) tier: number; }
class TiersDto { @IsArray() @ArrayMaxSize(3) @IsInt({ each: true }) @Min(1, { each: true }) @Max(3, { each: true }) tiers: number[]; }

@UseGuards(JwtAuthGuard)
@Controller()
export class SubscriptionsController {
  constructor(private subs: SubscriptionsService) {}

  @Get('creators/:username/subscription')
  info(@CurrentUser() u: AuthUser, @Param('username') username: string) {
    return this.subs.tierInfo(u.id, username);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('creators/:username/subscribe')
  subscribe(@CurrentUser() u: AuthUser, @Param('username') username: string, @Body() dto: SubscribeDto) {
    return this.subs.subscribe(u.id, username, dto.tier);
  }

  @Post('subscriptions/:id/cancel')
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.subs.cancel(u.id, id);
  }

  @Get('me/subscriptions')
  mine(@CurrentUser() u: AuthUser) {
    return this.subs.mine(u.id);
  }

  @Put('creator/subscription-tiers')
  setTiers(@CurrentUser() u: AuthUser, @Body() dto: TiersDto) {
    return this.subs.setEnabledTiers(u.id, dto.tiers);
  }
}

// Called once a day by Vercel Cron. Not a user endpoint: it needs the CRON_SECRET.
@Controller('internal/cron')
export class SubscriptionsCronController {
  constructor(private subs: SubscriptionsService) {}

  @Get('subscriptions')
  run(@Headers('authorization') auth?: string) {
    const secret = process.env.CRON_SECRET;
    const expected = Buffer.from(`Bearer ${secret ?? ''}`);
    const given = Buffer.from(auth ?? '');
    if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return this.subs.runRenewals();
  }
}
