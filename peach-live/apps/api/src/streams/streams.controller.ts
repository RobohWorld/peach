import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength } from 'class-validator';
import { StreamsService } from './streams.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';

class StartStreamDto {
  @IsString() @MaxLength(100) title: string;
}

@UseGuards(JwtAuthGuard)
@Controller('streams')
export class StreamsController {
  constructor(private streams: StreamsService) {}

  @Get('live')
  listLive() {
    return this.streams.listLive();
  }

  @Post()
  start(@CurrentUser() user: AuthUser, @Body() dto: StartStreamDto) {
    return this.streams.start(user.id, dto.title);
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
