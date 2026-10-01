import { type CaptchaResult, CaptchaVerifier } from '../../src/modules/captcha/captcha.verifier.js';

/**
 * Captcha determinístico e offline para os testes da API. Tokens que começam com
 * `ok-` passam (uma única vez); qualquer outro falha. O adapter real do Google é
 * coberto por testes unitários (recaptcha-v2.verifier.spec.ts).
 */
export class FakeCaptchaVerifier extends CaptchaVerifier {
  private readonly used = new Set<string>();
  calls = 0;

  verify(token: string | undefined): Promise<CaptchaResult> {
    this.calls += 1;
    if (!token) return Promise.resolve({ ok: false, reason: 'missing' });
    if (!token.startsWith('ok-')) return Promise.resolve({ ok: false, reason: 'invalid' });
    if (this.used.has(token)) return Promise.resolve({ ok: false, reason: 'duplicate' });
    this.used.add(token);
    return Promise.resolve({ ok: true });
  }
}

let counter = 0;
export function captchaToken(): string {
  counter += 1;
  return `ok-${Date.now()}-${counter}`;
}
