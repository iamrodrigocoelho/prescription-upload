import { type APIRequestContext, expect, type Page, request } from '@playwright/test';

const ORIGIN = 'http://localhost:3000';

export interface SeedStore {
  id: string;
  storeNumber: string;
  storeName: string;
  active: boolean;
  publicUrl: string;
}

/** Contexto autenticado como o admin do seed (credenciais do .env). */
export async function adminApi(): Promise<{ api: APIRequestContext; csrf: string }> {
  const api = await request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN } });
  const login = await api.post('/api/auth/login', {
    data: { email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD },
  });
  expect(login.ok()).toBe(true);
  return { api, csrf: ((await login.json()) as { csrfToken: string }).csrfToken };
}

export async function seedStores(): Promise<SeedStore[]> {
  const { api } = await adminApi();
  const res = await api.get('/api/admin/stores?pageSize=100');
  const body = (await res.json()) as { items: SeedStore[] };
  await api.dispose();
  return body.items;
}

export async function activeStore(): Promise<SeedStore & { slug: string }> {
  const store = (await seedStores()).find((s) => s.active && s.storeNumber === '101');
  if (!store) throw new Error('Loja 101 do seed não encontrada');
  return { ...store, slug: store.publicUrl.split('/l/')[1] ?? '' };
}

export async function inactiveStore(): Promise<SeedStore & { slug: string }> {
  const store = (await seedStores()).find((s) => !s.active);
  if (!store) throw new Error('Loja inativa do seed não encontrada');
  return { ...store, slug: store.publicUrl.split('/l/')[1] ?? '' };
}

/** Gera um link personalizado pelo Admin e devolve o path /p/{token}. */
export async function createPersonalizedLinkPath(storeId: string): Promise<string> {
  const { api, csrf } = await adminApi();
  const res = await api.post('/api/admin/patient-links', {
    headers: { 'X-CSRF-Token': csrf },
    data: { storeId, patientExternalId: 'mock-pat-0001' },
  });
  expect(res.status()).toBe(201);
  const { url } = (await res.json()) as { url: string };
  await api.dispose();
  return new URL(url).pathname;
}

export const jpeg = (name = 'receita.jpg', size = 4096) => {
  const buffer = Buffer.alloc(size);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]).copy(buffer);
  return { name, mimeType: 'image/jpeg', buffer };
};

export const pdf = (name = 'receita.pdf') => {
  const buffer = Buffer.alloc(4096, 0x20);
  Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n').copy(buffer);
  return { name, mimeType: 'application/pdf', buffer };
};

export async function addFiles(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
) {
  await page.getByTestId('file-input').setInputFiles(files);
}

/** Conclui o reCAPTCHA de teste (sem desafio) clicando no checkbox do iframe. */
export async function solveCaptcha(page: Page) {
  const frame = page.frameLocator('iframe[title="reCAPTCHA"]');
  await frame.locator('#recaptcha-anchor').click();
  await expect(frame.locator('#recaptcha-anchor')).toHaveAttribute('aria-checked', 'true');
}

export const submitButton = (page: Page) =>
  page.getByRole('button', { name: /^(Enviar|Tentar novamente)$/ });
