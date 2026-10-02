import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { REDIS } from '../../infra/redis/redis.module.js';

export type ControlMessage =
  | { type: 'session.revoked'; sessionId: string }
  /** Usuário desativado, sessões revogadas, senha/2FA redefinidos ou escopo alterado. */
  | { type: 'user.invalidated'; userId: string };

export function controlChannel(env: Pick<Env, 'REDIS_KEY_PREFIX'>): string {
  return `${env.REDIS_KEY_PREFIX}realtime:control`;
}

/**
 * Sinaliza a todas as instâncias da API que streams SSE devem ser encerrados
 * imediatamente. A revalidação periódica do stream cobre qualquer sinal perdido.
 */
@Injectable()
export class RealtimeControl {
  private readonly logger = new Logger(RealtimeControl.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  invalidateSession(sessionId: string): Promise<void> {
    return this.send({ type: 'session.revoked', sessionId });
  }

  invalidateUser(userId: string): Promise<void> {
    return this.send({ type: 'user.invalidated', userId });
  }

  private async send(message: ControlMessage): Promise<void> {
    try {
      await this.redis.publish(controlChannel(this.env), JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ err: error }, 'Falha ao publicar controle de tempo real');
    }
  }
}

@Global()
@Module({ providers: [RealtimeControl], exports: [RealtimeControl] })
export class RealtimeControlModule {}
