import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type SubmissionResponse } from '@receita/shared';
import type { Redis } from 'ioredis';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { sha256Hex } from '../../infra/crypto/primitives.js';
import { REDIS } from '../../infra/redis/redis.module.js';

const TTL_SECONDS = 24 * 3600;
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,128}$/;

export type IdempotencyStart =
  | { kind: 'new'; keyHash: string }
  | { kind: 'replay'; response: SubmissionResponse }
  | { kind: 'none' };

/**
 * Idempotência do envio (RNF-012, D-044). A chave do cliente (header
 * Idempotency-Key, uma por tentativa de envio) é guardada apenas como hash, no
 * escopo do endpoint/link. Repetição com envio concluído → mesma resposta;
 * em andamento → 409; falha → a chave é liberada para nova tentativa.
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async begin(rawKey: string | string[] | undefined, scope: string): Promise<IdempotencyStart> {
    if (rawKey === undefined) return { kind: 'none' };
    if (typeof rawKey !== 'string' || !KEY_FORMAT.test(rawKey)) {
      throw new AppError(ApiErrorCode.VALIDATION_FAILED, 'Idempotency-Key inválida.');
    }
    const keyHash = sha256Hex(`${scope}:${rawKey}`);
    const redisKey = this.redisKey(keyHash);
    const reserved = await this.redis.set(redisKey, 'processing', 'EX', TTL_SECONDS, 'NX');
    if (reserved === 'OK') return { kind: 'new', keyHash };

    const state = await this.redis.get(redisKey);
    if (state === 'done') return { kind: 'replay', response: { status: 'RECEIVED' } };
    throw new AppError(ApiErrorCode.CONFLICT, 'Este envio já está em processamento.');
  }

  async complete(keyHash: string): Promise<void> {
    await this.redis.set(this.redisKey(keyHash), 'done', 'EX', TTL_SECONDS);
  }

  async release(keyHash: string): Promise<void> {
    await this.redis.del(this.redisKey(keyHash));
  }

  private redisKey(keyHash: string): string {
    return `${this.env.REDIS_KEY_PREFIX}idem:${keyHash}`;
  }
}
