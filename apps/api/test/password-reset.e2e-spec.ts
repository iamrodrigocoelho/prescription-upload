import { AuditAction } from '@receita/shared';
import request from 'supertest';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createUser, TEST_PASSWORD } from './utils/factories.js';
import { extractToken } from './utils/in-memory-mail.js';
import { Client } from './utils/http.js';

const NEW_PASSWORD = 'nova-senha-muito-segura-7';

describe('Recuperação de senha (e2e)', () => {
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

  it('responde igual para e-mail existente e inexistente; só o existente recebe e-mail', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    const known = await http()
      .post('/auth/forgot-password')
      .send({ email: user.email })
      .expect(202);
    const unknown = await http()
      .post('/auth/forgot-password')
      .send({ email: 'ninguem@teste.local' })
      .expect(202);
    expect(known.body).toEqual(unknown.body);

    const message = await ctx.mail.waitFor(user.email);
    expect(message.text).toContain('http://localhost:3000/redefinir-senha#token=');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(ctx.mail.messages.filter((m) => m.to === 'ninguem@teste.local')).toHaveLength(0);
  });

  it('armazena apenas o hash do token', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const token = extractToken(await ctx.mail.waitFor(user.email));
    const rows = await ctx.prisma.passwordResetToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('redefine a senha, invalida todas as sessões e o token é de uso único', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    const deviceA = new Client(ctx.app);
    const deviceB = new Client(ctx.app);
    await deviceA.login(user.email);
    await deviceB.login(user.email);
    await deviceA.get('/auth/me').expect(200);

    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const token = extractToken(await ctx.mail.waitFor(user.email));

    await http().post('/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(204);

    await deviceA.get('/auth/me').expect(401);
    await deviceB.get('/auth/me').expect(401);
    const active = await ctx.prisma.session.count({ where: { userId: user.id, revokedAt: null } });
    expect(active).toBe(0);

    expect((await new Client(ctx.app).login(user.email, TEST_PASSWORD)).status).toBe(401);
    expect((await new Client(ctx.app).login(user.email, NEW_PASSWORD)).status).toBe(200);

    const reuse = await http()
      .post('/auth/reset-password')
      .send({ token, password: 'outra-senha-segura-99' })
      .expect(400);
    expect(reuse.body.error.code).toBe('INVALID_OR_EXPIRED_TOKEN');

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED, entityId: user.id },
    });
    expect(audit?.metadata).toEqual({ purpose: 'RESET', sessionsRevoked: 2 });
  });

  it('aplica a política de senha sem consumir o token', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const token = extractToken(await ctx.mail.waitFor(user.email));

    const weak = await http()
      .post('/auth/reset-password')
      .send({ token, password: 'curta' })
      .expect(400);
    expect(weak.body.error.code).toBe('VALIDATION_FAILED');
    expect(weak.body.error.issues[0].path).toBe('password');

    await http().post('/auth/reset-password').send({ token, password: NEW_PASSWORD }).expect(204);
  });

  it('rejeita token expirado ou inexistente com a mesma mensagem', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const token = extractToken(await ctx.mail.waitFor(user.email));
    await ctx.prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await http()
      .post('/auth/reset-password')
      .send({ token, password: NEW_PASSWORD });
    const missing = await http()
      .post('/auth/reset-password')
      .send({ token: 'A'.repeat(43), password: NEW_PASSWORD });
    expect(expired.status).toBe(400);
    expect(missing.status).toBe(400);
    expect(expired.body.error.message).toBe(missing.body.error.message);
  });

  it('nova solicitação invalida o token anterior', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    const first = extractToken(await ctx.mail.waitFor(user.email));
    ctx.mail.clear();
    await http().post('/auth/forgot-password').send({ email: user.email }).expect(202);
    await ctx.mail.waitFor(user.email);

    await http()
      .post('/auth/reset-password')
      .send({ token: first, password: NEW_PASSWORD })
      .expect(400);
  });
});
