import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Status operacional (e2e)', () => {
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
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const collaborator = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [a.id] }),
    );
    return { a, b, collaborator };
  }

  it('transição válida grava StatusHistory, AuditLog e evento; incrementa a versão', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const res = await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 0 })
      .expect(200);
    expect(res.body).toEqual({
      operationalStatus: 'IN_REVIEW',
      version: 1,
      allowedTransitions: ['IN_SERVICE', 'CANCELLED', 'NOT_SERVED'],
    });
    const history = await ctx.prisma.statusHistory.findMany({
      where: { submissionId: s.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      [null, 'RECEIVED'],
      ['RECEIVED', 'IN_REVIEW'],
    ]);
    expect(history[1]?.changedByUserId).toEqual(expect.any(String));
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: AuditAction.PRESCRIPTION_STATUS_CHANGED, entityId: s.id },
    });
    expect(audit).toMatchObject({ storeId: a.id, metadata: { from: 'RECEIVED', to: 'IN_REVIEW' } });
    const event = await ctx.prisma.outboxEvent.findFirst({
      where: { type: 'prescription.status_changed' },
    });
    expect(event?.payload).toEqual({
      submissionId: s.id,
      storeId: a.id,
      operationalStatus: 'IN_REVIEW',
      version: 1,
    });
  });

  it('transição inválida é recusada', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const res = await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'FINISHED', version: 0 })
      .expect(400);
    expect(res.body.error.message).toBe('Transição de status não permitida.');
    await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'RECEIVED', version: 0 })
      .expect(400);
    await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'INVALIDO', version: 0 })
      .expect(400);
  });

  it('versão desatualizada retorna 409; alterações simultâneas: apenas uma vence', async () => {
    const { a, collaborator } = await setup();
    const other = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
    );
    const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id });

    const results = await Promise.all([
      collaborator.patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 0 }),
      other.patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_SERVICE', version: 0 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const conflict = results.find((r) => r.status === 409);
    expect(conflict?.body.error.code).toBe('CONFLICT');
    expect(await ctx.prisma.statusHistory.count({ where: { submissionId: s.id } })).toBe(2);

    await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'CANCELLED', version: 0 })
      .expect(409);
  });

  it('estado final: Colaborador não reabre; Gestor reabre e é auditado como reabertura', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, {
      storeId: a.id,
      operationalStatus: 'FINISHED',
    });
    await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 0 })
      .expect(403);

    const manager = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
    );
    await manager
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_SERVICE', version: 0 })
      .expect(400);
    await manager
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 0 })
      .expect(200);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.PRESCRIPTION_REOPENED, entityId: s.id },
      }),
    ).toBe(1);
  });

  it('CA-007: não altera status de receita de outra loja (404)', async () => {
    const { b, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    await collaborator
      .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 0 })
      .expect(404);
    expect(
      (await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: s.id } }))
        .operationalStatus,
    ).toBe('RECEIVED');
  });

  it('o status de identificação não é alterado por esta rota', async () => {
    const { a, collaborator } = await setup();
    const s = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    await collaborator
      .patch(`/prescriptions/${s.id}/status`, {
        toStatus: 'IN_REVIEW',
        version: 0,
        identificationStatus: 'IDENTIFIED_MANUAL',
      })
      .expect(400);
    expect(
      (await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: s.id } }))
        .identificationStatus,
    ).toBe('NOT_IDENTIFIED');
  });
});
