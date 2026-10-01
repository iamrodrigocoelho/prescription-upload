import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { Env } from '../../config/env.js';
import { sanitizeUrl, scrubSensitive, scrubString } from './redact.js';

export const REQUEST_ID_HEADER = 'x-request-id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Aceita o correlation ID do cliente apenas se for um UUID; caso contrário gera um novo. */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const id = typeof incoming === 'string' && UUID.test(incoming) ? incoming : randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

export function buildLoggerParams(env: Env): Params {
  return {
    pinoHttp: {
      level: env.LOG_LEVEL,
      genReqId: resolveRequestId,
      // Health checks geram ruído e não carregam informação útil.
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/health') },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: sanitizeUrl(req.url),
        }),
        res: (res: { statusCode: number | null; raw?: { statusCode: number } }) => ({
          statusCode: res.raw?.statusCode ?? res.statusCode,
        }),
        err: (err: unknown) => scrubSensitive(err),
      },
      customAttributeKeys: { reqId: 'requestId' },
      formatters: {
        log: (object) => scrubSensitive(object) as Record<string, unknown>,
      },
      hooks: {
        logMethod(args, method) {
          const scrubbed = args.map((arg) =>
            typeof arg === 'string' ? scrubString(arg) : arg,
          ) as typeof args;
          method.apply(this, scrubbed);
        },
      },
      transport: env.LOG_PRETTY
        ? { target: 'pino-pretty', options: { singleLine: true } }
        : undefined,
    },
  };
}
