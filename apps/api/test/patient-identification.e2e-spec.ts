import { AuditAction } from '@receita/shared';
import { Queue, QueueEvents, UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV } from '../src/config/config.module.js';
import type { Env } from '../src/config/env.js';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import { REDIS } from '../src/infra/redis/redis.module.js';
import {
  ATTACHMENTS_QUEUE,
  type ProcessSubmissionJob,
} from '../src/modules/attachments/attachments.queue.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import {
  OutboxDispatcher,
  toRealtimeEvents,
} from '../src/modules/outbox/outbox-dispatcher.service.js';
import { OutboxService } from '../src/modules/outbox/outbox.service.js';
import {
  IDENTIFY_PATIENT_JOB,
  identificationJobId,
  identificationJobOptions,
  type IdentifyPatientJob,
  PATIENT_IDENTIFICATION_QUEUE,
} from '../src/modules/patient-identification/patient-identification.queue.js';
import {
  AUTO_IDENTIFICATION_ACTOR,
  PatientIdentificationService,
} from '../src/modules/patient-identification/patient-identification.service.js';
import { MockPatientProvider } from '../src/modules/patients/mock-patient.provider.js';
import {
  PatientProvider,
  PatientProviderError,
  type PatientSummary,
} from '../src/modules/patients/patient.provider.js';
import { RealtimePublisher } from '../src/modules/realtime/realtime-publisher.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission } from './utils/factories.js';
import { JOAO, MARIA } from './utils/patients.js';

/** Delega ao mock, permitindo injetar falhas e efeitos colaterais por chamada. */
class ControlledProvider extends PatientProvider {
  readonly mock = new MockPatientProvider();
  calls = 0;
  before?: (call: number) => Promise<void>;
  results?: PatientSummary[];

  async searchByCpf(cpf: string): Promise<PatientSummary[]> {
    this.calls += 1;
    await this.before?.(this.calls);
    return this.results ?? this.mock.searchByCpf(cpf);
  }
  searchByPhone(phone: string): Promise<PatientSummary[]> {
    return this.mock.searchByPhone(phone);
  }
  searchByEmail(email: string): Promise<PatientSummary[]> {
    return this.mock.searchByEmail(email);
  }
}

describe('Identificação automática por CPF (worker)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  let env: Env;
  let provider: ControlledProvider;
  let service: PatientIdentificationService;
  const connections: Redis[] = [];
  const prefix = `rv-test-bull-ident-${Date.now()}`;
  const connection = () => {
    const redis = new Redis(process.env.REDIS_URL ?? '', { maxRetriesPerRequest: null });
    connections.push(redis);
    return redis;
  };

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
    env = ctx.app.get(ENV);
  });

  beforeEach(async () => {
    await ctx.reset();
    provider = new ControlledProvider();
    service = new PatientIdentificationService(
      ctx.prisma,
      crypto,
      provider,
      ctx.app.get(AuditService),
      ctx.app.get(OutboxService),
      ctx.app.get(MetricsService),
    );
  });

  afterAll(async () => {
    await Promise.all(connections.map((redis) => redis.quit()));
    await ctx.app.close();
  });

  async function submissionWithCpf(cpf: string | undefined, extra: object = {}) {
    const store = await createStore(ctx.prisma);
    return createSubmission(ctx.prisma, crypto, { storeId: store.id, cpf, ...extra });
  }

  it('CA-002: correspondência única vincula, registra histórico, auditoria de sistema e evento', async () => {
    const submission = await submissionWithCpf(JOAO.cpf);
    await expect(service.identify(submission.id)).resolves.toBe('matched');

    const updated = await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });
    expect(updated).toMatchObject({
      identificationStatus: 'IDENTIFIED_AUTO_CPF',
      patientExternalId: JOAO.externalId,
      patientDisplayLabel: `João T. · CPF ***.***.***-${JOAO.cpf.slice(-2)}`,
      patientLabelCapturedAt: expect.any(Date),
      operationalStatus: 'RECEIVED',
      version: submission.version,
    });

    const history = await ctx.prisma.patientLinkHistory.findMany({
      where: { submissionId: submission.id },
    });
    expect(history).toEqual([
      expect.objectContaining({
        linkType: 'AUTOMATIC_CPF',
        linkedByUserId: null,
        patientExternalId: JOAO.externalId,
      }),
    ]);

    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: AuditAction.PRESCRIPTION_PATIENT_LINKED, entityId: submission.id },
    });
    expect(audit).toMatchObject({
      actorUserId: null,
      actorRole: null,
      storeId: submission.storeId,
      result: 'SUCCESS',
      metadata: {
        linkType: 'automatic_cpf',
        patientExternalId: JOAO.externalId,
        actor: AUTO_IDENTIFICATION_ACTOR,
      },
    });
    expect(JSON.stringify(audit)).not.toContain(JOAO.cpf);

    const event = await ctx.prisma.outboxEvent.findFirstOrThrow({
      where: { type: 'prescription.patient_linked' },
    });
    expect(event.payload).toEqual({
      submissionId: submission.id,
      storeId: submission.storeId,
      identificationStatus: 'IDENTIFIED_AUTO_CPF',
    });
    expect(toRealtimeEvents(event.type, event.payload)).toEqual([
      {
        type: 'prescription.patient_linked',
        prescriptionId: submission.id,
        storeId: submission.storeId,
        identificationStatus: 'IDENTIFIED_AUTO_CPF',
      },
      { type: 'counters.updated', storeId: submission.storeId },
    ]);
  });

  it('sem correspondência ou com mais de um paciente: permanece "Não identificado"', async () => {
    const unknown = await submissionWithCpf('52998224725');
    await expect(service.identify(unknown.id)).resolves.toBe('no_match');

    const ambiguous = await submissionWithCpf(JOAO.cpf);
    provider.results = [
      ...(await provider.mock.searchByCpf(JOAO.cpf)),
      ...(await provider.mock.searchByCpf(MARIA.cpf)),
    ];
    await expect(service.identify(ambiguous.id)).resolves.toBe('no_match');

    for (const id of [unknown.id, ambiguous.id]) {
      expect(
        await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ identificationStatus: 'NOT_IDENTIFIED', patientExternalId: null });
    }
    expect(await ctx.prisma.patientLinkHistory.count()).toBe(0);
  });

  it('ignora receitas sem CPF, de link personalizado ou já identificadas — sem consultar a API', async () => {
    const withoutCpf = await submissionWithCpf(undefined);
    const personalized = await submissionWithCpf(JOAO.cpf, {
      sourceChannel: 'PERSONALIZED_LINK',
      patient: { externalId: JOAO.externalId, label: 'João T. · CPF ***.***.***-00' },
    });
    const identified = await submissionWithCpf(JOAO.cpf, {
      identificationStatus: 'IDENTIFIED_MANUAL',
      patient: { externalId: MARIA.externalId, label: 'Maria F. · CPF ***.***.***-00' },
    });
    for (const submission of [withoutCpf, personalized, identified]) {
      await expect(service.identify(submission.id)).resolves.toBe('skipped');
    }
    expect(provider.calls).toBe(0);
  });

  it('não sobrescreve um vínculo manual feito durante a consulta (update condicional)', async () => {
    const submission = await submissionWithCpf(JOAO.cpf);
    provider.before = async () => {
      await ctx.prisma.prescriptionSubmission.update({
        where: { id: submission.id },
        data: { patientExternalId: MARIA.externalId, identificationStatus: 'IDENTIFIED_MANUAL' },
      });
    };
    await expect(service.identify(submission.id)).resolves.toBe('already_linked');
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({
      patientExternalId: MARIA.externalId,
      identificationStatus: 'IDENTIFIED_MANUAL',
    });
    expect(await ctx.prisma.patientLinkHistory.count()).toBe(0);
    expect(await ctx.prisma.outboxEvent.count()).toBe(0);
  });

  it('API indisponível lança erro para nova tentativa; entrada inválida não é repetida', async () => {
    const submission = await submissionWithCpf(JOAO.cpf);
    provider.before = () => Promise.reject(new PatientProviderError('unavailable'));
    await expect(service.identify(submission.id)).rejects.toBeInstanceOf(PatientProviderError);
    provider.before = () => Promise.reject(new PatientProviderError('invalid'));
    await expect(service.identify(submission.id)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({ identificationStatus: 'NOT_IDENTIFIED' });
  });

  it('dispatcher enfileira a identificação só quando a fila é fornecida (flag ligada)', async () => {
    const submission = await submissionWithCpf(JOAO.cpf);
    const attachments = new Queue<ProcessSubmissionJob>(ATTACHMENTS_QUEUE, {
      connection: connection(),
      prefix,
    });
    const identification = new Queue<IdentifyPatientJob>(PATIENT_IDENTIFICATION_QUEUE, {
      connection: connection(),
      prefix,
      defaultJobOptions: identificationJobOptions(env),
    });
    const dispatcher = new OutboxDispatcher(
      ctx.prisma,
      new RealtimePublisher(ctx.app.get<Redis>(REDIS), env),
    );
    const event = () =>
      ctx.prisma.outboxEvent.create({
        data: {
          type: 'prescription.submitted',
          payload: { submissionId: submission.id, storeId: submission.storeId },
        },
      });
    try {
      await event();
      await dispatcher.dispatchBatch(attachments);
      expect(await identification.getJob(identificationJobId(submission.id))).toBeUndefined();

      await event();
      await dispatcher.dispatchBatch(attachments, identification);
      const job = await identification.getJob(identificationJobId(submission.id));
      expect(job?.name).toBe(IDENTIFY_PATIENT_JOB);
      expect(job?.data).toEqual({ submissionId: submission.id });
      expect(job?.opts.attempts).toBe(env.PATIENT_AUTO_IDENTIFICATION_ATTEMPTS);
    } finally {
      await attachments.obliterate({ force: true });
      await identification.obliterate({ force: true });
      await attachments.close();
      await identification.close();
    }
  });

  it('BullMQ repete com backoff após indisponibilidade e vincula na tentativa seguinte', async () => {
    const submission = await submissionWithCpf(JOAO.cpf);
    provider.before = (call) =>
      call === 1 ? Promise.reject(new PatientProviderError('unavailable')) : Promise.resolve();
    const queue = new Queue<IdentifyPatientJob>(PATIENT_IDENTIFICATION_QUEUE, {
      connection: connection(),
      prefix,
      defaultJobOptions: identificationJobOptions({
        PATIENT_AUTO_IDENTIFICATION_ATTEMPTS: 3,
        PATIENT_AUTO_IDENTIFICATION_BACKOFF_MS: 100,
      }),
    });
    const events = new QueueEvents(PATIENT_IDENTIFICATION_QUEUE, {
      connection: connection(),
      prefix,
    });
    const worker = new Worker<IdentifyPatientJob>(
      PATIENT_IDENTIFICATION_QUEUE,
      (job) => service.identify(job.data.submissionId),
      { connection: connection(), prefix },
    );
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        IDENTIFY_PATIENT_JOB,
        { submissionId: submission.id },
        { jobId: identificationJobId(submission.id) },
      );
      await expect(job.waitUntilFinished(events, 15_000)).resolves.toBe('matched');
      expect(provider.calls).toBe(2);
      expect(
        await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
      ).toMatchObject({ identificationStatus: 'IDENTIFIED_AUTO_CPF' });
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
});
