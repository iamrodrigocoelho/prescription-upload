import type { CookieOptions, Request, Response } from 'express';
import type { Env } from '../../config/env.js';

/**
 * Com Secure, usa o prefixo `__Host-` (sem Domain, Path=/, Secure obrigatórios):
 * o cookie não pode ser definido por subdomínios nem trafegar sem TLS.
 */
export function sessionCookieName(env: Env): string {
  return env.COOKIE_SECURE ? '__Host-rv_session' : 'rv_session';
}

function cookieOptions(env: Env): CookieOptions {
  // Cookie de sessão do navegador (sem Max-Age): a expiração real é controlada no servidor.
  return { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, env: Env, token: string): void {
  res.cookie(sessionCookieName(env), token, cookieOptions(env));
}

export function clearSessionCookie(res: Response, env: Env): void {
  res.clearCookie(sessionCookieName(env), cookieOptions(env));
}

export function readSessionCookie(req: Request, env: Env): string | undefined {
  const value: unknown = (req.cookies as Record<string, unknown> | undefined)?.[
    sessionCookieName(env)
  ];
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
