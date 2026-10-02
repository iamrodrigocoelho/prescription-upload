import { createHash } from 'node:crypto';
import { ApiErrorCode, AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { PatientLinkAccessService } from '../src/modules/patient-links/patient-link-access.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createSubmission, createUser } from './utils/factories.js';
import { Client, loginAs } from './utils/http.js';
import {
  createPatientLink,
  JOAO,
  MARIA,
  selectPatient,
  unknownSelectionRef,
} from './utils/patients.js';

const TOKEN_URL = /^http:\/\/localhost:3000\/p\/([A-Za-z0-9_-]{43})$/;

describe('Links personalizados (e2e)', () => {
  let ctx: TestContext;
  let crypto: CryptoService;
  let access: PatientLinkAccessService;

  beforeAll(async () => {
    ctx = await createTestContext();
    crypto = ctx.app.get(CryptoService);
    access = ctx.app.get(PatientLinkAccessService);
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function setup() {
    const storeA = await createStore(ctx.prisma, { storeName: 'Loja A' });
    const storeB = await createStore(ctx.prisma, { storeName: 'Loja B' });
    const collaboratorA = await loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [storeA.id] }),
    );
    return { storeA, storeB, collaboratorA };
  }

  const createLink = createPatientLink;

  const tokenOf = (url: string): string => TOKEN_URL.exec(url)?.[1] ?? '';

  describe('geração (CA-011)', () => {
    it('cria URL com token opaco, sem PII, e persiste apenas o hash', async () => {
      const { storeA, collaboratorA } = await setup();
      const res = await createLink(collaboratorA, storeA.id).expect(201);

      expect(res.body.url).toMatch(TOKEN_URL);
      const token = tokenOf(res.body.url as string);
      const url = res.body.url as string;
      // Nenhum dado pessoal ou identificador interno na URL.
      for (const forbidden of [
        JOAO.cpf,
        JOAO.cpf.slice(-4),
        JOAO.phone ?? '',
        JOAO.email ?? '',
        'joao',
        'silva',
        JOAO.externalId,
        storeA.id,
        storeA.storeNumber,
        res.body.link.id,
      ]) {
        expect(url.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }

      expect(res.body.link).toMatchObject({
        status: 'ACTIVE',
        store: { id: storeA.id },
        patientLabel: `João T. · CPF ***.***.***-${JOAO.cpf.slice(-2)}`,
      });
      const days = (Date.parse(res.body.link.expiresAt) - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.99);
      expect(days).toBeLessThanOrEqual(7);

      const row = await ctx.prisma.patientUploadLink.findUniqueOrThrow({
        where: { id: res.body.link.id },
      });
      expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
      // O token puro não está em nenhuma coluna do link nem na auditoria.
      expect(JSON.stringify(row)).not.toContain(token);
      const audits = await ctx.prisma.auditLog.findMany({ where: { entityId: row.id } });
      expect(JSON.stringify(audits)).not.toContain(token);
      expect(audits.find((a) => a.action === AuditAction.PATIENT_LINK_CREATED)).toMatchObject({
        storeId: storeA.id,
        metadata: expect.objectContaining({ patientExternalId: JOAO.externalId, expiresInDays: 7 }),
      });
    });

    it('o token não é exibido novamente na listagem', async () => {
      const { storeA, collaboratorA } = await setup();
      const created = await createLink(collaboratorA, storeA.id).expect(201);
      const list = await collaboratorA.get('/admin/patient-links').expect(200);
      expect(JSON.stringify(list.body)).not.toContain(tokenOf(created.body.url as string));
      expect(list.body.items[0]).not.toHaveProperty('url');
    });

    it('aceita validade dentro do máximo e rejeita acima', async () => {
      const { storeA, collaboratorA } = await setup();
      const ok = await createLink(collaboratorA, storeA.id, JOAO, {
        expiresInDays: 3,
      }).expect(201);
      expect((Date.parse(ok.body.link.expiresAt) - Date.now()) / 86_400_000).toBeLessThanOrEqual(3);
      await createLink(collaboratorA, storeA.id, JOAO, { expiresInDays: 31 }).expect(400);

      const options = await collaboratorA.get('/admin/patient-links/options').expect(200);
      expect(options.body).toEqual({
        defaultExpiryDays: 7,
        maxExpiryDays: 30,
        expiryOptions: [1, 3, 7, 15, 30],
      });
    });

    it('recusa patientExternalId enviado pelo cliente (só aceita a seleção opaca)', async () => {
      const { storeA, collaboratorA } = await setup();
      await collaboratorA
        .post('/admin/patient-links', { storeId: storeA.id, patientExternalId: JOAO.externalId })
        .expect(400);
      const ref = await selectPatient(collaboratorA, { storeId: storeA.id });
      await collaboratorA
        .post('/admin/patient-links', {
          storeId: storeA.id,
          selectionRef: ref,
          patientExternalId: MARIA.externalId,
        })
        .expect(400);
    });

    it('seleção inexistente, de outra loja, de outro usuário ou já usada é recusada', async () => {
      const { storeA, collaboratorA } = await setup();
      const expectExpired = (res: { body: { error: { issues: { path: string }[] } } }) =>
        expect(res.body.error.issues[0]!.path).toBe('selectionRef');

      // Inexistente.
      expectExpired(
        await collaboratorA
          .post('/admin/patient-links', { storeId: storeA.id, selectionRef: unknownSelectionRef() })
          .expect(400),
      );

      // De outro contexto: busca feita para a Loja A2, usada na Loja A.
      const storeA2 = await createStore(ctx.prisma, { storeName: 'Loja A2' });
      const manager = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [storeA.id, storeA2.id] }),
      );
      const refA2 = await selectPatient(manager, { storeId: storeA2.id });
      expectExpired(
        await manager
          .post('/admin/patient-links', { storeId: storeA.id, selectionRef: refA2 })
          .expect(400),
      );

      // De outro usuário (mesma loja).
      const refManager = await selectPatient(manager, { storeId: storeA.id });
      expectExpired(
        await collaboratorA
          .post('/admin/patient-links', { storeId: storeA.id, selectionRef: refManager })
          .expect(400),
      );

      // Uso único.
      const ref = await selectPatient(collaboratorA, { storeId: storeA.id });
      await collaboratorA
        .post('/admin/patient-links', { storeId: storeA.id, selectionRef: ref })
        .expect(201);
      expectExpired(
        await collaboratorA
          .post('/admin/patient-links', { storeId: storeA.id, selectionRef: ref })
          .expect(400),
      );
    });

    it('seleção de outra sessão do mesmo usuário é recusada', async () => {
      const { storeA } = await setup();
      const { user } = await createUser(ctx.prisma, crypto, {
        role: 'STORE_COLLABORATOR',
        storeIds: [storeA.id],
      });
      const first = new Client(ctx.app);
      await first.login(user.email);
      const second = new Client(ctx.app);
      await second.login(user.email);
      const ref = await selectPatient(first, { storeId: storeA.id });
      await second
        .post('/admin/patient-links', { storeId: storeA.id, selectionRef: ref })
        .expect(400);
    });

    it('não gera link para loja inativa', async () => {
      const inactive = await createStore(ctx.prisma, { active: false });
      const adminClient = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'ADMIN' }),
      );
      await createLink(adminClient, inactive.id).expect(409);
    });
  });

  describe('escopo', () => {
    it('Colaborador da Loja A não gera link para a Loja B (store_id do cliente validado)', async () => {
      const { storeB, collaboratorA } = await setup();
      const res = await createLink(collaboratorA, storeB.id).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(await ctx.prisma.patientUploadLink.count()).toBe(0);
      const denied = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.AUTHZ_DENIED, entityId: storeB.id },
      });
      expect(denied?.metadata).toEqual({ reason: 'store_out_of_scope' });
    });

    it('Gestor fora do escopo é bloqueado; dentro do escopo, gera', async () => {
      const a = await createStore(ctx.prisma);
      const b = await createStore(ctx.prisma);
      const c = await createStore(ctx.prisma);
      const manager = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id, b.id] }),
      );
      await createLink(manager, b.id).expect(201);
      await createLink(manager, c.id).expect(403);
    });

    it('listagem mostra apenas links das lojas do escopo (CA-007 aplicado a links)', async () => {
      const { storeA, storeB, collaboratorA } = await setup();
      const adminClient = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'ADMIN' }),
      );
      await createLink(adminClient, storeA.id).expect(201);
      await createLink(adminClient, storeB.id, MARIA).expect(201);

      const own = await collaboratorA.get('/admin/patient-links').expect(200);
      expect(own.body.total).toBe(1);
      expect(own.body.items[0].store.id).toBe(storeA.id);

      // Filtrar explicitamente pela Loja B não vaza nada.
      const other = await collaboratorA
        .get(`/admin/patient-links?storeId=${storeB.id}`)
        .expect(200);
      expect(other.body.total).toBe(0);

      expect((await adminClient.get('/admin/patient-links').expect(200)).body.total).toBe(2);
    });

    it('não revoga link de outra loja (404, indistinguível de inexistente)', async () => {
      const { storeB, collaboratorA } = await setup();
      const adminClient = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'ADMIN' }),
      );
      const linkB = await createLink(adminClient, storeB.id).expect(201);
      await collaboratorA.post(`/admin/patient-links/${linkB.body.link.id}/revoke`).expect(404);
      const row = await ctx.prisma.patientUploadLink.findUniqueOrThrow({
        where: { id: linkB.body.link.id },
      });
      expect(row.status).toBe('ACTIVE');
    });
  });

  describe('status e revogação', () => {
    it('revoga link ativo, audita e não revoga duas vezes', async () => {
      const { storeA, collaboratorA } = await setup();
      const created = await createLink(collaboratorA, storeA.id).expect(201);
      const id = created.body.link.id as string;

      const res = await collaboratorA.post(`/admin/patient-links/${id}/revoke`).expect(200);
      expect(res.body.status).toBe('REVOKED');
      expect(res.body.revokedAt).toEqual(expect.any(String));
      await collaboratorA.post(`/admin/patient-links/${id}/revoke`).expect(409);

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.PATIENT_LINK_REVOKED, entityId: id },
      });
      expect(audit?.storeId).toBe(storeA.id);
    });

    it('deriva "Expirado" na leitura e filtra por status', async () => {
      const { storeA, collaboratorA } = await setup();
      const active = await createLink(collaboratorA, storeA.id).expect(201);
      const toExpire = await createLink(collaboratorA, storeA.id, MARIA).expect(201);
      await ctx.prisma.patientUploadLink.update({
        where: { id: toExpire.body.link.id },
        data: {
          createdAt: new Date(Date.now() - 10 * 86_400_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });

      const expired = await collaboratorA.get('/admin/patient-links?status=EXPIRED').expect(200);
      expect(expired.body.items.map((l: { id: string }) => l.id)).toEqual([toExpire.body.link.id]);
      expect(expired.body.items[0].status).toBe('EXPIRED');
      const activeList = await collaboratorA.get('/admin/patient-links?status=ACTIVE').expect(200);
      expect(activeList.body.items.map((l: { id: string }) => l.id)).toEqual([active.body.link.id]);

      // Link expirado não pode ser revogado.
      await collaboratorA.post(`/admin/patient-links/${toExpire.body.link.id}/revoke`).expect(409);
    });
  });

  describe('validação do token (CA-014) e consumo', () => {
    async function createdToken(client: Client, storeId: string, patient = JOAO) {
      const res = await createLink(client, storeId, patient).expect(201);
      return { token: tokenOf(res.body.url as string), id: res.body.link.id as string };
    }

    async function expectNeutral(promise: Promise<unknown>) {
      const error = (await promise.then(
        () => null,
        (e: unknown) => e,
      )) as { code?: string; message?: string; getStatus?: () => number } | null;
      expect(error?.code).toBe(ApiErrorCode.LINK_UNAVAILABLE);
      expect(error?.getStatus?.()).toBe(404);
      return error?.message;
    }

    it('token válido resolve loja e paciente', async () => {
      const { storeA, collaboratorA } = await setup();
      const { token, id } = await createdToken(collaboratorA, storeA.id);
      await expect(access.resolve(token)).resolves.toEqual({
        linkId: id,
        storeId: storeA.id,
        storeNumber: storeA.storeNumber,
        storeName: storeA.storeName,
        patientExternalId: JOAO.externalId,
        patientDisplayLabel: `João T. · CPF ***.***.***-${JOAO.cpf.slice(-2)}`,
        patientLabelCapturedAt: expect.any(Date),
      });
    });

    it('inexistente, malformado, expirado, revogado, utilizado e loja inativa → mesmo erro neutro', async () => {
      const { storeA, collaboratorA } = await setup();
      const expired = await createdToken(collaboratorA, storeA.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: expired.id },
        data: {
          createdAt: new Date(Date.now() - 10 * 86_400_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      const revoked = await createdToken(collaboratorA, storeA.id);
      await collaboratorA.post(`/admin/patient-links/${revoked.id}/revoke`).expect(200);
      const used = await createdToken(collaboratorA, storeA.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: used.id },
        data: { status: 'USED', usedAt: new Date() },
      });
      const inactiveStore = await createdToken(collaboratorA, storeA.id, MARIA);

      const messages = new Set([
        await expectNeutral(access.resolve('A'.repeat(43))),
        await expectNeutral(access.resolve('nao-e-um-token')),
        await expectNeutral(access.resolve(expired.token)),
        await expectNeutral(access.resolve(revoked.token)),
        await expectNeutral(access.resolve(used.token)),
      ]);
      await ctx.prisma.store.update({ where: { id: storeA.id }, data: { active: false } });
      messages.add(await expectNeutral(access.resolve(inactiveStore.token)));

      expect(messages).toEqual(
        new Set(['Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.']),
      );
    });

    async function createSubmission(storeId: string, linkId: string) {
      return ctx.prisma.prescriptionSubmission.create({
        data: {
          storeId,
          sourceChannel: 'PERSONALIZED_LINK',
          identificationStatus: 'IDENTIFIED_PERSONALIZED_LINK',
          patientExternalId: JOAO.externalId,
          patientUploadLinkId: linkId,
          retentionUntil: new Date(Date.now() + 365 * 86_400_000),
        },
      });
    }

    it('consumo é atômico, de uso único, idempotente e auditado', async () => {
      const { storeA, collaboratorA } = await setup();
      const { token, id } = await createdToken(collaboratorA, storeA.id);
      const first = await createSubmission(storeA.id, id);
      const second = await createSubmission(storeA.id, id);

      await expect(access.consume(id, first.id)).resolves.toBe('consumed');
      await expect(access.consume(id, first.id)).resolves.toBe('already_consumed');
      await expectNeutral(access.consume(id, second.id));
      await expectNeutral(access.resolve(token));

      const row = await ctx.prisma.patientUploadLink.findUniqueOrThrow({ where: { id } });
      expect(row).toMatchObject({ status: 'USED', usedSubmissionId: first.id });
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: AuditAction.PATIENT_LINK_CONSUMED, entityId: id },
        }),
      ).toBe(1);

      const list = await collaboratorA.get('/admin/patient-links?status=USED').expect(200);
      expect(list.body.items[0]).toMatchObject({ id, status: 'USED', usedAt: expect.any(String) });
    });

    it('envios concorrentes consomem o link apenas uma vez', async () => {
      const { storeA, collaboratorA } = await setup();
      const { id } = await createdToken(collaboratorA, storeA.id);
      const submissions = await Promise.all(
        Array.from({ length: 5 }, () => createSubmission(storeA.id, id)),
      );
      const results = await Promise.allSettled(submissions.map((s) => access.consume(id, s.id)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    });
  });

  describe('busca de pacientes', () => {
    it('retorna dados mínimos mascarados com referência opaca, sem ID, e audita sem o termo', async () => {
      const { storeA, collaboratorA } = await setup();
      const res = await collaboratorA
        .post('/patients/search', {
          type: 'cpf',
          query: JOAO.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'),
          context: { storeId: storeA.id },
        })
        .expect(200);
      expect(res.body.results).toEqual([
        {
          selectionRef: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
          displayName: 'João T.',
          cpfMasked: `***.***.***-${JOAO.cpf.slice(-2)}`,
          phoneMasked: '*****-0001',
          emailMasked: 'j***@e***.com',
        },
      ]);
      const body = JSON.stringify(res.body);
      for (const forbidden of [JOAO.cpf, 'Silva', JOAO.externalId]) {
        expect(body).not.toContain(forbidden);
      }

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.PATIENT_SEARCH_PERFORMED },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).toMatchObject({ storeId: storeA.id });
      expect(audit?.metadata).toMatchObject({
        searchType: 'cpf',
        resultCount: 1,
        contextType: 'store',
      });
      expect(JSON.stringify(audit?.metadata)).not.toContain(JOAO.cpf);
    });

    it('telefone compartilhado retorna pacientes para desambiguação', async () => {
      const { storeA, collaboratorA } = await setup();
      const res = await collaboratorA
        .post('/patients/search', {
          type: 'phone',
          query: '(21) 99000-0099',
          context: { storeId: storeA.id },
        })
        .expect(200);
      expect(res.body.results).toHaveLength(2);
      expect(res.body.results[0].selectionRef).not.toBe(res.body.results[1].selectionRef);
    });

    it('valida o termo por tipo e exige um contexto', async () => {
      const { storeA, collaboratorA } = await setup();
      const context = { storeId: storeA.id };
      await collaboratorA
        .post('/patients/search', { type: 'cpf', query: '111.111.111-11', context })
        .expect(400);
      await collaboratorA
        .post('/patients/search', { type: 'email', query: 'invalido', context })
        .expect(400);
      await collaboratorA
        .post('/patients/search', { type: 'nome', query: 'João', context })
        .expect(400);
      await collaboratorA
        .post('/patients/search', { type: 'email', query: 'x@example.com' })
        .expect(400);
    });

    it('contexto de loja fora do escopo ou inativa é recusado antes de consultar a API', async () => {
      const { storeB, collaboratorA } = await setup();
      const searches = () =>
        ctx.prisma.auditLog.count({ where: { action: AuditAction.PATIENT_SEARCH_PERFORMED } });
      const before = await searches();
      await collaboratorA
        .post('/patients/search', {
          type: 'email',
          query: 'x@example.com',
          context: { storeId: storeB.id },
        })
        .expect(403);
      const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
      const inactive = await createStore(ctx.prisma, { active: false });
      await admin
        .post('/patients/search', {
          type: 'email',
          query: 'x@example.com',
          context: { storeId: inactive.id },
        })
        .expect(409);
      expect(await searches()).toBe(before);
    });

    it('contexto de receita: fora do escopo → 404; já identificada → 409', async () => {
      const { storeA, storeB, collaboratorA } = await setup();
      const other = await createSubmission(ctx.prisma, crypto, { storeId: storeB.id });
      const search = (prescriptionId: string) =>
        collaboratorA.post('/patients/search', {
          type: 'email',
          query: 'x@example.com',
          context: { prescriptionId },
        });
      await search(other.id).expect(404);
      const linked = await createSubmission(ctx.prisma, crypto, {
        storeId: storeA.id,
        patient: { externalId: JOAO.externalId, label: 'João T. · CPF ***.***.***-00' },
      });
      await search(linked.id).expect(409);
      const open = await createSubmission(ctx.prisma, crypto, { storeId: storeA.id });
      const res = await search(open.id).expect(200);
      expect(res.body.results).toEqual([]);
    });

    it('aplica rate limit por usuário', async () => {
      const { storeA, collaboratorA } = await setup();
      const body = { type: 'email', query: 'x@example.com', context: { storeId: storeA.id } };
      for (let i = 0; i < 30; i += 1) {
        await collaboratorA.post('/patients/search', body).expect(200);
      }
      await collaboratorA.post('/patients/search', body).expect(429);
    });
  });
});
