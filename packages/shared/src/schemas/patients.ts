import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../cpf.js';
import { emailSchema } from './common.js';

export const PatientSearchType = { CPF: 'cpf', PHONE: 'phone', EMAIL: 'email' } as const;
export type PatientSearchType = (typeof PatientSearchType)[keyof typeof PatientSearchType];

/** Telefone brasileiro: somente dígitos, DDD + número, sem o DDI 55. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

/**
 * Busca de pacientes (PRD §8.5). O termo vai no corpo da requisição (D-011).
 */
export const patientSearchSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cpf'),
    query: z.string().trim().refine(isValidCpf, 'CPF inválido.').transform(normalizeCpf),
  }),
  z.object({
    type: z.literal('phone'),
    query: z
      .string()
      .trim()
      .transform(normalizePhone)
      .pipe(z.string().regex(/^\d{10,11}$/, 'Telefone inválido.')),
  }),
  z.object({ type: z.literal('email'), query: emailSchema }),
]);
export type PatientSearchInput = z.infer<typeof patientSearchSchema>;

/** Resultado mínimo para desambiguação (PRD §17.3), já mascarado no backend. */
export interface PatientSearchResult {
  externalId: string;
  displayName: string;
  cpfMasked: string;
  phoneMasked: string | null;
  emailMasked: string | null;
}
