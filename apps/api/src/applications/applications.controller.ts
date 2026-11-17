import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class ApplyDto {
  @Matches(/^[a-zA-Z0-9_]{3,20}$/, { message: 'Username: 3-20 letters, numbers or underscores' })
  username: string;
  @IsOptional() @IsString() @MaxLength(300) bio?: string;
}
class NoteDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }

@UseGuards(JwtAuthGuard)
@Controller()
export class ApplicationsController {
  constructor(private apps: ApplicationsService) {}

  @Get('creator/application')
  mine(@CurrentUser() u: AuthUser) { return this.apps.mine(u.id); }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('creator/apply')
  apply(@CurrentUser() u: AuthUser, @Body() dto: ApplyDto) { return this.apps.apply(u.id, dto); }

  @Get('admin/applications')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string) { return this.apps.adminList(u.id, status); }

  @Post('admin/applications/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.apps.approve(u.id, id, dto.note);
  }

  @Post('admin/applications/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.apps.reject(u.id, id, dto.note);
  }
}
