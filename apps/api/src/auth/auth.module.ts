import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { WalletModule } from '../wallet/wallet.module';

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!s || s.length < 32)) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters');
  }
  return s ?? 'dev-secret';
}

@Global()
@Module({
  imports: [
    WalletModule,
    JwtModule.register({
      global: true,
      secret: jwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
