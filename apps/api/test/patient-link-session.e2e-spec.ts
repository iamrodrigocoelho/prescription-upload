import { ApiErrorCode, AuditAction } from '@receita/shared';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { REDIS } from '../src/infra/redis/redis.module.js';
import { createPatientLink } from './utils/patients.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { captchaToken } from './utils/fake-captcha.js';
import { createStore, createUser } from './utils/factories.js';
import { JPEG } from './fixtures/files.js';
import { loginAs } from './utils/http.js';

describe('Link personalizado via cookie de contexto (e2e, D-047)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function newLink() {
    const store = await createStore(ctx.prisma, { storeName: 'Venancio Méier' });
    const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
    const res = await createPatientLink(admin, store.id).expect(201);
    return {
      store,
      id: res.body.link.id as string,
      token: /\/p\/([A-Za-z0-9_-]{43})$/.exec(res.body.url as string)?.[1] ?? '',
    };
  }

  it('troca o token por cookie HttpOnly + SameSite=Strict e envia sem token na URL', async () => {
    const { store, id, token } = await newLink();
    const agent = request.agent(ctx.app.getHttpServer());

    const open = await agent.post('/public/patient-link-sessions').send({ token }).expect(200);
    expect(open.body).toEqual({ storeNumber: store.storeNumber, storeName: 'Venancio Méier' });
    const setCookie = String(open.headers['set-cookie']);
    expect(setCookie).toMatch(/rv_plink=[A-Za-z0-9_-]{43}/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).not.toContain(token);

    // O Redis guarda apenas o hash do ID de contexto → linkId (nunca o token).
    const redis = ctx.app.get<Redis>(REDIS);
    const keys = await redis.keys(`${process.env.REDIS_KEY_PREFIX}plink:ctx:*`);
    expect(keys).toHaveLength(1);
    expect(await redis.get(keys[0]!)).toBe(id);

    await agent.get('/public/patient-link-sessions/current').expect(200);
    const sent = await agent
      .post('/public/patient-link-sessions/current/prescriptions')
      .field('captchaToken', captchaToken())
      .attach('files', JPEG(), 'receita.jpg')
      .expect(201);
    expect(sent.body).toEqual({ status: 'RECEIVED' });
    expect(String(sent.headers['set-cookie'])).toMatch(/rv_plink=;/);

    const submission = await ctx.prisma.prescriptionSubmission.findFirstOrThrow();
    expect(submission).toMatchObject({
      patientUploadLinkId: id,
      identificationStatus: 'IDENTIFIED_PERSONALIZED_LINK',
      sourceChannel: 'PERSONALIZED_LINK',
    });
    expect((await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id } })).status).toBe(
      'USED',
    );
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.PATIENT_LINK_OPENED, entityId: id },
      }),
    ).toBe(1);

    // Contexto encerrado após o envio.
    await agent.get('/public/patient-link-sessions/current').expect(404);
  });

  it('sem cookie, cookie inválido ou token inválido → mesmo erro neutro', async () => {
    const http = () => request(ctx.app.getHttpServer());
    const responses = [
      await http().get('/public/patient-link-sessions/current'),
      await http()
        .get('/public/patient-link-sessions/current')
        .set('Cookie', `rv_plink=${'x'.repeat(43)}`),
      await http()
        .post('/public/patient-link-sessions')
        .send({ token: 'D'.repeat(43) }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ApiErrorCode.LINK_UNAVAILABLE);
    }
  });

  it('link revogado depois de aberto deixa de valer no contexto', async () => {
    const { id, token } = await newLink();
    const agent = request.agent(ctx.app.getHttpServer());
    await agent.post('/public/patient-link-sessions').send({ token }).expect(200);
    await ctx.prisma.patientUploadLink.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await agent.get('/public/patient-link-sessions/current').expect(404);
    await agent
      .post('/public/patient-link-sessions/current/prescriptions')
      .field('captchaToken', captchaToken())
      .attach('files', JPEG(), 'r.jpg')
      .expect(404);
    expect(await ctx.prisma.prescriptionSubmission.count()).toBe(0);
  });

  it('o envio por contexto também rejeita campos de loja/paciente', async () => {
    const { store, token } = await newLink();
    const agent = request.agent(ctx.app.getHttpServer());
    await agent.post('/public/patient-link-sessions').send({ token }).expect(200);
    await agent
      .post('/public/patient-link-sessions/current/prescriptions')
      .field('captchaToken', captchaToken())
      .field('storeId', store.id)
      .attach('files', JPEG(), 'r.jpg')
      .expect(400);
  });

  it('o corpo da troca aceita apenas o token', async () => {
    await request(ctx.app.getHttpServer())
      .post('/public/patient-link-sessions')
      .send({ token: 'E'.repeat(43), storeId: 'x' })
      .expect(400);
  });
});
