import { timingSafeEqual } from 'node:crypto';
import { createHmac } from 'node:crypto';

/**
 * Token CSRF sincronizador derivado da sessão: HMAC(SESSION_SECRET, sessionId).
 * Muda sempre que a sessão é rotacionada; não precisa ser armazenado.
 */
export function deriveCsrfToken(sessionId: string, secret: string): string {
  return createHmac('sha256', secret).update(`csrf:${sessionId}`).digest('base64url');
}

export function verifyCsrfToken(sessionId: string, secret: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  const expected = Buffer.from(deriveCsrfToken(sessionId, secret));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
