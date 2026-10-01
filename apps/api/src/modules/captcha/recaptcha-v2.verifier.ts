import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { sha256Hex } from '../../infra/crypto/primitives.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { type CaptchaResult, CaptchaVerifier } from './captcha.verifier.js';

/** Tokens do reCAPTCHA expiram em 2 min; a marca de uso dura mais que isso. */
const REPLAY_TTL_SECONDS = 300;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,4000}$/;

interface SiteverifyResponse {
  success: boolean;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * Google reCAPTCHA v2 checkbox (PRD §10.4). Verifica `success`, o hostname
 * esperado e rejeita token reutilizado — inclusive com as chaves de teste, que o
 * Google sempre aprova: o próprio sistema marca cada token como usado.
 */
@Injectable()
export class RecaptchaV2Verifier extends CaptchaVerifier {
  private readonly logger = new Logger(RecaptchaV2Verifier.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  async verify(token: string | undefined, remoteIp: string | undefined): Promise<CaptchaResult> {
    if (!token) return { ok: false, reason: 'missing' };
    if (!TOKEN_FORMAT.test(token)) return { ok: false, reason: 'invalid' };

    // Reserva o token antes de consultar o Google: duas requisições com o mesmo
    // token nunca são aceitas, mesmo em paralelo.
    const replayKey = `${this.env.REDIS_KEY_PREFIX}captcha:used:${sha256Hex(token)}`;
    const reserved = await this.redis.set(replayKey, '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
    if (reserved !== 'OK') return { ok: false, reason: 'duplicate' };

    let body: SiteverifyResponse;
    try {
      const params = new URLSearchParams({
        secret: this.env.RECAPTCHA_SECRET_KEY,
        response: token,
      });
      if (remoteIp) params.set('remoteip', remoteIp);
      const response = await fetch(this.env.RECAPTCHA_VERIFY_URL, {
        method: 'POST',
        body: params,
        signal: AbortSignal.timeout(this.env.RECAPTCHA_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`siteverify HTTP ${response.status}`);
      body = (await response.json()) as SiteverifyResponse;
    } catch (error) {
      this.logger.warn({ err: error }, 'reCAPTCHA indisponível');
      return { ok: false, reason: 'unavailable' };
    }

    if (!body.success) {
      return {
        ok: false,
        reason: body['error-codes']?.includes('timeout-or-duplicate') ? 'duplicate' : 'invalid',
      };
    }
    const hostname = body.hostname?.toLowerCase();
    if (!hostname || !this.env.RECAPTCHA_EXPECTED_HOSTNAMES.includes(hostname)) {
      return { ok: false, reason: 'hostname' };
    }
    return { ok: true };
  }
}
