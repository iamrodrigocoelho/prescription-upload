import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  hasPermission,
  Permission,
  type PatientSearchContext,
  type PatientSearchInput,
  type PatientSearchResult,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { hmacSha256 } from '../../infra/crypto/primitives.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StoreScopeService } from '../auth/store-scope.service.js';
import { storeAcceptsSubmissions } from '../stores/stores.service.js';
import { callProvider } from './patient-errors.js';
import { PatientSelectionService } from './patient-selection.service.js';
import { PatientProvider, type PatientSummary } from './patient.provider.js';

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
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Busca por CPF, telefone ou e-mail (PRD §8.5), sempre vinculada a um contexto
   * validado (D-070). Contra enumeração (D-071): limites por usuário e por sessão,
   * máximo de resultados e auditoria de TODA busca — inclusive recusadas — com o
   * tipo de critério, o contexto, a quantidade de resultados e um HMAC do termo
   * (nunca o valor).
   */
  async search(auth: AuthContext, input: PatientSearchInput): Promise<PatientSearchResult[]> {
    const metadata = {
      searchType: input.type,
      queryFingerprint: hmacSha256(
        `${input.type}:${input.query}`,
        this.env.PATIENT_SEARCH_AUDIT_PEPPER,
      ),
      ...contextMetadata(input.context),
    };
    const record = (
      result: AuditResult,
      extra: Record<string, unknown>,
      storeId?: string,
    ): Promise<void> =>
      this.audit.record({
        action: AuditAction.PATIENT_SEARCH_PERFORMED,
        entityType: 'Patient',
        storeId,
        result,
        metadata: { ...metadata, ...extra },
      });

    let storeId: string | undefined;
    try {
      ({ storeId } = await this.assertContext(auth, input.context));
      await this.consumeLimits(auth);
    } catch (error) {
      await record(AuditResult.DENIED, { reason: denialReason(error) }, storeId);
      throw error;
    }

    let patients: PatientSummary[];
    try {
      patients = await callProvider(() =>
        input.type === 'cpf'
          ? this.provider.searchByCpf(input.query)
          : input.type === 'phone'
            ? this.provider.searchByPhone(input.query)
            : this.provider.searchByEmail(input.query),
      );
    } catch (error) {
      await record(AuditResult.FAILURE, { reason: denialReason(error) }, storeId);
      throw error;
    }

    const returned = patients.slice(0, this.env.PATIENT_SEARCH_MAX_RESULTS);
    await record(
      AuditResult.SUCCESS,
      { resultCount: patients.length, returnedCount: returned.length },
      storeId,
    );
    return this.selections.issue(auth, input.context, returned);
  }

  private async consumeLimits(auth: AuthContext): Promise<void> {
    await this.rateLimit.consume('patientSearchUserMinute', auth.user.id);
    await this.rateLimit.consume('patientSearchUserHour', auth.user.id);
    await this.rateLimit.consume('patientSearchSession', auth.sessionId);
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

/** Motivo categórico da recusa/falha (nunca a mensagem ou o termo). */
function denialReason(error: unknown): string {
  if (!(error instanceof AppError)) return 'error';
  switch (error.code) {
    case ApiErrorCode.RATE_LIMITED:
      return 'rate_limited';
    case ApiErrorCode.FORBIDDEN:
      return 'out_of_scope';
    case ApiErrorCode.NOT_FOUND:
      return 'not_found';
    case ApiErrorCode.CONFLICT:
      return 'context_unavailable';
    case ApiErrorCode.SERVICE_UNAVAILABLE:
      return 'integration_unavailable';
    case ApiErrorCode.VALIDATION_FAILED:
      return 'invalid';
    default:
      return 'error';
  }
}
