import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** Liveness: o processo está de pé. Não toca dependências externas. */
  @Get()
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
