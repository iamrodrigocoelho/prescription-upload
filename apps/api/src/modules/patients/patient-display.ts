import { maskCpf, maskEmail, maskName, maskPhone, type PatientSearchResult } from '@receita/shared';
import type { Patient } from './patient.provider.js';

/** Converte o paciente da API no mínimo necessário para desambiguação, já mascarado. */
export function toSearchResult(patient: Patient): PatientSearchResult {
  return {
    externalId: patient.externalId,
    displayName: maskName(patient.name),
    cpfMasked: maskCpf(patient.cpf),
    phoneMasked: patient.phone ? maskPhone(patient.phone) : null,
    emailMasked: patient.email ? maskEmail(patient.email) : null,
  };
}

/** Rótulo persistido no link personalizado (D-010). */
export function patientDisplayLabel(patient: Patient): string {
  return `${maskName(patient.name)} · CPF ${maskCpf(patient.cpf)}`;
}
