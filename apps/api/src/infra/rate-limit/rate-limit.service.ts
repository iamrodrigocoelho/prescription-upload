import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import type { Redis } from 'ioredis';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { REDIS } from '../redis/redis.module.js';

export type LimiterName =
  | 'loginIp'
  | 'forgotPasswordIp'
  | 'forgotPasswordEmail'
  | 'resetPasswordIp'
  | 'mfaSession'
  | 'patientSearchUser'
  | 'publicLookupIp'
  | 'publicSubmitIp';

/** Exceção de rate limit com o tempo de espera, usada para o header Retry-After. */
export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super(ApiErrorCode.RATE_LIMITED, undefined, undefined, {
      'Retry-After': String(Math.max(1, retryAfterSeconds)),
    });
  }
}

/**
 * Limitadores em Redis/Valkey (PRD §10.3, §15.2). Chaves sensíveis (e-mail) devem
 * ser passadas já como hash pelo chamador.
 */
@Injectable()
export class RateLimitService {
  private readonly limiters: Record<LimiterName, RateLimiterRedis>;

  constructor(@Inject(REDIS) redis: Redis, @Inject(ENV) env: Env) {
    const make = (name: string, points: number, duration: number): RateLimiterRedis =>
      new RateLimiterRedis({
        storeClient: redis,
        keyPrefix: `${env.REDIS_KEY_PREFIX}rl:${name}`,
        points,
        duration,
      });

    this.limiters = {
      loginIp: make('login-ip', env.LOGIN_RATE_LIMIT_POINTS, env.LOGIN_RATE_LIMIT_WINDOW_SECONDS),
      forgotPasswordIp: make('forgot-ip', 10, 3600),
      forgotPasswordEmail: make('forgot-email', 3, 3600),
      resetPasswordIp: make('reset-ip', 20, 900),
      mfaSession: make('mfa-session', 5, env.MFA_PENDING_TTL_MINUTES * 60),
      patientSearchUser: make('patient-search', 30, 60),
      publicLookupIp: make(
        'public-lookup-ip',
        env.PUBLIC_LOOKUP_RATE_LIMIT_POINTS,
        env.PUBLIC_LOOKUP_RATE_LIMIT_WINDOW_SECONDS,
      ),
      publicSubmitIp: make(
        'public-submit-ip',
        env.PUBLIC_SUBMIT_RATE_LIMIT_POINTS,
        env.PUBLIC_SUBMIT_RATE_LIMIT_WINDOW_SECONDS,
      ),
    };
  }

  /** Lança RATE_LIMITED se a chave já esgotou os pontos (sem consumir). */
  async assertNotBlocked(name: LimiterName, key: string): Promise<void> {
    const limiter = this.limiters[name];
    const state = await limiter.get(key);
    if (state && state.remainingPoints <= 0) {
      throw new RateLimitedError(Math.ceil(state.msBeforeNext / 1000));
    }
  }

  /** Consome um ponto; lança RATE_LIMITED quando o limite é excedido. */
  async consume(name: LimiterName, key: string): Promise<void> {
    try {
      await this.limiters[name].consume(key);
    } catch (error) {
      if (error instanceof RateLimiterRes) {
        throw new RateLimitedError(Math.ceil(error.msBeforeNext / 1000));
      }
      throw error;
    }
  }

  /**
   * Consome um ponto sem lançar. `exhausted`: este consumo usou o último ponto
   * disponível; `exceeded`: não havia mais pontos (consumo acima do limite).
   */
  async penalize(
    name: LimiterName,
    key: string,
  ): Promise<{ exhausted: boolean; exceeded: boolean }> {
    try {
      const res = await this.limiters[name].consume(key);
      return { exhausted: res.remainingPoints <= 0, exceeded: false };
    } catch (error) {
      if (error instanceof RateLimiterRes) return { exhausted: true, exceeded: true };
      throw error;
    }
  }

  async reset(name: LimiterName, key: string): Promise<void> {
    await this.limiters[name].delete(key);
  }
}
