import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class NoteDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
class ReasonDto { @IsString() @MaxLength(300) reason: string; }
class GrantDto {
  @IsInt() @Min(1) @Max(100000) coins: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get('overview')
  overview(@CurrentUser() u: AuthUser) { return this.admin.overview(u.id); }

  @Get('reports')
  reports(@CurrentUser() u: AuthUser) { return this.admin.reports(u.id); }

  @Post('reports/:id/resolve')
  resolve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.admin.resolveReport(u.id, id, dto.note);
  }

  @Get('streams')
  streams(@CurrentUser() u: AuthUser) { return this.admin.liveStreams(u.id); }

  @Post('streams/:id/end')
  endStream(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admin.endStream(u.id, id);
  }

  @Get('users')
  users(@CurrentUser() u: AuthUser, @Query('q') q: string) { return this.admin.searchUsers(u.id, q); }

  @Post('users/:id/grant-coins')
  grant(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: GrantDto) {
    return this.admin.grantCoins(u.id, id, dto.coins, dto.note);
  }

  @Post('users/:id/suspend')
  suspend(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.admin.suspend(u.id, id, dto.reason);
  }

  @Post('users/:id/unsuspend')
  unsuspend(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.admin.unsuspend(u.id, id);
  }
}
