import { Injectable } from '@nestjs/common';
import { ApiErrorCode, AuditAction } from '@receita/shared';
import { AppError } from '../../common/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';
import { hashPatientLinkToken, isWellFormedPatientLinkToken } from './patient-link-token.js';

export interface ResolvedPatientLink {
  linkId: string;
  storeId: string;
  storeNumber: string;
  storeName: string;
  patientExternalId: string;
}

export type ConsumeResult = 'consumed' | 'already_consumed';

/** Erro único e neutro para qualquer falha (CA-014): não diferencia o motivo. */
const unavailable = (): AppError => new AppError(ApiErrorCode.LINK_UNAVAILABLE);

/**
 * Validação e consumo do token do link personalizado (PRD §6.5). Usado pelo fluxo
 * público da Fase 2 (GET /public/patient-links/{token} e envio da receita).
 */
@Injectable()
export class PatientLinkAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Resolve loja + paciente a partir do token. Inexistente, malformado, expirado,
   * revogado, já utilizado ou de loja inativa → o mesmo LINK_UNAVAILABLE.
   */
  async resolve(token: unknown): Promise<ResolvedPatientLink> {
    if (!isWellFormedPatientLinkToken(token)) throw unavailable();
    return this.resolveWhere({ tokenHash: hashPatientLinkToken(token) });
  }

  /** Mesmas verificações de `resolve`, a partir do ID (contexto em cookie — D-047). */
  async resolveById(linkId: string): Promise<ResolvedPatientLink> {
    return this.resolveWhere({ id: linkId });
  }

  private async resolveWhere(
    where: { tokenHash: string } | { id: string },
  ): Promise<ResolvedPatientLink> {
    const link = await this.prisma.patientUploadLink.findUnique({
      where,
      include: { store: true },
    });
    if (
      !link ||
      link.status !== 'ACTIVE' ||
      link.expiresAt.getTime() <= Date.now() ||
      !storeAcceptsSubmissions(link.store)
    ) {
      throw unavailable();
    }
    return {
      linkId: link.id,
      storeId: link.storeId,
      storeNumber: link.store.storeNumber,
      storeName: link.store.storeName,
      patientExternalId: link.patientExternalId,
    };
  }

  /**
   * Consumo dentro da transação que cria a receita (Fase 2). Ordem importa: o link
   * é REIVINDICADO primeiro (update condicional, que bloqueia a linha); só então a
   * receita é criada e associada. Criar a receita antes (FK para o link) e depois
   * atualizar o link causa deadlock entre envios concorrentes.
   * Se o link já não estiver ativo, lança o erro neutro e a transação é desfeita.
   */
  async consumeWithin<T extends { id: string }>(
    tx: Prisma.TransactionClient,
    linkId: string,
    createSubmission: () => Promise<T>,
  ): Promise<T> {
    const now = new Date();
    const claimed = await tx.patientUploadLink.updateMany({
      where: { id: linkId, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'USED', usedAt: now },
    });
    if (claimed.count !== 1) throw unavailable();

    const submission = await createSubmission();
    const link = await tx.patientUploadLink.update({
      where: { id: linkId },
      data: { usedSubmissionId: submission.id },
    });
    await this.audit.record(
      {
        action: AuditAction.PATIENT_LINK_CONSUMED,
        entityType: 'PatientUploadLink',
        entityId: linkId,
        storeId: link.storeId,
        actor: { userId: null, role: null },
        metadata: { submissionId: submission.id },
      },
      tx,
    );
    return submission;
  }

  /**
   * Marca o link como utilizado após um envio bem-sucedido (uso único, RF-035).
   * Atômico: update condicional — dois envios concorrentes não consomem o mesmo link.
   * Idempotente: repetir com o mesmo `submissionId` retorna `already_consumed`.
   * Passe `tx` para consumir na mesma transação que cria a receita.
   */
  async consume(
    linkId: string,
    submissionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ConsumeResult> {
    const db = tx ?? this.prisma;
    const now = new Date();
    const updated = await db.patientUploadLink.updateMany({
      where: { id: linkId, status: 'ACTIVE', expiresAt: { gt: now } },
      data: { status: 'USED', usedAt: now, usedSubmissionId: submissionId },
    });

    if (updated.count === 1) {
      const link = await db.patientUploadLink.findUniqueOrThrow({ where: { id: linkId } });
      await this.audit.record(
        {
          action: AuditAction.PATIENT_LINK_CONSUMED,
          entityType: 'PatientUploadLink',
          entityId: linkId,
          storeId: link.storeId,
          actor: { userId: null, role: null },
          metadata: { submissionId },
        },
        tx,
      );
      return 'consumed';
    }

    const current = await db.patientUploadLink.findUnique({ where: { id: linkId } });
    if (current?.status === 'USED' && current.usedSubmissionId === submissionId) {
      return 'already_consumed';
    }
    throw unavailable();
  }
}
