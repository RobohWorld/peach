import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { StreamsModule } from './streams/streams.module';
import { WalletModule } from './wallet/wallet.module';
import { DevModule } from './dev/dev.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    StreamsModule,
    WalletModule,
    DevModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
