import { AuditAction } from '@receita/shared';
import { generate } from 'otplib';
import { CryptoService } from '../src/infra/crypto/crypto.service.js';
import { createTestContext, type TestContext } from './utils/app.js';
import { createUser } from './utils/factories.js';
import { Client, sessionCookieFrom } from './utils/http.js';

/** Código do próximo período (aceito pela tolerância de ±30 s) — evita o bloqueio de replay. */
const nextCode = (secret: string) =>
  generate({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });
const currentCode = (secret: string) => generate({ secret });

describe('2FA TOTP (e2e)', () => {
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

  it('ativa o 2FA: setup com QR Code, confirmação e códigos de recuperação', async () => {
    const { user } = await createUser(ctx.prisma, crypto);
    const client = new Client(ctx.app);
    await client.login(user.email);

    const setup = await client.post('/auth/totp/setup').expect(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/Receita%20Venancio:/);
    expect(setup.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const stored = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.totpPendingSecretEncrypted).not.toContain(setup.body.secret);
    expect(stored.totpEnabled).toBe(false);

    await client.post('/auth/totp/confirm', { code: '000000' }).expect(401);
    const confirm = await client
      .post('/auth/totp/confirm', { code: await currentCode(setup.body.secret as string) })
      .expect(200);
    expect(confirm.body.recoveryCodes).toHaveLength(10);
    expect(confirm.body.recoveryCodes[0]).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    const enabled = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(enabled.totpEnabled).toBe(true);
    expect(enabled.totpPendingSecretEncrypted).toBeNull();
    expect(crypto.decryptTotpSecret(enabled.totpSecretEncrypted ?? '')).toBe(setup.body.secret);
    const codes = await ctx.prisma.totpRecoveryCode.findMany({ where: { userId: user.id } });
    expect(codes).toHaveLength(10);
    expect(codes.map((c) => c.codeHash)).not.toContain(confirm.body.recoveryCodes[0]);

    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.AUTH_TOTP_ENABLED, entityId: user.id },
      }),
    ).toBe(1);
  });

  it('exige o código no login e rotaciona a sessão após a verificação', async () => {
    const { user, totpSecret } = await createUser(ctx.prisma, crypto, { withTotp: true });
    const client = new Client(ctx.app);
    const login = await client.login(user.email);
    expect(login.body.status).toBe('MFA_REQUIRED');
    const pendingToken = sessionCookieFrom(login);

    // Sessão intermediária só acessa a verificação.
    const blocked = await client.post('/auth/totp/recovery-codes', { code: '123456' }).expect(401);
    expect(blocked.body.error.code).toBe('MFA_REQUIRED');
    const me = await client.get('/auth/me').expect(200);
    expect(me.body.sessionStatus).toBe('MFA_REQUIRED');

    const verify = await client
      .post('/auth/totp/verify', { code: await currentCode(totpSecret ?? '') })
      .expect(200);
    expect(verify.body.status).toBe('AUTHENTICATED');
    const activeToken = sessionCookieFrom(verify);
    expect(activeToken).toBeDefined();
    expect(activeToken).not.toBe(pendingToken);
    client.adopt(verify);

    const sessions = await ctx.prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions.map((s) => [s.state, s.revokedReason])).toEqual([
      ['PENDING_MFA', 'rotated'],
      ['ACTIVE', null],
    ]);
    await client.get('/auth/me').expect(200);

    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: AuditAction.AUTH_LOGIN_SUCCEEDED, entityId: user.id },
    });
    expect(audit?.metadata).toEqual({ mfa: 'totp' });
  });

  it('não aceita o mesmo código duas vezes (replay) e aceita código de recuperação uma única vez', async () => {
    const { user, totpSecret } = await createUser(ctx.prisma, crypto, { withTotp: true });
    const secret = totpSecret ?? '';
    const code = await currentCode(secret);

    const first = new Client(ctx.app);
    await first.login(user.email);
    await first.post('/auth/totp/verify', { code }).expect(200);

    const second = new Client(ctx.app);
    await second.login(user.email);
    const replay = await second.post('/auth/totp/verify', { code }).expect(401);
    expect(replay.body.error.code).toBe('INVALID_MFA_CODE');

    // Códigos de recuperação conhecidos para o teste.
    const recovery = 'ABCDE23456';
    const { hashRecoveryCode } = await import('../src/modules/auth/recovery-codes.js');
    await ctx.prisma.totpRecoveryCode.create({
      data: { userId: user.id, codeHash: hashRecoveryCode(user.id, recovery) },
    });

    const viaRecovery = await second
      .post('/auth/totp/verify', { recoveryCode: 'abcde-23456' })
      .expect(200);
    expect(viaRecovery.body.remainingRecoveryCodes).toBe(0);

    const third = new Client(ctx.app);
    await third.login(user.email);
    await third.post('/auth/totp/verify', { recoveryCode: recovery }).expect(401);
  });

  it('descarta a sessão intermediária após 5 códigos inválidos', async () => {
    const { user } = await createUser(ctx.prisma, crypto, { withTotp: true });
    const client = new Client(ctx.app);
    await client.login(user.email);
    for (let i = 0; i < 5; i += 1) {
      await client.post('/auth/totp/verify', { code: '000000' }).expect(401);
    }
    const res = await client.post('/auth/totp/verify', { code: '000000' });
    expect([401, 429]).toContain(res.status);
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.revokedReason).toBe('mfa_attempts_exceeded');
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.AUTH_MFA_FAILED, entityId: user.id },
      }),
    ).toBeGreaterThanOrEqual(5);
  });

  it('mantém o bloqueio por conta entre novos logins de senha após falhas TOTP', async () => {
    const { user } = await createUser(ctx.prisma, crypto, { withTotp: true });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const client = new Client(ctx.app);
      await client.login(user.email).then((response) => expect(response.status).toBe(200));
      await client.post('/auth/totp/verify', { code: '000000' }).expect(401);
    }
    const locked = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginCount).toBe(5);
    expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    await new Client(ctx.app).login(user.email).then((response) => expect(response.status).toBe(401));
  });

  it('limita a regeneração de códigos de recuperação por sessão', async () => {
    const { user, totpSecret } = await createUser(ctx.prisma, crypto, { withTotp: true });
    const client = new Client(ctx.app);
    await client.login(user.email);
    client.adopt(
      await client.post('/auth/totp/verify', { code: await currentCode(totpSecret ?? '') }),
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await client.post('/auth/totp/recovery-codes', { code: '000000' }).expect(401);
    }
    const blocked = await client.post('/auth/totp/recovery-codes', { code: '000000' });
    expect([401, 429]).toContain(blocked.status);
  });

  it('obriga a configuração quando o Admin exige 2FA', async () => {
    const { user } = await createUser(ctx.prisma, crypto, { totpRequired: true });
    const client = new Client(ctx.app);
    const login = await client.login(user.email);
    expect(login.body.status).toBe('MFA_ENROLLMENT_REQUIRED');

    const blocked = await client.post('/auth/totp/recovery-codes', { code: '123456' }).expect(403);
    expect(blocked.body.error.code).toBe('MFA_ENROLLMENT_REQUIRED');

    const setup = await client.post('/auth/totp/setup').expect(200);
    const confirm = await client
      .post('/auth/totp/confirm', { code: await currentCode(setup.body.secret as string) })
      .expect(200);
    expect(confirm.body.status).toBe('AUTHENTICATED');
    expect(sessionCookieFrom(confirm)).toBeDefined();
    client.adopt(confirm);
    const me = await client.get('/auth/me').expect(200);
    expect(me.body.sessionStatus).toBe('AUTHENTICATED');
  });

  it('desativação: bloqueada quando obrigatória; exige senha e código; auditada', async () => {
    const required = await createUser(ctx.prisma, crypto, { withTotp: true, totpRequired: true });
    const a = new Client(ctx.app);
    await a.login(required.user.email);
    a.adopt(
      await a.post('/auth/totp/verify', { code: await currentCode(required.totpSecret ?? '') }),
    );
    const forbidden = await a
      .post('/auth/totp/disable', {
        password: 'senha-de-teste-forte-42',
        code: await nextCode(required.totpSecret ?? ''),
      })
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const optional = await createUser(ctx.prisma, crypto, { withTotp: true });
    const b = new Client(ctx.app);
    await b.login(optional.user.email);
    b.adopt(
      await b.post('/auth/totp/verify', { code: await currentCode(optional.totpSecret ?? '') }),
    );
    await b
      .post('/auth/totp/disable', {
        password: 'senha-errada-123',
        code: await nextCode(optional.totpSecret ?? ''),
      })
      .expect(401);
    await b
      .post('/auth/totp/disable', {
        password: 'senha-de-teste-forte-42',
        code: await nextCode(optional.totpSecret ?? ''),
      })
      .expect(204);

    const after = await ctx.prisma.user.findUniqueOrThrow({ where: { id: optional.user.id } });
    expect(after.totpEnabled).toBe(false);
    expect(after.totpSecretEncrypted).toBeNull();
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: AuditAction.AUTH_TOTP_DISABLED, entityId: optional.user.id },
      }),
    ).toBe(1);
  });
});
