import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Fila de receitas (e2e)', () => {
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

  async function twoStores() {
    const a = await createStore(ctx.prisma, { storeName: 'Loja A' });
    const b = await createStore(ctx.prisma, { storeName: 'Loja B' });
    const collaboratorA = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [a.id] }),
    );
    return { a, b, collaboratorA };
  }

  const ids = (body: { items: { id: string }[] }) => body.items.map((item) => item.id);

  it('CA-007: Colaborador da Loja A lista apenas receitas da Loja A', async () => {
    const { a, b, collaboratorA } = await twoStores();
    const own = await createSubmission(ctx.prisma, crypto, { storeId: a.id, cpf: '52998224725' });
    await createSubmission(ctx.prisma, crypto, { storeId: b.id });

    const res = await collaboratorA.get('/prescriptions').expect(200);
    expect(ids(res.body)).toEqual([own.id]);
    expect(res.body.items[0]).toMatchObject({
      store: { id: a.id, storeName: 'Loja A' },
      operationalStatus: 'RECEIVED',
      identificationStatus: 'NOT_IDENTIFIED',
      cpfMasked: '***.***.***-25',
      fileCount: 1,
      isNew: true,
      sourceChannel: 'STORE_LINK',
      patientLabel: null,
    });
    expect(JSON.stringify(res.body)).not.toContain('52998224725');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('filtro com store_id de outra loja não amplia o escopo', async () => {
    const { b, collaboratorA } = await twoStores();
    await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    const res = await collaboratorA.get(`/prescriptions?storeId=${b.id}`).expect(200);
    expect(res.body.items).toEqual([]);
    const counters = await collaboratorA.get(`/prescriptions/counters?storeId=${b.id}`).expect(200);
    expect(counters.body).toEqual({ new: 0, unidentified: 0, inService: 0, finished: 0 });
  });

  it('Gestor vê suas lojas; Admin vê todas', async () => {
    const { a, b } = await twoStores();
    const c = await createStore(ctx.prisma);
    const inA = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const inB = await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    const inC = await createSubmission(ctx.prisma, crypto, { storeId: c.id });

    const manager = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id, b.id] }),
    );
    expect(ids((await manager.get('/prescriptions').expect(200)).body).sort()).toEqual(
      [inA.id, inB.id].sort(),
    );

    const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
    expect(ids((await admin.get('/prescriptions').expect(200)).body).sort()).toEqual(
      [inA.id, inB.id, inC.id].sort(),
    );
  });

  it('aplica os filtros do PRD §12.3', async () => {
    const { a, collaboratorA } = await twoStores();
    const viewed = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      firstViewedAt: new Date(),
      operationalStatus: 'IN_SERVICE',
      cpf: '52998224725',
    });
    const linked = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      sourceChannel: 'PERSONALIZED_LINK',
      patient: { externalId: 'mock-pat-0001', label: 'João T. · CPF ***.***.***-08' },
    });
    const old = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      createdAt: new Date('2026-01-10T12:00:00Z'),
      sourceChannel: 'GENERIC',
    });

    const query = async (qs: string) =>
      ids((await collaboratorA.get(`/prescriptions?${qs}`).expect(200)).body).sort();
    expect(await query('unviewed=true')).toEqual([linked.id, old.id].sort());
    expect(await query('unviewed=false')).toEqual([viewed.id]);
    expect(await query('hasCpf=true')).toEqual([viewed.id]);
    expect(await query('linked=true')).toEqual([linked.id]);
    expect(await query('operationalStatus=IN_SERVICE,FINISHED')).toEqual([viewed.id]);
    expect(await query('identificationStatus=IDENTIFIED_PERSONALIZED_LINK')).toEqual([linked.id]);
    expect(await query('sourceChannel=GENERIC')).toEqual([old.id]);
    expect(await query('from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z')).toEqual([old.id]);

    const linkedItem = (await collaboratorA.get('/prescriptions?linked=true').expect(200)).body
      .items[0];
    expect(linkedItem.patientLabel).toBe('João T. · CPF ***.***.***-08');
  });

  it('paginação por cursor: mais recentes primeiro, sem repetir nem pular; ordem inversa', async () => {
    const { a, collaboratorA } = await twoStores();
    const created: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      const s = await createSubmission(ctx.prisma, crypto, {
        storeId: a.id,
        createdAt: new Date(Date.UTC(2026, 9, 1, 10, i)),
      });
      created.push(s.id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await collaboratorA
        .get(`/prescriptions?limit=3${cursor ? `&cursor=${cursor}` : ''}`)
        .expect(200);
      seen.push(...ids(res.body));
      cursor = res.body.nextCursor as string | null;
    } while (cursor);
    expect(seen).toEqual([...created].reverse());

    const asc = await collaboratorA.get('/prescriptions?sort=asc&limit=7').expect(200);
    expect(ids(asc.body)).toEqual(created);
  });

  it('contadores respeitam escopo e filtros de loja/período', async () => {
    const { a, b, collaboratorA } = await twoStores();
    await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      operationalStatus: 'IN_SERVICE',
      firstViewedAt: new Date(),
    });
    await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      operationalStatus: 'FINISHED',
      firstViewedAt: new Date(),
      patient: { externalId: 'x', label: 'Ana E.' },
    });
    await createSubmission(ctx.prisma, crypto, { storeId: b.id });

    const res = await collaboratorA.get('/prescriptions/counters').expect(200);
    expect(res.body).toEqual({ new: 1, unidentified: 2, inService: 1, finished: 1 });
  });

  it('valida parâmetros e cursor', async () => {
    const { collaboratorA } = await twoStores();
    await collaboratorA.get('/prescriptions?limit=500').expect(400);
    await collaboratorA.get('/prescriptions?operationalStatus=INVALIDO').expect(400);
    await collaboratorA.get('/prescriptions?storeId=nao-uuid').expect(400);
    await collaboratorA.get('/prescriptions?desconhecido=1').expect(400);
    await collaboratorA.get(`/prescriptions?cursor=${'x'.repeat(20)}`).expect(400);
  });

  it('exige autenticação', async () => {
    const { default: request } = await import('supertest');
    await request(ctx.app.getHttpServer()).get('/prescriptions').expect(401);
  });
});
