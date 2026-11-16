import { Controller, Get } from '@nestjs/common';

@Controller()
export class HealthController {
  @Get()
  root() {
    return { app: 'Peach Live API', status: 'ok' };
  }

  @Get('health')
  health() {
    return { status: 'ok', time: new Date().toISOString() };
  }
}
