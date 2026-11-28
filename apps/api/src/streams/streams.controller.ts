import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { StreamsService } from './streams.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { CATEGORIES } from './streams.constants';

class StartStreamDto {
  @IsString() @MaxLength(100) title: string;
  @IsOptional() @IsIn([...CATEGORIES]) category?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5) @IsString({ each: true }) @MaxLength(24, { each: true }) tags?: string[];
}

class CountryDto {
  @IsString() @Length(2, 2) country: string;
}

@UseGuards(JwtAuthGuard)
@Controller('streams')
export class StreamsController {
  constructor(private streams: StreamsService) {}

  @Get('live')
listLive(@CurrentUser() u: AuthUser, @Query('sort') sort?: string, @Query('q') q?: string, @Query('category') category?: string) {
  const s = ['popular', 'new', 'following'].includes(sort ?? '') ? sort! : 'popular';
  const c = (CATEGORIES as readonly string[]).includes(category ?? '') ? category : undefined;
  return this.streams.listLive(u.id, s, q, c);
}

  // The country shown as a flag on the user's live card.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Put('country')
  setCountry(@CurrentUser() user: AuthUser, @Body() dto: CountryDto) {
    return this.streams.setCountry(user.id, dto.country);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartStreamDto) {
    return this.streams.start(user.id, dto.title, dto.category, dto.tags);
  }

  @Post(':id/join')
  join(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.streams.join(user.id, id);
  }

  @Post(':id/end')
  end(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.streams.end(user.id, id);
  }
}
