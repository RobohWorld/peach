import { Module } from '@nestjs/common';
import { DevController } from './dev.controller';
import { DevAuthController } from './dev-auth.controller';

@Module({ controllers: [DevController, DevAuthController] })
export class DevModule {}
