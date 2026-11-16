import { Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('dev')
export class DevAdminController {
  constructor(private prisma: PrismaService) {}

  // Use a separate test account: ADMIN replaces the CREATOR role.
  @Post('become-admin')
  async becomeAdmin(@CurrentUser() user: AuthUser) {
    if (process.env.ALLOW_DEV_ENDPOINTS !== 'true') throw new ForbiddenException();
    await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    return { ok: true };
  }
}
