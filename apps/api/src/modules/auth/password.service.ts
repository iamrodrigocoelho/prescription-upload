import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  AuditAction,
  passwordPolicyIssues,
  type ResetPasswordInput,
} from '@receita/shared';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { PasswordTokenPurpose, type User } from '../../generated/prisma/client.js';
import { hashPassword } from '../../infra/crypto/password-hasher.js';
import { generateToken, hmacSha256, sha256Hex } from '../../infra/crypto/primitives.js';
import { MailProvider } from '../../infra/mail/mail.provider.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RateLimitService } from '../../infra/rate-limit/rate-limit.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeControl } from '../realtime/realtime-control.js';
import { inviteEmail, passwordResetEmail } from './mail-templates.js';

/**
 * Recuperação de senha e convite (PRD §15.2). Tokens de uso único, curta duração,
 * persistidos apenas como hash. A resposta pública nunca revela se o e-mail existe.
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailProvider,
    private readonly rateLimit: RateLimitService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    private readonly control: RealtimeControl,
  ) {}

  /**
   * Aceita a solicitação e processa em segundo plano: o tempo de resposta é o mesmo
   * para e-mails existentes e inexistentes.
   */
  async requestReset(email: string, ip: string | undefined): Promise<void> {
    await this.rateLimit.consume('forgotPasswordIp', ip ?? 'unknown');
    const emailKey = hmacSha256(email, this.env.SESSION_SECRET);
    if ((await this.rateLimit.penalize('forgotPasswordEmail', emailKey)).exceeded) return;

    void this.processResetRequest(email).catch((error: unknown) => {
      this.logger.error({ err: error }, 'Falha ao processar solicitação de redefinição de senha');
    });
  }

  private async processResetRequest(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) return;

    const token = await this.issueToken(user.id, PasswordTokenPurpose.RESET);
    const link = `${this.env.PUBLIC_APP_URL}/redefinir-senha#token=${token}`;
    await this.mail.send(passwordResetEmail(user.email, link, this.env.PASSWORD_RESET_TTL_MINUTES));
    await this.audit.record({
      action: AuditAction.AUTH_PASSWORD_RESET_REQUESTED,
      entityType: 'User',
      entityId: user.id,
      actor: { userId: null, role: null },
    });
  }

  /** Convite de novo usuário: definição da própria senha (o Admin nunca a conhece). */
  async sendInvite(user: Pick<User, 'id' | 'email' | 'name'>): Promise<void> {
    const token = await this.issueToken(user.id, PasswordTokenPurpose.INVITE);
    const link = `${this.env.PUBLIC_APP_URL}/definir-senha#token=${token}`;
    await this.mail.send(inviteEmail(user.email, user.name, link, this.env.INVITE_TTL_HOURS));
  }

  async resetPassword(input: ResetPasswordInput, ip: string | undefined): Promise<void> {
    await this.rateLimit.consume('resetPasswordIp', ip ?? 'unknown');

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(input.token) },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now() ||
      !record.user.active
    ) {
      throw new AppError(ApiErrorCode.INVALID_OR_EXPIRED_TOKEN);
    }

    const issues = passwordPolicyIssues(input.password, {
      minLength: this.env.PASSWORD_MIN_LENGTH,
      email: record.user.email,
      name: record.user.name,
    });
    if (issues.length > 0) {
      throw new AppError(
        ApiErrorCode.VALIDATION_FAILED,
        undefined,
        issues.map((message) => ({ path: 'password', message })),
      );
    }

    const passwordHash = await hashPassword(input.password);
    const now = new Date();
    const { user } = record;

    await this.prisma.$transaction(async (tx) => {
      // Consumo condicional: duas requisições simultâneas com o mesmo token não passam.
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new AppError(ApiErrorCode.INVALID_OR_EXPIRED_TOKEN);

      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: now, failedLoginCount: 0, lockedUntil: null },
      });
      // Invalida todas as sessões após a redefinição (PRD §15.2).
      const revoked = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'password_reset' },
      });
      await this.audit.record(
        {
          action: AuditAction.AUTH_PASSWORD_RESET_COMPLETED,
          entityType: 'User',
          entityId: user.id,
          actor: { userId: user.id, role: user.role },
          metadata: { purpose: record.purpose, sessionsRevoked: revoked.count },
        },
        tx,
      );
    });
    await this.control.invalidateUser(user.id);
  }

  /** Emite um token novo e invalida os pendentes do mesmo propósito. */
  private async issueToken(userId: string, purpose: PasswordTokenPurpose): Promise<string> {
    const token = generateToken();
    const ttlMs =
      purpose === PasswordTokenPurpose.INVITE
        ? this.env.INVITE_TTL_HOURS * 3_600_000
        : this.env.PASSWORD_RESET_TTL_MINUTES * 60_000;
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + ttlMs),
        },
      }),
    ]);
    return token;
  }
}
