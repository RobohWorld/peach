import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private n: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('cursor') cursor?: string) { return this.n.list(u.id, 30, cursor); }

  @Get('unread-count')
  unread(@CurrentUser() u: AuthUser) { return this.n.unreadCount(u.id); }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('read')
  read(@CurrentUser() u: AuthUser) { return this.n.markAllRead(u.id); }
}