import { createHmac } from 'node:crypto';
import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { MOCK_PATIENTS } from '../src/modules/patients/mock-patient.provider.js';
import { PatientProvider } from '../src/modules/patients/patient.provider.js';
import { UnavailablePatientProvider } from '../src/modules/patients/unavailable-patient.provider.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { Client, loginAs } from './utils/http.js';
import { JOAO } from './utils/patients.js';

const PEPPER = 'test-search-pepper-test-search-pepper-01';

/** Última busca auditada do usuário (a tabela de auditoria não é limpa entre testes). */
async function lastSearchAudit(ctx: TestContext, actorUserId: string) {
  return ctx.prisma.auditLog.findFirstOrThrow({
    where: { action: AuditAction.PATIENT_SEARCH_PERFORMED, actorUserId },
    orderBy: { createdAt: 'desc' },
  });
}

describe('Busca de pacientes — proteção contra enumeração (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.app.close());

  async function collaborator() {
    const store = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, {
      role: 'STORE_COLLABORATOR',
      storeIds: [store.id],
    });
    const client = await loginAs(ctx.app, () => Promise.resolve({ user }));
    return { store, client, user };
  }

  it('audita o tipo, o contexto e um HMAC do termo — nunca o valor', async () => {
    const { store, client, user } = await collaborator();
    await client
      .post('/patients/search', {
        type: 'email',
        query: ' Familia@Example.com ',
        context: { storeId: store.id },
      })
      .expect(200);
    const audit = await lastSearchAudit(ctx, user.id);
    const expected = createHmac('sha256', PEPPER).update('email:familia@example.com').digest('hex');
    expect(audit).toMatchObject({ result: 'SUCCESS', storeId: store.id });
    expect(audit.metadata).toEqual({
      searchType: 'email',
      queryFingerprint: expected,
      contextType: 'store',
      resultCount: 2,
      returnedCount: 2,
    });
    expect(JSON.stringify(audit)).not.toMatch(/familia@/i);
  });

  it('o mesmo termo gera o mesmo HMAC (permite investigar repetição sem guardar o valor)', async () => {
    const { store, client, user } = await collaborator();
    const body = { type: 'cpf', query: JOAO.cpf, context: { storeId: store.id } };
    await client.post('/patients/search', body).expect(200);
    const first = await lastSearchAudit(ctx, user.id);
    await client.post('/patients/search', body).expect(200);
    const second = await lastSearchAudit(ctx, user.id);
    const fingerprint = (row: typeof first) =>
      (row.metadata as { queryFingerprint: string }).queryFingerprint;
    expect(fingerprint(second)).toBe(fingerprint(first));
    expect(JSON.stringify(second)).not.toContain(JOAO.cpf);
  });

  it('audita buscas recusadas por contexto com o motivo', async () => {
    const { client, user } = await collaborator();
    const other = await createStore(ctx.prisma);
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: other.id });
    await client
      .post('/patients/search', {
        type: 'email',
        query: 'x@example.com',
        context: { prescriptionId: submission.id },
      })
      .expect(404);
    const audit = await lastSearchAudit(ctx, user.id);
    expect(audit).toMatchObject({ result: 'DENIED', storeId: null });
    expect(audit.metadata).toMatchObject({ reason: 'not_found', contextType: 'prescription' });
  });

  it('limita a quantidade de resultados devolvidos', async () => {
    const { store, client } = await collaborator();
    const res = await client
      .post('/patients/search', {
        type: 'phone',
        query: MOCK_PATIENTS[4]!.phone,
        context: { storeId: store.id },
      })
      .expect(200);
    expect(res.body.results.length).toBeLessThanOrEqual(10);
  });
});

describe('Busca de pacientes — limites por usuário e por sessão (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  const saved = { ...process.env };

  beforeAll(async () => {
    process.env.PATIENT_SEARCH_LIMIT_USER_PER_MINUTE = '1000';
    process.env.PATIENT_SEARCH_LIMIT_USER_PER_HOUR = '5';
    process.env.PATIENT_SEARCH_LIMIT_SESSION_PER_HOUR = '3';
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
  });
  beforeEach(() => ctx.reset());
  afterAll(async () => {
    process.env = saved;
    await ctx.app.close();
  });

  it('cada sessão tem seu limite e o usuário tem um teto somando as sessões', async () => {
    const store = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, {
      role: 'STORE_COLLABORATOR',
      storeIds: [store.id],
    });
    const first = new Client(ctx.app);
    await first.login(user.email);
    const second = new Client(ctx.app);
    await second.login(user.email);
    const body = { type: 'email', query: 'x@example.com', context: { storeId: store.id } };

    for (let i = 0; i < 3; i += 1) await first.post('/patients/search', body).expect(200);
    const blocked = await first.post('/patients/search', body).expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();

    // Tentativas bloqueadas também contam para o teto do usuário (5/h): 3 + 1 bloqueada + 1.
    await second.post('/patients/search', body).expect(200);
    // Teto do usuário atingido, embora a segunda sessão ainda tenha saldo.
    await second.post('/patients/search', body).expect(429);

    const audit = await lastSearchAudit(ctx, user.id);
    expect(audit).toMatchObject({ result: 'DENIED' });
    expect(audit.metadata).toMatchObject({ reason: 'rate_limited' });
  });
});

describe('Busca de pacientes — API indisponível (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;

  beforeAll(async () => {
    ctx = await createTestContext([
      { provide: PatientProvider, useValue: new UnavailablePatientProvider() },
    ]);
    crypto = ctx.app.get(CryptoService);
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.app.close());

  it('informa indisponibilidade temporária e a receita continua acessível (PRD §33)', async () => {
    const store = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, {
      role: 'STORE_COLLABORATOR',
      storeIds: [store.id],
    });
    const client = await loginAs(ctx.app, () => Promise.resolve({ user }));
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: store.id });
    const res = await client
      .post('/patients/search', {
        type: 'cpf',
        query: JOAO.cpf,
        context: { prescriptionId: submission.id },
      })
      .expect(503);
    expect(res.body.error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message:
        'A consulta de pacientes está temporariamente indisponível. Tente novamente em instantes.',
    });
    expect(JSON.stringify(res.body)).not.toContain(JOAO.cpf);

    const audit = await lastSearchAudit(ctx, user.id);
    expect(audit).toMatchObject({ result: 'FAILURE', storeId: store.id });
    expect(audit.metadata).toMatchObject({ reason: 'integration_unavailable' });

    await client.get(`/prescriptions/${submission.id}`).expect(200);
  });
});
