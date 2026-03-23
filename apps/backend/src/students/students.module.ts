import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { UploadsModule } from '../uploads/uploads.module';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
