import { randomBase62 } from '../../infra/crypto/primitives.js';

/** 12 caracteres base62 ≈ 71 bits: não sequencial e imprevisível (PRD §6.1). */
export const STORE_SLUG_LENGTH = 12;

export function generateStoreSlug(): string {
  return randomBase62(STORE_SLUG_LENGTH);
}
