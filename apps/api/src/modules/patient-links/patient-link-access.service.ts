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
    const link = await this.prisma.patientUploadLink.findUnique({
      where: { tokenHash: hashPatientLinkToken(token) },
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
