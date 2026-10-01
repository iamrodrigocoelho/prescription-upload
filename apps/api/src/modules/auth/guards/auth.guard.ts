import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode } from '@receita/shared';
import type { Response } from 'express';
import { ALLOWED_SESSION_STATES, IS_PUBLIC } from '../../../common/auth/decorators.js';
import type { AuthenticatedRequest } from '../../../common/auth/auth.types.js';
import { RequestContext } from '../../../common/context/request-context.js';
import { AppError } from '../../../common/errors.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { SessionState } from '../../../generated/prisma/client.js';
import { clearSessionCookie, readSessionCookie } from '../session-cookie.js';
import { SessionService } from '../session.service.js';

/**
 * Autenticação global: nega por padrão. Rotas públicas exigem `@Public()`.
 * Por padrão só sessões ACTIVE são aceitas; etapas intermediárias do login usam
 * `@AllowSessionStates(...)`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request, this.env);
    if (!token) throw new AppError(ApiErrorCode.UNAUTHENTICATED);

    const session = await this.sessions.resolve(token);
    if (!session) {
      clearSessionCookie(http.getResponse<Response>(), this.env);
      throw new AppError(ApiErrorCode.UNAUTHENTICATED);
    }

    const allowed = this.reflector.getAllAndOverride<SessionState[] | undefined>(
      ALLOWED_SESSION_STATES,
      targets,
    ) ?? [SessionState.ACTIVE];
    if (!allowed.includes(session.state)) {
      throw new AppError(
        session.state === SessionState.PENDING_MFA
          ? ApiErrorCode.MFA_REQUIRED
          : session.state === SessionState.MFA_ENROLLMENT_REQUIRED
            ? ApiErrorCode.MFA_ENROLLMENT_REQUIRED
            : ApiErrorCode.FORBIDDEN,
      );
    }

    const { user } = session;
    request.auth = {
      sessionId: session.id,
      sessionState: session.state,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        totpEnabled: user.totpEnabled,
        totpRequired: user.totpRequired,
      },
    };
    RequestContext.setActor(user.id, user.role);
    return true;
  }
}
