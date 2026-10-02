import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import {
  ApiErrorCode,
  isStoreInScope,
  Permission,
  resolveStoreScope,
  type StoreScope,
} from '@receita/shared';
import type { Request, Response } from 'express';
import { CurrentAuth, RequirePermissions, RouteScope } from '../../common/auth/decorators.js';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { RealtimeHub } from './realtime-hub.service.js';

function sameScope(a: StoreScope, b: StoreScope): boolean {
  if (a.all || b.all) return a.all === b.all;
  return a.storeIds.length === b.storeIds.length && a.storeIds.every((id) => isStoreInScope(b, id));
}

/** SSE autenticado pela sessão (cookie). Eventos só com IDs (PRD §12.5, §19.3). */
@Controller('realtime')
@RouteScope('STORE')
@RequirePermissions(Permission.PRESCRIPTIONS_READ)
export class RealtimeController {
  constructor(
    private readonly hub: RealtimeHub,
    private readonly scopes: StoreScopeService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('stream')
  async stream(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (this.hub.countForUser(auth.user.id) >= this.env.REALTIME_MAX_STREAMS_PER_USER) {
      throw new AppError(ApiErrorCode.RATE_LIMITED, 'Muitas abas conectadas ao tempo real.');
    }
    const scope = await this.scopes.scopeFor(auth);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Impede buffering em Nginx/Caddy/CDNs que respeitam este header.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const connection = this.hub.register({
      userId: auth.user.id,
      sessionId: auth.sessionId,
      scope,
      res,
    });
    this.hub.write(res, `retry: 5000\n: conectado\n\n`);

    const lastEventId = req.headers['last-event-id'];
    if (typeof lastEventId === 'string') await this.hub.replay(connection, lastEventId);

    const heartbeat = setInterval(
      () => this.hub.write(res, `: ping\n\n`),
      this.env.REALTIME_HEARTBEAT_SECONDS * 1000,
    );
    const revalidate = setInterval(() => {
      void this.stillValid(auth, scope).then((valid) => {
        if (!valid) this.hub.close(connection.id);
      });
    }, this.env.REALTIME_REVALIDATE_SECONDS * 1000);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      clearInterval(revalidate);
      this.hub.unregister(connection.id);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
  }

  /** Sessão ainda válida, usuário ativo e escopo inalterado. */
  private async stillValid(auth: AuthContext, scope: StoreScope): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: auth.sessionId },
      include: { user: { include: { storeAccess: { select: { storeId: true } } } } },
    });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.absoluteExpiresAt.getTime() <= now ||
      session.idleExpiresAt.getTime() <= now ||
      !session.user.active ||
      session.user.role !== auth.user.role
    ) {
      return false;
    }
    const current = resolveStoreScope(
      session.user.role,
      session.user.storeAccess.map((access) => access.storeId),
    );
    return sameScope(scope, current);
  }
}
