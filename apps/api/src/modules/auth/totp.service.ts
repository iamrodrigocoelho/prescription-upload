import { Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  LoginStatus,
  type TotpConfirmResponse,
  type TotpSetupResponse,
  type TotpVerifyInput,
} from '@receita/shared';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { SessionState, type User } from '../../generated/prisma/client.js';
import { CryptoService } from '../../infra/crypto/crypto.service.js';
import { verifyPassword } from '../../infra/crypto/password-hasher.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeControl } from '../realtime/realtime-control.js';
import { AccountLockoutService } from './account-lockout.service.js';
import { AuthService, type SessionGrant } from './auth.service.js';
import {
  formatRecoveryCode,
  generateRecoveryCode,
  hashRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-codes.js';
import { type SessionClientInfo, SessionService } from './session.service.js';

const ISSUER = 'Receita Venancio';
/** Tolerância de ±30 s (um período) para dessincronia de relógio. */
const EPOCH_TOLERANCE = 30;

/** Verifica um código TOTP e retorna o time-step aceito, ou `null` se inválido. */
async function verifyTotpCode(
  secret: string,
  token: string,
  afterTimeStep?: number,
): Promise<number | null> {
  const result = await verify({
    secret,
    token,
    epochTolerance: EPOCH_TOLERANCE,
    ...(afterTimeStep === undefined ? {} : { afterTimeStep }),
  });
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

/** Resultado de uma operação TOTP que pode emitir uma nova sessão (rotação). */
export interface TotpOutcome<T> {
  body: T;
  /** Novo token de sessão a ser gravado no cookie, quando houve rotação. */
  newSessionToken?: string;
}

/**
 * 2FA TOTP compatível com Google Authenticator (PRD §15.3). Segredos cifrados com
 * AES-256-GCM; códigos aceitos uma única vez (proteção contra replay).
 */
@Injectable()
export class TotpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionService,
    private readonly lockout: AccountLockoutService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly control: RealtimeControl,
  ) {}

  async setup(auth: AuthContext): Promise<TotpSetupResponse> {
    const user = await this.loadUser(auth.user.id);
    if (user.totpEnabled)
      throw new AppError(ApiErrorCode.CONFLICT, 'A verificação em duas etapas já está ativa.');

    const secret = generateSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecretEncrypted: this.crypto.encryptTotpSecret(secret) },
    });
    const otpauthUri = generateURI({ issuer: ISSUER, label: user.email, secret });
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
    });
    return { otpauthUri, qrCodeDataUrl, secret };
  }

  async confirm(
    auth: AuthContext,
    code: string,
    client: SessionClientInfo,
  ): Promise<TotpOutcome<TotpConfirmResponse>> {
    const user = await this.loadUser(auth.user.id);
    if (user.totpEnabled || !user.totpPendingSecretEncrypted) {
      throw new AppError(
        ApiErrorCode.CONFLICT,
        'Inicie a configuração da verificação em duas etapas.',
      );
    }
    await this.rateLimit.assertNotBlocked('mfaSession', auth.sessionId);

    const secret = this.crypto.decryptTotpSecret(user.totpPendingSecretEncrypted);
    const timeStep = await verifyTotpCode(secret, code);
    if (timeStep === null) {
      await this.rateLimit.penalize('mfaSession', auth.sessionId);
      throw new AppError(ApiErrorCode.INVALID_MFA_CODE);
    }

    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: true,
          totpSecretEncrypted: user.totpPendingSecretEncrypted,
          totpPendingSecretEncrypted: null,
          totpLastUsedStep: BigInt(timeStep),
        },
      });
      await tx.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.totpRecoveryCode.createMany({
        data: codes.map((value) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(user.id, value),
        })),
      });
      // Ativar 2FA encerra as demais sessões do usuário.
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'mfa_enabled' },
      });
      await this.audit.record(
        { action: AuditAction.AUTH_TOTP_ENABLED, entityType: 'User', entityId: user.id },
        tx,
      );
    });
    await this.rateLimit.reset('mfaSession', auth.sessionId);
    // As demais sessões foram revogadas na transação acima.
    await this.control.invalidateUser(user.id);

    const recoveryCodes = codes.map(formatRecoveryCode);
    if (auth.sessionState === SessionState.MFA_ENROLLMENT_REQUIRED) {
      const grant = await this.promote(auth, user, client, { mfa: 'enrollment' });
      return {
        body: { recoveryCodes, status: grant.status, csrfToken: grant.csrfToken },
        newSessionToken: grant.token,
      };
    }
    return {
      body: {
        recoveryCodes,
        status: LoginStatus.AUTHENTICATED,
        csrfToken: this.auth.csrfFor(auth.sessionId),
      },
    };
  }

  /** Segunda etapa do login: código TOTP ou código de recuperação. */
  async verifyLogin(
    auth: AuthContext,
    input: TotpVerifyInput,
    client: SessionClientInfo,
  ): Promise<
    TotpOutcome<{ status: LoginStatus; csrfToken: string; remainingRecoveryCodes?: number }>
  > {
    await this.rateLimit.assertNotBlocked('mfaSession', auth.sessionId);
    const user = await this.loadUser(auth.user.id);

    const method = 'code' in input ? 'totp' : 'recovery_code';
    const valid =
      !this.lockout.isLocked(user) &&
      ('code' in input
        ? await this.consumeTotp(user, input.code)
        : await this.consumeRecoveryCode(user.id, input.recoveryCode));

    if (!valid) {
      await this.lockout.registerFailure(user.id);
      const { exhausted } = await this.rateLimit.penalize('mfaSession', auth.sessionId);
      await this.audit.recordSafely({
        action: AuditAction.AUTH_MFA_FAILED,
        entityType: 'User',
        entityId: user.id,
        result: AuditResult.FAILURE,
        metadata: { method, sessionRevoked: exhausted },
      });
      // Tentativas esgotadas: a sessão intermediária é descartada; novo login necessário.
      if (exhausted) await this.sessions.revoke(auth.sessionId, 'mfa_attempts_exceeded');
      throw new AppError(ApiErrorCode.INVALID_MFA_CODE);
    }

    await this.rateLimit.reset('mfaSession', auth.sessionId);
    const grant = await this.promote(auth, user, client, { mfa: method });
    const body: { status: LoginStatus; csrfToken: string; remainingRecoveryCodes?: number } = {
      status: grant.status,
      csrfToken: grant.csrfToken,
    };
    if (method === 'recovery_code') {
      body.remainingRecoveryCodes = await this.prisma.totpRecoveryCode.count({
        where: { userId: user.id, usedAt: null },
      });
    }
    return { body, newSessionToken: grant.token };
  }

  async disable(auth: AuthContext, password: string, code: string): Promise<void> {
    const user = await this.loadUser(auth.user.id);
    if (!user.totpEnabled)
      throw new AppError(ApiErrorCode.CONFLICT, 'A verificação em duas etapas não está ativa.');
    if (user.totpRequired) {
      throw new AppError(
        ApiErrorCode.FORBIDDEN,
        'A verificação em duas etapas é obrigatória para a sua conta.',
      );
    }
    const passwordOk = user.passwordHash
      ? await verifyPassword(user.passwordHash, password)
      : false;
    if (!passwordOk || !(await this.consumeTotp(user, code))) {
      await this.lockout.registerFailure(user.id);
      throw new AppError(ApiErrorCode.INVALID_MFA_CODE, 'Senha ou código inválido.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          totpEnabled: false,
          totpSecretEncrypted: null,
          totpPendingSecretEncrypted: null,
          totpLastUsedStep: null,
        },
      });
      await tx.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'mfa_disabled' },
      });
      await this.audit.record(
        { action: AuditAction.AUTH_TOTP_DISABLED, entityType: 'User', entityId: user.id },
        tx,
      );
    });
    await this.control.invalidateUser(user.id);
  }

  async regenerateRecoveryCodes(auth: AuthContext, code: string): Promise<string[]> {
    await this.rateLimit.assertNotBlocked('mfaSession', auth.sessionId);
    const user = await this.loadUser(auth.user.id);
    if (!user.totpEnabled || !(await this.consumeTotp(user, code))) {
      await this.lockout.registerFailure(user.id);
      await this.rateLimit.penalize('mfaSession', auth.sessionId);
      throw new AppError(ApiErrorCode.INVALID_MFA_CODE);
    }
    await this.rateLimit.reset('mfaSession', auth.sessionId);
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction(async (tx) => {
      await tx.totpRecoveryCode.deleteMany({ where: { userId: user.id } });
      await tx.totpRecoveryCode.createMany({
        data: codes.map((value) => ({
          userId: user.id,
          codeHash: hashRecoveryCode(user.id, value),
        })),
      });
      await this.audit.record(
        {
          action: AuditAction.AUTH_RECOVERY_CODES_REGENERATED,
          entityType: 'User',
          entityId: user.id,
        },
        tx,
      );
    });
    return codes.map(formatRecoveryCode);
  }

  /**
   * Valida o código e registra o time-step de forma condicional: o mesmo código (ou
   * um anterior) nunca é aceito duas vezes, nem em requisições concorrentes.
   */
  private async consumeTotp(user: User, code: string): Promise<boolean> {
    if (!user.totpSecretEncrypted) return false;
    const secret = this.crypto.decryptTotpSecret(user.totpSecretEncrypted);
    const lastStep = user.totpLastUsedStep === null ? undefined : Number(user.totpLastUsedStep);
    const timeStep = await verifyTotpCode(secret, code, lastStep);
    if (timeStep === null) return false;
    const step = BigInt(timeStep);
    const updated = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
      },
      data: { totpLastUsedStep: step },
    });
    return updated.count === 1;
  }

  private async consumeRecoveryCode(userId: string, normalizedCode: string): Promise<boolean> {
    const updated = await this.prisma.totpRecoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(userId, normalizedCode), usedAt: null },
      data: { usedAt: new Date() },
    });
    return updated.count === 1;
  }

  private async promote(
    auth: AuthContext,
    user: User,
    client: SessionClientInfo,
    metadata: Record<string, unknown>,
  ): Promise<SessionGrant> {
    const rotated = await this.sessions.rotateToActive(auth.sessionId, client);
    if (!rotated) throw new AppError(ApiErrorCode.UNAUTHENTICATED);
    await this.auth.completeLogin(user, metadata);
    return {
      status: LoginStatus.AUTHENTICATED,
      token: rotated.token,
      csrfToken: this.auth.csrfFor(rotated.session.id),
    };
  }

  private loadUser(id: string): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({ where: { id } });
  }
}
