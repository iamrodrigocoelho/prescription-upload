import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { addDays, localDate } from '../src/modules/dashboard/dashboard-range.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';
import { JOAO } from './utils/patients.js';

const TZ = 'America/Sao_Paulo';
/** Instante de um horário local de São Paulo (UTC-3, sem horário de verão desde 2019). */
const at = (day: string, time: string) => new Date(`${day}T${time}-03:00`);
const today = () => localDate(new Date(), TZ);
const SECOND = 1000;

describe('Dashboard (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.app.close());

  async function setup() {
    const [a, b, c] = await Promise.all([
      createStore(ctx.prisma, { storeName: 'Loja A' }),
      createStore(ctx.prisma, { storeName: 'Loja B' }),
      createStore(ctx.prisma, { storeName: 'Loja C' }),
    ]);
    const collaborator = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [a.id] }),
    );
    const manager = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id, b.id] }),
    );
    const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
    return { a, b, c, collaborator, manager, admin };
  }

  const submit = (storeId: string, createdAt: Date, extra: object = {}) =>
    createSubmission(ctx.prisma, crypto, { storeId, createdAt, ...extra });

  it('escopo: colaborador vê a própria loja; gestor, as suas (consolidado e por loja); admin, todas', async () => {
    const { a, b, c, collaborator, manager, admin } = await setup();
    const day = today();
    await submit(a.id, at(day, '00:30:00'));
    await submit(b.id, at(day, '00:30:00'));
    await submit(b.id, at(day, '00:31:00'));
    await submit(c.id, at(day, '00:30:00'));

    const received = async (client: typeof admin): Promise<number> => {
      const res = await client.get('/dashboard/summary?period=today').expect(200);
      return (res.body as { receivedInPeriod: number }).receivedInPeriod;
    };
    expect(await received(collaborator)).toBe(1);
    expect(await received(manager)).toBe(3);
    expect(await received(admin)).toBe(4);

    const byStore = await manager.get('/dashboard/by-store?period=today').expect(200);
    expect(
      byStore.body.items.map((row: { store: { storeName: string }; received: number }) => [
        row.store.storeName,
        row.received,
      ]),
    ).toEqual([
      ['Loja B', 2],
      ['Loja A', 1],
    ]);

    // Filtro de lojas reduz, nunca amplia: loja fora do escopo → 403.
    const onlyB = await manager.get(`/dashboard/summary?period=today&storeIds=${b.id}`).expect(200);
    expect(onlyB.body.receivedInPeriod).toBe(2);
    await collaborator.get(`/dashboard/summary?period=today&storeIds=${b.id}`).expect(403);
    await manager.get(`/dashboard/by-store?period=today&storeIds=${a.id},${c.id}`).expect(403);
  });

  it('"hoje" e os dias seguem o fuso do sistema, não UTC', async () => {
    const { a, collaborator } = await setup();
    const day = today();
    const yesterday = addDays(day, -1);
    // 23h30 de ontem em São Paulo = 02h30 UTC de hoje: NÃO é "hoje".
    await submit(a.id, at(yesterday, '23:30:00'));
    await submit(a.id, at(day, '00:10:00'));

    const summary = await collaborator.get('/dashboard/summary?period=7d').expect(200);
    expect(summary.body).toMatchObject({ receivedToday: 1, receivedInPeriod: 2 });
    expect(summary.body.range).toEqual({ from: addDays(day, -6), to: day, timezone: TZ });

    const series = await collaborator.get('/dashboard/timeseries?period=7d').expect(200);
    expect(series.body.days).toHaveLength(7);
    expect(series.body.days.at(-1)).toEqual({ date: day, received: 1, finished: 0 });
    expect(series.body.days.at(-2)).toEqual({ date: yesterday, received: 1, finished: 0 });
    expect(series.body.days[0]).toEqual({ date: addDays(day, -6), received: 0, finished: 0 });
  });

  it('indicadores por status, identificação, origem e desfechos', async () => {
    const { a, collaborator } = await setup();
    const t = at(today(), '00:05:00');
    const patient = { externalId: JOAO.externalId, label: 'João T. · CPF ***.***.***-00' };
    await submit(a.id, t);
    await submit(a.id, t, {
      firstViewedAt: t,
      identificationStatus: 'IDENTIFIED_AUTO_CPF',
      patient,
    });
    await submit(a.id, t, {
      firstViewedAt: t,
      operationalStatus: 'FINISHED',
      identificationStatus: 'IDENTIFIED_MANUAL',
      patient,
    });
    await submit(a.id, t, {
      firstViewedAt: t,
      operationalStatus: 'CANCELLED',
      sourceChannel: 'PERSONALIZED_LINK',
      patient,
    });
    await submit(a.id, t, { firstViewedAt: t, operationalStatus: 'NOT_SERVED' });

    const summary = await collaborator.get('/dashboard/summary?period=today').expect(200);
    expect(summary.body).toMatchObject({
      receivedInPeriod: 5,
      unviewed: 1,
      unidentified: 2,
      identifiedAuto: 1,
      identifiedManual: 1,
      identifiedPersonalizedLink: 1,
      personalizedLinkSubmissions: 1,
      finished: 1,
      cancelled: 1,
      notServed: 1,
      links: { active: 0, used: 0, expired: 0 },
    });

    const byStatus = await collaborator.get('/dashboard/by-status?period=today').expect(200);
    expect(byStatus.body.items).toEqual([
      { status: 'RECEIVED', count: 2 },
      { status: 'IN_REVIEW', count: 0 },
      { status: 'IN_SERVICE', count: 0 },
      { status: 'FINISHED', count: 1 },
      { status: 'CANCELLED', count: 1 },
      { status: 'NOT_SERVED', count: 1 },
    ]);
    // Agregados apenas: nenhum dado pessoal na resposta.
    expect(JSON.stringify(summary.body)).not.toMatch(/João|mock-pat/);
  });

  it('tempos: mediana, p90 e amostra; identificação ignora link; finalização usa a primeira', async () => {
    const { a, collaborator } = await setup();
    const t0 = at(today(), '00:01:00');
    const plus = (seconds: number) => new Date(t0.getTime() + seconds * SECOND);
    const patient = { externalId: JOAO.externalId, label: 'João T. · CPF ***.***.***-00' };

    const s1 = await submit(a.id, t0, { firstViewedAt: plus(60) });
    const s2 = await submit(a.id, t0, { firstViewedAt: plus(120) });
    const s3 = await submit(a.id, t0, { firstViewedAt: plus(600) });
    await submit(a.id, t0); // nunca visualizada: fora da amostra
    const viaLink = await submit(a.id, t0, { sourceChannel: 'PERSONALIZED_LINK', patient });

    await ctx.prisma.patientLinkHistory.createMany({
      data: [
        {
          submissionId: s1.id,
          patientExternalId: 'x',
          linkType: 'AUTOMATIC_CPF',
          createdAt: plus(30),
        },
        { submissionId: s2.id, patientExternalId: 'x', linkType: 'MANUAL', createdAt: plus(300) },
        {
          submissionId: viaLink.id,
          patientExternalId: 'x',
          linkType: 'PERSONALIZED_LINK',
          createdAt: t0,
        },
      ],
    });
    // s3 finalizada, reaberta e finalizada de novo: conta a primeira finalização.
    await ctx.prisma.statusHistory.createMany({
      data: [
        { submissionId: s3.id, fromStatus: 'RECEIVED', toStatus: 'FINISHED', createdAt: plus(900) },
        {
          submissionId: s3.id,
          fromStatus: 'FINISHED',
          toStatus: 'IN_REVIEW',
          createdAt: plus(950),
        },
        {
          submissionId: s3.id,
          fromStatus: 'IN_REVIEW',
          toStatus: 'FINISHED',
          createdAt: plus(2000),
        },
      ],
    });

    const { body } = await collaborator.get('/dashboard/summary?period=today').expect(200);
    // percentile_cont([60,120,600]): mediana 120; p90 = 120 + 0,8 × 480 = 504.
    expect(body.timings.toFirstView).toEqual({ medianSeconds: 120, p90Seconds: 504, count: 3 });
    // [30, 300]: mediana 165; p90 = 30 + 0,9 × 270 = 273.
    expect(body.timings.toIdentification).toEqual({
      medianSeconds: 165,
      p90Seconds: 273,
      count: 2,
    });
    expect(body.timings.toFinalization).toEqual({ medianSeconds: 900, p90Seconds: 900, count: 1 });
  });

  it('sem dados: tempos nulos e contagens zeradas', async () => {
    const { collaborator } = await setup();
    const { body } = await collaborator.get('/dashboard/summary?period=30d').expect(200);
    expect(body.receivedInPeriod).toBe(0);
    expect(body.timings.toFirstView).toEqual({ medianSeconds: null, p90Seconds: null, count: 0 });
  });

  it('links personalizados: ativos agora; utilizados e expirados no período; por escopo', async () => {
    const { a, b, collaborator, admin } = await setup();
    const now = Date.now();
    const { user } = await createUser(ctx.prisma, crypto, { role: 'ADMIN' });
    const base = {
      createdAt: new Date(now - 2 * 86_400_000),
      patientExternalId: 'x',
      patientDisplayLabel: 'X. · CPF ***.***.***-00',
      createdByUserId: user.id,
    };
    let seq = 0;
    const token = () => `hash-${(seq += 1)}`.padEnd(64, '0');
    await ctx.prisma.patientUploadLink.createMany({
      data: [
        { ...base, storeId: a.id, tokenHash: token(), expiresAt: new Date(now + 86_400_000) },
        {
          ...base,
          storeId: a.id,
          tokenHash: token(),
          status: 'USED',
          usedAt: new Date(now - 60_000),
          expiresAt: new Date(now + 86_400_000),
        },
        { ...base, storeId: a.id, tokenHash: token(), expiresAt: new Date(now - 60_000) },
        { ...base, storeId: b.id, tokenHash: token(), expiresAt: new Date(now + 86_400_000) },
      ],
    });
    const mine = await collaborator.get('/dashboard/summary?period=today').expect(200);
    expect(mine.body.links).toEqual({ active: 1, used: 1, expired: 1 });
    const all = await admin.get('/dashboard/summary?period=today').expect(200);
    expect(all.body.links).toEqual({ active: 2, used: 1, expired: 1 });
  });

  it('valida período: personalizado acima do máximo, datas inválidas e parâmetros extras', async () => {
    const { collaborator } = await setup();
    const day = today();
    await collaborator
      .get(`/dashboard/summary?period=custom&from=${addDays(day, -89)}&to=${day}`)
      .expect(200);
    await collaborator
      .get(`/dashboard/summary?period=custom&from=${addDays(day, -90)}&to=${day}`)
      .expect(400);
    await collaborator
      .get('/dashboard/summary?period=custom&from=2026-02-30&to=2026-03-01')
      .expect(400);
    await collaborator.get(`/dashboard/summary?period=custom&from=${day}`).expect(400);
    await collaborator.get('/dashboard/summary?period=7d&from=2026-01-01').expect(400);
    await collaborator.get('/dashboard/summary?period=ontem').expect(400);
    await collaborator.get('/dashboard/summary?storeId=x').expect(400);
  });
});
