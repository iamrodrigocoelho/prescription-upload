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
  // Fluxo real: busca no contexto da loja → referência opaca → geração (D-069).
  const search = await api.post('/api/patients/search', {
    headers: { 'X-CSRF-Token': csrf },
    data: { type: 'email', query: 'joao.teste@example.com', context: { storeId } },
  });
  expect(search.status()).toBe(200);
  const { results } = (await search.json()) as { results: { selectionRef: string }[] };
  const res = await api.post('/api/admin/patient-links', {
    headers: { 'X-CSRF-Token': csrf },
    data: { storeId, selectionRef: results[0]?.selectionRef },
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

/** JPEG válido e decodificável (96×64, gerado para o projeto) — usado pelo visualizador. */
const REAL_JPEG_BASE64 =
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABAAGADASIAAhEBAxEB/8QAGAABAAMBAAAAAAAAAAAAAAAAAAUHCAb/xAAvEAABAgQDBwALAAAAAAAAAAAAF6QDBlXSARITAgQFERRl4hUWISMkMTJDUWKh/8QAFwEBAQEBAAAAAAAAAAAAAAAAAAECA//EABsRAQEBAQEBAQEAAAAAAAAAAAABERJhgSFB/9oADAMBAAIRAxEAPwC/ADBh1k1ztxvMGDAXlOm8wYMA5Om8wYMA5Om8wYMA5Om8wYMN5ksxZdDgkikeiO4953pVKvdkd+BJL/CplIpHojuPeEikeiO495DK92R34BXuyO/AuVNiZSKR6I7j3hIpHojuPeQyvdkd+AV7sjvwGU2JlIpHojuPeEikeiO495DK92R34BXuyO/AZTYmUikeiO494SKR6I7j3klIs3+tXXfA9J02T7upmzZv1w5csv8ATqyfsX8cEkUj0R3HvO9AAHKJ7K9McRbjqzPyezRTHEK4sKtZPZXpjiLcE9lemOItxVKezRTHEK4J7NFMcQri56nxayeyvTHEW4J7K9McRbiqU9mimOIVwT2aKY4hXDPT4tZPZXpjiLcE9lemOItxVKezRTHEK4J7NFMcQrhnp8XZwKXuF8B1/RO69Pr5dT3m1t5svPl9WOP5xJUz8ns0UxxCuOgkGTePcKm3cN93/cNLdoWpn29aHtcucPaww9mG1jj88cCWemrhABloAAAAAAAAAAAAAAAB/9k=';

export const realJpeg = (name = 'foto.jpg') => ({
  name,
  mimeType: 'image/jpeg',
  buffer: Buffer.from(REAL_JPEG_BASE64, 'base64'),
});

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

/** Autentica o contexto do navegador via API (compartilha os cookies com as páginas). */
export async function loginPage(page: Page, email: string, password: string): Promise<void> {
  const res = await page.request.post('/api/auth/login', {
    headers: { Origin: ORIGIN },
    data: { email, password },
  });
  expect(res.ok()).toBe(true);
}

export const demoCollaborator = () => ({
  email: 'colaborador@receita.local',
  password: process.env.SEED_DEMO_PASSWORD ?? '',
});
export const demoManager = () => ({
  email: 'gestor@receita.local',
  password: process.env.SEED_DEMO_PASSWORD ?? '',
});

let captchaSeq = 0;
/** Envio público via API (chave de teste do reCAPTCHA aprova qualquer token). */
export async function submitPrescription(
  slug: string,
  files: { name: string; mimeType: string; buffer: Buffer }[] = [jpeg()],
): Promise<void> {
  const api = await request.newContext({ baseURL: ORIGIN, extraHTTPHeaders: { Origin: ORIGIN } });
  captchaSeq += 1;
  const multipart: Record<string, string | { name: string; mimeType: string; buffer: Buffer }> = {
    captchaToken: `e2e-${Date.now()}-${captchaSeq}-token-xxxxxxxxxxxx`,
    slug,
  };
  // Playwright aceita um arquivo por chave; para vários, envia-se como lista no FormData.
  const form = new FormData();
  for (const [key, value] of Object.entries(multipart)) form.append(key, value as string);
  for (const file of files)
    form.append(
      'files',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }),
      file.name,
    );
  const res = await api.post('/api/public/prescriptions', { multipart: form });
  expect(res.status()).toBe(201);
  await api.dispose();
}

/** Substitui o AudioContext por um contador (o áudio real não é verificável no headless). */
export async function mockAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: number };
    w.__sounds = 0;
    class FakeContext {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createGain() {
        w.__sounds += 1;
        return {
          connect() {},
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        };
      }
      createOscillator() {
        return {
          type: 'sine',
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {},
          stop() {},
        };
      }
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeContext;
  });
}

export const soundCount = (page: Page) =>
  page.evaluate(() => (window as unknown as { __sounds: number }).__sounds);
