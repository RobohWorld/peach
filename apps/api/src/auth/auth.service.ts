import {
  BadRequestException, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';

type GoogleLogin = { idToken?: string; accessToken?: string; code?: string };
type AgeStatus = 'ADULT' | 'MINOR' | 'UNKNOWN';

function ageOn(y: number, m: number, d: number): number {
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d)) age--;
  return age;
}

// Public display name. The Google real name is kept privately in realName.
const nickname = () => `Peach${Math.floor(1000 + Math.random() * 9000)}`;

@Injectable()
export class AuthService {
  private google = new OAuth2Client();
  private audiences = (process.env.GOOGLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  /** Reads the Google account birthday. The date itself is never stored. */
  private async googleAge(accessToken: string | undefined, sub: string): Promise<AgeStatus> {
    if (!accessToken) return 'UNKNOWN';
    try {
      const res = await fetch('https://people.googleapis.com/v1/people/me?personFields=birthdays', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return 'UNKNOWN';
      const data: any = await res.json();
      // The token must belong to the same Google user whose ID token we verified.
      if (data?.resourceName !== `people/${sub}`) return 'UNKNOWN';

      const ages: number[] = (data.birthdays ?? [])
        .map((b: any) => b?.date)
        .filter((d: any) => d?.year && d?.month && d?.day)
        .map((d: any) => ageOn(Number(d.year), Number(d.month), Number(d.day)))
        .filter((a: number) => a >= 0 && a <= 120);
      if (ages.length === 0) return 'UNKNOWN';

      // If entries disagree, the youngest one decides (safest for an age check).
      return Math.min(...ages) >= 18 ? 'ADULT' : 'MINOR';
    } catch {
      return 'UNKNOWN';
    }
  }

  async loginWithGoogle(dto: GoogleLogin) {
    let idToken = dto.idToken;
    let accessToken = dto.accessToken;

    // Web: exchange the authorization code for tokens on the server.
    if (dto.code) {
      const secret = process.env.GOOGLE_CLIENT_SECRET;
      if (!secret || this.audiences.length === 0) {
        throw new UnauthorizedException('Google sign-in is not configured');
      }
      try {
        const oauth = new OAuth2Client(this.audiences[0], secret, 'postmessage');
        const { tokens } = await oauth.getToken(dto.code);
        idToken = tokens.id_token ?? undefined;
        accessToken = tokens.access_token ?? undefined;
      } catch {
        throw new UnauthorizedException('Google sign-in failed');
      }
    }
    if (!idToken) throw new BadRequestException('Missing Google token');

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

    const ageStatus = await this.googleAge(accessToken, payload.sub);

    if (ageStatus === 'MINOR') {
      await this.prisma.user.updateMany({
        where: { googleId: payload.sub },
        data: { ageDeclaredAt: null, ageVerified: false, suspendedAt: new Date(), suspendReason: 'Under 18 per Google account' },
      });
      throw new ForbiddenException('You must be 18 or older to use Peach Live');
    }

    const ageData = ageStatus === 'ADULT' ? { ageDeclaredAt: new Date(), ageSource: 'GOOGLE' } : {};

    let user = await this.prisma.user.upsert({
      where: { googleId: payload.sub },
      update: { ...ageData },
      create: {
        googleId: payload.sub,
        email: payload.email,
        name: nickname(),
        realName: payload.name ?? null,
        wallet: { create: {} },
        ...ageData,
      },
    });

    // Bootstrap: emails listed in ADMIN_EMAILS become admins (Google has verified the email).
    const admins = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (admins.includes(payload.email.toLowerCase()) && user.role !== 'ADMIN') {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    }

    const accessJwt = await this.jwt.signAsync({ sub: user.id, role: user.role });
    return { accessToken: accessJwt, user, ageStatus };
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
    const age = ageOn(y, mo, d);
    if (age < 0 || age > 120) throw new BadRequestException('That is not a valid date');
    if (age < 18) throw new BadRequestException('You must be 18 or older to use Peach Live');

    await this.prisma.user.update({
      where: { id: userId },
      data: { ageDeclaredAt: new Date(), ageSource: 'MANUAL' },
    });
    return { ok: true };
  }
}
