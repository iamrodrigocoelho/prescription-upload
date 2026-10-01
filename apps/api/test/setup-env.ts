/**
 * Ambiente determinístico para testes. Valores de segredo aqui são fictícios e
 * exclusivos de teste. URLs de serviços podem ser sobrescritas pelo ambiente
 * (ex.: TEST_DATABASE_URL no CI).
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const testDefaults: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PUBLIC_APP_URL: 'http://localhost:3000',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgresql://receita:receita_dev@localhost:5432/receita_test',
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
  STORAGE_ENDPOINT: process.env.TEST_STORAGE_ENDPOINT ?? 'http://localhost:8333',
  STORAGE_BUCKET: 'receitas-test',
  STORAGE_ACCESS_KEY: process.env.STORAGE_ACCESS_KEY ?? 'receita',
  STORAGE_SECRET_KEY: process.env.STORAGE_SECRET_KEY ?? 'receita_dev_secret',
};

// Valores de teste sempre prevalecem sobre o .env de desenvolvimento.
Object.assign(process.env, testDefaults);
