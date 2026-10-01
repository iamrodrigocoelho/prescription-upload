import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@receita/shared';
import { SessionState } from '../../generated/prisma/client.js';
import type { AuthContext, AuthenticatedRequest } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';
export const ALLOWED_SESSION_STATES = 'auth:allowedSessionStates';
export const ROLES = 'auth:roles';

/** Rota acessível sem sessão. Toda rota é protegida por padrão. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/**
 * Estados de sessão aceitos pela rota (padrão: apenas ACTIVE). Usado nas etapas
 * intermediárias do login (verificação TOTP, configuração obrigatória de 2FA).
 */
export const AllowSessionStates = (...states: SessionState[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOWED_SESSION_STATES, states);

/** Perfis autorizados. Sem o decorator, qualquer perfil autenticado é aceito. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);

/** Injeta o contexto autenticado (garantido pelo AuthGuard nas rotas protegidas). */
export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth) throw new Error('CurrentAuth usado em rota sem autenticação');
    return request.auth;
  },
);

export const ANY_SESSION_STATE = [
  SessionState.ACTIVE,
  SessionState.PENDING_MFA,
  SessionState.MFA_ENROLLMENT_REQUIRED,
] as const;
