import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { R2Service } from './r2.service';

@Module({
  imports: [WalletModule, SubscriptionsModule],
  controllers: [MediaController],
  providers: [MediaService, R2Service],
})
export class MediaModule {}
