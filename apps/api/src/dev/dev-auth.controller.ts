import { Body, Controller, ForbiddenException, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IsEmail, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';

class DevLoginDto {
  @IsEmail() email: string;
  @IsString() name: string;
}

@Controller('dev')
export class DevAuthController {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  @Post('login')
  async login(@Body() dto: DevLoginDto) {
    if (process.env.ALLOW_DEV_ENDPOINTS !== 'true') throw new ForbiddenException();
    const user = await this.prisma.user.upsert({
      where: { googleId: `dev:${dto.email}` },
      update: {},
      create: { googleId: `dev:${dto.email}`, email: dto.email, name: dto.name, wallet: { create: {} } },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, user };
  }
}
