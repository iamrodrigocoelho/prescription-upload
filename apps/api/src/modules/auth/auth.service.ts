import { Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  AuditResult,
  type LoginInput,
  LoginStatus,
  type MeResponse,
} from '@receita/shared';
import type { AuthContext } from '../../common/auth/auth.types.js';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { SessionState, type User } from '../../generated/prisma/client.js';
import { generateToken } from '../../infra/crypto/primitives.js';
import { hashPassword, needsRehash, verifyPassword } from '../../infra/crypto/password-hasher.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AccountLockoutService } from './account-lockout.service.js';
import { deriveCsrfToken } from './csrf.js';
import { type SessionClientInfo, SessionService } from './session.service.js';

export interface SessionGrant {
  status: LoginStatus;
  token: string;
  csrfToken: string;
}

type FailureReason = 'unknown_user' | 'inactive' | 'no_password' | 'locked' | 'wrong_password';

export function statusForState(state: SessionState): LoginStatus {
  switch (state) {
    case SessionState.PENDING_MFA:
      return LoginStatus.MFA_REQUIRED;
    case SessionState.MFA_ENROLLMENT_REQUIRED:
      return LoginStatus.MFA_ENROLLMENT_REQUIRED;
    default:
      return LoginStatus.AUTHENTICATED;
  }
}

@Injectable()
export class AuthService {
  /** Hash de uma senha aleatória: iguala o tempo de resposta quando o usuário não existe. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly lockout: AccountLockoutService,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  csrfFor(sessionId: string): string {
    return deriveCsrfToken(sessionId, this.env.SESSION_SECRET);
  }

  /**
   * Login por e-mail e senha (PRD §15.1). Qualquer falha — usuário inexistente,
   * inativo, bloqueado ou senha errada — produz a mesma resposta.
   */
  async login(input: LoginInput, client: SessionClientInfo): Promise<SessionGrant> {
    const ipKey = client.ip ?? 'unknown';
    await this.rateLimit.assertNotBlocked('loginIp', ipKey);

    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !user.active || !user.passwordHash) {
      await verifyPassword(await this.getDummyHash(), input.password);
      return this.fail(
        ipKey,
        user,
        !user ? 'unknown_user' : !user.active ? 'inactive' : 'no_password',
      );
    }

    const passwordOk = await verifyPassword(user.passwordHash, input.password);

    if (this.lockout.isLocked(user)) {
      // Mesmo com a senha correta: não revela o bloqueio.
      return this.fail(ipKey, user, 'locked');
    }
    if (!passwordOk) {
      await this.lockout.registerFailure(user.id);
      return this.fail(ipKey, user, 'wrong_password');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        ...(needsRehash(user.passwordHash)
          ? { passwordHash: await hashPassword(input.password) }
          : {}),
      },
    });

    const state = user.totpEnabled
      ? SessionState.PENDING_MFA
      : user.totpRequired
        ? SessionState.MFA_ENROLLMENT_REQUIRED
        : SessionState.ACTIVE;

    const { session, token } = await this.sessions.create(user.id, state, client);
    if (state === SessionState.ACTIVE) {
      await this.completeLogin(user, { mfa: 'none' });
    }
    return { status: statusForState(state), token, csrfToken: this.csrfFor(session.id) };
  }

  /** Registra o login efetivo (após senha e, quando aplicável, 2FA). */
  async completeLogin(
    user: Pick<User, 'id' | 'role'>,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    await this.audit.record({
      action: AuditAction.AUTH_LOGIN_SUCCEEDED,
      entityType: 'User',
      entityId: user.id,
      actor: { userId: user.id, role: user.role },
      metadata,
    });
  }

  async logout(auth: AuthContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId, 'logout');
    await this.audit.record({
      action: AuditAction.AUTH_LOGOUT,
      entityType: 'Session',
      entityId: auth.sessionId,
    });
  }

  async me(auth: AuthContext): Promise<MeResponse> {
    const base = {
      user: auth.user,
      sessionStatus: statusForState(auth.sessionState),
      csrfToken: this.csrfFor(auth.sessionId),
    };
    if (auth.user.role === 'ADMIN') return { ...base, storeScope: { global: true } };

    const access = await this.prisma.userStoreAccess.findMany({
      where: { userId: auth.user.id },
      include: { store: true },
      orderBy: { store: { storeNumber: 'asc' } },
    });
    return {
      ...base,
      storeScope: {
        global: false,
        stores: access.map(({ store }) => ({
          id: store.id,
          storeNumber: store.storeNumber,
          storeName: store.storeName,
          active: store.active,
        })),
      },
    };
  }

  private async fail(ipKey: string, user: User | null, reason: FailureReason): Promise<never> {
    await this.rateLimit.penalize('loginIp', ipKey);
    await this.audit.recordSafely({
      action: AuditAction.AUTH_LOGIN_FAILED,
      entityType: 'User',
      entityId: user?.id ?? null,
      result: AuditResult.FAILURE,
      actor: { userId: null, role: null },
      metadata: { reason },
    });
    throw new AppError(ApiErrorCode.INVALID_CREDENTIALS);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(generateToken());
    return this.dummyHash;
  }
}
