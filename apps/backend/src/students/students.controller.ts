import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentsService } from './students.service';

@Roles('admin', 'superadmin')
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  async findAll() {
    return this.studentsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }
}
