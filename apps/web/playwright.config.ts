import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const rootEnv = resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * E2E das telas públicas. API e web rodam com build de produção contra o banco
 * de testes (`TEST_DATABASE_URL`), com prefixo próprio no Redis e a chave de
 * TESTE do reCAPTCHA (o widget real do Google é carregado — requer internet).
 */
export const e2eEnv: Record<string, string> = {
  // A API do E2E roda como `test` (permite chave de teste do reCAPTCHA e mock de
  // pacientes); o web usa o build de produção.
  NODE_ENV: 'test',
  DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
  REDIS_KEY_PREFIX: 'rv-e2e:',
  COOKIE_SECURE: 'false',
  LOG_LEVEL: 'warn',
  LOG_PRETTY: 'false',
  PATIENT_PROVIDER: 'mock',
  PUBLIC_SUBMIT_RATE_LIMIT_POINTS: '10000',
  PUBLIC_LOOKUP_RATE_LIMIT_POINTS: '10000',
  LOGIN_RATE_LIMIT_POINTS: '10000',
  STORAGE_BUCKET: 'receitas-e2e',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    locale: 'pt-BR',
  },
  projects: [
    { name: 'mobile-320', use: { ...devices['Pixel 5'], viewport: { width: 320, height: 640 } } },
    {
      name: 'mobile-375',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'node dist/main.js',
      cwd: resolve(import.meta.dirname, '../api'),
      url: 'http://localhost:4000/health',
      env: { ...process.env, ...e2eEnv } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm start',
      cwd: import.meta.dirname,
      url: 'http://localhost:3000/login',
      env: { ...process.env, NODE_ENV: 'production' } as Record<string, string>,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
