import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassStatusDto } from './dto/update-class-status.dto';

@Roles('admin', 'superadmin')
@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  async findAll() {
    return this.classesService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  @Patch(':classId/status')
  async updateStatus(
    @Param('classId') classId: string,
    @Body() dto: UpdateClassStatusDto,
  ) {
    return this.classesService.updateStatus(classId, dto.status);
  }
}
