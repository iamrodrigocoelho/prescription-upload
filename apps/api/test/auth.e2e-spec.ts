import { AuditAction } from '@receita/shared';
import request from 'supertest';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createUser, TEST_PASSWORD } from './utils/factories.js';
import { Client, sessionCookieFrom } from './utils/http.js';

describe('Autenticação: login, lockout e logout (e2e)', () => {
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

  describe('login', () => {
    it('autentica e emite cookie HttpOnly + SameSite=Lax', async () => {
      const { user } = await createUser(ctx.prisma, crypto, { email: 'ana@teste.local' });
      const client = new Client(ctx.app);
      const res = await client.login('ANA@teste.local ');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('AUTHENTICATED');
      expect(res.body.csrfToken).toEqual(expect.any(String));
      const setCookie = String(res.headers['set-cookie']);
      expect(setCookie).toMatch(/rv_session=[A-Za-z0-9_-]{43}/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(res.headers['cache-control']).toBe('no-store');

      const me = await client.get('/auth/me').expect(200);
      expect(me.body.user).toMatchObject({ id: user.id, role: 'STORE_COLLABORATOR' });
      expect(me.body.sessionStatus).toBe('AUTHENTICATED');

      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.AUTH_LOGIN_SUCCEEDED, entityId: user.id },
      });
      expect(audit).toMatchObject({ actorUserId: user.id, actorRole: 'STORE_COLLABORATOR' });
      expect(audit?.correlationId).toBe(res.headers['x-request-id']);
    });

    it('persiste apenas o hash do token de sessão', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const res = await new Client(ctx.app).login(user.email);
      const token = sessionCookieFrom(res);
      const sessions = await ctx.prisma.session.findMany({ where: { userId: user.id } });
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(sessions[0]?.tokenHash).not.toBe(token);
    });

    it('não revela se o e-mail existe: mesma resposta para senha errada e e-mail inexistente', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const wrong = await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'errada-123456' });
      const unknown = await http()
        .post('/auth/login')
        .send({ email: 'ninguem@teste.local', password: 'errada-123456' });

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      const strip = (body: { error: Record<string, unknown> }) => ({
        ...body.error,
        requestId: undefined,
      });
      expect(strip(wrong.body)).toEqual(strip(unknown.body));
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('usuário inativo recebe a mesma resposta genérica', async () => {
      const { user } = await createUser(ctx.prisma, crypto, { active: false });
      const res = await new Client(ctx.app).login(user.email);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('audita a falha sem registrar a senha', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      await http().post('/auth/login').send({ email: user.email, password: 'senha-errada-xyz' });
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.AUTH_LOGIN_FAILED, entityId: user.id },
      });
      expect(audit?.result).toBe('FAILURE');
      expect(audit?.metadata).toEqual({ reason: 'wrong_password' });
      expect(JSON.stringify(audit)).not.toContain('senha-errada-xyz');
    });

    it('valida a entrada', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: 'invalido', password: '' })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('bloqueio progressivo por conta', () => {
    it('bloqueia após 5 falhas, mesmo com a senha correta, sem revelar o bloqueio', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      for (let i = 0; i < 5; i += 1) {
        await http()
          .post('/auth/login')
          .send({ email: user.email, password: `errada-${i}-abcdef` });
      }
      const locked = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(locked.failedLoginCount).toBe(5);
      expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

      const res = await new Client(ctx.app).login(user.email, TEST_PASSWORD);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('libera após o período de bloqueio e zera o contador no sucesso', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) },
      });
      const res = await new Client(ctx.app).login(user.email);
      expect(res.status).toBe(200);
      const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.failedLoginCount).toBe(0);
      expect(after.lockedUntil).toBeNull();
    });

    it('dobra o tempo de bloqueio a cada nova falha', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      await ctx.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) },
      });
      await http().post('/auth/login').send({ email: user.email, password: 'errada-abcdef-1' });
      const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      const seconds = ((after.lockedUntil?.getTime() ?? 0) - Date.now()) / 1000;
      expect(seconds).toBeGreaterThan(100);
      expect(seconds).toBeLessThanOrEqual(120);
    });
  });

  describe('rate limit por IP', () => {
    it('retorna 429 com Retry-After após exceder as tentativas', async () => {
      for (let i = 0; i < 10; i += 1) {
        await http()
          .post('/auth/login')
          .send({ email: `x${i}@teste.local`, password: 'errada-abcdef' })
          .expect(401);
      }
      const res = await http()
        .post('/auth/login')
        .send({ email: 'y@teste.local', password: 'errada-abcdef' })
        .expect(429);
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('sessão e logout', () => {
    it('logout revoga a sessão no servidor e audita', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const client = new Client(ctx.app);
      const login = await client.login(user.email);
      const token = sessionCookieFrom(login) ?? '';

      await client.post('/auth/logout').expect(204);
      await client.get('/auth/me').expect(401);
      // O cookie antigo, mesmo reapresentado, não é mais aceito.
      await http().get('/auth/me').set('Cookie', `rv_session=${token}`).expect(401);

      const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
      expect(session.revokedReason).toBe('logout');
      const audit = await ctx.prisma.auditLog.findFirst({
        where: { action: AuditAction.AUTH_LOGOUT, actorUserId: user.id },
      });
      expect(audit).not.toBeNull();
    });

    it('rotas protegidas exigem sessão', async () => {
      const res = await http().get('/auth/me').expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('sessão expirada por inatividade é rejeitada', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const client = new Client(ctx.app);
      await client.login(user.email);
      await ctx.prisma.session.updateMany({
        where: { userId: user.id },
        data: { idleExpiresAt: new Date(Date.now() - 1000) },
      });
      await client.get('/auth/me').expect(401);
    });

    it('sessão de usuário desativado é rejeitada', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const client = new Client(ctx.app);
      await client.login(user.email);
      await ctx.prisma.user.update({ where: { id: user.id }, data: { active: false } });
      await client.get('/auth/me').expect(401);
    });
  });

  describe('CSRF', () => {
    it('rejeita alteração de estado sem o token CSRF', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const client = new Client(ctx.app);
      await client.login(user.email);
      const res = await client.agent.post('/auth/logout').expect(403);
      expect(res.body.error.code).toBe('CSRF_FAILED');
    });

    it('rejeita token CSRF de outra sessão', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      const a = new Client(ctx.app);
      const b = new Client(ctx.app);
      await a.login(user.email);
      await b.login(user.email);
      await a.agent.post('/auth/logout').set('x-csrf-token', b.csrfToken).expect(403);
    });

    it('rejeita Origin diferente da aplicação, inclusive em rotas públicas', async () => {
      const res = await http()
        .post('/auth/login')
        .set('Origin', 'https://atacante.example')
        .send({ email: 'a@teste.local', password: 'x' })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_FAILED');
    });

    it('rejeita requisição cross-site (Sec-Fetch-Site)', async () => {
      await http()
        .post('/auth/login')
        .set('Sec-Fetch-Site', 'cross-site')
        .send({ email: 'a@teste.local', password: 'x' })
        .expect(403);
    });

    it('aceita Origin da própria aplicação', async () => {
      const { user } = await createUser(ctx.prisma, crypto);
      await http()
        .post('/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({ email: user.email, password: TEST_PASSWORD })
        .expect(200);
    });
  });
});
