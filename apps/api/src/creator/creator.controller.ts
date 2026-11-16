import { Controller, Get, UseGuards } from '@nestjs/common';
import { CreatorService } from './creator.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('creator')
export class CreatorController {
  constructor(private creator: CreatorService) {}

  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser) {
    return this.creator.earnings(user.id);
  }
}
