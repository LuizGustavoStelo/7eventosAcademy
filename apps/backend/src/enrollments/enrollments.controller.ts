import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
  async create(
    @Body() dto: CreateEnrollmentDto,
    @Req() request: FastifyRequest & { user: { sub: string; role?: string } },
  ) {
    return this.enrollmentsService.create(dto, {
      actorUserId: request.user?.sub,
      actorRole: request.user?.role,
    });
  }

  @Delete('class/:classId/student/:studentId')
  async remove(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.enrollmentsService.remove(classId, studentId);
  }
}
