import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtPayload } from '../auth/types/app-role.type';
import { AgendaService } from './agenda.service';

type AuthenticatedRequest = FastifyRequest & {
  user: JwtPayload;
};

@Roles('admin', 'superadmin')
@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get('events')
  async getEvents(@Req() request: AuthenticatedRequest) {
    return this.agendaService.getEvents(request.user);
  }

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
}
