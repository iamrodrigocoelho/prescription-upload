import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode, AuditAction, AuditResult, type Role } from '@receita/shared';
import { ROLES } from '../../../common/auth/decorators.js';
import type { AuthenticatedRequest } from '../../../common/auth/auth.types.js';
import { AppError } from '../../../common/errors.js';
import { sanitizeUrl } from '../../../common/logging/redact.js';
import { AuditService } from '../../audit/audit.service.js';

/** Autorização por perfil (`@Roles(...)`). Negações são auditadas. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth && roles.includes(request.auth.user.role)) return true;

    await this.audit.recordSafely({
      action: AuditAction.AUTHZ_DENIED,
      entityType: 'Route',
      entityId: `${request.method} ${sanitizeUrl(request.originalUrl)}`.slice(0, 128),
      result: AuditResult.DENIED,
      metadata: { requiredRoles: roles },
    });
    throw new AppError(ApiErrorCode.FORBIDDEN);
  }
}
