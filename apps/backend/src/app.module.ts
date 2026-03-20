import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { ClassesModule } from './classes/classes.module';
import { CoursesModule } from './courses/courses.module';
import { PrismaModule } from './database/prisma.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { FinanceModule } from './finance/finance.module';
import { SecretsModule } from './security/secrets/secrets.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SecretsModule,
    PrismaModule,
    AuthModule,
    CoursesModule,
    ClassesModule,
    StudentsModule,
    EnrollmentsModule,
    FinanceModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
