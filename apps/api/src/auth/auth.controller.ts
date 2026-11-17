import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class GoogleLoginDto {
  @IsString() idToken: string;
}
class ConfirmAgeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use the format YYYY-MM-DD' })
  birthDate: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // The date of birth is checked, never stored. We only record that 18+ was confirmed.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('confirm-age')
  confirmAge(@CurrentUser() user: AuthUser, @Body() dto: ConfirmAgeDto) {
    return this.auth.confirmAge(user.id, dto.birthDate);
  }
}
