import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service.js';

/** Latência por rota usando o TEMPLATE (ex.: /public/patient-links/:token), nunca a URL real. */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const end = this.metrics.httpDuration.startTimer();
    res.on('finish', () => {
      const route = (req.route as { path?: string } | undefined)?.path;
      end({
        method: req.method,
        route: route ? `${req.baseUrl}${route}` : 'unmatched',
        status: String(res.statusCode),
      });
    });
    next();
  }
}
