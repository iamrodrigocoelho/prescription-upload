import { formatCpf, isValidCpf, normalizeCpf, SUBMISSION_MESSAGES } from '@receita/shared';

/**
 * Estado do campo CPF (DESIGN §6.5): máscara enquanto digita e validação apenas
 * após interação (blur ou 11 dígitos), com a mensagem do DESIGN §7.
 */
export function cpfFieldState(
  raw: string,
  touched: boolean,
): { value: string; valid: boolean; error?: string } {
  const value = formatCpf(raw);
  const digits = normalizeCpf(value);
  const valid = digits.length === 11 && isValidCpf(value);
  const shouldValidate = touched || digits.length === 11;
  if (digits.length === 0) return { value, valid: false };
  return shouldValidate && !valid
    ? { value, valid, error: SUBMISSION_MESSAGES.invalidCpf }
    : { value, valid };
}
