import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class RequestDto {
  @IsOptional() @IsString() @MaxLength(64) userId?: string;
  @IsOptional() @IsString() @MaxLength(64) username?: string;
}
class UserIdDto { @IsString() @MaxLength(64) userId: string; }

@UseGuards(JwtAuthGuard)
@Controller()
export class FriendsController {
  constructor(private friends: FriendsService) {}

  @Get('friends')
  list(@CurrentUser() u: AuthUser) { return this.friends.list(u.id); }

  @Get('friends/requests')
  incoming(@CurrentUser() u: AuthUser) { return this.friends.incoming(u.id); }

  @Get('friends/status')
  status(@CurrentUser() u: AuthUser, @Query('userId') userId?: string, @Query('username') username?: string) {
    return this.friends.status(u.id, { userId, username });
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('friends/request')
  request(@CurrentUser() u: AuthUser, @Body() dto: RequestDto) {
    return this.friends.request(u.id, dto);
  }

  @Post('friends/block')
  block(@CurrentUser() u: AuthUser, @Body() dto: UserIdDto) { return this.friends.block(u.id, dto.userId); }

  @Post('friends/unblock')
  unblock(@CurrentUser() u: AuthUser, @Body() dto: UserIdDto) { return this.friends.unblock(u.id, dto.userId); }

  @Post('friends/:id/accept')
  accept(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.friends.accept(u.id, id); }

  @Post('friends/:id/decline')
  decline(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.friends.decline(u.id, id); }

  @Post('friends/:id/remove')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.friends.remove(u.id, id); }
}
