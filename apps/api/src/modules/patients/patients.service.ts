import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  hasPermission,
  Permission,
  type PatientSearchContext,
  type PatientSearchInput,
  type PatientSearchResult,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';
import { callProvider } from './patient-errors.js';
import { PatientSelectionService } from './patient-selection.service.js';
import { PatientProvider } from './patient.provider.js';

const MAX_RESULTS = 20;

export const ALREADY_LINKED_MESSAGE = 'Esta receita já tem um paciente vinculado.';

@Injectable()
export class PatientsService {
  constructor(
    private readonly provider: PatientProvider,
    private readonly selections: PatientSelectionService,
    private readonly prisma: PrismaService,
    private readonly scope: StoreScopeService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Busca por CPF, telefone ou e-mail (PRD §8.5), sempre vinculada a um contexto
   * validado (D-070). Rate limit por usuário contra enumeração; a auditoria
   * registra o tipo e a quantidade de resultados, nunca o termo.
   */
  async search(auth: AuthContext, input: PatientSearchInput): Promise<PatientSearchResult[]> {
    const { storeId } = await this.assertContext(auth, input.context);
    await this.rateLimit.consume('patientSearchUser', auth.user.id);
    const patients = await callProvider(() =>
      input.type === 'cpf'
        ? this.provider.searchByCpf(input.query)
        : input.type === 'phone'
          ? this.provider.searchByPhone(input.query)
          : this.provider.searchByEmail(input.query),
    );

    await this.audit.record({
      action: AuditAction.PATIENT_SEARCH_PERFORMED,
      entityType: 'Patient',
      storeId,
      metadata: {
        searchType: input.type,
        resultCount: patients.length,
        ...contextMetadata(input.context),
      },
    });
    return this.selections.issue(auth, input.context, patients.slice(0, MAX_RESULTS));
  }

  /**
   * Valida o contexto antes de qualquer consulta à API (D-070):
   * - loja: no escopo do usuário, aceitando envios, com permissão de gerar links;
   * - receita: no escopo (senão 404) e ainda sem paciente vinculado.
   */
  async assertContext(
    auth: AuthContext,
    context: PatientSearchContext,
  ): Promise<{ storeId: string }> {
    if ('storeId' in context) {
      if (!hasPermission(auth.user.role, Permission.PATIENT_LINKS_MANAGE)) {
        throw new AppError(ApiErrorCode.FORBIDDEN);
      }
      const store = await this.scope.assertStoreInScope(auth, context.storeId);
      if (!storeAcceptsSubmissions(store)) {
        throw new AppError(
          ApiErrorCode.CONFLICT,
          'Esta loja não está disponível para novos envios.',
        );
      }
      return { storeId: store.id };
    }

    const prescription = await this.prisma.prescriptionSubmission.findFirst({
      where: { AND: [{ id: context.prescriptionId }, await this.scope.storeIdWhere(auth)] },
      select: { storeId: true, identificationStatus: true, patientExternalId: true },
    });
    if (!prescription) throw new AppError(ApiErrorCode.NOT_FOUND);
    if (
      prescription.identificationStatus !== 'NOT_IDENTIFIED' ||
      prescription.patientExternalId !== null
    ) {
      throw new AppError(ApiErrorCode.CONFLICT, ALREADY_LINKED_MESSAGE);
    }
    return { storeId: prescription.storeId };
  }
}

export function contextMetadata(context: PatientSearchContext): Record<string, string> {
  return 'storeId' in context
    ? { contextType: 'store' }
    : { contextType: 'prescription', prescriptionId: context.prescriptionId };
}
