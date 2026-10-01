import { EventEmitter } from 'node:events';
import { Global, Injectable, Logger, Module } from '@nestjs/common';

/** Eventos de domínio. Payloads carregam apenas IDs — nunca dados pessoais. */
export interface DomainEventMap {
  /** Consumido pela Fase 3 (tempo real) e pela Fase 4 (identificação por CPF). */
  'prescription.submitted': { submissionId: string; storeId: string };
}

/**
 * Barramento em processo, emitido após o commit. Ponto de extensão: a Fase 3 deve
 * publicar em Redis pub/sub ou outbox para não perder eventos em caso de queda.
 */
@Injectable()
export class DomainEventBus {
  private readonly logger = new Logger(DomainEventBus.name);
  private readonly emitter = new EventEmitter();

  emit<K extends keyof DomainEventMap>(name: K, payload: DomainEventMap[K]): void {
    try {
      this.emitter.emit(name, payload);
    } catch (error) {
      // Um consumidor com falha nunca desfaz o que já foi confirmado.
      this.logger.error({ err: error, event: name }, 'Falha em consumidor de evento de domínio');
    }
  }

  on<K extends keyof DomainEventMap>(
    name: K,
    handler: (payload: DomainEventMap[K]) => void,
  ): () => void {
    this.emitter.on(name, handler);
    return () => this.emitter.off(name, handler);
  }
}

@Global()
@Module({ providers: [DomainEventBus], exports: [DomainEventBus] })
export class DomainEventsModule {}
