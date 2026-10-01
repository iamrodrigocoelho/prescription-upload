import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { applyTestEnv } from './test-env.js';

/**
 * Aplica as migrations versionadas pendentes no banco de testes (inclui CHECKs e o
 * trigger append-only do audit_logs). Operação não destrutiva: a limpeza de dados
 * entre suítes é feita por `resetDatabase` (test/utils/db.ts).
 */
export default function setup(): void {
  applyTestEnv();
  const database = new URL(process.env.DATABASE_URL ?? 'postgresql://invalid/').pathname;
  if (!database.endsWith('_test')) {
    throw new Error('Por segurança, os testes e2e só rodam em bancos cujo nome termina com _test.');
  }
  execFileSync(resolve(import.meta.dirname, '../node_modules/.bin/prisma'), ['migrate', 'deploy'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
}
