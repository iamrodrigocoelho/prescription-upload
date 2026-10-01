import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { RecaptchaV2Verifier } from './recaptcha-v2.verifier.js';

function fakeRedis(): Redis {
  const store = new Set<string>();
  return {
    set: (key: string, _v: string, _ex: string, _ttl: number, nx: string) => {
      if (nx === 'NX' && store.has(key)) return Promise.resolve(null);
      store.add(key);
      return Promise.resolve('OK');
    },
  } as unknown as Redis;
}

const env = {
  REDIS_KEY_PREFIX: 't:',
  RECAPTCHA_SECRET_KEY: 'segredo',
  RECAPTCHA_EXPECTED_HOSTNAMES: ['receita.venancio.com.br'],
  RECAPTCHA_VERIFY_URL: 'https://verify.invalid/siteverify',
  RECAPTCHA_TIMEOUT_MS: 1000,
} as unknown as Env;

const TOKEN = 'a'.repeat(40);

function mockFetch(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

describe('RecaptchaV2Verifier', () => {
  afterEach(() => vi.restoreAllMocks());

  it('aceita resposta válida do hostname esperado e envia secret + remoteip', async () => {
    const spy = mockFetch({ success: true, hostname: 'receita.venancio.com.br' });
    const verifier = new RecaptchaV2Verifier(env, fakeRedis());
    await expect(verifier.verify(TOKEN, '203.0.113.9')).resolves.toEqual({ ok: true });
    const body = spy.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('secret')).toBe('segredo');
    expect(body.get('response')).toBe(TOKEN);
    expect(body.get('remoteip')).toBe('203.0.113.9');
  });

  it('recusa token ausente ou malformado sem consultar o Google', async () => {
    const spy = mockFetch({ success: true });
    const verifier = new RecaptchaV2Verifier(env, fakeRedis());
    await expect(verifier.verify(undefined, undefined)).resolves.toEqual({
      ok: false,
      reason: 'missing',
    });
    await expect(verifier.verify('<script>', undefined)).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('recusa success=false', async () => {
    mockFetch({ success: false, 'error-codes': ['invalid-input-response'] });
    await expect(
      new RecaptchaV2Verifier(env, fakeRedis()).verify(TOKEN, undefined),
    ).resolves.toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('recusa hostname diferente do esperado (ex.: chave de teste em produção)', async () => {
    mockFetch({ success: true, hostname: 'testkey.google.com' });
    await expect(
      new RecaptchaV2Verifier(env, fakeRedis()).verify(TOKEN, undefined),
    ).resolves.toEqual({
      ok: false,
      reason: 'hostname',
    });
  });

  it('recusa token reutilizado, mesmo quando o Google aprovaria', async () => {
    mockFetch({ success: true, hostname: 'receita.venancio.com.br' });
    const verifier = new RecaptchaV2Verifier(env, fakeRedis());
    await expect(verifier.verify(TOKEN, undefined)).resolves.toEqual({ ok: true });
    await expect(verifier.verify(TOKEN, undefined)).resolves.toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('mapeia timeout-or-duplicate do Google', async () => {
    mockFetch({ success: false, 'error-codes': ['timeout-or-duplicate'] });
    await expect(
      new RecaptchaV2Verifier(env, fakeRedis()).verify(TOKEN, undefined),
    ).resolves.toEqual({
      ok: false,
      reason: 'duplicate',
    });
  });

  it('falha fechada quando o Google está indisponível', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      new RecaptchaV2Verifier(env, fakeRedis()).verify(TOKEN, undefined),
    ).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
    mockFetch({}, 500);
    await expect(
      new RecaptchaV2Verifier(env, fakeRedis()).verify(TOKEN, undefined),
    ).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});
