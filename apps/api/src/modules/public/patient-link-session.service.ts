import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@receita/shared';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { AppError } from '../../common/errors.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { generateToken, sha256Hex } from '../../infra/crypto/primitives.js';
import { REDIS } from '../../infra/redis/redis.module.js';

const CONTEXT_TTL_SECONDS = 30 * 60;

/**
 * Contexto de link personalizado em cookie (D-047). O token sai da URL logo na
 * primeira carga: o navegador troca o token por um ID de contexto aleatório, em
 * cookie HttpOnly + SameSite=Strict. O Redis guarda apenas o hash do ID → linkId.
 */
@Injectable()
export class PatientLinkSessionService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  cookieName(): string {
    return this.env.COOKIE_SECURE ? '__Host-rv_plink' : 'rv_plink';
  }

  async open(res: Response, linkId: string): Promise<void> {
    const contextId = generateToken();
    await this.redis.set(this.key(contextId), linkId, 'EX', CONTEXT_TTL_SECONDS);
    res.cookie(this.cookieName(), contextId, {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
      path: '/',
      maxAge: CONTEXT_TTL_SECONDS * 1000,
    });
  }

  /** linkId do contexto atual; ausente/expirado → erro neutro (o mesmo de link inválido). */
  async linkIdFrom(req: Request): Promise<string> {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
      this.cookieName()
    ];
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
      throw new AppError(ApiErrorCode.LINK_UNAVAILABLE);
    }
    const linkId = await this.redis.get(this.key(value));
    if (!linkId) throw new AppError(ApiErrorCode.LINK_UNAVAILABLE);
    return linkId;
  }

  async close(req: Request, res: Response): Promise<void> {
    const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
      this.cookieName()
    ];
    if (typeof value === 'string') await this.redis.del(this.key(value));
    res.clearCookie(this.cookieName(), {
      path: '/',
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: 'strict',
    });
  }

  private key(contextId: string): string {
    return `${this.env.REDIS_KEY_PREFIX}plink:ctx:${sha256Hex(contextId)}`;
  }
}
