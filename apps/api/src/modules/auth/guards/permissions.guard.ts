import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  hasPermission,
  type Permission,
} from '@receita/shared';
import { PERMISSIONS } from '../../../common/auth/decorators.js';
import type { AuthenticatedRequest } from '../../../common/auth/auth.types.js';
import { AppError } from '../../../common/errors.js';
import { sanitizeUrl } from '../../../common/logging/redact.js';
import { AuditService } from '../../audit/audit.service.js';

/** Autorização por permissão (`@RequirePermissions(...)`). Negações são auditadas. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.auth?.user.role;
    if (role && required.every((permission) => hasPermission(role, permission))) return true;

    await this.audit.recordSafely({
      action: AuditAction.AUTHZ_DENIED,
      entityType: 'Route',
      entityId: `${request.method} ${sanitizeUrl(request.originalUrl)}`.slice(0, 128),
      result: AuditResult.DENIED,
      metadata: { requiredPermissions: required },
    });
    throw new AppError(ApiErrorCode.FORBIDDEN);
  }
}
