import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AgendaModule } from './agenda/agenda.module';
import { AttendanceModule } from './attendance/attendance.module';
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
import { SuperadminAccountsModule } from './superadmin-accounts/superadmin-accounts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // Rate limiting global por IP.
    // default: alta capacidade para navegação do painel sem travar UX.
    // public-mis: agressivo para proteger cadastro público contra abuso.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 10_000,  // janela de 10 segundos
        limit: 220,   // ~1320 req/min por IP, com reset rápido
      },
      {
        name: 'public-mis',
        ttl: 60_000,  // janela de 60 segundos
        limit: 10,    // máximo de 10 req/min por IP
      },
    ]),

    SecretsModule,
    PrismaModule,
    AuthModule,
    AgendaModule,
    AttendanceModule,
    CoursesModule,
    ClassesModule,
    StudentsModule,
    EnrollmentsModule,
    FinanceModule,
    UploadsModule,
    WordpressIntegrationModule,
    MisModule,
    SuperadminAccountsModule,
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


