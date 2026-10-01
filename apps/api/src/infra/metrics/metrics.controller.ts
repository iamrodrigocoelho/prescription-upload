import { timingSafeEqual } from 'node:crypto';
import { Controller, Get, Header, Inject, Req, Res } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import type { Request, Response } from 'express';
import { Public } from '../../common/auth/decorators.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { MetricsService } from './metrics.service.js';

/** Endpoint Prometheus. Desligado sem METRICS_TOKEN; exige Bearer token. Somente rede interna. */
@Controller('metrics')
@Public()
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Req() req: Request, @Res() res: Response): Promise<void> {
    const expected = this.env.METRICS_TOKEN;
    if (!expected) throw new AppError(ApiErrorCode.NOT_FOUND);
    const provided = Buffer.from(String(req.headers.authorization ?? '').replace(/^Bearer /, ''));
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      throw new AppError(ApiErrorCode.UNAUTHENTICATED);
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
