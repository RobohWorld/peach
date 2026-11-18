import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LeaderboardsService } from './leaderboards.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private lb: LeaderboardsService) {}

  @Get()
  top(@Query('period') period?: string) {
    return this.lb.top(['day', 'week', 'month', 'all'].includes(period ?? '') ? period! : 'week');
  }
}
