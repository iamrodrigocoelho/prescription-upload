import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  IDENTIFICATION_STATUS_LABELS,
  type IdentificationStatus,
  type LinkPatientResponse,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { PatientSelectionService } from '../patients/patient-selection.service.js';
import { ALREADY_LINKED_MESSAGE } from '../patients/patients.service.js';
import { PrescriptionsService } from './prescriptions.service.js';

/** 409 com o estado atual da identificação (a interface recarrega o detalhe). */
function alreadyLinked(status: IdentificationStatus): AppError {
  return new AppError(ApiErrorCode.CONFLICT, ALREADY_LINKED_MESSAGE, [
    { path: 'identificationStatus', message: IDENTIFICATION_STATUS_LABELS[status] },
  ]);
}

/**
 * Vínculo manual de paciente (PRD §8.6, CA-008; D-073). O paciente vem da
 * referência opaca da busca feita no contexto desta receita, nunca do cliente.
 */
@Injectable()
export class PrescriptionPatientLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prescriptions: PrescriptionsService,
    private readonly selections: PatientSelectionService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async link(auth: AuthContext, id: string, selectionRef: string): Promise<LinkPatientResponse> {
    const submission = await this.prescriptions.findScoped(auth, id);
    if (submission.identificationStatus !== 'NOT_IDENTIFIED' || submission.patientExternalId) {
      throw alreadyLinked(submission.identificationStatus);
    }
    const selection = await this.selections.resolve(auth, selectionRef, { prescriptionId: id });

    const linked = await this.prisma.$transaction(async (tx) => {
      // Condicional: se outro usuário ou o job automático vinculou antes, nada muda.
      const updated = await tx.prescriptionSubmission.updateMany({
        where: { id, patientExternalId: null, identificationStatus: 'NOT_IDENTIFIED' },
        data: {
          patientExternalId: selection.patientExternalId,
          identificationStatus: 'IDENTIFIED_MANUAL',
          patientDisplayLabel: selection.patientDisplayLabel,
          patientLabelCapturedAt: new Date(),
        },
      });
      if (updated.count !== 1) return false;

      await tx.patientLinkHistory.create({
        data: {
          submissionId: id,
          patientExternalId: selection.patientExternalId,
          linkType: 'MANUAL',
          linkedByUserId: auth.user.id,
        },
      });
      // Usuário, data/hora, receita e paciente (apenas o ID externo) — PRD §8.6.
      await this.audit.record(
        {
          action: AuditAction.PRESCRIPTION_PATIENT_LINKED,
          entityType: 'PrescriptionSubmission',
          entityId: id,
          storeId: submission.storeId,
          metadata: { linkType: 'manual', patientExternalId: selection.patientExternalId },
        },
        tx,
      );
      await this.outbox.add(tx, 'prescription.patient_linked', {
        submissionId: id,
        storeId: submission.storeId,
        identificationStatus: 'IDENTIFIED_MANUAL',
      });
      return true;
    });

    if (!linked) {
      const current = await this.prisma.prescriptionSubmission.findUniqueOrThrow({
        where: { id },
        select: { identificationStatus: true },
      });
      throw alreadyLinked(current.identificationStatus);
    }
    await this.selections.consume(selection);
    return {
      identificationStatus: 'IDENTIFIED_MANUAL',
      patientLabel: selection.patientDisplayLabel,
    };
  }
}
