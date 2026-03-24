import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { ClassesMaterialsService } from './classes-materials.service';

@Module({
  controllers: [ClassesController],
  providers: [ClassesService, ClassesMaterialsService],
})
export class ClassesModule {}
