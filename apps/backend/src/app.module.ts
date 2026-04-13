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
import { ContractsModule } from './contracts/contracts.module';
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
import { InstitutionUsersModule } from './institution-users/institution-users.module';
import { SuperadminIntegrationsModule } from './superadmin-integrations/superadmin-integrations.module';

function readThrottleEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name] ?? '');
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    // Rate limiting global por IP.
    // default: capacidade para navegação sem travar UX.
    // public-mis: agressivo para proteger cadastro público contra abuso.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: readThrottleEnv('THROTTLE_DEFAULT_TTL_MS', 10_000),
        limit: readThrottleEnv('THROTTLE_DEFAULT_LIMIT', 400),
      },
      {
        name: 'public-mis',
        ttl: readThrottleEnv('THROTTLE_PUBLIC_TTL_MS', 60_000),
        limit: readThrottleEnv('THROTTLE_PUBLIC_LIMIT', 10),
      },
    ]),

    SecretsModule,
    PrismaModule,
    AuthModule,
    AgendaModule,
    AttendanceModule,
    ContractsModule,
    CoursesModule,
    ClassesModule,
    StudentsModule,
    EnrollmentsModule,
    FinanceModule,
    UploadsModule,
    WordpressIntegrationModule,
    MisModule,
    SuperadminAccountsModule,
    InstitutionUsersModule,
    SuperadminIntegrationsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
