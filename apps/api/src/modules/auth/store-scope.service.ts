import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  isStoreInScope,
  resolveStoreScope,
  type StoreScope,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import type { Prisma, Store } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * Escopo de lojas aplicado na camada de consulta (anti-IDOR, PRD §14, §35).
 * Regra: toda consulta a dados de loja passa por `storeWhere`/`storeIdWhere`, e todo
 * `store_id` recebido do cliente passa por `assertStoreInScope`.
 */
@Injectable()
export class StoreScopeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async scopeFor(auth: AuthContext): Promise<StoreScope> {
    if (auth.storeScope) return auth.storeScope;
    const linked =
      auth.user.role === 'ADMIN'
        ? []
        : (
            await this.prisma.userStoreAccess.findMany({
              where: { userId: auth.user.id },
              select: { storeId: true },
            })
          ).map((row) => row.storeId);
    auth.storeScope = resolveStoreScope(auth.user.role, linked);
    return auth.storeScope;
  }

  /** Filtro para consultas no model Store. */
  async storeWhere(auth: AuthContext): Promise<Prisma.StoreWhereInput> {
    const scope = await this.scopeFor(auth);
    return scope.all ? {} : { id: { in: [...scope.storeIds] } };
  }

  /** Filtro para models com coluna `storeId` (links, receitas...). */
  async storeIdWhere(auth: AuthContext): Promise<{ storeId?: { in: string[] } }> {
    const scope = await this.scopeFor(auth);
    return scope.all ? {} : { storeId: { in: [...scope.storeIds] } };
  }

  /**
   * Valida um `store_id` vindo do cliente. Fora do escopo → 403 auditado (sem
   * revelar se a loja existe). Dentro do escopo, mas inexistente → 404.
   */
  async assertStoreInScope(auth: AuthContext, storeId: string): Promise<Store> {
    const scope = await this.scopeFor(auth);
    if (!isStoreInScope(scope, storeId)) {
      await this.audit.recordSafely({
        action: AuditAction.AUTHZ_DENIED,
        entityType: 'Store',
        entityId: storeId,
        result: AuditResult.DENIED,
        metadata: { reason: 'store_out_of_scope' },
      });
      throw new AppError(ApiErrorCode.FORBIDDEN);
    }
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new AppError(ApiErrorCode.NOT_FOUND);
    return store;
  }
}
