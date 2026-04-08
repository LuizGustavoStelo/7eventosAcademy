import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'path';
import { AppModule } from './app.module';

function readEnvMegabytes(name: string, fallbackMb: number): number {
  const raw = Number(process.env[name] ?? '');
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallbackMb;
  }
  return Math.floor(raw);
}

function readTrustProxy(): boolean | number | string {
  const raw = String(process.env.TRUST_PROXY ?? '').trim();
  if (!raw) {
    return process.env.NODE_ENV === 'production';
  }

  if (raw === 'true') return true;
  if (raw === 'false') return false;

  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.floor(asNumber);
  }

  return raw;
}

async function bootstrap() {
  const multipartMaxFileSizeMb = readEnvMegabytes('MULTIPART_MAX_FILE_SIZE_MB', 32);
  const httpBodyLimitMb = readEnvMegabytes('HTTP_BODY_LIMIT_MB', 40);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: httpBodyLimitMb * 1024 * 1024,
      trustProxy: readTrustProxy(),
    }),
  );

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        frameAncestors: ['*'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  });

  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/api/',
    decorateReply: false,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    },
  });

  await app.register(multipart, {
    limits: {
      fileSize: multipartMaxFileSizeMb * 1024 * 1024,
      files: 20,
    },
  });

  const rawOrigins = process.env.CORS_ORIGINS ?? '';
  const allowedOrigins: (string | RegExp)[] = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: process.env.NODE_ENV === 'production' && allowedOrigins.length > 0 ? allowedOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3210);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
