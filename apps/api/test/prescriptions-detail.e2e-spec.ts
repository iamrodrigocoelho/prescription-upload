import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Detalhe da receita (e2e)', () => {
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

  async function setup() {
    const a = await createStore(ctx.prisma, { storeName: 'Loja A' });
    const b = await createStore(ctx.prisma, { storeName: 'Loja B' });
    const collaboratorA = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, {
        role: 'STORE_COLLABORATOR',
        storeIds: [a.id],
        name: 'Ana Lima',
      }),
    );
    return { a, b, collaboratorA };
  }

  it('retorna o detalhe sem storage_key, com CPF mascarado, transições e histórico', async () => {
    const { a, collaboratorA } = await setup();
    const submission = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      cpf: '52998224725',
      files: [{ mimeType: 'image/jpeg' }, { mimeType: 'application/pdf' }],
    });

    const res = await collaboratorA.get(`/prescriptions/${submission.id}`).expect(200);
    expect(res.body).toMatchObject({
      id: submission.id,
      store: { id: a.id, storeName: 'Loja A' },
      operationalStatus: 'RECEIVED',
      cpfMasked: '***.***.***-25',
      version: 0,
      allowedTransitions: ['IN_REVIEW', 'IN_SERVICE', 'CANCELLED', 'NOT_SERVED'],
    });
    expect(res.body.files).toEqual([
      expect.objectContaining({
        position: 1,
        kind: 'image',
        accessible: true,
        previewAvailable: true,
      }),
      expect.objectContaining({ position: 2, kind: 'pdf', accessible: true }),
    ]);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain(submission.files[0]!.storageKey);
    expect(serialized).not.toContain('receita-1.jpg');
    expect(serialized).not.toContain('52998224725');
    expect(res.body.timeline.map((e: { type: string }) => e.type)).toEqual([
      'received',
      'first_viewed',
    ]);
    expect(res.body.timeline[1].actorName).toBe('Ana Lima');
  });

  it('CA-007: receita de outra loja (ou inexistente) retorna 404', async () => {
    const { b, collaboratorA } = await setup();
    const other = await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    const outOfScope = await collaboratorA.get(`/prescriptions/${other.id}`).expect(404);
    const missing = await collaboratorA
      .get('/prescriptions/00000000-0000-4000-8000-000000000000')
      .expect(404);
    expect(outOfScope.body.error.message).toBe(missing.body.error.message);
    const refreshed = await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({
      where: { id: other.id },
    });
    expect(refreshed.firstViewedAt).toBeNull();
  });

  it('primeira visualização atômica: aberturas simultâneas geram um único registro', async () => {
    const { a, collaboratorA } = await setup();
    const other = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
    );
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: a.id });

    await Promise.all([
      collaboratorA.get(`/prescriptions/${submission.id}`).expect(200),
      other.get(`/prescriptions/${submission.id}`).expect(200),
      collaboratorA.get(`/prescriptions/${submission.id}`).expect(200),
    ]);

    const firstViews = await ctx.prisma.auditLog.count({
      where: { action: AuditAction.PRESCRIPTION_FIRST_VIEWED, entityId: submission.id },
    });
    const opens = await ctx.prisma.auditLog.count({
      where: { action: AuditAction.PRESCRIPTION_OPENED, entityId: submission.id },
    });
    const events = await ctx.prisma.outboxEvent.findMany({
      where: { type: 'prescription.viewed' },
    });
    expect(firstViews).toBe(1);
    expect(opens).toBe(3);
    expect(events.map((e) => e.payload)).toEqual([{ submissionId: submission.id, storeId: a.id }]);

    const list = await collaboratorA.get('/prescriptions').expect(200);
    expect(list.body.items[0].isNew).toBe(false);
  });

  it('toda abertura é auditada com loja e ator', async () => {
    const { a, collaboratorA } = await setup();
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    await collaboratorA.get(`/prescriptions/${submission.id}`).expect(200);
    await collaboratorA.get(`/prescriptions/${submission.id}`).expect(200);
    const opens = await ctx.prisma.auditLog.findMany({
      where: { action: AuditAction.PRESCRIPTION_OPENED, entityId: submission.id },
    });
    expect(opens).toHaveLength(2);
    expect(opens[0]).toMatchObject({
      storeId: a.id,
      actorRole: 'STORE_COLLABORATOR',
      result: 'SUCCESS',
    });
  });

  it('Gestor reabre: transições de estado final dependem do perfil', async () => {
    const { a, collaboratorA } = await setup();
    const finished = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      operationalStatus: 'FINISHED',
    });
    expect(
      (await collaboratorA.get(`/prescriptions/${finished.id}`).expect(200)).body
        .allowedTransitions,
    ).toEqual([]);
    const manager = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
    );
    expect(
      (await manager.get(`/prescriptions/${finished.id}`).expect(200)).body.allowedTransitions,
    ).toEqual(['IN_REVIEW']);
  });
});
