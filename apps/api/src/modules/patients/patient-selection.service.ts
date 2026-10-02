import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type PatientSearchContext,
  type PatientSearchResult,
  selectionRefSchema,
} from '@receita/shared';
import type { Redis } from 'ioredis';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { sha256Hex } from '../../infra/crypto/primitives.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { patientDisplayLabel } from './patient-display.js';
import type { PatientSummary } from './patient.provider.js';

interface StoredSelection {
  userId: string;
  sessionId: string;
  context: PatientSearchContext;
  externalId: string;
  label: string;
}

/** Paciente escolhido, resolvido no backend a partir da referência opaca. */
export interface ResolvedSelection {
  ref: string;
  patientExternalId: string;
  /** Rótulo mascarado para o snapshot de exibição (D-067). */
  patientDisplayLabel: string;
}

export const SELECTION_EXPIRED_MESSAGE = 'A seleção do paciente expirou. Faça a busca novamente.';

function sameContext(a: PatientSearchContext, b: PatientSearchContext): boolean {
  if ('storeId' in a) return 'storeId' in b && a.storeId === b.storeId;
  return 'prescriptionId' in b && a.prescriptionId === b.prescriptionId;
}

/**
 * Referência opaca de seleção de paciente (D-069). A busca devolve, por resultado,
 * um token aleatório; o ID do paciente fica só no Redis (TTL curto), preso ao
 * usuário, à sessão e ao contexto da busca. O vínculo manual e a geração de link
 * recebem apenas a referência — o cliente nunca escolhe um `patient_external_id`.
 */
@Injectable()
export class PatientSelectionService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly metrics: MetricsService,
  ) {}

  async issue(
    auth: AuthContext,
    context: PatientSearchContext,
    patients: PatientSummary[],
  ): Promise<PatientSearchResult[]> {
    if (patients.length === 0) return [];
    const pipeline = this.redis.multi();
    const results = patients.map((patient) => {
      const ref = randomBytes(32).toString('base64url');
      const stored: StoredSelection = {
        userId: auth.user.id,
        sessionId: auth.sessionId,
        context,
        externalId: patient.externalId,
        label: patientDisplayLabel(patient),
      };
      pipeline.set(
        this.key(ref),
        JSON.stringify(stored),
        'EX',
        this.env.PATIENT_SELECTION_TTL_SECONDS,
      );
      const { externalId: _omit, ...visible } = patient;
      return { selectionRef: ref, ...visible };
    });
    await pipeline.exec();
    return results;
  }

  /**
   * Resolve a referência. Expirada, malformada, de outro usuário, de outra sessão ou
   * de outro contexto → o mesmo erro (sem diferenciar o motivo ao cliente).
   */
  async resolve(
    auth: AuthContext,
    ref: string,
    context: PatientSearchContext,
  ): Promise<ResolvedSelection> {
    const rejected = () =>
      new AppError(ApiErrorCode.VALIDATION_FAILED, SELECTION_EXPIRED_MESSAGE, [
        { path: 'selectionRef', message: SELECTION_EXPIRED_MESSAGE },
      ]);
    if (!selectionRefSchema.safeParse(ref).success) throw rejected();
    const raw = await this.redis.get(this.key(ref));
    if (!raw) throw rejected();
    const stored = JSON.parse(raw) as StoredSelection;
    if (
      stored.userId !== auth.user.id ||
      stored.sessionId !== auth.sessionId ||
      !sameContext(stored.context, context)
    ) {
      // Referência válida usada fora do seu dono/contexto: possível manipulação.
      this.metrics.securityEvents.inc({ type: 'patient_selection_mismatch' });
      throw rejected();
    }
    return { ref, patientExternalId: stored.externalId, patientDisplayLabel: stored.label };
  }

  /** Uso único: descarta a referência após a ação ser concluída com sucesso. */
  async consume(selection: ResolvedSelection): Promise<void> {
    await this.redis.del(this.key(selection.ref));
  }

  private key(ref: string): string {
    // Só o hash da referência vai para a chave.
    return `${this.env.REDIS_KEY_PREFIX}psel:${sha256Hex(ref)}`;
  }
}
