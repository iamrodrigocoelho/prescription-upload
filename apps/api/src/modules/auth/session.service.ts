import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { type Session, SessionState, type User } from '../../generated/prisma/client.js';
import { generateToken, sha256Hex } from '../../infra/crypto/primitives.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RealtimeControl } from '../realtime/realtime-control.js';

/** Janela para concluir a configuração obrigatória de 2FA (escanear QR Code). */
const ENROLLMENT_TTL_MINUTES = 15;
/** Evita uma escrita por requisição: renova a sessão no máximo uma vez por minuto. */
const TOUCH_INTERVAL_MS = 60_000;

export interface SessionClientInfo {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export type SessionWithUser = Session & { user: User };

export type RevokeReason =
  | 'logout'
  | 'rotated'
  | 'password_reset'
  | 'admin_revoked'
  | 'user_deactivated'
  | 'mfa_enabled'
  | 'mfa_disabled'
  | 'mfa_attempts_exceeded';

/**
 * Sessões server-side (PRD §15.4). O cookie carrega um token opaco de 32 bytes;
 * o banco guarda apenas o SHA-256.
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    private readonly control: RealtimeControl,
  ) {}

  async create(
    userId: string,
    state: SessionState,
    client: SessionClientInfo,
  ): Promise<{ session: Session; token: string }> {
    const token = generateToken();
    const now = Date.now();
    const absoluteMs =
      state === SessionState.ACTIVE
        ? this.env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 3_600_000
        : state === SessionState.PENDING_MFA
          ? this.env.MFA_PENDING_TTL_MINUTES * 60_000
          : ENROLLMENT_TTL_MINUTES * 60_000;
    const absoluteExpiresAt = new Date(now + absoluteMs);
    const idleExpiresAt = new Date(
      Math.min(now + this.env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000, absoluteExpiresAt.getTime()),
    );

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256Hex(token),
        state,
        ipAddress: client.ip?.slice(0, 64) ?? null,
        userAgent: client.userAgent?.slice(0, 256) ?? null,
        idleExpiresAt,
        absoluteExpiresAt,
      },
    });
    return { session, token };
  }

  /** Resolve uma sessão válida (não revogada, não expirada, usuário ativo) ou `null`. */
  async resolve(token: string): Promise<SessionWithUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.idleExpiresAt.getTime() <= now ||
      session.absoluteExpiresAt.getTime() <= now ||
      !session.user.active
    ) {
      return null;
    }
    if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      const idleExpiresAt = new Date(
        Math.min(
          now + this.env.SESSION_IDLE_TIMEOUT_MINUTES * 60_000,
          session.absoluteExpiresAt.getTime(),
        ),
      );
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: new Date(now), idleExpiresAt },
      });
    }
    return session;
  }

  /**
   * Promove para ACTIVE emitindo um novo token (previne fixação de sessão). A sessão
   * anterior é revogada atomicamente; retorna `null` se ela já não era válida.
   */
  async rotateToActive(
    sessionId: string,
    client: SessionClientInfo,
  ): Promise<{ session: Session; token: string } | null> {
    const revoked = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });
    if (revoked.count !== 1) return null;
    await this.control.invalidateSession(sessionId);
    const previous = await this.prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
    return this.create(previous.userId, SessionState.ACTIVE, client);
  }

  async revoke(sessionId: string, reason: RevokeReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.control.invalidateSession(sessionId);
  }

  /** Revoga todas as sessões do usuário (opcionalmente preservando a atual). */
  async revokeAllForUser(
    userId: string,
    reason: RevokeReason,
    exceptSessionId?: string,
  ): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    await this.control.invalidateUser(userId);
    return result.count;
  }
}
