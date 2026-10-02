import { z } from 'zod';
import { isValidCpf, normalizeCpf } from '../cpf.js';
import { emailSchema, uuidSchema } from './common.js';

export const PatientSearchType = { CPF: 'cpf', PHONE: 'phone', EMAIL: 'email' } as const;
export type PatientSearchType = (typeof PatientSearchType)[keyof typeof PatientSearchType];

/** Telefone brasileiro: somente dígitos, DDD + número, sem o DDI 55. */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

/**
 * Contexto obrigatório da busca (D-070): uma receita (vínculo manual) ou uma loja
 * (geração de link). O backend valida o escopo do usuário sobre ele antes de
 * consultar a API, e a seleção resultante só vale nesse contexto.
 */
export const patientSearchContextSchema = z.union([
  z.object({ prescriptionId: uuidSchema }).strict(),
  z.object({ storeId: uuidSchema }).strict(),
]);
export type PatientSearchContext = z.infer<typeof patientSearchContextSchema>;

const cpfQuery = z.string().trim().refine(isValidCpf, 'CPF inválido.').transform(normalizeCpf);
const phoneQuery = z
  .string()
  .trim()
  .transform(normalizePhone)
  .pipe(z.string().regex(/^\d{10,11}$/, 'Telefone inválido.'));

/**
 * Busca de pacientes (PRD §8.5): um único critério por busca. O termo vai no corpo
 * da requisição, nunca na URL (D-011).
 */
export const patientSearchSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('cpf'), query: cpfQuery, context: patientSearchContextSchema })
    .strict(),
  z
    .object({ type: z.literal('phone'), query: phoneQuery, context: patientSearchContextSchema })
    .strict(),
  z
    .object({ type: z.literal('email'), query: emailSchema, context: patientSearchContextSchema })
    .strict(),
]);
export type PatientSearchInput = z.infer<typeof patientSearchSchema>;

/**
 * Resultado mínimo para desambiguação (PRD §17.3), já mascarado no backend. Não
 * carrega o ID do paciente: `selectionRef` é uma referência opaca e temporária,
 * presa ao usuário, à sessão e ao contexto da busca (D-069).
 */
export interface PatientSearchResult {
  selectionRef: string;
  displayName: string;
  cpfMasked: string;
  phoneMasked: string | null;
  emailMasked: string | null;
}

/** Referência opaca: 32 bytes em base64url. */
export const selectionRefSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Seleção inválida.');
