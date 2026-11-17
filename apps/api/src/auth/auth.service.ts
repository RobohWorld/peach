import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
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
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Invalid Google token');
    }

    let user = await this.prisma.user.upsert({
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

    // Bootstrap: emails listed in ADMIN_EMAILS become admins (Google has verified the email).
    const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (admins.includes(payload.email.toLowerCase()) && user.role !== 'ADMIN') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    }

    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken, user };
  }

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { wallet: true, creator: true },
    });
  }

  async confirmAge(userId: string, birthDate: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
    if (!m) throw new BadRequestException('Use the format YYYY-MM-DD');
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);

    const dob = new Date(Date.UTC(y, mo - 1, d));
    if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) {
      throw new BadRequestException('That is not a valid date');
    }
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    if (now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d)) age--;
    if (age < 0 || age > 120) throw new BadRequestException('That is not a valid date');
    if (age < 18) throw new BadRequestException('You must be 18 or older to use Peach Live');

    await this.prisma.user.update({ where: { id: userId }, data: { ageDeclaredAt: new Date() } });
    return { ok: true };
  }
}
