import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context.js';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    // `req.id` é definido pelo pino-http (ver logger.config.ts) e já validado.
    const { id } = req as Request & { id?: unknown };
    const requestId = typeof id === 'string' ? id : '';
    RequestContext.run({ requestId, ip: req.ip }, () => next());
  }
}
