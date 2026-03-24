import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { CoursesModule } from './courses/courses.module';
import { PrismaModule } from './database/prisma.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { FinanceModule } from './finance/finance.module';
import { SecretsModule } from './security/secrets/secrets.module';
import { StudentsModule } from './students/students.module';
import { UploadsModule } from './uploads/uploads.module';
import { WordpressIntegrationModule } from './wordpress-integration/wordpress-integration.module';
import { MisModule } from './mis/mis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // ── Rate Limiting ──────────────────────────────────────────────────────
    // Perfil "default": 120 req / 60 s por IP — proteção geral da API
    // Perfil "public-mis": 10 req / 60 s por IP — cadastro público (anti-bot)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,  // janela de 60 segundos (ms)
        limit: 120,   // máx. 120 requisições por IP nessa janela
      },
      {
        name: 'public-mis',
        ttl: 60_000,  // janela de 60 segundos
        limit: 10,    // máx. 10 requisições por IP — muito restritivo intencionalmente
      },
    ]),

    SecretsModule,
    PrismaModule,
    AuthModule,
    CoursesModule,
    ClassesModule,
    StudentsModule,
    EnrollmentsModule,
    FinanceModule,
    UploadsModule,
    WordpressIntegrationModule,
    MisModule,
  ],
  controllers: [AppController],
  providers: [
    // Guard global de rate limiting (aplica o perfil "default" em toda a API)
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
