import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import pg from 'pg';
import { e2eEnv } from '../playwright.config';

const apiDir = resolve(import.meta.dirname, '../../api');

/**
 * Prepara o banco de testes: migrations (não destrutivo), limpeza das tabelas
 * (exceto audit_logs, append-only), chaves do Redis do E2E e seed (admin + lojas).
 */
export default async function globalSetup(): Promise<void> {
  const url = e2eEnv.DATABASE_URL ?? '';
  if (!new URL(url).pathname.endsWith('_test'))
    throw new Error('E2E exige banco *_test (TEST_DATABASE_URL).');
  const env = { ...process.env, ...e2eEnv, NODE_ENV: 'development' } as NodeJS.ProcessEnv;

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    env,
    stdio: 'pipe',
  });

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`
    TRUNCATE TABLE "patient_link_history", "status_history", "prescription_files", "patient_upload_links",
      "prescription_submissions", "totp_recovery_codes", "password_reset_tokens", "sessions",
      "user_store_access", "users", "stores", "orphaned_objects", "outbox_events" RESTART IDENTITY CASCADE`);
  await client.query(`
    INSERT INTO "system_settings" ("key", "value", "updated_at") VALUES
      ('retention_days', '365', now()), ('patient_link_default_expiry_days', '7', now()),
      ('patient_link_max_expiry_days', '30', now())
    ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"`);
  await client.end();

  const redis = new Redis(e2eEnv.REDIS_URL ?? '');
  const keys = await redis.keys(`${e2eEnv.REDIS_KEY_PREFIX}*`);
  if (keys.length > 0) await redis.del(...keys);
  await redis.quit();

  execFileSync('pnpm', ['exec', 'prisma', 'db', 'seed'], { cwd: apiDir, env, stdio: 'pipe' });
}
