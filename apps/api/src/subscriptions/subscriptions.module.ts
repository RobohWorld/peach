import { Module } from '@nestjs/common';
import { WalletModule } from '../wallet/wallet.module';
import { SubscriptionsController, SubscriptionsCronController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [WalletModule],
  controllers: [SubscriptionsController, SubscriptionsCronController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
