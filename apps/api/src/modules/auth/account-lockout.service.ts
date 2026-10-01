import { Inject, Injectable } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import type { User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { lockoutSeconds } from './lockout.js';

@Injectable()
export class AccountLockoutService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  isLocked(user: Pick<User, 'lockedUntil'>): boolean {
    return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
  }

  /** Incrementa falhas de forma atômica e aplica o bloqueio progressivo quando cabível. */
  async registerFailure(userId: string): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const seconds = lockoutSeconds(
      failedLoginCount,
      this.env.LOCKOUT_THRESHOLD,
      this.env.LOCKOUT_BASE_SECONDS,
      this.env.LOCKOUT_MAX_SECONDS,
    );
    if (seconds > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + seconds * 1000) },
      });
    }
  }

  async clearFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
