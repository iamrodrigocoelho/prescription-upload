import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import type { AuthenticatedRequest } from '../../../common/auth/auth.types.js';
import { AppError } from '../../../common/errors.js';
import { ENV } from '../../../config/config.module.js';
import type { Env } from '../../../config/env.js';
import { verifyCsrfToken } from '../csrf.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Proteção CSRF em métodos que alteram estado (PRD §35):
 * 1. `Origin`, quando presente, deve ser a origem pública da aplicação;
 * 2. `Sec-Fetch-Site: cross-site` é rejeitado;
 * 3. com sessão, exige o token sincronizador no header `X-CSRF-Token`.
 * Complementa o cookie SameSite=Lax.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.allowedOrigin = new URL(env.PUBLIC_APP_URL).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (origin !== undefined && origin !== this.allowedOrigin) {
      throw new AppError(ApiErrorCode.CSRF_FAILED);
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      throw new AppError(ApiErrorCode.CSRF_FAILED);
    }
    if (
      request.auth &&
      !verifyCsrfToken(
        request.auth.sessionId,
        this.env.SESSION_SECRET,
        request.headers[CSRF_HEADER],
      )
    ) {
      throw new AppError(ApiErrorCode.CSRF_FAILED);
    }
    return true;
  }
}
