/**
 * Política de senha (PRD §15.2). Segue NIST SP 800-63B: comprimento mínimo,
 * máximo generoso, bloqueio de senhas óbvias — sem regras de composição.
 */

export const PASSWORD_DEFAULT_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  '123456789012',
  'senha1234567',
  'senhasenha12',
  'password1234',
  'qwertyuiop12',
  'venancio1234',
  'drogaria1234',
  'receita12345',
  'administrador',
  'abcdefghijkl',
]);

export interface PasswordPolicyOptions {
  minLength?: number;
  email?: string;
  name?: string;
}

/** Retorna a lista de problemas (vazia quando a senha atende à política). */
export function passwordPolicyIssues(
  password: string,
  options: PasswordPolicyOptions = {},
): string[] {
  const minLength = options.minLength ?? PASSWORD_DEFAULT_MIN_LENGTH;
  const issues: string[] = [];
  const lower = password.toLowerCase();

  if (password.length < minLength)
    issues.push(`A senha deve ter ao menos ${minLength} caracteres.`);
  if (password.length > PASSWORD_MAX_LENGTH) {
    issues.push(`A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
  }
  if (/^(.)\1+$/.test(password)) issues.push('A senha não pode repetir um único caractere.');
  if (COMMON_PASSWORDS.has(lower)) issues.push('Esta senha é muito comum. Escolha outra.');

  const emailLocal = options.email?.split('@')[0]?.toLowerCase();
  if (emailLocal && emailLocal.length >= 4 && lower.includes(emailLocal)) {
    issues.push('A senha não pode conter o seu e-mail.');
  }
  const firstName = options.name?.trim().split(/\s+/)[0]?.toLowerCase();
  if (firstName && firstName.length >= 4 && lower.includes(firstName)) {
    issues.push('A senha não pode conter o seu nome.');
  }
  return issues;
}
