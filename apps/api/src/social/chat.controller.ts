import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class SendDto { @IsString() @MaxLength(500) text: string; }

@UseGuards(JwtAuthGuard)
@Controller()
export class ChatController {
  constructor(private chat: ChatService) {}

  @Get('chat/conversations')
  conversations(@CurrentUser() u: AuthUser) { return this.chat.conversations(u.id); }

  @Get('chat/unread')
  unread(@CurrentUser() u: AuthUser) { return this.chat.unread(u.id); }

  @Get('chat/:friendshipId/messages')
  messages(
    @CurrentUser() u: AuthUser,
    @Param('friendshipId') friendshipId: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    const n = Number(limit);
    return this.chat.messages(u.id, friendshipId, after, Number.isFinite(n) && n > 0 ? n : 50);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('chat/:friendshipId/messages')
  send(@CurrentUser() u: AuthUser, @Param('friendshipId') friendshipId: string, @Body() dto: SendDto) {
    return this.chat.send(u.id, friendshipId, dto.text);
  }

  @Post('chat/:friendshipId/read')
  read(@CurrentUser() u: AuthUser, @Param('friendshipId') friendshipId: string) {
    return this.chat.markRead(u.id, friendshipId);
  }
}
