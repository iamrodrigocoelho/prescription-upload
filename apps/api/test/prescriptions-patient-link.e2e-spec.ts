import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { type Client, loginAs } from './utils/http.js';
import { JOAO, MARIA, selectPatient } from './utils/patients.js';

describe('Vínculo manual de paciente (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
  });
  beforeEach(() => ctx.reset());
  afterAll(() => ctx.app.close());

  async function setup() {
    const a = await createStore(ctx.prisma);
    const b = await createStore(ctx.prisma);
    const { user } = await createUser(ctx.prisma, crypto, {
      role: 'STORE_COLLABORATOR',
      storeIds: [a.id],
      name: 'Colaboradora Ana',
    });
    const collaborator = await loginAs(ctx.app, () => Promise.resolve({ user }));
    const submission = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    return { a, b, user, collaborator, submission };
  }

  const link = (client: Client, id: string, selectionRef: string) =>
    client.post(`/prescriptions/${id}/patient-link`, { selectionRef });

  it('CA-008: busca por CPF, telefone ou e-mail, confirma e vincula com auditoria', async () => {
    const { a, user, collaborator, submission } = await setup();
    const context = { prescriptionId: submission.id };

    // Os três critérios funcionam no contexto da receita.
    for (const body of [
      { type: 'cpf', query: JOAO.cpf },
      { type: 'phone', query: JOAO.phone },
      { type: 'email', query: JOAO.email },
    ]) {
      const res = await collaborator.post('/patients/search', { ...body, context }).expect(200);
      expect(res.body.results).toHaveLength(1);
    }

    const ref = await selectPatient(collaborator, context, JOAO);
    const res = await link(collaborator, submission.id, ref).expect(200);
    const label = `João T. · CPF ***.***.***-${JOAO.cpf.slice(-2)}`;
    expect(res.body).toEqual({ identificationStatus: 'IDENTIFIED_MANUAL', patientLabel: label });

    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({
      identificationStatus: 'IDENTIFIED_MANUAL',
      patientExternalId: JOAO.externalId,
      patientDisplayLabel: label,
      patientLabelCapturedAt: expect.any(Date),
    });
    expect(
      await ctx.prisma.patientLinkHistory.findFirstOrThrow({
        where: { submissionId: submission.id },
      }),
    ).toMatchObject({
      linkType: 'MANUAL',
      linkedByUserId: user.id,
      patientExternalId: JOAO.externalId,
    });

    // Campos mínimos do PRD §23 + receita e paciente (somente o ID externo).
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: AuditAction.PRESCRIPTION_PATIENT_LINKED, entityId: submission.id },
    });
    expect(audit).toMatchObject({
      id: expect.any(String),
      createdAt: expect.any(Date),
      actorUserId: user.id,
      actorRole: 'STORE_COLLABORATOR',
      entityType: 'PrescriptionSubmission',
      storeId: a.id,
      result: 'SUCCESS',
      metadata: { linkType: 'manual', patientExternalId: JOAO.externalId },
    });
    expect(JSON.stringify(audit)).not.toMatch(new RegExp(`${JOAO.cpf}|João|joao`));

    expect(
      await ctx.prisma.outboxEvent.findFirstOrThrow({
        where: { type: 'prescription.patient_linked' },
      }),
    ).toMatchObject({
      payload: {
        submissionId: submission.id,
        storeId: a.id,
        identificationStatus: 'IDENTIFIED_MANUAL',
      },
    });

    // Detalhe e timeline refletem o vínculo, com o responsável.
    const detail = await collaborator.get(`/prescriptions/${submission.id}`).expect(200);
    expect(detail.body).toMatchObject({
      identificationStatus: 'IDENTIFIED_MANUAL',
      patientLabel: label,
    });
    expect(detail.body.timeline).toContainEqual(
      expect.objectContaining({
        type: 'patient_linked',
        linkType: 'MANUAL',
        actorName: 'Colaboradora Ana',
      }),
    );
  });

  it('receita já identificada → 409 com o estado atual; seleção não é aceita duas vezes', async () => {
    const { collaborator, submission } = await setup();
    const ref = await selectPatient(collaborator, { prescriptionId: submission.id });
    await link(collaborator, submission.id, ref).expect(200);

    const again = await link(collaborator, submission.id, ref).expect(409);
    expect(again.body.error).toMatchObject({
      code: 'CONFLICT',
      message: 'Esta receita já tem um paciente vinculado.',
      issues: [{ path: 'identificationStatus', message: 'Identificado manualmente' }],
    });
  });

  it('vínculos concorrentes: apenas um vence; o outro recebe 409', async () => {
    const { a, collaborator, submission } = await setup();
    const manager = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] }),
    );
    const [refA, refB] = await Promise.all([
      selectPatient(collaborator, { prescriptionId: submission.id }, JOAO),
      selectPatient(manager, { prescriptionId: submission.id }, MARIA),
    ]);
    const results = await Promise.all([
      link(collaborator, submission.id, refA),
      link(manager, submission.id, refB),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await ctx.prisma.patientLinkHistory.count({ where: { submissionId: submission.id } }),
    ).toBe(1);
  });

  it('não sobrescreve a identificação automática feita antes da confirmação', async () => {
    const { collaborator, submission } = await setup();
    const ref = await selectPatient(collaborator, { prescriptionId: submission.id }, MARIA);
    await ctx.prisma.prescriptionSubmission.update({
      where: { id: submission.id },
      data: { patientExternalId: JOAO.externalId, identificationStatus: 'IDENTIFIED_AUTO_CPF' },
    });
    const res = await link(collaborator, submission.id, ref).expect(409);
    expect(res.body.error.issues[0].message).toBe('Identificado automaticamente por CPF');
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({ patientExternalId: JOAO.externalId });
  });

  it('escopo: receita de outra loja → 404, sem vincular', async () => {
    const { b, collaborator, submission } = await setup();
    const other = await createSubmission(ctx.prisma, crypto, { storeId: b.id });
    const ref = await selectPatient(collaborator, { prescriptionId: submission.id });
    await link(collaborator, other.id, ref).expect(404);
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: other.id } }),
    ).toMatchObject({ patientExternalId: null });
  });

  it('seleção de outro contexto (outra receita ou loja) é recusada; ID direto é rejeitado', async () => {
    const { a, collaborator, submission } = await setup();
    const second = await createSubmission(ctx.prisma, crypto, { storeId: a.id });
    const refOther = await selectPatient(collaborator, { prescriptionId: second.id });
    const refStore = await selectPatient(collaborator, { storeId: a.id });
    for (const ref of [refOther, refStore]) {
      const res = await link(collaborator, submission.id, ref).expect(400);
      expect(res.body.error.issues[0].path).toBe('selectionRef');
    }
    await collaborator
      .post(`/prescriptions/${submission.id}/patient-link`, { patientExternalId: JOAO.externalId })
      .expect(400);
    expect(
      await ctx.prisma.prescriptionSubmission.findUniqueOrThrow({ where: { id: submission.id } }),
    ).toMatchObject({ identificationStatus: 'NOT_IDENTIFIED' });
  });
});
