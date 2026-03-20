import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@Roles('admin', 'superadmin')
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get()
  async findAll() {
    return this.enrollmentsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateEnrollmentDto) {
    return this.enrollmentsService.create(dto);
  }
}
