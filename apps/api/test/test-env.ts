/**
 * Ambiente determinístico para testes. Segredos aqui são fictícios e exclusivos
 * de teste. URLs de serviços vêm de TEST_* no `.env` (ou do CI).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function applyTestEnv(): void {
  const rootEnv = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const testDefaults: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    LOG_PRETTY: 'false',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      'postgresql://receita:receita_dev@localhost:5432/receita_test',
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
    REDIS_KEY_PREFIX: 'rv-test:',
    CPF_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
    CPF_LOOKUP_PEPPER: 'test-pepper-test-pepper-test-pepper-0001',
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    SESSION_SECRET: 'test-session-secret-test-session-secret-01',
    COOKIE_SECURE: 'false',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MAIL_FROM: 'Receita Venancio <nao-responda@localhost>',
    PATIENT_PROVIDER: 'mock',
    RECAPTCHA_SECRET_KEY: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
    RECAPTCHA_EXPECTED_HOSTNAMES: 'localhost,testkey.google.com',
    METRICS_TOKEN: 'test-metrics-token-test-metrics-token-01',
    STORAGE_ENDPOINT: process.env.TEST_STORAGE_ENDPOINT ?? 'http://localhost:8333',
    STORAGE_BUCKET: 'receitas-test',
    STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY ?? 'receita',
    STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY ?? 'receita_dev_secret',
  };

  // Valores de teste sempre prevalecem sobre o .env de desenvolvimento.
  Object.assign(process.env, testDefaults);
}
