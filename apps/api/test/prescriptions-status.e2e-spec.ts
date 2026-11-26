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
      allowedTransitions: [
        'APPROVED',
        'REJECTED',
        'RESUBMISSION_REQUESTED',
        'CANCELLED',
        'NOT_SERVED',
      ],
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
      other.patch(`/prescriptions/${s.id}/status`, { toStatus: 'NOT_SERVED', version: 0 }),
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

  describe('decisões da análise (D-087)', () => {
    async function inReview() {
      const { a, collaborator } = await setup();
      const s = await createSubmission(ctx.prisma, crypto, {
        storeId: a.id,
        operationalStatus: 'IN_REVIEW',
      });
      return { a, collaborator, s };
    }

    it('atendimento só após aprovação: Em análise → Aprovada → Em atendimento', async () => {
      const { collaborator, s } = await inReview();
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_SERVICE', version: 0 })
        .expect(400);
      const approved = await collaborator
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'APPROVED', version: 0 })
        .expect(200);
      expect(approved.body.allowedTransitions).toEqual([
        'IN_SERVICE',
        'IN_REVIEW',
        'CANCELLED',
        'NOT_SERVED',
      ]);
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_SERVICE', version: 1 })
        .expect(200);
    });

    it('Reprovada exige motivo; motivos não se aplicam a Aprovada', async () => {
      const { collaborator, s } = await inReview();
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'REJECTED', version: 0 })
        .expect(400);
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, {
          toStatus: 'APPROVED',
          version: 0,
          reasons: ['CRM_ILLEGIBLE'],
        })
        .expect(400);
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, {
          toStatus: 'RESUBMISSION_REQUESTED',
          version: 0,
          reasons: ['OTHER'],
        })
        .expect(400);
      expect(
        (await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: s.id } }))
          .operationalStatus,
      ).toBe('IN_REVIEW');
    });

    it('grava motivos e texto no histórico; auditoria só com códigos; outbox sem motivos', async () => {
      const { a, collaborator, s } = await inReview();
      const note = 'Receita rasurada no campo de posologia';
      const res = await collaborator
        .patch(`/prescriptions/${s.id}/status`, {
          toStatus: 'REJECTED',
          version: 0,
          reasons: ['ISSUE_DATE_EXPIRED', 'OTHER'],
          reasonNote: `  ${note}  `,
        })
        .expect(200);
      expect(res.body).toMatchObject({ operationalStatus: 'REJECTED', allowedTransitions: [] });

      const last = await ctx.prisma.statusHistory.findFirstOrThrow({
        where: { submissionId: s.id, toStatus: 'REJECTED' },
      });
      expect(last).toMatchObject({ reasons: ['ISSUE_DATE_EXPIRED', 'OTHER'], reasonNote: note });

      const audit = await ctx.prisma.auditLog.findFirstOrThrow({
        where: { action: AuditAction.PRESCRIPTION_STATUS_CHANGED, entityId: s.id },
      });
      expect(audit.metadata).toEqual({
        from: 'IN_REVIEW',
        to: 'REJECTED',
        reasons: ['ISSUE_DATE_EXPIRED', 'OTHER'],
      });
      expect(JSON.stringify(audit)).not.toContain('rasurada');

      const event = await ctx.prisma.outboxEvent.findFirstOrThrow({
        where: {
          type: 'prescription.status_changed',
          payload: { path: ['submissionId'], equals: s.id },
        },
      });
      expect(event.payload).toEqual({
        submissionId: s.id,
        storeId: a.id,
        operationalStatus: 'REJECTED',
        version: 1,
      });

      const detail = await collaborator.get(`/prescriptions/${s.id}`).expect(200);
      expect(detail.body.statusDecision).toMatchObject({
        reasons: ['ISSUE_DATE_EXPIRED', 'OTHER'],
        reasonNote: note,
        actorName: expect.any(String),
      });
      const entry = detail.body.timeline.find(
        (e: { toStatus?: string }) => e.toStatus === 'REJECTED',
      );
      expect(entry).toMatchObject({ reasons: ['ISSUE_DATE_EXPIRED', 'OTHER'] });
      expect(JSON.stringify(detail.body.timeline)).not.toContain('rasurada');
    });

    it('texto de "Outros" com CPF é recusado', async () => {
      const { collaborator, s } = await inReview();
      const res = await collaborator
        .patch(`/prescriptions/${s.id}/status`, {
          toStatus: 'RESUBMISSION_REQUESTED',
          version: 0,
          reasons: ['OTHER'],
          reasonNote: 'paciente 123.456.789-09',
        })
        .expect(400);
      expect(JSON.stringify(res.body)).not.toContain('123.456.789-09');
    });

    it('Reenvio solicitado é final; ao reabrir, a decisão deixa de ser exibida', async () => {
      const { a, collaborator, s } = await inReview();
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, {
          toStatus: 'RESUBMISSION_REQUESTED',
          version: 0,
          reasons: ['CONTENT_ILLEGIBLE'],
        })
        .expect(200);
      await collaborator
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 1 })
        .expect(403);
      const manager = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
      );
      await manager
        .patch(`/prescriptions/${s.id}/status`, { toStatus: 'IN_REVIEW', version: 1 })
        .expect(200);
      const detail = await manager.get(`/prescriptions/${s.id}`).expect(200);
      expect(detail.body.statusDecision).toBeNull();
    });

    it('o banco recusa motivo em status que não o exige (defesa em profundidade)', async () => {
      const { s } = await inReview();
      await expect(
        ctx.prisma.statusHistory.create({
          data: {
            submissionId: s.id,
            fromStatus: 'IN_REVIEW',
            toStatus: 'APPROVED',
            reasons: ['OTHER'],
          },
        }),
      ).rejects.toThrow();
      await expect(
        ctx.prisma.statusHistory.create({
          data: { submissionId: s.id, fromStatus: 'IN_REVIEW', toStatus: 'REJECTED' },
        }),
      ).rejects.toThrow();
    });
  });
});
