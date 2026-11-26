import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ModerationModule } from '../moderation/moderation.module';
import { MediaModule } from '../media/media.module';

@Module({ imports: [ModerationModule, MediaModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}

