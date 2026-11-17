import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StreamsModule } from './streams/streams.module';
import { WalletModule } from './wallet/wallet.module';
import { DevModule } from './dev/dev.module';
import { ModerationModule } from './moderation/moderation.module';
import { CreatorModule } from './creator/creator.module';
import { HealthController } from './health.controller';
import { LivekitModule } from './livekit/livekit.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StreamsModule,
     LivekitModule,
    WalletModule,
    DevModule,
    AdminModule,
    PayoutsModule,
    ModerationModule,
    CreatorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
