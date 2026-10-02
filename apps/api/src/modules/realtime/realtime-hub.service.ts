import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { isStoreInScope, type RealtimeEvent, type StoreScope } from '@receita/shared';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { REDIS } from '../../infra/redis/redis.module.js';
import { type ControlMessage, controlChannel } from './realtime-control.js';
import { realtimeStreamKey } from './realtime-publisher.js';

const STREAM_ID = /^\d{1,20}-\d{1,20}$/;
const REPLAY_LIMIT = 500;

export interface StreamConnection {
  id: string;
  userId: string;
  sessionId: string;
  scope: StoreScope;
  res: Response;
}

/**
 * Hub SSE por instância (D-063): um leitor XREAD do Redis Stream compartilhado
 * distribui cada evento apenas às conexões cujo escopo de loja contém o storeId.
 * Sinais de controle (pub/sub) encerram conexões imediatamente.
 */
@Injectable()
export class RealtimeHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeHub.name);
  private readonly connections = new Map<string, StreamConnection>();
  private reader?: Redis;
  private subscriber?: Redis;
  private running = false;
  private lastId = '$';

  constructor(
    @Inject(ENV) private readonly env: Env,
    /** Conexão compartilhada (não bloqueante) para o replay; `reader` fica em XREAD BLOCK. */
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit(): void {
    this.running = true;
    this.reader = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
    void this.subscriber.subscribe(controlChannel(this.env));
    this.subscriber.on('message', (_channel, raw: string) => this.onControl(raw));
    void this.readLoop();
  }

  /**
   * Roda ANTES do fechamento do servidor HTTP: encerra os streams para que o
   * `server.close()` não espere conexões SSE abertas indefinidamente.
   */
  async onModuleDestroy(): Promise<void> {
    this.running = false;
    for (const connection of this.connections.values()) connection.res.end();
    this.connections.clear();
    this.reader?.disconnect();
    await this.subscriber?.quit().catch(() => undefined);
  }

  countForUser(userId: string): number {
    let count = 0;
    for (const connection of this.connections.values())
      if (connection.userId === userId) count += 1;
    return count;
  }

  register(connection: Omit<StreamConnection, 'id'>): StreamConnection {
    const registered = { ...connection, id: randomUUID() };
    this.connections.set(registered.id, registered);
    return registered;
  }

  unregister(id: string): void {
    this.connections.delete(id);
  }

  close(id: string): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    this.connections.delete(id);
    connection.res.end();
  }

  /** Reenvia eventos posteriores ao Last-Event-ID (filtrados pelo escopo). */
  async replay(connection: StreamConnection, lastEventId: string): Promise<void> {
    if (!STREAM_ID.test(lastEventId)) return;
    const entries = await this.redis.xrange(
      realtimeStreamKey(this.env),
      `(${lastEventId}`,
      '+',
      'COUNT',
      REPLAY_LIMIT,
    );
    for (const [id, fields] of entries) this.deliver(connection, id, fields);
  }

  write(res: Response, chunk: string): void {
    res.write(chunk);
    (res as Response & { flush?: () => void }).flush?.();
  }

  private async readLoop(): Promise<void> {
    while (this.running && this.reader) {
      try {
        const result = await this.reader.xread(
          'COUNT',
          100,
          'BLOCK',
          10_000,
          'STREAMS',
          realtimeStreamKey(this.env),
          this.lastId,
        );
        for (const [, entries] of result ?? []) {
          for (const [id, fields] of entries) {
            this.lastId = id;
            for (const connection of this.connections.values())
              this.deliver(connection, id, fields);
          }
        }
      } catch (error) {
        if (!this.running) return;
        this.logger.warn({ err: error }, 'Falha ao ler o stream de tempo real; nova tentativa');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private deliver(connection: StreamConnection, id: string, fields: string[]): void {
    const data = fields[fields.indexOf('data') + 1];
    if (!data) return;
    let event: RealtimeEvent;
    try {
      event = JSON.parse(data) as RealtimeEvent;
    } catch {
      return;
    }
    // Escopo aplicado no servidor: evento de loja fora do escopo nunca é enviado.
    if (!isStoreInScope(connection.scope, event.storeId)) return;
    this.write(connection.res, `id: ${id}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  private onControl(raw: string): void {
    let message: ControlMessage;
    try {
      message = JSON.parse(raw) as ControlMessage;
    } catch {
      return;
    }
    for (const connection of [...this.connections.values()]) {
      const matches =
        message.type === 'session.revoked'
          ? connection.sessionId === message.sessionId
          : connection.userId === message.userId;
      if (matches) this.close(connection.id);
    }
  }
}
