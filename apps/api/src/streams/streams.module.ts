import { Module } from '@nestjs/common';
import { StreamsController } from './streams.controller';
import { StreamsService } from './streams.service';
import { LivekitModule } from '../livekit/livekit.module';
import { PrismaModule } from '../prisma/prisma.module';


@Module({
  imports: [
    PrismaModule,
    LivekitModule,
  ],
  controllers: [StreamsController],
  providers: [StreamsService],
  exports: [StreamsService] 
})

export class StreamsModule {}