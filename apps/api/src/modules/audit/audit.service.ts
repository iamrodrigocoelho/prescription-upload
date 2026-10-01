import { Injectable, Logger } from '@nestjs/common';
import { type AuditAction, AuditResult, type Role } from '@receita/shared';
import { RequestContext } from '../../common/context/request-context.js';
import { scrubSensitive } from '../../common/logging/redact.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditEvent {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  storeId?: string | null;
  result?: AuditResult;
  /** Nunca inclua CPF integral, tokens, senhas ou conteúdo de receita (são removidos, mas não confie nisso). */
  metadata?: Record<string, unknown>;
  /** Por padrão, o ator vem do contexto da requisição. */
  actor?: { userId: string | null; role: Role | null };
}

type AuditWriter = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Trilha de auditoria append-only (PRD §23). Apenas inserção — não há método de
 * atualização ou remoção, e o banco bloqueia ambos por trigger.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um evento. Passe `tx` para gravar na mesma transação da ação auditada
   * (a ação e seu registro de auditoria são confirmados ou desfeitos juntos).
   */
  async record(event: AuditEvent, tx?: AuditWriter): Promise<void> {
    const context = RequestContext.get();
    const actorUserId = event.actor ? event.actor.userId : (context?.userId ?? null);
    const actorRole = event.actor ? event.actor.role : (context?.role ?? null);

    await (tx ?? this.prisma).auditLog.create({
      data: {
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        storeId: event.storeId ?? null,
        result: event.result ?? AuditResult.SUCCESS,
        metadata: event.metadata
          ? (scrubSensitive(event.metadata) as Prisma.InputJsonObject)
          : undefined,
        actorUserId,
        actorRole,
        ipAddress: context?.ip ?? null,
        correlationId: context?.requestId || null,
      },
    });
  }

  /**
   * Variante para eventos de segurança fora de transação (ex.: login falho): uma
   * falha ao auditar é logada, mas não altera a resposta ao cliente.
   */
  async recordSafely(event: AuditEvent): Promise<void> {
    try {
      await this.record(event);
    } catch (error) {
      this.logger.error({ err: error, action: event.action }, 'Falha ao registrar auditoria');
    }
  }
}
