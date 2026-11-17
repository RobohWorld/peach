import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind Vercel's proxy: use the real client IP (needed for rate limiting).
  app.set('trust proxy', 1);
  app.use(helmet());

  // Browsers: only your web app. Native apps send no Origin header and are unaffected.
  // If CORS_ORIGINS is empty, everything is allowed (local development only).
  const allowed = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: (origin, cb) => cb(null, !origin || allowed.length === 0 || allowed.includes(origin)),
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
