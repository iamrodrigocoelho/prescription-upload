import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode } from '@receita/shared';
import {
  IS_PUBLIC,
  ROUTE_SCOPE,
  type RouteScopePolicy,
} from '../../../common/auth/decorators.js';
import type { AuthenticatedRequest } from '../../../common/auth/auth.types.js';
import { AppError } from '../../../common/errors.js';
import { StoreScopeService } from '../store-scope.service.js';

/** Política de escopo explícita por rota; consultas continuam filtrando pelo escopo. */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly stores: StoreScopeService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const policy = this.reflector.getAllAndOverride<RouteScopePolicy>(ROUTE_SCOPE, targets);
    const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
    if (!auth || !policy) throw new AppError(ApiErrorCode.FORBIDDEN);
    if (policy === 'GLOBAL') {
      if (auth.user.role !== 'ADMIN') throw new AppError(ApiErrorCode.FORBIDDEN);
    } else if (policy === 'STORE') {
      const scope = await this.stores.scopeFor(auth);
      if (!scope.all && scope.storeIds.length === 0) throw new AppError(ApiErrorCode.FORBIDDEN);
    }
    return true;
  }
}
