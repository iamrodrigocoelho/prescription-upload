import { Injectable, Logger } from '@nestjs/common';
import type { RealtimeEvent } from '@receita/shared';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  ATTACHMENT_JOB_OPTIONS,
  PROCESS_SUBMISSION_JOB,
  type ProcessSubmissionJob,
  submissionJobId,
} from '../attachments/attachments.queue.js';
import {
  IDENTIFY_PATIENT_JOB,
  identificationJobId,
  type IdentifyPatientJob,
} from '../patient-identification/patient-identification.queue.js';
import { RealtimePublisher } from '../realtime/realtime-publisher.js';
import type { OutboxEventMap } from './outbox.service.js';

const BATCH = 50;
const MAX_ATTEMPTS = 20;

/** Traduz um evento de domínio nos eventos de tempo real correspondentes. */
export function toRealtimeEvents(type: string, payload: unknown): RealtimeEvent[] {
  const p = payload as Partial<OutboxEventMap['prescription.status_changed']>;
  if (!p.submissionId || !p.storeId) return [];
  const counters: RealtimeEvent = { type: 'counters.updated', storeId: p.storeId };
  switch (type) {
    case 'prescription.submitted':
      return [
        { type: 'prescription.created', prescriptionId: p.submissionId, storeId: p.storeId },
        counters,
      ];
    case 'prescription.viewed':
      return [
        { type: 'prescription.viewed', prescriptionId: p.submissionId, storeId: p.storeId },
        counters,
      ];
    case 'prescription.patient_linked': {
      const linked = payload as OutboxEventMap['prescription.patient_linked'];
      return [
        {
          type: 'prescription.patient_linked',
          prescriptionId: linked.submissionId,
          storeId: linked.storeId,
          identificationStatus: linked.identificationStatus,
        },
        counters,
      ];
    }
    case 'prescription.status_changed':
      return [
        {
          type: 'prescription.status_changed',
          prescriptionId: p.submissionId,
          storeId: p.storeId,
          operationalStatus: p.operationalStatus as never,
          version: Number(p.version),
        },
        counters,
      ];
    default:
      return [];
  }
}

/**
 * Entrega os eventos do outbox (D-054): fila de anexos e stream de tempo real.
 * `FOR UPDATE SKIP LOCKED` permite várias instâncias do worker sem duplicar lotes.
 */
@Injectable()
export class OutboxDispatcher {
  private readonly logger = new Logger(OutboxDispatcher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimePublisher,
  ) {}

  /**
   * Reconciliação: reenfileira receitas com anexos ainda pendentes (envios
   * anteriores ao outbox, perda de dados no Redis, jobs removidos). O jobId
   * determinístico evita processamento duplicado.
   */
  async enqueueStalePending(
    queue: Queue<ProcessSubmissionJob>,
    olderThanMs = 120_000,
  ): Promise<number> {
    const rows = await this.prisma.prescriptionFile.findMany({
      where: { processingStatus: 'PENDING', createdAt: { lt: new Date(Date.now() - olderThanMs) } },
      select: { submissionId: true },
      distinct: ['submissionId'],
      take: 200,
    });
    for (const { submissionId } of rows) {
      await queue.add(
        PROCESS_SUBMISSION_JOB,
        { submissionId },
        {
          ...ATTACHMENT_JOB_OPTIONS,
          jobId: submissionJobId(submissionId),
        },
      );
    }
    return rows.length;
  }

  /**
   * `identificationQueue` só é passado com a identificação automática ligada
   * (PATIENT_AUTO_IDENTIFICATION_ENABLED); o próprio job revalida as condições.
   */
  async dispatchBatch(
    queue: Queue<ProcessSubmissionJob>,
    identificationQueue?: Queue<IdentifyPatientJob>,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<
        { id: string; type: string; payload: unknown; attempts: number }[]
      >`
        SELECT "id", "type", "payload", "attempts" FROM "outbox_events"
         WHERE "processed_at" IS NULL AND "attempts" < ${MAX_ATTEMPTS}
         ORDER BY "created_at" LIMIT ${BATCH} FOR UPDATE SKIP LOCKED`;
      for (const event of events) {
        try {
          if (event.type === 'prescription.submitted') {
            const { submissionId } = event.payload as OutboxEventMap['prescription.submitted'];
            await queue.add(
              PROCESS_SUBMISSION_JOB,
              { submissionId },
              {
                ...ATTACHMENT_JOB_OPTIONS,
                jobId: submissionJobId(submissionId),
              },
            );
            if (identificationQueue) {
              await identificationQueue.add(
                IDENTIFY_PATIENT_JOB,
                { submissionId },
                // Tentativas e backoff vêm de `defaultJobOptions` da fila (env).
                { jobId: identificationJobId(submissionId) },
              );
            }
          }
          await this.realtime.publish(toRealtimeEvents(event.type, event.payload));
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { processedAt: new Date() },
          });
        } catch (error) {
          this.logger.error({ err: error, type: event.type }, 'Falha ao entregar evento do outbox');
          await tx.outboxEvent.update({
            where: { id: event.id },
            data: { attempts: { increment: 1 } },
          });
        }
      }
      return events.length;
    });
  }
}
