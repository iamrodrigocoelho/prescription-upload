import { generateToken, sha256Hex } from '../../infra/crypto/primitives.js';

/** 32 bytes do CSPRNG em base64url (43 caracteres, 256 bits de entropia). */
export function generatePatientLinkToken(): { token: string; tokenHash: string } {
  const token = generateToken(32);
  return { token, tokenHash: hashPatientLinkToken(token) };
}

export function hashPatientLinkToken(token: string): string {
  return sha256Hex(token);
}

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedPatientLinkToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_FORMAT.test(value);
}
