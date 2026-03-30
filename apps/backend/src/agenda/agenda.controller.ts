import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { AgendaService } from './agenda.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @RequirePermissions('classes.read')
  @Get('events')
  async getEvents(@Req() request: AuthenticatedRequest) {
    return this.agendaService.getEvents(request.user);
  }

  @RequirePermissions('classes.read')
  @Get('class-events/meta')
  async getClassEventsMeta(@Req() request: AuthenticatedRequest) {
    return this.agendaService.getClassEventsMeta(request.user);
  }

  @RequirePermissions('classes.update')
  @Post('events')
  async createEvent(
    @Body()
    body: {
      type?: string;
      title?: string;
      classId?: string | null;
      className?: string;
      teacher?: string;
      datetime?: string;
      provider?: string | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agendaService.createEvent(request.user, body);
  }

  @RequirePermissions('classes.update')
  @Post('class-events/sync')
  async syncClassEvents(
    @Body()
    body: {
      classId?: string;
      className?: string;
      teacher?: string;
      recurrenceKind?: 'none' | 'weekly' | 'monthly';
      repeatUntil?: string | null;
      monthDay?: number | null;
      weeklyDays?: number[];
      events?: Array<{
        type?: string;
        title?: string;
        datetime?: string;
        provider?: string | null;
      }>;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.agendaService.syncClassEvents(request.user, body);
  }
}
