import { Module } from '@nestjs/common';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { ProfilesModule } from './profiles/profiles.module';
import { PushModule } from './push/push.module';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { PrismaModule } from './prisma/prisma.module';
import { LivekitModule } from './livekit/livekit.module';
import { AuthModule } from './auth/auth.module';
import { StreamsModule } from './streams/streams.module';
import { WalletModule } from './wallet/wallet.module';
import { ModerationModule } from './moderation/moderation.module';
import { CreatorModule } from './creator/creator.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ApplicationsModule } from './applications/applications.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
    PrismaModule,
    LivekitModule,
    AuthModule,
    StreamsModule,
    WalletModule,
    ModerationModule,
    CreatorModule,
    PayoutsModule,
    ApplicationsModule,
    AdminModule,
    LeaderboardsModule,
    ProfilesModule,
    PushModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
