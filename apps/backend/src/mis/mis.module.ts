import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { StudentsModule } from '../students/students.module';
import { CoursesModule } from '../courses/courses.module';
import { MisController } from './mis.controller';
import { MisService } from './mis.service';

@Module({
  imports: [PrismaModule, StudentsModule, CoursesModule],
  controllers: [MisController],
  providers: [MisService],
})
export class MisModule {}
