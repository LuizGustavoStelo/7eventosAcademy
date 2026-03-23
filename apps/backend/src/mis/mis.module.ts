import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { StudentsModule } from '../students/students.module';
import { MisController } from './mis.controller';
import { MisService } from './mis.service';

@Module({
  imports: [PrismaModule, StudentsModule],
  controllers: [MisController],
  providers: [MisService],
})
export class MisModule {}
