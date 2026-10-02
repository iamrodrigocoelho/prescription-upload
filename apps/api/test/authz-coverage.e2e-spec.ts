import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MODULE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { APP_GUARD, ModulesContainer } from '@nestjs/core';
import { hasPermission, Role, type Permission } from '@receita/shared';
import {
  ALLOWED_SESSION_STATES,
  IS_PUBLIC,
  PERMISSIONS,
  ROUTE_SCOPE,
  type RouteScopePolicy,
} from '../src/common/auth/decorators.js';
import { AuthModule } from '../src/modules/auth/auth.module.js';
import { AuthGuard } from '../src/modules/auth/guards/auth.guard.js';
import { CsrfGuard } from '../src/modules/auth/guards/csrf.guard.js';
import { PermissionsGuard } from '../src/modules/auth/guards/permissions.guard.js';
import { ScopeGuard } from '../src/modules/auth/guards/scope.guard.js';
import { createTestContext, type TestContext } from './utils/app.js';

interface Route {
  key: string;
  method: string;
  path: string;
  public: boolean;
  permissions: Permission[];
  sessionStates?: string[];
  routeScope?: RouteScopePolicy;
}

/** Únicas rotas sem sessão. /metrics exige token de serviço mesmo com @Public. */
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /health/ready',
  'GET /metrics',
  'GET /public/stores',
  'GET /public/stores/:slug',
  'GET /public/patient-links/:token',
  'GET /public/patient-link-sessions/current',
  'POST /public/patient-link-sessions',
  'POST /public/prescriptions',
  'POST /public/patient-links/:token/prescriptions',
  'POST /public/patient-link-sessions/current/prescriptions',
  'POST /auth/login',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
]);

/** Rotas de conta própria: sessão obrigatória, sem permissão de loja. */
const SELF_ROUTES = new Set([
  'GET /auth/me',
  'POST /auth/logout',
  'POST /auth/totp/setup',
  'POST /auth/totp/confirm',
  'POST /auth/totp/verify',
  'POST /auth/totp/disable',
  'POST /auth/totp/recovery-codes',
  'GET /me/preferences',
  'PATCH /me/preferences',
]);

function joinPath(root: string, child: string): string {
  return `/${[root, child].filter(Boolean).join('/')}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function routeInventory(modules: ModulesContainer): Route[] {
  const routes = new Map<string, Route>();
  for (const module of modules.values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller?.prototype) continue;
      const root = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      if (typeof root !== 'string') continue;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        if (name === 'constructor') continue;
        const handler: unknown = controller.prototype[name];
        if (typeof handler !== 'function') continue;
        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
          | RequestMethod
          | undefined;
        if (requestMethod === undefined) continue;
        const child = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = RequestMethod[requestMethod];
        const path = joinPath(root, child ?? '');
        const key = `${method} ${path}`;
        if (routes.has(key)) throw new Error(`Rota duplicada: ${key}`);
        routes.set(key, {
          key,
          method,
          path,
          public: (Reflect.getMetadata(IS_PUBLIC, handler) ??
            Reflect.getMetadata(IS_PUBLIC, controller)) === true,
          permissions: (Reflect.getMetadata(PERMISSIONS, handler) ??
            Reflect.getMetadata(PERMISSIONS, controller) ?? []) as Permission[],
          sessionStates: Reflect.getMetadata(ALLOWED_SESSION_STATES, handler) as
            | string[]
            | undefined,
          routeScope: (Reflect.getMetadata(ROUTE_SCOPE, handler) ??
            Reflect.getMetadata(ROUTE_SCOPE, controller)) as RouteScopePolicy | undefined,
        });
      }
    }
  }
  return [...routes.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function scope(route: Route): string {
  if (route.key === 'GET /metrics') return 'Token de serviço';
  if (route.public) return 'Público';
  if (route.routeScope === 'SELF') return 'Própria conta';
  if (route.routeScope === 'GLOBAL') return 'Global (Admin)';
  if (route.path.startsWith('/admin/stores') && route.permissions.includes('stores:manage'))
    return 'Global (Admin)';
  return 'Lojas do usuário; Admin global';
}

function matrix(routes: Route[]): string {
  const lines = [
    '# Matriz de autorização — rotas registradas no NestJS',
    '',
    'Gerada/verificada por `apps/api/test/authz-coverage.e2e-spec.ts`. `Sim` significa que o perfil passa pelos guards de permissão e escopo; consultas por recurso também filtram por loja. Rotas de 2FA exigem o estado de sessão indicado em `Condição`. `/metrics` requer Bearer de serviço e não usa sessão.',
    '',
    '| Rota | Anônimo | Colaborador | Gestor | Administrador | Serviço | Escopo | Condição |',
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const route of routes) {
    const yes = 'Sim';
    const no = '—';
    const metrics = route.key === 'GET /metrics';
    const roleAccess = (role: Role) =>
      route.public ? (metrics ? no : yes) : route.permissions.every((p) => hasPermission(role, p)) ? yes : no;
    const condition = route.public
      ? metrics ? 'Bearer de serviço' : 'Público explícito'
      : route.sessionStates?.length
        ? `Sessão: ${route.sessionStates.join(', ')}`
        : route.permissions.length
          ? route.permissions.join(', ')
          : 'Sessão ativa';
    lines.push(
      `| \`${route.key}\` | ${route.public && !metrics ? yes : no} | ${roleAccess(Role.STORE_COLLABORATOR)} | ${roleAccess(Role.MANAGER)} | ${roleAccess(Role.ADMIN)} | ${metrics ? yes : no} | ${scope(route)} | ${condition} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

describe('Cobertura de autorização de todas as rotas NestJS', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestContext();
  });
  afterAll(async () => {
    await ctx.app.close();
  });

  it('registra os guards globais na ordem autenticação → CSRF → permissão → escopo', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AuthModule) as Array<{
      provide?: unknown;
      useClass?: unknown;
    }>;
    expect(providers.filter((p) => p.provide === APP_GUARD).map((p) => p.useClass)).toEqual([
      AuthGuard,
      CsrfGuard,
      PermissionsGuard,
      ScopeGuard,
    ]);
  });

  it('exige allowlist pública e permissão ou exceção de conta própria para cada rota', () => {
    const routes = routeInventory(ctx.app.get(ModulesContainer));
    expect(routes.length).toBeGreaterThan(50);
    expect(new Set(routes.filter((route) => route.public).map((route) => route.key))).toEqual(
      PUBLIC_ROUTES,
    );
    for (const route of routes) {
      if (route.public) continue;
      expect(route.routeScope, `${route.key} não declara política de escopo`).toBeDefined();
      expect(
        route.permissions.length > 0 || SELF_ROUTES.has(route.key),
        `${route.key} não tem permissão nem escopo explícito de conta própria`,
      ).toBe(true);
    }
    expect(
      new Set(routes.filter((route) => !route.public && route.permissions.length === 0).map((r) => r.key)),
    ).toEqual(SELF_ROUTES);
    for (const route of routes.filter((r) => SELF_ROUTES.has(r.key))) {
      expect(route.routeScope).toBe('SELF');
    }
    expect(routes.some((route) => route.key === 'POST /prescriptions/:id/open')).toBe(true);
  });

  it('mantém a matriz perfil × rota × escopo sincronizada com o código', () => {
    const routes = routeInventory(ctx.app.get(ModulesContainer));
    const expected = matrix(routes);
    const path = resolve(import.meta.dirname, '../../../docs/security/authz-matrix.md');
    if (process.env.UPDATE_AUTHZ_MATRIX === '1') writeFileSync(path, expected);
    expect(readFileSync(path, 'utf8')).toBe(expected);
  });
});
