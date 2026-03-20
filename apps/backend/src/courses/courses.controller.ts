import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateCourseDto } from './dto/create-course.dto';
import { CoursesService } from './courses.service';

@Roles('admin', 'superadmin')
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async findAll() {
    return this.coursesService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateCourseDto) {
    return this.coursesService.create(dto);
  }
}
