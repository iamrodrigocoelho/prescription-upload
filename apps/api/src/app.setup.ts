import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';

/** Parse de `TRUST_PROXY`: número de hops, booleano ou lista/preset aceito pelo Express. */
function trustProxyValue(raw: string): boolean | number | string {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw;
}

/**
 * Configuração HTTP compartilhada entre `main.ts` e os testes e2e, para que os
 * testes exercitem exatamente os mesmos headers e middlewares de produção.
 */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  const expressApp = app as NestExpressApplication;

  expressApp.useLogger(app.get(Logger));
  expressApp.set('trust proxy', trustProxyValue(env.TRUST_PROXY));
  expressApp.disable('x-powered-by');
  expressApp.useBodyParser('json', { limit: '100kb' });
  expressApp.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  // A API só serve JSON: CSP mais restritiva possível (PRD §35).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 63_072_000, includeSubDomains: true, preload: true } : false,
      permittedCrossDomainPolicies: false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
    }),
  );
  app.use(cookieParser());
  // Respostas da API contêm dados sensíveis: nunca devem ser armazenadas em cache.
  app.use(
    (_req: unknown, res: { setHeader(name: string, value: string): void }, next: () => void) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.enableShutdownHooks();
}

/**
 * Keep-alive da API maior que o do proxy à frente (Caddy/Next): evita que o proxy
 * reaproveite uma conexão que o Node acabou de fechar ("socket hang up").
 * Chamar após `init()`/`listen()`.
 */
export function tuneHttpServer(app: INestApplication): void {
  const server = app.getHttpServer() as import('node:http').Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
}
