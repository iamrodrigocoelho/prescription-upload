import { Controller, Get, Header, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

type CheckResult = 'ok' | 'fail';

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: o processo está de pé. Não toca dependências externas. */
  @Get()
  @Header('Cache-Control', 'no-store')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependências essenciais acessíveis. Não expõe detalhes de erro. */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  async ready(): Promise<{ status: 'ok'; checks: Record<string, CheckResult> }> {
    const checks: Record<string, CheckResult> = {
      database: await this.check('database', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
    };
    if (Object.values(checks).some((value) => value === 'fail')) {
      throw new AppError(ApiErrorCode.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', checks };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<CheckResult> {
    try {
      await probe();
      return 'ok';
    } catch (error) {
      this.logger.warn({ err: error, dependency: name }, 'Dependência indisponível');
      return 'fail';
    }
  }
}
