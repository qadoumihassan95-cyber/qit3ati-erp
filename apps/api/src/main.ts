import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// ---------------------------------------------------------------------------
// Global BigInt-safe JSON serialization.
// Prisma models with `BigInt` id columns (e.g. TelegramCommandLog) blow up
// on JSON.stringify because JS's default toJSON doesn't know how to
// serialize BigInts. Registering a toJSON hook once at bootstrap makes
// every downstream JSON.stringify (Nest response, third-party libs,
// application code) coerce BigInts to strings — the standard convention
// for wire-format BigInt values and safe for JavaScript consumers.
// ---------------------------------------------------------------------------
(BigInt.prototype as any).toJSON = function () { return this.toString(); };

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  // Render injects PORT automatically; fall back to API_PORT for local dev.
  const port   = parseInt(config.get<string>('PORT') ?? config.get<string>('API_PORT', '3001'), 10);
  const origin = config.get<string>('CORS_ORIGIN', 'http://localhost:5173');

  // When deployed behind Render's proxy, trust the X-Forwarded-* headers
  // so request.ip / secure cookies work correctly.
  const httpAdapter = app.getHttpAdapter().getInstance();
  if (typeof httpAdapter?.set === 'function') httpAdapter.set('trust proxy', 1);

  // Body parser: default 100kb is too small for image uploads (base64 data URLs).
  // Raise to 8MB to cover part-image uploads while still rejecting abusive payloads.
  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));

  app.setGlobalPrefix(prefix);

  // Security headers — Helmet must run before CORS so headers attach to every response.
  // Conservative config (only well-supported options across helmet 7.x versions
  // and Render's reverse proxy).
  app.use(helmet({
    contentSecurityPolicy: false,            // API only, no inline scripts — CSP managed at the static site
    crossOriginResourcePolicy: false,        // allow the Web origin to read JSON
    crossOriginEmbedderPolicy: false,
    hsts: { maxAge: 15552000, includeSubDomains: true, preload: false },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.enableCors({
    origin: origin.split(',').map((s) => s.trim()),
    credentials: true,
    methods: 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    exposedHeaders: ['Content-Length', 'Content-Type'],
    maxAge: 600,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port, '0.0.0.0');
  Logger.log(`🚀 Qit3ati API listening on port ${port} (prefix /${prefix})`, 'Bootstrap');
}
bootstrap();
