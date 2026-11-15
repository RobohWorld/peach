import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  private google = new OAuth2Client();
  private audiences = (process.env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async loginWithGoogle(idToken: string) {
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: this.audiences });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.sub || !payload.email) throw new UnauthorizedException('Invalid Google token');

    const user = await this.prisma.user.upsert({
      where: { googleId: payload.sub },
      update: { name: payload.name ?? payload.email, avatarUrl: payload.picture },
      create: {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email,
        avatarUrl: payload.picture,
        wallet: { create: {} },
      },
    });

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, user };
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallet: true, creator: true },
    });
  }
}
