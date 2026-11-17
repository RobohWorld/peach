import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ModerationModule } from '../moderation/moderation.module';

@Module({ imports: [ModerationModule], controllers: [AdminController], providers: [AdminService] })
export class AdminModule {}
