import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassesMaterialsService } from './classes-materials.service';
import { ClassesNoticesService } from './classes-notices.service';

@Module({
  controllers: [ClassesController],
  providers: [ClassesService, ClassesMaterialsService, ClassesNoticesService],
})
export class ClassesModule {}
