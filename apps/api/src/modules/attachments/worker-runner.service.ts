import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { OutboxDispatcher } from '../outbox/outbox-dispatcher.service.js';
import {
  identificationJobOptions,
  type IdentifyPatientJob,
  PATIENT_IDENTIFICATION_QUEUE,
} from '../patient-identification/patient-identification.queue.js';
import { PatientIdentificationService } from '../patient-identification/patient-identification.service.js';
import { AttachmentProcessorService } from './attachment-processor.service.js';
import { ATTACHMENTS_QUEUE, bullPrefix, type ProcessSubmissionJob } from './attachments.queue.js';

/**
 * Processo worker (D-062/D-054/D-072): loop do dispatcher do outbox e consumidores
 * BullMQ das filas de anexos e (quando ligada) de identificação automática por CPF.
 * Pode rodar em várias instâncias.
 */
@Injectable()
export class WorkerRunner implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerRunner.name);
  private queue?: Queue<ProcessSubmissionJob>;
  private worker?: Worker<ProcessSubmissionJob>;
  private identificationQueue?: Queue<IdentifyPatientJob>;
  private identificationWorker?: Worker<IdentifyPatientJob>;
  private connections: Redis[] = [];
  private timer?: NodeJS.Timeout;
  private sweepTimer?: NodeJS.Timeout;
  private stopping = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly dispatcher: OutboxDispatcher,
    private readonly processor: AttachmentProcessorService,
    private readonly identification: PatientIdentificationService,
  ) {}

  onApplicationBootstrap(): void {
    // BullMQ exige maxRetriesPerRequest: null nas conexões bloqueantes.
    const connection = (): Redis => {
      const redis = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: null });
      this.connections.push(redis);
      return redis;
    };
    const prefix = bullPrefix(this.env);
    this.queue = new Queue<ProcessSubmissionJob>(ATTACHMENTS_QUEUE, {
      connection: connection(),
      prefix,
    });
    this.worker = new Worker<ProcessSubmissionJob>(
      ATTACHMENTS_QUEUE,
      async (job) => this.processor.processSubmission(job.data.submissionId),
      { connection: connection(), prefix, concurrency: this.env.ATTACHMENTS_CONCURRENCY },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.warn({ err: error, attempt: job?.attemptsMade }, 'Job de anexos falhou');
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.processor.markFailed(job.data.submissionId);
      }
    });
    if (this.env.PATIENT_AUTO_IDENTIFICATION_ENABLED) {
      this.identificationQueue = new Queue<IdentifyPatientJob>(PATIENT_IDENTIFICATION_QUEUE, {
        connection: connection(),
        prefix,
        defaultJobOptions: identificationJobOptions(this.env),
      });
      this.identificationWorker = new Worker<IdentifyPatientJob>(
        PATIENT_IDENTIFICATION_QUEUE,
        async (job) => this.identification.identify(job.data.submissionId),
        { connection: connection(), prefix, concurrency: 2 },
      );
      this.identificationWorker.on('failed', (job, error) => {
        // Sem dados pessoais: só a tentativa e o tipo do erro.
        this.logger.warn(
          { attempt: job?.attemptsMade, error: error.name },
          'Identificação automática falhou',
        );
        const exhausted =
          job &&
          (error.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1));
        if (exhausted) this.identification.recordExhausted();
      });
    }
    this.scheduleTick(0);
    const sweep = (): void => {
      if (this.queue) {
        this.dispatcher
          .enqueueStalePending(this.queue)
          .catch((error: unknown) =>
            this.logger.error({ err: error }, 'Falha na reconciliação de anexos'),
          );
      }
    };
    sweep();
    this.sweepTimer = setInterval(sweep, 60_000);
    this.logger.log(
      this.identificationQueue
        ? 'Worker iniciado: outbox + fila de anexos + identificação automática'
        : 'Worker iniciado: outbox + fila de anexos',
    );
  }

  private scheduleTick(delay: number): void {
    if (this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    let delivered = 0;
    try {
      if (this.queue) {
        delivered = await this.dispatcher.dispatchBatch(this.queue, this.identificationQueue);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Falha no dispatcher do outbox');
    }
    // Lote cheio: continua imediatamente; senão aguarda o intervalo.
    this.scheduleTick(delivered >= 50 ? 0 : this.env.OUTBOX_POLL_INTERVAL_MS);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
    await this.identificationWorker?.close();
    await this.queue?.close();
    await this.identificationQueue?.close();
    await Promise.all(this.connections.map((redis) => redis.quit().catch(() => undefined)));
  }
}
