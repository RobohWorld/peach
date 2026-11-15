import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class TopupDto {
  @IsInt() @Min(1) @Max(100000) coins: number;
}
class BecomeCreatorDto {
  @IsString() username: string;
}

// Fake "payments" and creator onboarding for solo testing. Disabled in production.
@UseGuards(JwtAuthGuard)
@Controller('dev')
export class DevController {
  constructor(private prisma: PrismaService) {}

  private guard() {
    if (process.env.NODE_ENV === 'production') throw new ForbiddenException();
  }

  @Post('topup')
  async topup(@CurrentUser() user: AuthUser, @Body() dto: TopupDto) {
    this.guard();
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId: user.id } });
    await this.prisma.$transaction([
      this.prisma.wallet.update({ where: { id: wallet.id }, data: { coinBalance: { increment: dto.coins } } }),
      this.prisma.ledgerEntry.create({
        data: { walletId: wallet.id, currency: 'COIN', amount: dto.coins, kind: 'DEV_TOPUP', idempotencyKey: randomUUID() },
      }),
    ]);
    return this.prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  }

  @Post('become-creator')
  async becomeCreator(@CurrentUser() user: AuthUser, @Body() dto: BecomeCreatorDto) {
    this.guard();
    await this.prisma.user.update({ where: { id: user.id }, data: { role: 'CREATOR', ageVerified: true } });
    return this.prisma.creatorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, username: dto.username, kycStatus: 'APPROVED' },
    });
  }
}
