import { maskCpf, maskEmail, maskName, maskPhone } from '@receita/shared';
import type { PatientSummary } from './patient.provider.js';

/** Registro bruto como um adapter o recebe da API (existe apenas em memória, no adapter). */
export interface RawPatient {
  externalId: string;
  name: string;
  /** Somente dígitos. */
  cpf: string;
  phone: string | null;
  email: string | null;
}

/**
 * Minimização na fronteira do adapter (PRD §8.2): mascara e descarta todo o resto.
 * Campos extras do objeto de origem nunca são copiados.
 */
export function toPatientSummary(raw: RawPatient): PatientSummary {
  return {
    externalId: raw.externalId,
    displayName: maskName(raw.name),
    cpfMasked: maskCpf(raw.cpf),
    phoneMasked: raw.phone ? maskPhone(raw.phone) : null,
    emailMasked: raw.email ? maskEmail(raw.email) : null,
  };
}

/** Rótulo persistido no link e na receita (D-010). */
export function patientDisplayLabel(patient: PatientSummary): string {
  return `${patient.displayName} · CPF ${patient.cpfMasked}`;
}
