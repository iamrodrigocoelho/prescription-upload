import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import { REDIS } from '../src/infra/redis/redis.module.js';
import { generateStorageKey } from '../src/infra/storage/storage-key.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { AttachmentProcessorService } from '../src/modules/attachments/attachment-processor.service.js';
import {
  ATTACHMENTS_QUEUE,
  PROCESS_SUBMISSION_JOB,
  type ProcessSubmissionJob,
  submissionJobId,
} from '../src/modules/attachments/attachments.queue.js';
import { NoopMalwareScanner } from '../src/modules/malware/malware-scanner.js';
import { OutboxDispatcher } from '../src/modules/outbox/outbox-dispatcher.service.js';
import {
  RealtimePublisher,
  realtimeStreamKey,
} from '../src/modules/realtime/realtime-publisher.js';
import { PDF } from './fixtures/files.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

const HEIC = readFileSync(resolve(import.meta.dirname, 'fixtures/amostra-sintetica.heic'));

describe('Worker: processamento de anexos e outbox (integração)', () => {
  let ctx: TestContext;
  let env: Env;
  let storage: StorageProvider;
  let processor: AttachmentProcessorService;
  let crypto: CryptoService;
  const connections: Redis[] = [];
  const prefix = `rv-test-bull-${Date.now()}`;

  const connection = () => {
    const redis = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: null });
    connections.push(redis);
    return redis;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    env = ctx.app.get(ENV);
    storage = ctx.app.get(StorageProvider);
    crypto = ctx.app.get(CryptoService);
    processor = new AttachmentProcessorService(
      ctx.prisma,
      storage,
      new NoopMalwareScanner(),
      ctx.app.get(MetricsService),
    );
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await Promise.all(connections.map((c) => c.quit().catch(() => undefined)));
    await ctx.app.close();
  });

  async function heicSubmission() {
    const store = await createStore(ctx.prisma);
    const key = generateStorageKey('test');
    await storage.putObject({ key, body: HEIC, contentType: 'image/heic' });
    const submission = await createSubmission(ctx.prisma, crypto, {
      storeId: store.id,
      files: [{ storageKey: key, mimeType: 'image/heic', malwareScanStatus: 'PENDING' }],
    });
    await ctx.prisma.prescriptionFile.updateMany({
      where: { submissionId: submission.id },
      data: { processingStatus: 'PENDING' },
    });
    return { store, submission, key };
  }

  it('HEIC gera derivado JPEG e miniatura; original preservado; NOT_SCANNED', async () => {
    const { submission, key } = await heicSubmission();
    await processor.processSubmission(submission.id);

    const file = await ctx.prisma.prescriptionFile.findFirstOrThrow({
      where: { submissionId: submission.id },
    });
    expect(file).toMatchObject({
      malwareScanStatus: 'NOT_SCANNED',
      processingStatus: 'DONE',
      previewMimeType: 'image/jpeg',
      previewStorageKey: `derivatives/${file.id}/preview.jpg`,
      thumbnailStorageKey: `derivatives/${file.id}/thumbnail.jpg`,
      storageKey: key,
    });
    const preview = await storage.getObject(file.previewStorageKey ?? '');
    expect((await sharp(preview).metadata()).format).toBe('jpeg');
    expect(await storage.getObject(key)).toEqual(HEIC);

    // Idempotente: reprocessar não falha nem altera nada.
    await processor.processSubmission(submission.id);
    expect(await ctx.prisma.prescriptionFile.findFirstOrThrow({ where: { id: file.id } })).toEqual(
      file,
    );
  });

  it('PDF: sem derivados, NOT_SCANNED', async () => {
    const store = await createStore(ctx.prisma);
    const key = generateStorageKey('test');
    await storage.putObject({ key, body: PDF(), contentType: 'application/pdf' });
    const submission = await createSubmission(ctx.prisma, crypto, {
      storeId: store.id,
      files: [{ storageKey: key, mimeType: 'application/pdf', malwareScanStatus: 'PENDING' }],
    });
    await processor.processSubmission(submission.id);
    const file = await ctx.prisma.prescriptionFile.findFirstOrThrow({
      where: { submissionId: submission.id },
    });
    expect(file).toMatchObject({
      processingStatus: 'DONE',
      malwareScanStatus: 'NOT_SCANNED',
      previewStorageKey: null,
      thumbnailStorageKey: null,
    });
  });

  it('retry: falha na 1ª tentativa e conclui na 2ª via BullMQ', async () => {
    const { submission } = await heicSubmission();
    const queue = new Queue<ProcessSubmissionJob>(ATTACHMENTS_QUEUE, {
      connection: connection(),
      prefix,
    });
    const events = new QueueEvents(ATTACHMENTS_QUEUE, { connection: connection(), prefix });
    let attempts = 0;
    const worker = new Worker<ProcessSubmissionJob>(
      ATTACHMENTS_QUEUE,
      async (job) => {
        attempts += 1;
        if (attempts === 1) throw new Error('storage indisponível (simulado)');
        await processor.processSubmission(job.data.submissionId);
      },
      { connection: connection(), prefix },
    );
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        PROCESS_SUBMISSION_JOB,
        { submissionId: submission.id },
        {
          attempts: 3,
          backoff: { type: 'fixed', delay: 50 },
          jobId: submissionJobId(submission.id),
        },
      );
      await job.waitUntilFinished(events, 15_000);
      expect(attempts).toBe(2);
      const file = await ctx.prisma.prescriptionFile.findFirstOrThrow({
        where: { submissionId: submission.id },
      });
      expect(file.processingStatus).toBe('DONE');
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });

  it('tentativas esgotadas: marca FAILED e o anexo continua com download no Admin', async () => {
    const { store, submission } = await heicSubmission();
    await processor.markFailed(submission.id);
    const file = await ctx.prisma.prescriptionFile.findFirstOrThrow({
      where: { submissionId: submission.id },
    });
    expect(file).toMatchObject({
      processingStatus: 'FAILED',
      processingErrorCode: 'processing_failed',
    });

    const collaborator = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [store.id] }),
    );
    const detail = await collaborator.get(`/prescriptions/${submission.id}`).expect(200);
    expect(detail.body.files[0]).toMatchObject({ accessible: true, previewAvailable: false });
    await collaborator
      .get(`/prescriptions/${submission.id}/files/${file.id}/download-url`)
      .expect(200);
  });

  it('dispatcher: enfileira o job, publica eventos de tempo real e marca o outbox como processado', async () => {
    const store = await createStore(ctx.prisma);
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: store.id });
    await ctx.prisma.outboxEvent.create({
      data: {
        type: 'prescription.submitted',
        payload: { submissionId: submission.id, storeId: store.id },
      },
    });
    const redis = ctx.app.get<Redis>(REDIS);
    const stream = realtimeStreamKey(env);
    await redis.del(stream);
    const queue = new Queue<ProcessSubmissionJob>(ATTACHMENTS_QUEUE, {
      connection: connection(),
      prefix,
    });
    const dispatcher = new OutboxDispatcher(ctx.prisma, new RealtimePublisher(redis, env));
    try {
      expect(await dispatcher.dispatchBatch(queue)).toBe(1);
      expect(await dispatcher.dispatchBatch(queue)).toBe(0);

      const job = await queue.getJob(submissionJobId(submission.id));
      expect(job?.data).toEqual({ submissionId: submission.id });
      const entries = await redis.xrange(stream, '-', '+');
      expect(entries.map(([, fields]) => JSON.parse(fields[1] ?? '{}') as unknown)).toEqual([
        { type: 'prescription.created', prescriptionId: submission.id, storeId: store.id },
        { type: 'counters.updated', storeId: store.id },
      ]);
      expect((await ctx.prisma.outboxEvent.findFirstOrThrow()).processedAt).not.toBeNull();

      // Reconciliação não duplica o job (jobId determinístico).
      await ctx.prisma.prescriptionFile.updateMany({
        where: { submissionId: submission.id },
        data: { processingStatus: 'PENDING', createdAt: new Date(Date.now() - 600_000) },
      });
      expect(await dispatcher.enqueueStalePending(queue)).toBe(1);
      expect(await queue.getJobCounts('waiting', 'delayed', 'active')).toMatchObject({
        waiting: 1,
      });
    } finally {
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
