import { Injectable } from '@nestjs/common';
import { AuditAction, type PatientSearchInput, type PatientSearchResult } from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { toSearchResult } from './patient-display.js';
import { PatientProvider } from './patient.provider.js';

const MAX_RESULTS = 20;

@Injectable()
export class PatientsService {
  constructor(
    private readonly provider: PatientProvider,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Busca por CPF, telefone ou e-mail (PRD §8.5). Rate limit por usuário contra
   * enumeração; a auditoria registra o tipo e a quantidade de resultados, nunca o termo.
   */
  async search(auth: AuthContext, input: PatientSearchInput): Promise<PatientSearchResult[]> {
    await this.rateLimit.consume('patientSearchUser', auth.user.id);
    const patients =
      input.type === 'cpf'
        ? await this.provider.searchByCpf(input.query)
        : input.type === 'phone'
          ? await this.provider.searchByPhone(input.query)
          : await this.provider.searchByEmail(input.query);

    await this.audit.record({
      action: AuditAction.PATIENT_SEARCH_PERFORMED,
      entityType: 'Patient',
      metadata: { searchType: input.type, resultCount: patients.length },
    });
    return patients.slice(0, MAX_RESULTS).map(toSearchResult);
  }
}
