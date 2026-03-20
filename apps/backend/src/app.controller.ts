import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

@Controller('health')
export class AppController {
  @Public()
  @Get()
  health() {
    return {
      status: 'ok',
      service: '7eventos-academy-api',
      timestamp: new Date().toISOString(),
    };
  }
}
