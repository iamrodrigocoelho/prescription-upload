import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  activeStore,
  adminApi,
  demoCollaborator,
  demoManager,
  jpeg,
  loginPage,
  mockAudio,
  pdf,
  realJpeg,
  soundCount,
  submitPrescription,
} from './helpers';

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

const newRows = (page: Page) =>
  page.getByTestId('queue-row').filter({ has: page.getByText('Nova', { exact: true }) });

test.describe('Operação da loja', () => {
  test('CA-006: nova receita aparece sem refresh, com toast, contadores e destaque', async ({
    browser,
  }) => {
    const store = await activeStore();
    const context = await browser.newContext();
    const page = await context.newPage();
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    // Conta as linhas só depois que a fila carregou (evita contar 0 durante o carregamento).
    const queueLoaded = page.waitForResponse(
      (res) => res.url().includes('/api/prescriptions?') && res.ok(),
    );
    await page.goto('/admin/receitas');
    await expect(page.getByRole('heading', { name: 'Receitas' })).toBeVisible();
    await queueLoaded;
    await expect(
      page.getByTestId('queue-row').or(page.getByText('Nenhuma receita encontrada')).first(),
    ).toBeVisible();
    const newChip = page.getByRole('button', { name: /Novas/ });
    const before = Number((await newChip.locator('span').last().textContent()) ?? '0');
    const rowsBefore = await newRows(page).count();
    await expectNoSeriousA11yViolations(page);

    // Outro contexto (cliente): envio público.
    await submitPrescription(store.slug, [jpeg(), pdf()]);

    await expect(page.getByText('Nova receita recebida.', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Abrir' }).first()).toBeVisible();
    await expect(newRows(page)).toHaveCount(rowsBefore + 1);
    await expect(newChip.locator('span').last()).toHaveText(String(before + 1));
    await expect(
      page.getByRole('link', { name: /Receitas/ }).getByText(/não visualizadas/),
    ).toBeAttached();
    await context.close();
  });

  test('som habilitado: dispara uma única vez por evento, mesmo com duas abas abertas', async ({
    browser,
  }) => {
    const store = await activeStore();
    const context = await browser.newContext();
    const tabA = await context.newPage();
    await mockAudio(tabA);
    const collaborator = demoCollaborator();
    await loginPage(tabA, collaborator.email, collaborator.password);
    await tabA.goto('/admin/receitas');
    const toggle = tabA.getByRole('button', { name: /Som (ligado|desligado)/ });
    if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    const tabB = await context.newPage();
    await mockAudio(tabB);
    await tabB.goto('/admin/receitas');
    await expect(tabB.getByRole('heading', { name: 'Receitas' })).toBeVisible();

    await submitPrescription(store.slug);
    await expect(tabA.getByText('Nova receita recebida.', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(tabB.getByText('Nova receita recebida.', { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
    await tabA.waitForTimeout(500);
    expect((await soundCount(tabA)) + (await soundCount(tabB))).toBe(1);

    // Desliga para não afetar outros testes.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await context.close();
  });

  test('abrir a receita remove o destaque de "nova" em outra aba', async ({ browser }) => {
    const store = await activeStore();
    await submitPrescription(store.slug);
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const collaborator = demoCollaborator();
    await loginPage(tabA, collaborator.email, collaborator.password);
    await tabA.goto('/admin/receitas');
    const firstRow = tabA.getByTestId('queue-row').first();
    await expect(firstRow.getByText('Nova', { exact: true })).toBeVisible();
    const href = await firstRow.getByRole('link', { name: /Abrir receita/ }).getAttribute('href');

    const tabB = await context.newPage();
    await tabB.goto(href ?? '/admin/receitas');
    await expect(tabB.getByRole('heading', { name: /Receita · Loja/ })).toBeVisible();

    await expect(
      tabA.getByTestId('queue-row').first().getByText('Nova', { exact: true }),
    ).toHaveCount(0, { timeout: 15_000 });
    await context.close();
  });

  test('visualizador de imagem (zoom/rotação) e PDF; download funciona', async ({ page }) => {
    const store = await activeStore();
    await submitPrescription(store.slug, [realJpeg(), pdf()]);
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    await page.goto('/admin/receitas');
    await page
      .getByTestId('queue-row')
      .first()
      .getByRole('link', { name: /Abrir receita/ })
      .click();
    await expect(page.getByRole('heading', { name: 'Arquivos' })).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole('button', { name: 'Visualizar' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Arquivo 1 de 2' })).toBeVisible();
    const image = page.getByTestId('viewer-image');
    await expect(image).toBeVisible();
    await page.keyboard.press('+');
    await expect(image).toHaveAttribute('data-zoom', '1.25');
    await page.keyboard.press('r');
    await expect(image).toHaveAttribute('data-rotation', '90');
    await dialog.getByRole('button', { name: 'Aumentar zoom' }).click();
    await expect(image).toHaveAttribute('data-zoom', '1.5');
    await expectNoSeriousA11yViolations(page);

    await page.keyboard.press('PageDown');
    await expect(dialog.getByRole('heading', { name: 'Arquivo 2 de 2' })).toBeVisible();
    await expect(dialog.locator('iframe[title*="PDF"]')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Baixar' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^receita-[0-9a-f]{8}-2\.pdf$/);
    // Espera o download terminar: recarregar antes aborta a navegação do download.
    expect(await download.failure()).toBeNull();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // Histórico registra visualização e download.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Visualizou o arquivo 1/).first()).toBeVisible();
    await expect(page.getByText(/Baixou o arquivo 2/).first()).toBeVisible();
  });

  test('mudança de status refletida em tempo real em outra sessão', async ({ browser }) => {
    const store = await activeStore();
    await submitPrescription(store.slug);
    const collabContext = await browser.newContext();
    const page = await collabContext.newPage();
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    await page.goto('/admin/receitas');
    await page
      .getByTestId('queue-row')
      .first()
      .getByRole('link', { name: /Abrir receita/ })
      .click();
    await expect(page.getByText('Status atual:')).toBeVisible();
    const id = page.url().split('/').pop() ?? '';

    // Outra sessão (gestor) altera o status.
    const managerContext = await browser.newContext();
    const managerPage = await managerContext.newPage();
    const manager = demoManager();
    await loginPage(managerPage, manager.email, manager.password);
    const detail = await managerPage.request.get(`/api/prescriptions/${id}`);
    const { version } = (await detail.json()) as { version: number };
    const me = await managerPage.request.get('/api/auth/me');
    const { csrfToken } = (await me.json()) as { csrfToken: string };
    const patch = await managerPage.request.patch(`/api/prescriptions/${id}/status`, {
      headers: { 'X-CSRF-Token': csrfToken, Origin: 'http://localhost:3000' },
      data: { toStatus: 'IN_REVIEW', version },
    });
    expect(patch.ok()).toBe(true);

    await expect(page.getByText('O status desta receita foi atualizado.').first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('section', { hasText: 'Status atual:' }).getByText('Em análise'),
    ).toBeVisible();
    await collabContext.close();
    await managerContext.close();
  });

  test('navegação por teclado na fila e no detalhe', async ({ page }) => {
    const store = await activeStore();
    await submitPrescription(store.slug);
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    await page.goto('/admin/receitas');
    await expect(page.getByTestId('queue-row').first()).toBeVisible();

    // Pula para o conteúdo e chega ao primeiro "Abrir" só com Tab.
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
    const openLink = page
      .getByTestId('queue-row')
      .first()
      .getByRole('link', { name: /Abrir receita/ });
    for (
      let i = 0;
      i < 60 && !(await openLink.evaluate((el) => el === document.activeElement));
      i += 1
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(openLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: /Receita · Loja/ })).toBeVisible();

    // No detalhe: abre o visualizador pelo teclado e fecha com Esc, devolvendo o foco.
    const viewButton = page.getByRole('button', { name: 'Visualizar' }).first();
    for (
      let i = 0;
      i < 60 && !(await viewButton.evaluate((el) => el === document.activeElement));
      i += 1
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(viewButton).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(viewButton).toBeFocused();

    // Status alterável pelo teclado.
    const select = page.getByLabel('Novo status');
    await select.focus();
    await select.selectOption('IN_REVIEW');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Alterar status' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Status alterado para Em análise.').first()).toBeVisible();
  });
});

test('fila respeita o escopo: colaborador não vê lojas de fora (CA-007 na interface)', async ({
  page,
}) => {
  const { api } = await adminApi();
  const stores = (await (await api.get('/api/admin/stores?pageSize=100')).json()) as {
    items: { storeNumber: string; publicUrl: string; active: boolean }[];
  };
  await api.dispose();
  const other = stores.items.find((s) => s.storeNumber === '103');
  if (other) await submitPrescription(other.publicUrl.split('/l/')[1] ?? '');
  const collaborator = demoCollaborator();
  await loginPage(page, collaborator.email, collaborator.password);
  await page.goto('/admin/receitas');
  await expect(page.getByTestId('queue-row').first()).toBeVisible();
  await expect(page.getByTestId('queue-row').filter({ hasText: '103' })).toHaveCount(0);
});
