import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { AttendanceService } from './attendance.service';
import { UpsertAttendanceDto } from './dto/upsert-attendance.dto';

type AuthenticatedRequest = FastifyRequest & {
  user: {
    sub: string;
  };
};

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Roles('admin', 'superadmin')
  @Get('teacher/classes')
  async getTeacherClasses() {
    return this.attendanceService.getTeacherClasses();
  }

  @Roles('admin', 'superadmin')
  @Get('teacher/classes/:classId/sessions')
  async getTeacherClassSessions(@Param('classId') classId: string) {
    return this.attendanceService.getTeacherClassSessions(classId);
  }

  @Roles('admin', 'superadmin')
  @Get('teacher/classes/:classId/sessions/:sessionId')
  async getTeacherSessionRoster(
    @Param('classId') classId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.attendanceService.getTeacherSessionRoster(classId, sessionId);
  }

  @Roles('admin', 'superadmin')
  @Put('teacher/classes/:classId/sessions/:sessionId')
  async saveTeacherSessionAttendance(
    @Param('classId') classId: string,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpsertAttendanceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.attendanceService.saveTeacherSessionAttendance({
      classId,
      sessionId,
      actorId: request.user.sub,
      items: dto.items,
    });
  }

  @Get('student/summary')
  async getStudentSummary(@Req() request: AuthenticatedRequest) {
    return this.attendanceService.getStudentSummary(request.user.sub);
  }
}
