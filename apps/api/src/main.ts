import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

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

  app.setGlobalPrefix(prefix);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({
    origin: origin.split(',').map((s) => s.trim()),
    credentials: true,
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
