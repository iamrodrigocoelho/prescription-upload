import { randomInt } from 'node:crypto';
import { sha256Hex } from '../../infra/crypto/primitives.js';

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I). 10 caracteres ≈ 50 bits. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const RECOVERY_CODE_COUNT = 10;
const CODE_LENGTH = 10;

export function generateRecoveryCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET.charAt(randomInt(ALPHABET.length));
  return code;
}

/** Formato de exibição: XXXXX-XXXXX. */
export function formatRecoveryCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Hash vinculado ao usuário: o mesmo código em contas diferentes gera hashes diferentes. */
export function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return sha256Hex(`${userId}:${normalizedCode}`);
}
