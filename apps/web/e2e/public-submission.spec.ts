import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  activeStore,
  addFiles,
  createPersonalizedLinkPath,
  inactiveStore,
  jpeg,
  pdf,
  solveCaptcha,
  submitButton,
} from './helpers';

const SUCCESS = 'Receita enviada com sucesso.';

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    // O widget do reCAPTCHA é um iframe de terceiros, fora do nosso controle.
    .exclude('iframe[title="reCAPTCHA"]')
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('Link da loja (/l/{slug})', () => {
  test('envio completo sem CPF, com hierarquia e acessibilidade', async ({ page }) => {
    const store = await activeStore();
    await page.goto(`/l/${store.slug}`);
    await expect(page.getByRole('heading', { name: 'Envio de receita' })).toBeVisible();
    await expect(page.getByText(`Loja: ${store.storeNumber} · ${store.storeName}`)).toBeVisible();
    await expect(page.getByLabel('CPF do paciente (opcional)')).toBeVisible();
    await expect(
      page.getByText('Você pode enviar até 10 arquivos', { exact: false }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousA11yViolations(page);

    // CA-003: sem captcha, o botão permanece desabilitado.
    await addFiles(page, [jpeg(), pdf()]);
    await expect(page.getByText('receita.jpg')).toBeVisible();
    await expect(page.getByText('receita.pdf')).toBeVisible();
    await expect(submitButton(page)).toBeDisabled();

    await solveCaptcha(page);
    await expect(submitButton(page)).toBeEnabled();
    await submitButton(page).click();

    await expect(page.getByRole('heading', { name: SUCCESS })).toBeVisible();
    await expect(page.getByText(/protocolo/i)).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });

  test('envio com CPF: máscara, validação e sucesso', async ({ page }) => {
    const store = await activeStore();
    await page.goto(`/l/${store.slug}`);
    const cpf = page.getByLabel('CPF do paciente (opcional)');

    await cpf.fill('52998224724');
    await expect(cpf).toHaveValue('529.982.247-24');
    await expect(page.getByText('CPF inválido.')).toBeVisible();

    await cpf.fill('52998224725');
    await expect(page.getByText('CPF inválido.')).toHaveCount(0);
    await addFiles(page, [jpeg()]);
    await solveCaptcha(page);
    await submitButton(page).click();
    await expect(page.getByRole('heading', { name: SUCCESS })).toBeVisible();
  });

  test('erros de arquivo: formato, tamanho e limite (CA-004, CA-005)', async ({ page }) => {
    const store = await activeStore();
    await page.goto(`/l/${store.slug}`);

    await addFiles(page, [{ name: 'foto.gif', mimeType: 'image/gif', buffer: Buffer.alloc(100) }]);
    await expect(
      page.getByRole('alert').getByText('Formato de arquivo não permitido.'),
    ).toBeVisible();

    await addFiles(page, [jpeg('grande.jpg', 5 * 1024 * 1024 + 1)]);
    await expect(
      page.getByRole('alert').getByText('Este arquivo ultrapassa o limite de 5 MB.'),
    ).toBeVisible();

    await addFiles(
      page,
      Array.from({ length: 10 }, (_, i) => jpeg(`r${i}.jpg`, 512)),
    );
    await addFiles(page, [jpeg('extra.jpg', 512)]).catch(() => undefined);
    await expect(
      page.getByRole('alert').getByText('Você pode enviar no máximo 10 arquivos.'),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Arquivos selecionados' }).getByRole('listitem'),
    ).toHaveCount(10);

    // Remover libera espaço novamente.
    await page.getByRole('button', { name: 'Remover r0.jpg' }).click();
    await expect(
      page.getByRole('list', { name: 'Arquivos selecionados' }).getByRole('listitem'),
    ).toHaveCount(9);
  });

  test('loja inativa exibe a mensagem de indisponibilidade (CA-010)', async ({ page }) => {
    const store = await inactiveStore();
    await page.goto(`/l/${store.slug}`);
    await expect(
      page.getByRole('heading', {
        name: 'Esta loja não está disponível para novos envios no momento.',
      }),
    ).toBeVisible();
    await expect(page.getByTestId('file-input')).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
  });
});

test.describe('Entrada genérica (/enviar)', () => {
  test('seleciona a loja pela busca e envia', async ({ page }) => {
    const store = await activeStore();
    await page.goto('/enviar');
    await expectNoSeriousA11yViolations(page);
    await page.getByLabel('Buscar loja').fill(store.storeNumber);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('radio', { name: new RegExp(store.storeName) }).check();
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByText(`Loja: ${store.storeNumber} · ${store.storeName}`)).toBeVisible();
    await expect(page.getByLabel('CPF do paciente (opcional)')).toBeVisible();
    await addFiles(page, [jpeg()]);
    await solveCaptcha(page);
    await submitButton(page).click();
    await expect(page.getByRole('heading', { name: SUCCESS })).toBeVisible();
  });
});

test.describe('Link personalizado (/p/{token})', () => {
  test('remove o token da URL, não exibe CPF e envia (CA-012, CA-013)', async ({ page }) => {
    const store = await activeStore();
    const path = await createPersonalizedLinkPath(store.id);
    await page.goto(path);

    await expect(page).toHaveURL(/\/p$/);
    await expect(page.getByText('Envie sua receita para a Drogaria Venancio')).toBeVisible();
    await expect(page.getByLabel('CPF do paciente (opcional)')).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);

    await addFiles(page, [jpeg()]);
    await expect(submitButton(page)).toBeDisabled();
    await solveCaptcha(page);
    await submitButton(page).click();
    await expect(page.getByRole('heading', { name: SUCCESS })).toBeVisible();

    // Uso único: abrir o mesmo link de novo mostra a mensagem neutra.
    await page.goto(path);
    await expect(
      page.getByRole('heading', {
        name: 'Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.',
      }),
    ).toBeVisible();
  });

  test('link inválido exibe mensagem neutra (CA-014)', async ({ page }) => {
    await page.goto(`/p/${'X'.repeat(43)}`);
    await expect(page).toHaveURL(/\/p$/);
    await expect(
      page.getByRole('heading', {
        name: 'Este link não está mais disponível. Solicite um novo link à Drogaria Venancio.',
      }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });
});
