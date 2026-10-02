import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Permission } from '@receita/shared';
import { SessionState } from '../../generated/prisma/client.js';
import type { AuthContext, AuthenticatedRequest } from './auth.types.js';

export const IS_PUBLIC = 'auth:isPublic';
export const ALLOWED_SESSION_STATES = 'auth:allowedSessionStates';
export const PERMISSIONS = 'auth:permissions';
export const ROUTE_SCOPE = 'auth:routeScope';
export type RouteScopePolicy = 'SELF' | 'STORE' | 'GLOBAL';

/** Rota acessível sem sessão. Toda rota é protegida por padrão. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** O guard global exige uma política explícita de escopo nas rotas com sessão. */
export const RouteScope = (policy: RouteScopePolicy): MethodDecorator & ClassDecorator =>
  SetMetadata(ROUTE_SCOPE, policy);

/**
 * Estados de sessão aceitos pela rota (padrão: apenas ACTIVE). Usado nas etapas
 * intermediárias do login (verificação TOTP, configuração obrigatória de 2FA).
 */
export const AllowSessionStates = (...states: SessionState[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOWED_SESSION_STATES, states);

/**
 * Permissões exigidas (todas). Sem o decorator, qualquer usuário autenticado é
 * aceito — o escopo de loja continua sendo aplicado nas consultas.
 */
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS, permissions);

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
