import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import helmet from '@fastify/helmet';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { join } from 'path';
import { AppModule } from './app.module';

function readEnvMegabytes(name: string, fallbackMb: number): number {
  const raw = Number(process.env[name] ?? '');
  if (!Number.isFinite(raw) || raw <= 0) {
    return fallbackMb;
  }
  return Math.floor(raw);
}

async function bootstrap() {
  const multipartMaxFileSizeMb = readEnvMegabytes(
    'MULTIPART_MAX_FILE_SIZE_MB',
    32,
  );
  const httpBodyLimitMb = readEnvMegabytes('HTTP_BODY_LIMIT_MB', 40);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      bodyLimit: httpBodyLimitMb * 1024 * 1024,
    }),
  );

  // ── Cabeçalhos de segurança HTTP (Helmet) ──────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   ["'self'", "'unsafe-inline'"],   // necessário para os scripts inline do MIS
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:      ["'self'", 'data:'],
        connectSrc:  ["'self'"],
        frameSrc:    ["'self'"],
        frameAncestors: ["*"], // Permitir que o MIS seja incorporado em iFrames de outros domínios (WP)
        objectSrc:   ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    // Permite que as páginas do MIS sejam carregadas em iframe pelo WordPress
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  });

  // ── Arquivos estáticos do MIS (HTML/CSS/JS) ────────────────────────────────
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/api/',
    decorateReply: false,
    // Garante que ativos estáticos (como fontes e CSS) tenham CORS habilitado,
    // mesmo para iframes em domínios diferentes.
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    },
  });

  // ── Upload multipart ───────────────────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: multipartMaxFileSizeMb * 1024 * 1024,
      files: 20,
    },
  });

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Em produção, restrito ao(s) domínio(s) configurado(s) via env.
  // Ex: CORS_ORIGINS=https://www.7eventos.com,https://academy.7eventos.com
  const rawOrigins = process.env.CORS_ORIGINS ?? '';
  const allowedOrigins: (string | RegExp)[] = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin:
      process.env.NODE_ENV === 'production' && allowedOrigins.length > 0
        ? allowedOrigins
        : true,             // em dev, libera tudo
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // ── Global Prefix ──────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ── Pipes de validação ─────────────────────────────────────────────────────
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
