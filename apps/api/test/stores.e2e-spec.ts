import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createUser } from './utils/factories.js';
import { type Client, loginAs } from './utils/http.js';

const CSV = [
  'store_number;store_name;active;address;neighborhood;city;state',
  '101;Venancio Copacabana;sim;Rua A, 1;Copacabana;Rio de Janeiro;RJ',
  '102;Venancio Tijuca;sim;;Tijuca;Rio de Janeiro;rj',
  '103;Venancio Barra;não;;;;',
  ';Sem número;sim;;;;',
  '104;Venancio Niterói;talvez;;;;RJ',
].join('\n');

describe('Lojas (e2e)', () => {
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

  const admin = () => loginAs(ctx.app, () => createUser(ctx.prisma, crypto, { role: 'ADMIN' }));

  const upload = (client: Client, content: string, query = '', filename = 'lojas.csv') =>
    client.agent
      .post(`/admin/stores/import${query}`)
      .set('x-csrf-token', client.csrfToken)
      .attach('file', Buffer.from(content, 'utf8'), { filename, contentType: 'text/csv' });

  describe('importação CSV', () => {
    it('importa linhas válidas, reporta as inválidas e audita', async () => {
      const client = await admin();
      const res = await upload(client, CSV).expect(200);
      expect(res.body).toMatchObject({
        dryRun: false,
        totalRows: 5,
        validRows: 3,
        created: 3,
        updated: 0,
        unchanged: 0,
      });
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ line: 5, field: 'store_number' }),
          expect.objectContaining({ line: 6, field: 'active' }),
        ]),
      );

      const stores = await ctx.prisma.store.findMany({ orderBy: { storeNumber: 'asc' } });
      expect(stores.map((s) => [s.storeNumber, s.active, s.state])).toEqual([
        ['101', true, 'RJ'],
        ['102', true, 'RJ'],
        ['103', false, null],
      ]);
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.STORE_IMPORTED },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.metadata).toEqual({
        totalRows: 5,
        created: 3,
        updated: 0,
        unchanged: 0,
        invalidRows: 2,
      });
    });

    it('gera slug público não sequencial e imprevisível', async () => {
      const client = await admin();
      await upload(client, CSV).expect(200);
      const slugs = (await ctx.prisma.store.findMany()).map((s) => s.publicSlug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const slug of slugs) {
        expect(slug).toMatch(/^[0-9A-Za-z]{12}$/);
        expect(slug).not.toMatch(/10[1-3]/);
      }
    });

    it('reimportação não duplica lojas: atualiza por store_number e preserva o slug', async () => {
      const client = await admin();
      await upload(client, CSV).expect(200);
      const before = await ctx.prisma.store.findUniqueOrThrow({ where: { storeNumber: '101' } });

      const again = await upload(client, CSV).expect(200);
      expect(again.body).toMatchObject({ created: 0, updated: 0, unchanged: 3 });

      const changed = CSV.replace('Venancio Copacabana;sim', 'Venancio Copa Posto 6;não');
      const third = await upload(client, changed).expect(200);
      expect(third.body).toMatchObject({ created: 0, updated: 1, unchanged: 2 });

      expect(await ctx.prisma.store.count()).toBe(3);
      const after = await ctx.prisma.store.findUniqueOrThrow({ where: { storeNumber: '101' } });
      expect(after).toMatchObject({ storeName: 'Venancio Copa Posto 6', active: false });
      expect(after.publicSlug).toBe(before.publicSlug);
      expect(after.id).toBe(before.id);
    });

    it('dryRun valida sem gravar', async () => {
      const client = await admin();
      const res = await upload(client, CSV, '?dryRun=true').expect(200);
      expect(res.body).toMatchObject({ dryRun: true, created: 3 });
      expect(await ctx.prisma.store.count()).toBe(0);
    });

    it('rejeita ausência de arquivo, formato não CSV e arquivo grande', async () => {
      const client = await admin();
      await client.agent
        .post('/admin/stores/import')
        .set('x-csrf-token', client.csrfToken)
        .expect(400);
      await client.agent
        .post('/admin/stores/import')
        .set('x-csrf-token', client.csrfToken)
        .attach('file', Buffer.from('%PDF-1.7'), {
          filename: 'x.pdf',
          contentType: 'application/pdf',
        })
        .expect(400);
      const big = 'store_number,store_name,active\n' + `1,${'x'.repeat(190)},true\n`.repeat(12_000);
      const res = await upload(client, big);
      expect(res.status).toBe(413);
    });

    it.each(['STORE_COLLABORATOR', 'MANAGER'] as const)(
      '%s não importa nem edita lojas',
      async (role) => {
        const store = await createStore(ctx.prisma);
        const client = await loginAs(ctx.app, () =>
          createUser(ctx.prisma, crypto, { role, storeIds: [store.id] }),
        );
        await upload(client, CSV).expect(403);
        await client.patch(`/admin/stores/${store.id}`, { active: false }).expect(403);
        await client
          .post('/admin/stores', { storeNumber: '555', storeName: 'Nova', active: true })
          .expect(403);
      },
    );
  });

  describe('cadastro e edição pelo Admin', () => {
    it('cria loja com slug e impede número duplicado', async () => {
      const client = await admin();
      const res = await client
        .post('/admin/stores', {
          storeNumber: '300',
          storeName: 'Venancio Centro',
          active: true,
          state: 'rj',
        })
        .expect(201);
      expect(res.body.publicUrl).toMatch(/^http:\/\/localhost:3000\/l\/[0-9A-Za-z]{12}$/);
      expect(res.body.state).toBe('RJ');
      await client
        .post('/admin/stores', { storeNumber: '300', storeName: 'Outra', active: true })
        .expect(409);
    });

    it('desativa a loja e audita a mudança', async () => {
      const store = await createStore(ctx.prisma);
      const client = await admin();
      const res = await client.patch(`/admin/stores/${store.id}`, { active: false }).expect(200);
      expect(res.body.active).toBe(false);
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.STORE_UPDATED, entityId: store.id },
      });
      expect(audit?.metadata).toEqual({ fields: ['active'], active: { from: true, to: false } });
      expect(audit?.storeId).toBe(store.id);
    });
  });

  describe('escopo de lojas (isolamento)', () => {
    it('Colaborador da Loja A vê apenas a Loja A e não acessa a Loja B', async () => {
      const a = await createStore(ctx.prisma, { storeName: 'Loja A' });
      const b = await createStore(ctx.prisma, { storeName: 'Loja B' });
      const client = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'STORE_COLLABORATOR', storeIds: [a.id] }),
      );

      const list = await client.get('/admin/stores').expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([a.id]);
      expect(list.body.total).toBe(1);

      await client.get(`/admin/stores/${b.id}`).expect(404);
      await client.get(`/admin/stores/${b.id}/public-link`).expect(404);

      const link = await client.get(`/admin/stores/${a.id}/public-link`).expect(200);
      expect(link.body).toEqual({ url: `http://localhost:3000/l/${a.publicSlug}`, active: true });
    });

    it('Gestor vê somente as lojas sob sua responsabilidade', async () => {
      const a = await createStore(ctx.prisma);
      const b = await createStore(ctx.prisma);
      const c = await createStore(ctx.prisma);
      const client = await loginAs(ctx.app, () =>
        createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id, b.id] }),
      );
      const list = await client.get('/admin/stores').expect(200);
      expect(list.body.items.map((s: { id: string }) => s.id).sort()).toEqual([a.id, b.id].sort());
      await client.get(`/admin/stores/${c.id}`).expect(404);
    });

    it('Admin vê todas as lojas e filtra por busca', async () => {
      await createStore(ctx.prisma, { storeName: 'Venancio Leblon' });
      await createStore(ctx.prisma, { storeName: 'Venancio Ipanema' });
      const client = await admin();
      expect((await client.get('/admin/stores').expect(200)).body.total).toBe(2);
      const search = await client.get('/admin/stores?search=leblon').expect(200);
      expect(search.body.items).toHaveLength(1);
    });
  });
});
