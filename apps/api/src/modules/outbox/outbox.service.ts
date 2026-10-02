import type { IdentificationStatus } from '@receita/shared';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';

/** Eventos de domínio entregues via outbox. Payloads: apenas IDs e campos não sensíveis. */
export interface OutboxEventMap {
  /** Consumido pela fila de anexos (varredura/derivados) e pelo tempo real. */
  'prescription.submitted': { submissionId: string; storeId: string };
  'prescription.viewed': { submissionId: string; storeId: string };
  'prescription.patient_linked': {
    submissionId: string;
    storeId: string;
    identificationStatus: IdentificationStatus;
  };
  'prescription.status_changed': {
    submissionId: string;
    storeId: string;
    operationalStatus: string;
    version: number;
  };
}

export type OutboxEventType = keyof OutboxEventMap;

/**
 * Outbox transacional (D-054): o evento é gravado NA MESMA transação da ação.
 * O dispatcher do worker entrega à fila de jobs e ao stream de tempo real.
 */
@Injectable()
export class OutboxService {
  async add<K extends OutboxEventType>(
    tx: Prisma.TransactionClient,
    type: K,
    payload: OutboxEventMap[K],
  ): Promise<void> {
    await tx.outboxEvent.create({ data: { type, payload } });
  }
}
