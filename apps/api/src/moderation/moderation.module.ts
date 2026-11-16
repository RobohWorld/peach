import { Module } from '@nestjs/common';
import { AdminController, ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';

@Module({ controllers: [ModerationController, AdminController], providers: [ModerationService] })
export class ModerationModule {}
