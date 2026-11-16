import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevAdminController } from './dev-admin.controller';
import { DevAuthController } from './dev-auth.controller';

@Module({ controllers: [DevController, DevAuthController, DevAdminController] })
export class DevModule {}
