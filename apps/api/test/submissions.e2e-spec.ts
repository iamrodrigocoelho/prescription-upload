import { randomUUID } from 'node:crypto';
import { ApiErrorCode, AuditAction, MAX_FILE_BYTES } from '@receita/shared';
import request from 'supertest';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { StorageProvider } from '../src/infra/storage/storage.provider.js';
import { MOCK_PATIENTS } from '../src/modules/patients/mock-patient.provider.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { captchaToken } from './utils/fake-captcha.js';
import { createStore, createUser } from './utils/factories.js';
import { EXE, JPEG, PDF, PNG } from './fixtures/files.js';
import { loginAs } from './utils/http.js';

const VALID_CPF = '529.982.247-25';
const PATIENT = MOCK_PATIENTS[0]!;

type Part = { name: string; content: Buffer; filename: string };

describe('Envio público de receitas (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  let storage: StorageProvider;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
    storage = ctx.app.get(StorageProvider);
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  function post(
    path: string,
    fields: Record<string, string>,
    files: Part[],
    idempotencyKey?: string,
  ) {
    let req = request(ctx.app.getHttpServer()).post(path);
    if (idempotencyKey) req = req.set('Idempotency-Key', idempotencyKey);
    for (const [name, value] of Object.entries(fields)) req = req.field(name, value);
    for (const file of files) req = req.attach(file.name, file.content, file.filename);
    return req;
  }

  const file = (content: Buffer, filename: string): Part => ({ name: 'files', content, filename });
  const submitToStore = (
    slug: string,
    extra: Record<string, string> = {},
    files = [file(JPEG(), 'receita.jpg')],
  ) => post('/public/prescriptions', { captchaToken: captchaToken(), slug, ...extra }, files);

  async function createPersonalizedLink(storeId: string) {
    const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
    const res = await admin
      .post('/admin/patient-links', { storeId, patientExternalId: PATIENT.externalId })
      .expect(201);
    return {
      token: /\/p\/([A-Za-z0-9_-]{43})$/.exec(res.body.url as string)?.[1] ?? '',
      id: res.body.link.id as string,
    };
  }

  async function objectExists(key: string) {
    return (await storage.headObject(key)) !== null;
  }

  describe('link da loja e entrada genérica', () => {
    it('CA-001: envio sem CPF cria receita "Recebida" e "Não identificado", sem protocolo', async () => {
      const store = await createStore(ctx.prisma);
      const res = await submitToStore(store.publicSlug, {}, [
        file(JPEG(), 'receita.jpg'),
        file(PDF(), 'receita.pdf'),
      ]).expect(201);
      expect(res.body).toEqual({ status: 'RECEIVED' });

      const submission = await ctx.prisma.prescriptionSubmission.findFirstOrThrow({
        include: { files: true },
      });
      expect(submission).toMatchObject({
        storeId: store.id,
        operationalStatus: 'RECEIVED',
        identificationStatus: 'NOT_IDENTIFIED',
        sourceChannel: 'STORE_LINK',
        cpfEncrypted: null,
        patientExternalId: null,
      });
      expect(submission.files).toHaveLength(2);
      for (const stored of submission.files) {
        expect(stored.malwareScanStatus).toBe('PENDING');
        expect(stored.checksum).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.storageKey).toMatch(/^prescriptions\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
        expect(stored.storageKey).not.toContain('receita');
        expect(await objectExists(stored.storageKey)).toBe(true);
      }
      // Ordem de envio preservada (JPEG enviado primeiro, PDF depois).
      const ordered = [...submission.files].sort((x, y) => x.position - y.position);
      expect(ordered.map((f) => [f.position, f.mimeType])).toEqual([
        [1, 'image/jpeg'],
        [2, 'application/pdf'],
      ]);
      const days = (submission.retentionUntil.getTime() - Date.now()) / 86_400_000;
      expect(Math.round(days)).toBe(365);
      expect(await ctx.prisma.statusHistory.count({ where: { submissionId: submission.id } })).toBe(
        1,
      );
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.PRESCRIPTION_SUBMITTED, entityId: submission.id },
      });
      expect(audit).toMatchObject({
        storeId: store.id,
        metadata: expect.objectContaining({ fileCount: 2, documentProvided: false }),
      });
    });

    it('CA-002: CPF válido é persistido criptografado e com hash, nunca em texto puro', async () => {
      const store = await createStore(ctx.prisma);
      await submitToStore(store.publicSlug, { cpf: VALID_CPF }).expect(201);
      const submission = await ctx.prisma.prescriptionSubmission.findFirstOrThrow();
      expect(submission.identificationStatus).toBe('NOT_IDENTIFIED');
      expect(crypto.decryptCpf(submission.cpfEncrypted ?? '')).toBe('52998224725');
      expect(submission.cpfHashForLookup).toBe(crypto.cpfLookupHash(VALID_CPF));

      const dump = JSON.stringify(
        await ctx.prisma.$queryRawUnsafe(
          `SELECT row_to_json(t)::text AS j FROM prescription_submissions t
           UNION ALL SELECT row_to_json(a)::text FROM audit_logs a WHERE a.store_id = '${store.id}'`,
        ),
      );
      expect(dump).not.toContain('52998224725');
      expect(dump).not.toContain('529.982.247-25');
    });

    it('rejeita CPF inválido', async () => {
      const store = await createStore(ctx.prisma);
      const res = await submitToStore(store.publicSlug, { cpf: '111.111.111-11' }).expect(400);
      expect(res.body.error.issues[0].message).toBe('CPF inválido.');
    });

    it('entrada genérica usa a loja selecionada (source_channel = generic)', async () => {
      const store = await createStore(ctx.prisma);
      await post('/public/prescriptions', { captchaToken: captchaToken(), storeId: store.id }, [
        file(PNG(), 'foto.png'),
      ]).expect(201);
      const submission = await ctx.prisma.prescriptionSubmission.findFirstOrThrow();
      expect(submission).toMatchObject({ storeId: store.id, sourceChannel: 'GENERIC' });
    });

    it('CA-010: loja inativa não aceita envio', async () => {
      const store = await createStore(ctx.prisma, { active: false });
      const res = await submitToStore(store.publicSlug).expect(409);
      expect(res.body.error.code).toBe(ApiErrorCode.STORE_UNAVAILABLE);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
    });

    it('loja inexistente, campo desconhecido ou slug + storeId juntos são rejeitados', async () => {
      const store = await createStore(ctx.prisma);
      await submitToStore('AAAAAAAAAAAA').expect(404);
      await submitToStore(store.publicSlug, { patientId: 'x' }).expect(400);
      await submitToStore(store.publicSlug, { storeId: store.id }).expect(400);
    });

    it('exige ao menos um arquivo e multipart', async () => {
      const store = await createStore(ctx.prisma);
      await submitToStore(store.publicSlug, {}, []).expect(400);
      await request(ctx.app.getHttpServer())
        .post('/public/prescriptions')
        .send({ slug: store.publicSlug })
        .expect(400);
    });
  });

  describe('captcha (RF-012)', () => {
    it('recusa sem captcha, com captcha inválido e com captcha reutilizado — sem gravar arquivos', async () => {
      const store = await createStore(ctx.prisma);
      const files = [file(JPEG(), 'receita.jpg')];
      await post('/public/prescriptions', { slug: store.publicSlug }, files).expect(400);
      await post(
        '/public/prescriptions',
        { slug: store.publicSlug, captchaToken: 'invalido' },
        files,
      ).expect(400);
      const token = captchaToken();
      await post(
        '/public/prescriptions',
        { slug: store.publicSlug, captchaToken: token },
        files,
      ).expect(201);
      const reused = await post(
        '/public/prescriptions',
        { slug: store.publicSlug, captchaToken: token },
        files,
      ).expect(400);
      expect(reused.body.error.code).toBe(ApiErrorCode.CAPTCHA_FAILED);
      expect(reused.body.error.message).toBe('Conclua a verificação de segurança para continuar.');
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(1);
    });

    it('arquivo enviado antes dos campos é recusado (captcha verificado antes do storage)', async () => {
      const store = await createStore(ctx.prisma);
      const res = await request(ctx.app.getHttpServer())
        .post('/public/prescriptions')
        .attach('files', JPEG(), 'receita.jpg')
        .field('captchaToken', captchaToken())
        .field('slug', store.publicSlug);
      expect(res.status).toBe(400);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
    });
  });

  describe('arquivos no servidor (CA-004, CA-005, §9.4)', () => {
    it('aceita exatamente 5 MB e rejeita 5 MB + 1 byte', async () => {
      const store = await createStore(ctx.prisma);
      await submitToStore(store.publicSlug, {}, [file(JPEG(MAX_FILE_BYTES), 'limite.jpg')]).expect(
        201,
      );
      const res = await submitToStore(store.publicSlug, {}, [
        file(JPEG(MAX_FILE_BYTES + 1), 'grande.jpg'),
      ]).expect(413);
      expect(res.body.error.message).toBe('Este arquivo ultrapassa o limite de 5 MB.');
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(1);
    });

    it('rejeita 11 arquivos', async () => {
      const store = await createStore(ctx.prisma);
      const files = Array.from({ length: 11 }, (_, i) => file(JPEG(512), `r${i}.jpg`));
      const res = await submitToStore(store.publicSlug, {}, files).expect(400);
      expect(res.body.error.message).toBe('Você pode enviar no máximo 10 arquivos.');
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
    });

    it('aceita 10 arquivos', async () => {
      const store = await createStore(ctx.prisma);
      const files = Array.from({ length: 10 }, (_, i) => file(JPEG(512), `r${i}.jpg`));
      await submitToStore(store.publicSlug, {}, files).expect(201);
    });

    it('rejeita formato fora da allowlist, executável renomeado e MIME divergente, sem deixar objetos', async () => {
      const store = await createStore(ctx.prisma);
      for (const bad of [
        file(JPEG(), 'r.gif'),
        file(EXE(), 'receita.jpg'),
        file(PNG(), 'receita.pdf'),
      ]) {
        const res = await submitToStore(store.publicSlug, {}, [file(JPEG(), 'ok.jpg'), bad]).expect(
          422,
        );
        expect(res.body.error.message).toBe('Formato de arquivo não permitido.');
        expect(res.body.error.issues[0].path).toBe('files.1');
      }
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
      expect(await ctx.prisma.orphanedObject.count()).toBe(0);
    });
  });

  describe('link personalizado (CA-012, CA-013, CA-014)', () => {
    it('cria receita vinculada ao paciente e à loja do link e consome o link', async () => {
      const store = await createStore(ctx.prisma);
      const { token, id } = await createPersonalizedLink(store.id);
      const res = await post(
        `/public/patient-links/${token}/prescriptions`,
        { captchaToken: captchaToken() },
        [file(HEIC_OR_JPEG(), 'foto.jpg')],
      ).expect(201);
      expect(res.body).toEqual({ status: 'RECEIVED' });

      const submission = await ctx.prisma.prescriptionSubmission.findFirstOrThrow();
      expect(submission).toMatchObject({
        storeId: store.id,
        patientExternalId: PATIENT.externalId,
        identificationStatus: 'IDENTIFIED_PERSONALIZED_LINK',
        sourceChannel: 'PERSONALIZED_LINK',
        patientUploadLinkId: id,
        cpfEncrypted: null,
      });
      expect(
        await ctx.prisma.patientLinkHistory.findFirst({ where: { submissionId: submission.id } }),
      ).toMatchObject({
        linkType: 'PERSONALIZED_LINK',
        patientExternalId: PATIENT.externalId,
        linkedByUserId: null,
      });
      const link = await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id } });
      expect(link).toMatchObject({ status: 'USED', usedSubmissionId: submission.id });
      expect(submission.patientDisplayLabel).toBe(link.patientDisplayLabel);
      // Evento de domínio gravado na mesma transação (outbox), apenas com IDs.
      const events = await ctx.prisma.outboxEvent.findMany({
        where: { type: 'prescription.submitted' },
      });
      expect(events.map((e) => e.payload)).toEqual([
        { submissionId: submission.id, storeId: store.id },
      ]);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: AuditAction.PATIENT_LINK_CONSUMED, entityId: id },
        }),
      ).toBe(1);

      // Uso único: novo envio com o mesmo link é recusado com o erro neutro.
      const again = await post(
        `/public/patient-links/${token}/prescriptions`,
        { captchaToken: captchaToken() },
        [file(JPEG(), 'r.jpg')],
      ).expect(404);
      expect(again.body.error.code).toBe(ApiErrorCode.LINK_UNAVAILABLE);
    });

    it('rejeita store_id, CPF ou patient_id no corpo e registra evento de segurança', async () => {
      const store = await createStore(ctx.prisma);
      const other = await createStore(ctx.prisma);
      const { token, id } = await createPersonalizedLink(store.id);
      const startedAt = new Date();
      for (const extra of [
        { storeId: other.id },
        { cpf: VALID_CPF },
        { patientId: 'mock-pat-0002' },
      ] as Record<string, string>[]) {
        await post(
          `/public/patient-links/${token}/prescriptions`,
          { captchaToken: captchaToken(), ...extra },
          [file(JPEG(), 'r.jpg')],
        ).expect(400);
      }
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
      expect((await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id } })).status).toBe(
        'ACTIVE',
      );
      const events = await ctx.prisma.auditLog.findMany({
        where: {
          action: AuditAction.SECURITY_PERSONALIZED_LINK_TAMPERING,
          createdAt: { gte: startedAt },
        },
      });
      expect(events).toHaveLength(3);
      expect(JSON.stringify(events)).not.toContain('52998224725');
      expect(JSON.stringify(events)).not.toContain(token);
    });

    it('falha de captcha ou de arquivo não consome o link', async () => {
      const store = await createStore(ctx.prisma);
      const { token, id } = await createPersonalizedLink(store.id);
      await post(`/public/patient-links/${token}/prescriptions`, { captchaToken: 'invalido' }, [
        file(JPEG(), 'r.jpg'),
      ]).expect(400);
      await post(`/public/patient-links/${token}/prescriptions`, { captchaToken: captchaToken() }, [
        file(EXE(), 'r.jpg'),
      ]).expect(422);
      await post(`/public/patient-links/${token}/prescriptions`, { captchaToken: captchaToken() }, [
        file(JPEG(MAX_FILE_BYTES + 1), 'r.jpg'),
      ]).expect(413);
      expect((await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id } })).status).toBe(
        'ACTIVE',
      );
      await post(`/public/patient-links/${token}/prescriptions`, { captchaToken: captchaToken() }, [
        file(JPEG(), 'r.jpg'),
      ]).expect(201);
    });

    it('dois envios concorrentes com o mesmo link: apenas um é aceito', async () => {
      const store = await createStore(ctx.prisma);
      const { token } = await createPersonalizedLink(store.id);
      const attempts = await Promise.all(
        Array.from({ length: 3 }, () =>
          post(`/public/patient-links/${token}/prescriptions`, { captchaToken: captchaToken() }, [
            file(JPEG(), 'r.jpg'),
          ]),
        ),
      );
      expect(attempts.map((r) => r.status).sort()).toEqual([201, 404, 404]);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(1);
      expect(await ctx.prisma.prescriptionFile.count()).toBe(1);
      expect(await ctx.prisma.orphanedObject.count()).toBe(0);
    });

    it('token inexistente, expirado, revogado e usado retornam a mesma resposta', async () => {
      const store = await createStore(ctx.prisma);
      const expired = await createPersonalizedLink(store.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: expired.id },
        data: { createdAt: new Date(Date.now() - 9e8), expiresAt: new Date(Date.now() - 1000) },
      });
      const revoked = await createPersonalizedLink(store.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: revoked.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      const used = await createPersonalizedLink(store.id);
      await post(
        `/public/patient-links/${used.token}/prescriptions`,
        { captchaToken: captchaToken() },
        [file(JPEG(), 'r.jpg')],
      ).expect(201);

      const responses = await Promise.all(
        ['C'.repeat(43), expired.token, revoked.token, used.token].map((token) =>
          post(`/public/patient-links/${token}/prescriptions`, { captchaToken: captchaToken() }, [
            file(JPEG(), 'r.jpg'),
          ]),
        ),
      );
      const strip = (b: { error: Record<string, unknown> }) =>
        JSON.stringify({ ...b.error, requestId: undefined });
      expect(responses.map((r) => r.status)).toEqual([404, 404, 404, 404]);
      expect(new Set(responses.map((r) => strip(r.body))).size).toBe(1);
    });
  });

  describe('idempotência e atomicidade', () => {
    it('Idempotency-Key repetida não duplica a receita', async () => {
      const store = await createStore(ctx.prisma);
      const key = randomUUID();
      const fields = { captchaToken: captchaToken(), slug: store.publicSlug };
      const first = await post(
        '/public/prescriptions',
        fields,
        [file(JPEG(), 'r.jpg')],
        key,
      ).expect(201);
      const replay = await post(
        '/public/prescriptions',
        fields,
        [file(JPEG(), 'r.jpg')],
        key,
      ).expect(201);
      expect(replay.body).toEqual(first.body);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(1);

      // Chave nova = novo envio.
      await post(
        '/public/prescriptions',
        { ...fields, captchaToken: captchaToken() },
        [file(JPEG(), 'r.jpg')],
        randomUUID(),
      ).expect(201);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(2);
    });

    it('falha libera a Idempotency-Key para nova tentativa', async () => {
      const store = await createStore(ctx.prisma);
      const key = randomUUID();
      await post(
        '/public/prescriptions',
        { captchaToken: 'invalido', slug: store.publicSlug },
        [file(JPEG(), 'r.jpg')],
        key,
      ).expect(400);
      await post(
        '/public/prescriptions',
        { captchaToken: captchaToken(), slug: store.publicSlug },
        [file(JPEG(), 'r.jpg')],
        key,
      ).expect(201);
    });

    it('rejeita Idempotency-Key malformada', async () => {
      const store = await createStore(ctx.prisma);
      await post(
        '/public/prescriptions',
        { captchaToken: captchaToken(), slug: store.publicSlug },
        [file(JPEG(), 'r.jpg')],
        'curta',
      ).expect(400);
    });

    it('aplica rate limit por IP', async () => {
      for (let i = 0; i < 30; i += 1) {
        await request(ctx.app.getHttpServer()).post('/public/prescriptions').send({}).expect(400);
      }
      const res = await request(ctx.app.getHttpServer())
        .post('/public/prescriptions')
        .send({})
        .expect(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });
});

/** HEIC real exigiria um arquivo de amostra; JPEG cobre o fluxo do link personalizado. */
function HEIC_OR_JPEG(): Buffer {
  return JPEG();
}

describe('Envio público — falhas de storage (e2e)', () => {
  it('falha de storage não deixa receita parcial nem objeto órfão', async () => {
    const written: string[] = [];
    let realStorage: StorageProvider | undefined;
    const failingStorage = {
      putObjectStream: async (input: Parameters<StorageProvider['putObjectStream']>[0]) => {
        if (written.length === 1) throw new Error('storage indisponível');
        written.push(input.key);
        await realStorage!.putObjectStream(input);
      },
      deleteObject: (key: string) => realStorage!.deleteObject(key),
      headObject: (key: string) => realStorage!.headObject(key),
      ping: () => Promise.resolve(),
    };
    const ctx = await createTestContext([{ provide: StorageProvider, useValue: failingStorage }]);
    try {
      await ctx.reset();
      const { S3StorageProvider } = await import('../src/infra/storage/s3-storage.provider.js');
      const { ENV } = await import('../src/config/config.module.js');
      realStorage = new S3StorageProvider(ctx.app.get(ENV));
      const store = await createStore(ctx.prisma);
      const res = await request(ctx.app.getHttpServer())
        .post('/public/prescriptions')
        .field('captchaToken', captchaToken())
        .field('slug', store.publicSlug)
        .attach('files', JPEG(), 'a.jpg')
        .attach('files', JPEG(), 'b.jpg');
      expect(res.status).toBe(500);
      expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
      expect(await ctx.prisma.prescriptionFile.count()).toBe(0);
      expect(written).toHaveLength(1);
      expect(await realStorage.headObject(written[0]!)).toBeNull();
    } finally {
      await ctx.app.close();
    }
  });

  it('remoção que falha vai para orphaned_objects', async () => {
    let realStorage: StorageProvider | undefined;
    const storage = {
      putObjectStream: (input: Parameters<StorageProvider['putObjectStream']>[0]) =>
        realStorage!.putObjectStream(input),
      deleteObject: () => Promise.reject(new Error('delete falhou')),
      headObject: (key: string) => realStorage!.headObject(key),
      ping: () => Promise.resolve(),
    };
    const ctx = await createTestContext([{ provide: StorageProvider, useValue: storage }]);
    try {
      await ctx.reset();
      const { S3StorageProvider } = await import('../src/infra/storage/s3-storage.provider.js');
      const { ENV } = await import('../src/config/config.module.js');
      realStorage = new S3StorageProvider(ctx.app.get(ENV));
      const store = await createStore(ctx.prisma, { active: true });
      // Arquivo válido + inválido: o válido é gravado e precisa ser removido.
      await request(ctx.app.getHttpServer())
        .post('/public/prescriptions')
        .field('captchaToken', captchaToken())
        .field('slug', store.publicSlug)
        .attach('files', JPEG(), 'a.jpg')
        .attach('files', EXE(), 'b.jpg')
        .expect(422);
      const orphans = await ctx.prisma.orphanedObject.findMany();
      expect(orphans).toHaveLength(1);
      expect(orphans[0]?.reason).toBe('submission_upload_failed');
      await realStorage.deleteObject(orphans[0]!.storageKey);
    } finally {
      await ctx.app.close();
    }
  });
});
