import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { ProfilesService } from './profiles.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import {
  AuthUser,
  CurrentUser,
} from '../common/current-user.decorator';

class BioDto {
  @IsString()
  @MaxLength(300)
  bio: string;
}

class MuteDto {
  @IsBoolean()
  muted: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller()
export class ProfilesController {
  constructor(private profiles: ProfilesService) {}

  // "search" must be declared before ":username"
  @Get('creators/search')
  search(@Query('q') q: string) {
    return this.profiles.search(q);
  }

  @Get('creators/:username')
  profile(
    @CurrentUser() u: AuthUser,
    @Param('username') username: string,
  ) {
    return this.profiles.getProfile(u.id, username);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('creators/:username/follow')
  follow(
    @CurrentUser() u: AuthUser,
    @Param('username') username: string,
  ) {
    return this.profiles.follow(u.id, username);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('creators/:username/unfollow')
  unfollow(
    @CurrentUser() u: AuthUser,
    @Param('username') username: string,
  ) {
    return this.profiles.unfollow(u.id, username);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('creators/:username/mute-live')
  muteLive(
    @CurrentUser() u: AuthUser,
    @Param('username') username: string,
    @Body() dto: MuteDto,
  ) {
    return this.profiles.muteLive(u.id, username, dto.muted);
  }

  @Get('me/following')
  following(@CurrentUser() u: AuthUser) {
    return this.profiles.following(u.id);
  }

  @Put('creator/profile')
  updateBio(
    @CurrentUser() u: AuthUser,
    @Body() dto: BioDto,
  ) {
    return this.profiles.updateBio(u.id, dto.bio);
  }
}
