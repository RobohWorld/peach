import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

// Friends + 1:1 text chat. PushService comes from the global PushModule.
@Module({
  controllers: [FriendsController, ChatController],
  providers: [FriendsService, ChatService],
})
export class SocialModule {}
