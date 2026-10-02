import { Inject, Injectable } from '@nestjs/common';
import type { RealtimeEvent } from '@receita/shared';
import type { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { REDIS } from '../../infra/redis/redis.module.js';

/** Eventos guardados para reconexão com Last-Event-ID (aproximado; MAXLEN ~). */
export const REALTIME_STREAM_MAXLEN = 10_000;

export function realtimeStreamKey(env: Pick<Env, 'REDIS_KEY_PREFIX'>): string {
  return `${env.REDIS_KEY_PREFIX}realtime`;
}

/**
 * Publica eventos de tempo real num Redis Stream (D-063): compartilhado entre
 * instâncias da API e com histórico para Last-Event-ID. Apenas IDs e campos não
 * sensíveis (`RealtimeEvent`).
 */
@Injectable()
export class RealtimePublisher {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async publish(events: RealtimeEvent[]): Promise<void> {
    if (events.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const event of events) {
      pipeline.xadd(
        realtimeStreamKey(this.env),
        'MAXLEN',
        '~',
        String(REALTIME_STREAM_MAXLEN),
        '*',
        'data',
        JSON.stringify(event),
      );
    }
    const results = await pipeline.exec();
    const failed = results?.find(([error]) => error);
    if (failed?.[0]) throw failed[0];
  }
}
