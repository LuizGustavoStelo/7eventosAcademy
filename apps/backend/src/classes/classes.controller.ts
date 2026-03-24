import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassStatusDto } from './dto/update-class-status.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { ClassesMaterialsService } from './classes-materials.service';
import { ClassesNoticesService } from './classes-notices.service';

@Roles('admin', 'superadmin')
@Controller('classes')
export class ClassesController {
  constructor(
    private readonly classesService: ClassesService,
    private readonly materialsService: ClassesMaterialsService,
    private readonly noticesService: ClassesNoticesService,
  ) {}

  @Get()
  async findAll() {
    return this.classesService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  @Patch(':classId')
  async update(@Param('classId') classId: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(classId, dto);
  }

  @Patch(':classId/status')
  async updateStatus(
    @Param('classId') classId: string,
    @Body() dto: UpdateClassStatusDto,
  ) {
    return this.classesService.updateStatus(classId, dto.status);
  }

  @Get(':classId/materials')
  async getMaterials(@Param('classId') classId: string) {
    return this.materialsService.getMaterials(classId);
  }

  @Get('materials/all')
  async getAllMaterials() {
    return this.materialsService.getAllMaterials();
  }

  @Post(':classId/notices')
  async createNotice(@Param('classId') classId: string, @Body() dto: any) {
    return this.noticesService.createNotice({ classId, ...dto });
  }

  @Get('notices/all')
  async getAllNotices() {
    return this.noticesService.getAllNotices();
  }
}

