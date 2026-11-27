import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class GoogleLoginDto {
  @IsOptional() @IsString() idToken?: string;      // phones
  @IsOptional() @IsString() accessToken?: string;  // phones: lets us read the birthday
  @IsOptional() @IsString() code?: string;         // web: authorization code
}
class ConfirmAgeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use the format YYYY-MM-DD' })
  birthDate: string;
}

class AcceptRulesDto { @IsInt() @Min(1) version: number; }



@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('google')
  google(@Body() dto: GoogleLoginDto) {
    return this.auth.loginWithGoogle(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  // Fallback only: used when Google does not share a usable birthday.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('confirm-age')
  confirmAge(@CurrentUser() user: AuthUser, @Body() dto: ConfirmAgeDto) {
    return this.auth.confirmAge(user.id, dto.birthDate);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
@UseGuards(JwtAuthGuard)
@Post('accept-rules')
acceptRules(@CurrentUser() user: AuthUser, @Body() dto: AcceptRulesDto) {
  return this.auth.acceptRules(user.id, dto.version);
}
}
