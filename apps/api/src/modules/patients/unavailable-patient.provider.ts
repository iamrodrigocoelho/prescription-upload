import { Injectable } from '@nestjs/common';
import { PatientProvider, PatientProviderError, type PatientSummary } from './patient.provider.js';

const unavailable = (): Promise<never> =>
  Promise.reject(new PatientProviderError('unavailable', 'Integração de pacientes desligada.'));

/**
 * Integração desligada (PATIENT_INTEGRATION_ENABLED=false): toda chamada informa
 * indisponibilidade (PRD §33) e nada mais quebra.
 */
@Injectable()
export class UnavailablePatientProvider extends PatientProvider {
  searchByCpf(): Promise<PatientSummary[]> {
    return unavailable();
  }
  searchByPhone(): Promise<PatientSummary[]> {
    return unavailable();
  }
  searchByEmail(): Promise<PatientSummary[]> {
    return unavailable();
  }
  findByExternalId(): Promise<PatientSummary | null> {
    return unavailable();
  }
}
