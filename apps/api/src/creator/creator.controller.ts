import { CreatorService } from './creator.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Controller, Get, Query, UseGuards } from '@nestjs/common';



@UseGuards(JwtAuthGuard)
@Controller('creator')
export class CreatorController {
  constructor(private creator: CreatorService) {}

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.creator.earnings(user.id);
  }

  @Get('dashboard')
dashboard(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
  return this.creator.dashboard(user.id, Number(days));
}
}
