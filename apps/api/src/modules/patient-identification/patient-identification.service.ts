import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@receita/shared';
import { UnrecoverableError } from 'bullmq';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PatientProvider, PatientProviderError } from '../patients/patient.provider.js';
import { patientDisplayLabel } from '../patients/patient-display.js';

export type IdentificationOutcome = 'matched' | 'no_match' | 'skipped' | 'already_linked';

/** Ator de sistema identificável na auditoria (sem usuário). */
export const AUTO_IDENTIFICATION_ACTOR = 'system:patient-auto-identification';

/**
 * Identificação automática por CPF (PRD §8.2, §8.4, CA-002; D-072). Roda no
 * worker, a partir de `prescription.submitted`. Nunca bloqueia o fluxo público.
 */
@Injectable()
export class PatientIdentificationService {
  private readonly logger = new Logger(PatientIdentificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly provider: PatientProvider,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Indisponibilidade da API lança erro (o job é repetido com backoff); entrada
   * inválida lança `UnrecoverableError` (sem novas tentativas). Os demais desfechos
   * retornam normalmente e ficam registrados em métricas.
   */
  async identify(submissionId: string): Promise<IdentificationOutcome> {
    const outcome = await this.run(submissionId);
    this.metrics.patientAutoIdentification.inc({ outcome });
    return outcome;
  }

  private async run(submissionId: string): Promise<IdentificationOutcome> {
    const submission = await this.prisma.prescriptionSubmission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        storeId: true,
        cpfEncrypted: true,
        identificationStatus: true,
        patientExternalId: true,
        sourceChannel: true,
      },
    });
    // Só receitas com CPF, não identificadas, sem paciente e fora do link personalizado.
    if (
      !submission?.cpfEncrypted ||
      submission.sourceChannel === 'PERSONALIZED_LINK' ||
      submission.identificationStatus !== 'NOT_IDENTIFIED' ||
      submission.patientExternalId !== null
    ) {
      return 'skipped';
    }

    // O CPF existe em claro apenas nesta variável, em memória.
    const cpf = this.crypto.decryptCpf(submission.cpfEncrypted);
    let match;
    try {
      match = await this.provider.findByCpf(cpf);
    } catch (error) {
      if (error instanceof PatientProviderError && error.kind === 'invalid') {
        throw new UnrecoverableError('Consulta de paciente recusada pela API (entrada inválida).');
      }
      throw error;
    }
    // Nenhum ou mais de um paciente: permanece "Não identificado" (PRD §8.4).
    if (!match) return 'no_match';

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      // Condicional: um vínculo manual feito antes nunca é sobrescrito.
      const updated = await tx.prescriptionSubmission.updateMany({
        where: {
          id: submission.id,
          patientExternalId: null,
          identificationStatus: 'NOT_IDENTIFIED',
        },
        data: {
          patientExternalId: match.externalId,
          identificationStatus: 'IDENTIFIED_AUTO_CPF',
          patientDisplayLabel: patientDisplayLabel(match),
          patientLabelCapturedAt: now,
        },
      });
      if (updated.count !== 1) return 'already_linked';

      await tx.patientLinkHistory.create({
        data: {
          submissionId: submission.id,
          patientExternalId: match.externalId,
          linkType: 'AUTOMATIC_CPF',
          linkedByUserId: null,
          createdAt: now,
        },
      });
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_PATIENT_LINKED,
          entityType: 'PrescriptionSubmission',
          entityId: submission.id,
          storeId: submission.storeId,
          actor: { userId: null, role: null },
          metadata: {
            linkType: 'automatic_cpf',
            patientExternalId: match.externalId,
            actor: AUTO_IDENTIFICATION_ACTOR,
          },
        },
        tx,
      );
      await this.outbox.add(tx, 'prescription.patient_linked', {
        submissionId: submission.id,
        storeId: submission.storeId,
        identificationStatus: 'IDENTIFIED_AUTO_CPF',
      });
      return 'matched';
    });
  }

  /** Tentativas esgotadas: a receita segue "Não identificado" (PRD §8.4, §33). */
  recordExhausted(): void {
    this.metrics.patientAutoIdentification.inc({ outcome: 'failed' });
    this.logger.warn(
      'Identificação automática esgotou as tentativas; receita segue não identificada',
    );
  }
}
