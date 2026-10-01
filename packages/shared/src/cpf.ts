/**
 * Utilitários de CPF. Nunca registre o CPF integral em logs: use `maskCpf`.
 */

const CPF_LENGTH = 11;

/** Remove tudo que não for dígito. */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(digits: readonly number[], factorStart: number): number {
  const sum = digits.reduce((acc, digit, index) => acc + digit * (factorStart - index), 0);
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/** Validação estrutural (dígitos verificadores). Aceita entrada com ou sem máscara. */
export function isValidCpf(value: string): boolean {
  if (/[^\d.\-\s]/.test(value)) return false;
  const cpf = normalizeCpf(value);
  if (cpf.length !== CPF_LENGTH) return false;
  // Sequências repetidas (000.000.000-00, 111...) passam no cálculo, mas são inválidas.
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digits = cpf.split('').map(Number);
  const first = checkDigit(digits.slice(0, 9), 10);
  const second = checkDigit(digits.slice(0, 10), 11);
  return first === digits[9] && second === digits[10];
}

/** Formata para exibição em formulários (000.000.000-00). */
export function formatCpf(value: string): string {
  const cpf = normalizeCpf(value).slice(0, CPF_LENGTH);
  return cpf
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/**
 * Mascaramento para listagens (DESIGN §13.4): expõe apenas os 2 últimos dígitos.
 * Entradas inválidas retornam máscara completa, sem vazar nenhum dígito.
 */
export function maskCpf(value: string | null | undefined): string {
  const cpf = normalizeCpf(value ?? '');
  if (cpf.length !== CPF_LENGTH) return '***.***.***-**';
  return `***.***.***-${cpf.slice(-2)}`;
}
