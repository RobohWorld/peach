import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ModerationService, REPORT_REASONS } from './moderation.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class ChatDto { @IsString() @MaxLength(500) text: string; }
class SlowDto { @IsInt() @Min(0) @Max(120) seconds: number; }
class TargetDto { @IsString() userId: string; }
class ReportDto {
  @IsString() targetUserId: string;
  @IsOptional() @IsString() streamId?: string;
  @IsOptional() @IsString() messageId?: string;
  @IsIn(REPORT_REASONS) reason: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class ModerationController {
  constructor(private mod: ModerationService) {}

  @Post('streams/:id/chat')
  chat(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ChatDto) {
    return this.mod.chat(u.id, id, dto.text);
  }

  @Post('streams/:id/slow-mode')
  slow(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SlowDto) {
    return this.mod.setSlowMode(u.id, id, dto.seconds);
  }

  @Post('streams/:id/mute')
  mute(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TargetDto) {
    return this.mod.mute(u.id, id, dto.userId);
  }

  @Post('streams/:id/unmute')
  unmute(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TargetDto) {
    return this.mod.unmute(u.id, id, dto.userId);
  }

  @Post('streams/:id/kick')
  kick(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TargetDto) {
    return this.mod.kick(u.id, id, dto.userId);
  }

  @Post('reports')
  report(@CurrentUser() u: AuthUser, @Body() dto: ReportDto) {
    return this.mod.report(u.id, dto);
  }
}
