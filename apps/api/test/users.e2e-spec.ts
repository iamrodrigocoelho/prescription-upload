import { AuditAction } from '@receita/shared';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createStore, createUser } from './utils/factories.js';
import { extractToken } from './utils/in-memory-mail.js';
import { Client, loginAs } from './utils/http.js';

describe('RBAC e gestão de usuários (e2e)', () => {
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

  const admin = () =>
    loginAs(ctx.app, () =>
      createUser(ctx.prisma, crypto, { role: 'ADMIN', email: 'admin@teste.local' }),
    );

  describe('autorização por perfil', () => {
    it.each(['STORE_COLLABORATOR', 'MANAGER'] as const)(
      '%s não acessa a gestão de usuários, configurações nem auditoria',
      async (role) => {
        const store = await createStore(ctx.prisma);
        const client = await loginAs(ctx.app, () =>
          createUser(ctx.prisma, crypto, { role, storeIds: [store.id] }),
        );
        for (const path of ['/admin/users', '/admin/settings', '/admin/audit-logs']) {
          const res = await client.get(path).expect(403);
          expect(res.body.error.code).toBe('FORBIDDEN');
        }
        await client
          .post('/admin/users', { name: 'X', email: 'x@teste.local', role: 'ADMIN' })
          .expect(403);
        await client.patch('/admin/settings', { retention_days: 400 }).expect(403);

        const denied = await ctx.prisma.auditLog.count({
          where: { action: AuditAction.AUTHZ_DENIED, actorRole: role },
        });
        expect(denied).toBeGreaterThanOrEqual(5);
      },
    );

    it('Admin acessa a gestão de usuários', async () => {
      const client = await admin();
      const res = await client.get('/admin/users').expect(200);
      expect(res.body).toMatchObject({ total: 1, page: 1 });
    });

    it('rotas administrativas exigem sessão', async () => {
      await new Client(ctx.app).get('/admin/users').expect(401);
    });
  });

  describe('criação por convite', () => {
    it('cria usuário sem senha, envia convite e audita', async () => {
      const store = await createStore(ctx.prisma);
      const client = await admin();
      const res = await client
        .post('/admin/users', {
          name: 'Carla Souza',
          email: 'Carla@Teste.local',
          role: 'STORE_COLLABORATOR',
          storeIds: [store.id],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        email: 'carla@teste.local',
        pendingInvite: true,
        totpRequired: false,
        inviteSent: true,
        stores: [{ id: store.id }],
      });
      const created = await ctx.prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(created.passwordHash).toBeNull();

      const invite = await ctx.mail.waitFor('carla@teste.local');
      expect(invite.text).toContain('/definir-senha#token=');

      // O convidado define a própria senha e consegue entrar.
      await new Client(ctx.app)
        .post('/auth/reset-password', {
          token: extractToken(invite),
          password: 'girassol-azul-montanha-8',
        })
        .expect(204);
      expect(
        (await new Client(ctx.app).login('carla@teste.local', 'girassol-azul-montanha-8')).status,
      ).toBe(200);

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.USER_CREATED, entityId: res.body.id },
      });
      expect(audit?.metadata).toMatchObject({ role: 'STORE_COLLABORATOR', storeIds: [store.id] });
    });

    it('Admin nasce com 2FA obrigatório por padrão', async () => {
      const client = await admin();
      const res = await client
        .post('/admin/users', { name: 'Outro Admin', email: 'admin2@teste.local', role: 'ADMIN' })
        .expect(201);
      expect(res.body.totpRequired).toBe(true);
    });

    it('valida escopo por perfil e e-mail duplicado', async () => {
      const store = await createStore(ctx.prisma);
      const client = await admin();
      const noStore = await client
        .post('/admin/users', { name: 'Sem Loja', email: 's@teste.local', role: 'MANAGER' })
        .expect(400);
      expect(noStore.body.error.issues[0].path).toBe('storeIds');

      await client
        .post('/admin/users', {
          name: 'Adm',
          email: 'a2@teste.local',
          role: 'ADMIN',
          storeIds: [store.id],
        })
        .expect(400);
      await client
        .post('/admin/users', {
          name: 'Loja Fantasma',
          email: 'f@teste.local',
          role: 'MANAGER',
          storeIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(400);

      const dup = await client
        .post('/admin/users', { name: 'Dup', email: 'ADMIN@teste.local', role: 'ADMIN' })
        .expect(409);
      expect(dup.body.error.code).toBe('CONFLICT');
    });
  });

  describe('edição, ativação e escopo', () => {
    it('desativa usuário, revoga sessões e audita; reativa', async () => {
      const store = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { storeIds: [store.id] });
      const target = new Client(ctx.app);
      await target.login(user.email);

      const client = await admin();
      await client.patch(`/admin/users/${user.id}`, { active: false }).expect(200);
      await target.get('/auth/me').expect(401);
      expect(await ctx.prisma.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(
        0,
      );
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: AuditAction.USER_DEACTIVATED, entityId: user.id },
        }),
      ).toBe(1);

      await client.patch(`/admin/users/${user.id}`, { active: true }).expect(200);
      expect(
        await ctx.prisma.auditLog.count({
          where: { action: AuditAction.USER_ACTIVATED, entityId: user.id },
        }),
      ).toBe(1);
    });

    it('impede o Admin de desativar a si mesmo ou remover o último Admin', async () => {
      const client = await admin();
      const me = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'admin@teste.local' } });
      await client.patch(`/admin/users/${me.id}`, { active: false }).expect(403);
      await client.patch(`/admin/users/${me.id}`, { role: 'MANAGER' }).expect(403);

      const { user: other } = await createUser(ctx.prisma, crypto, {
        role: 'ADMIN',
        active: false,
      });
      await client.patch(`/admin/users/${other.id}`, { name: 'Renomeado' }).expect(200);
    });

    it('altera o escopo de lojas e audita adições e remoções', async () => {
      const a = await createStore(ctx.prisma);
      const b = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] });
      const client = await admin();

      const res = await client
        .put(`/admin/users/${user.id}/stores`, { storeIds: [b.id] })
        .expect(200);
      expect(res.body.stores.map((s: { id: string }) => s.id)).toEqual([b.id]);
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.USER_STORE_SCOPE_CHANGED, entityId: user.id },
      });
      expect(audit?.metadata).toEqual({ added: [b.id], removed: [a.id] });

      await client.put(`/admin/users/${user.id}/stores`, { storeIds: [] }).expect(400);
    });

    it('promover a Admin remove as lojas e torna o 2FA obrigatório', async () => {
      const a = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { role: 'MANAGER', storeIds: [a.id] });
      const client = await admin();
      const res = await client.patch(`/admin/users/${user.id}`, { role: 'ADMIN' }).expect(200);
      expect(res.body).toMatchObject({ role: 'ADMIN', stores: [], totpRequired: true });
    });

    it('rebaixar Admin exige lojas', async () => {
      const a = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { role: 'ADMIN' });
      const client = await admin();
      await client.patch(`/admin/users/${user.id}`, { role: 'MANAGER' }).expect(400);
      await client
        .patch(`/admin/users/${user.id}`, { role: 'MANAGER', storeIds: [a.id] })
        .expect(200);
    });

    it('exige 2FA por usuário', async () => {
      const a = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id] });
      const client = await admin();
      await client.patch(`/admin/users/${user.id}`, { totpRequired: true }).expect(200);
      const login = await new Client(ctx.app).login(user.email);
      expect(login.body.status).toBe('MFA_ENROLLMENT_REQUIRED');
    });

    it('revoga sessões do usuário e reseta o 2FA', async () => {
      const a = await createStore(ctx.prisma);
      const { user } = await createUser(ctx.prisma, crypto, { storeIds: [a.id], withTotp: true });
      await new Client(ctx.app).login(user.email);
      const client = await admin();

      const revoke = await client.post(`/admin/users/${user.id}/sessions/revoke`).expect(200);
      expect(revoke.body.revoked).toBe(1);

      const reset = await client.post(`/admin/users/${user.id}/totp/reset`).expect(200);
      expect(reset.body.totpEnabled).toBe(false);
      for (const action of [
        AuditAction.AUTH_SESSIONS_REVOKED,
        AuditAction.AUTH_TOTP_RESET_BY_ADMIN,
      ]) {
        expect(await ctx.prisma.auditLog.count({ where: { action, entityId: user.id } })).toBe(1);
      }
    });

    it('ID inexistente ou malformado retorna 404', async () => {
      const client = await admin();
      await client.get('/admin/users/00000000-0000-4000-8000-000000000000').expect(404);
      await client.get('/admin/users/nao-e-uuid').expect(404);
    });
  });

  describe('configurações e auditoria', () => {
    it('Admin altera configurações respeitando o piso de retenção', async () => {
      const client = await admin();
      await client.patch('/admin/settings', { retention_days: 100 }).expect(400);
      const ok = await client.patch('/admin/settings', { retention_days: 500 }).expect(200);
      expect(ok.body.retention_days).toBe(500);
    });

    it('Admin consulta a auditoria com filtros', async () => {
      const client = await admin();
      const res = await client
        .get(`/admin/audit-logs?action=${AuditAction.AUTH_LOGIN_SUCCEEDED}`)
        .expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(
        res.body.items.every(
          (item: { action: string }) => item.action === AuditAction.AUTH_LOGIN_SUCCEEDED,
        ),
      ).toBe(true);
    });
  });
});
