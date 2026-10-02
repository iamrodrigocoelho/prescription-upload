import { AuditAction } from '@receita/shared';
import request from 'supertest';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { MOCK_PATIENTS } from '../src/modules/patients/mock-patient.provider.js';
import { createPatientLink } from './utils/patients.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createUser } from './utils/factories.js';
import { loginAs } from './utils/http.js';

describe('Contexto público (e2e)', () => {
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

  const http = () => request(ctx.app.getHttpServer());

  describe('GET /public/stores/:slug', () => {
    it('retorna apenas dados de exibição da loja ativa', async () => {
      const store = await createStore(ctx.prisma, { storeName: 'Venancio Centro' });
      const res = await http().get(`/public/stores/${store.publicSlug}`).expect(200);
      expect(res.body).toEqual({
        storeNumber: store.storeNumber,
        storeName: 'Venancio Centro',
        acceptsSubmissions: true,
      });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('loja inativa retorna estado indisponível (CA-010)', async () => {
      const store = await createStore(ctx.prisma, { active: false });
      const res = await http().get(`/public/stores/${store.publicSlug}`).expect(200);
      expect(res.body.acceptsSubmissions).toBe(false);
    });

    it('slug inexistente ou malformado retorna o mesmo erro neutro', async () => {
      const a = await http().get('/public/stores/AAAAAAAAAAAA').expect(404);
      const b = await http().get('/public/stores/curto%24').expect(404);
      expect(a.body.error.code).toBe('NOT_FOUND');
      expect(b.body.error.message).toBe(a.body.error.message);
    });
  });

  describe('GET /public/stores?search=', () => {
    it('busca apenas lojas ativas, por número, nome, bairro ou endereço', async () => {
      await createStore(ctx.prisma, { storeNumber: '701', storeName: 'Venancio Leblon' });
      await createStore(ctx.prisma, {
        storeNumber: '702',
        storeName: 'Venancio Leblon II',
        active: false,
      });
      const res = await http().get('/public/stores?search=leblon').expect(200);
      expect(res.body.items.map((s: { storeNumber: string }) => s.storeNumber)).toEqual(['701']);
      expect(Object.keys(res.body.items[0] as object).sort()).toEqual(
        ['city', 'id', 'neighborhood', 'storeName', 'storeNumber'].sort(),
      );
    });

    it('exige termo mínimo', async () => {
      await http().get('/public/stores?search=a').expect(400);
    });

    it('aplica rate limit por IP', async () => {
      // Limite reduzido não é necessário: o padrão de teste é 120/min; consome direto.
      for (let i = 0; i < 120; i += 1) await http().get('/public/stores?search=xx');
      const res = await http().get('/public/stores?search=xx').expect(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('GET /public/patient-links/:token', () => {
    async function createLinkToken(storeId: string) {
      const admin = await loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));
      const res = await createPatientLink(admin, storeId).expect(201);
      return {
        token: /\/p\/([A-Za-z0-9_-]{43})$/.exec(res.body.url as string)?.[1] ?? '',
        id: res.body.link.id as string,
      };
    }

    it('retorna somente a loja — nada do paciente — e audita a abertura sem o token', async () => {
      const store = await createStore(ctx.prisma, { storeName: 'Venancio Tijuca' });
      const { token, id } = await createLinkToken(store.id);
      const res = await http().get(`/public/patient-links/${token}`).expect(200);
      expect(res.body).toEqual({ storeNumber: store.storeNumber, storeName: 'Venancio Tijuca' });
      const body = JSON.stringify(res.body);
      for (const forbidden of [MOCK_PATIENTS[0]!.cpf, 'João', MOCK_PATIENTS[0]!.externalId]) {
        expect(body).not.toContain(forbidden);
      }
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.PATIENT_LINK_OPENED, entityId: id },
      });
      expect(audit?.storeId).toBe(store.id);
      expect(JSON.stringify(audit)).not.toContain(token);
    });

    it('inexistente, expirado e revogado retornam a mesma resposta (CA-014)', async () => {
      const store = await createStore(ctx.prisma);
      const expired = await createLinkToken(store.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: expired.id },
        data: { createdAt: new Date(Date.now() - 9e8), expiresAt: new Date(Date.now() - 1000) },
      });
      const revoked = await createLinkToken(store.id);
      await ctx.prisma.patientUploadLink.update({
        where: { id: revoked.id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });
      const responses = await Promise.all(
        ['B'.repeat(43), expired.token, revoked.token].map((t) =>
          http().get(`/public/patient-links/${t}`),
        ),
      );
      for (const res of responses) expect(res.status).toBe(404);
      const strip = (b: { error: Record<string, unknown> }) => ({
        ...b.error,
        requestId: undefined,
      });
      expect(new Set(responses.map((r) => JSON.stringify(strip(r.body)))).size).toBe(1);
    });
  });
});
