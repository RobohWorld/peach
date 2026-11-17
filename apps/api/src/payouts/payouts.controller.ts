import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class CreatePayoutDto {
  @IsInt() @Min(1) @Max(10000000) diamonds: number;
  @IsIn(['BANK', 'PAYPAL', 'OTHER']) method: string;
  @IsString() @MaxLength(80) destination: string;
}
class NoteDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }

@UseGuards(JwtAuthGuard)
@Controller()
export class PayoutsController {
  constructor(private payouts: PayoutsService) {}

  @Get('payouts')
  mine(@CurrentUser() u: AuthUser) { return this.payouts.listMine(u.id); }

  @Post('payouts')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreatePayoutDto) { return this.payouts.create(u.id, dto); }

  @Get('admin/payouts')
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string) { return this.payouts.adminList(u.id, status); }

  @Post('admin/payouts/:id/approve')
  approve(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.payouts.approve(u.id, id, dto.note);
  }

  @Post('admin/payouts/:id/pay')
  pay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.payouts.markPaid(u.id, id, dto.note);
  }

  @Post('admin/payouts/:id/reject')
  reject(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: NoteDto) {
    return this.payouts.reject(u.id, id, dto.note);
  }
}
