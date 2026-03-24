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

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
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
        frameSrc:    ["'none'"],
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
  });

  // ── Upload multipart ───────────────────────────────────────────────────────
  await app.register(multipart, {
    limits: {
      fileSize: 5 * 1024 * 1024, // 5 MB
      files: 1,
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
