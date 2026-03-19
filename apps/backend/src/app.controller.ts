import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class AppController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: '7eventos-academy-api',
      timestamp: new Date().toISOString(),
    };
  }
}
