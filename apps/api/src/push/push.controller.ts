import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsString, Matches } from 'class-validator';
import { PushService } from './push.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class RegisterDto {
  @Matches(/^Expo(nent)?PushToken\[[^\]]+\]$/, { message: 'Invalid push token' }) token: string;
  @IsIn(['android', 'ios']) platform: string;
}
class RemoveDto { @IsString() token: string; }

@UseGuards(JwtAuthGuard)
@Controller('me/push-token')
export class PushController {
  constructor(private push: PushService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  register(@CurrentUser() u: AuthUser, @Body() dto: RegisterDto) {
    return this.push.register(u.id, dto.token, dto.platform);
  }

  @Post('remove')
  remove(@CurrentUser() u: AuthUser, @Body() dto: RemoveDto) {
    return this.push.unregister(u.id, dto.token);
  }
}
