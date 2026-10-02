import { ApiErrorCode } from '@receita/shared';
import { AppError } from '../../common/errors.js';

export interface QueueCursor {
  createdAt: Date;
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor opaco (created_at, id) em base64url — estável sob inserções concorrentes. */
export function encodeCursor(cursor: QueueCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt.toISOString(), cursor.id])).toString(
    'base64url',
  );
}

export function decodeCursor(value: string): QueueCursor {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (Array.isArray(parsed) && parsed.length === 2) {
      const [at, id] = parsed as [unknown, unknown];
      const createdAt = new Date(String(at));
      if (typeof id === 'string' && UUID.test(id) && !Number.isNaN(createdAt.getTime())) {
        return { createdAt, id };
      }
    }
  } catch {
    // cai no erro abaixo
  }
  throw new AppError(ApiErrorCode.VALIDATION_FAILED, undefined, [
    { path: 'cursor', message: 'Cursor inválido.' },
  ]);
}
