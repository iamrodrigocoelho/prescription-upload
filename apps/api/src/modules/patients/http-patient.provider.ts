import { PatientProvider, PatientProviderError, type PatientSummary } from './patient.provider.js';

export interface HttpPatientProviderConfig {
  baseUrl: string;
  /** Credencial de serviço; nunca logada. */
  token: string | undefined;
  timeoutMs: number;
}

/**
 * Adapter HTTP da API real de pacientes — ESQUELETO. O contrato ainda não foi
 * definido (PRD §42.4); endpoints e formatos NÃO devem ser inventados. Ver
 * docs/integrations/patients-api-checklist.md. Enquanto isso, a validação do
 * ambiente impede ligar a integração com este adapter (env.ts).
 *
 * Ao implementar: chamar a API com `fetch` + `AbortSignal.timeout`, mapear cada
 * registro com `toPatientSummary` (descarta campos extras) e traduzir falhas em
 * `PatientProviderError` (5xx/rede → unavailable, 400/422 → invalid). A suíte de
 * contrato (`patient-provider.contract.ts`) deve passar contra um servidor fake.
 */
export class HttpPatientProvider extends PatientProvider {
  constructor(private readonly config: HttpPatientProviderConfig) {
    super();
  }

  searchByCpf(): Promise<PatientSummary[]> {
    return this.pending();
  }

  searchByPhone(): Promise<PatientSummary[]> {
    return this.pending();
  }

  searchByEmail(): Promise<PatientSummary[]> {
    return this.pending();
  }

  findByExternalId(): Promise<PatientSummary | null> {
    return this.pending();
  }

  private pending(): Promise<never> {
    void this.config;
    return Promise.reject(
      new PatientProviderError('unavailable', 'Adapter HTTP de pacientes aguardando contrato.'),
    );
  }
}
