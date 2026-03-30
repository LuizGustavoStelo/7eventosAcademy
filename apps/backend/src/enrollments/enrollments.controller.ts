import { Body, Controller, Delete, Get, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @RequirePermissions('enrollments.read')
  @Get()
  async findAll(@Req() request: AuthenticatedRequest) {
    return this.enrollmentsService.findAll({
      actorUserId: request.user?.sub,
      actorRole: request.user?.role,
      actorInstitutionId: request.user?.activeInstitutionId,
    });
  }

  @RequirePermissions('enrollments.create')
  @Post()
  async create(
    @Body() dto: CreateEnrollmentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.enrollmentsService.create(dto, {
      actorUserId: request.user?.sub,
      actorRole: request.user?.role,
      actorInstitutionId: request.user?.activeInstitutionId,
    });
  }

  @RequirePermissions('enrollments.delete')
  @Delete('class/:classId/student/:studentId')
  async remove(
    @Param('classId') classId: string,
    @Param('studentId') studentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.enrollmentsService.remove(classId, studentId, {
      actorUserId: request.user?.sub,
      actorRole: request.user?.role,
      actorInstitutionId: request.user?.activeInstitutionId,
    });
  }
}
