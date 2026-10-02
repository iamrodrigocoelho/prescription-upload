import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { adminApi, demoCollaborator, demoManager, loginPage, submitPrescription } from './helpers';

async function slugOf(storeNumber: string): Promise<string> {
  const { api } = await adminApi();
  const stores = (await (await api.get('/api/admin/stores?pageSize=100')).json()) as {
    items: { storeNumber: string; publicUrl: string }[];
  };
  await api.dispose();
  return stores.items.find((s) => s.storeNumber === storeNumber)?.publicUrl.split('/l/')[1] ?? '';
}

const kpi = (page: Page, label: string) =>
  page.getByRole('group', { name: label }).getByTestId('kpi-value');

async function kpiValue(page: Page, label: string): Promise<number> {
  return Number(await kpi(page, label).textContent());
}

test.describe('Dashboard', () => {
  test('colaborador: indicadores da própria loja, atualizados em tempo real; acessível', async ({
    page,
  }) => {
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    await page.goto('/admin/receitas');
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByText(/horário de Brasília/)).toBeVisible();
    await expect(kpi(page, 'Recebidas hoje')).toBeVisible();
    // Colaborador de uma loja só: sem seletor de loja.
    await expect(page.getByLabel('Loja', { exact: true })).toHaveCount(0);

    const before = await kpiValue(page, 'Recebidas hoje');
    // Envio para a loja 102 (fora do escopo do colaborador) não conta.
    await submitPrescription(await slugOf('102'));
    // Envio para a loja 101 (do colaborador) atualiza sem recarregar a página.
    await submitPrescription(await slugOf('101'));
    await expect(kpi(page, 'Recebidas hoje')).toHaveText(String(before + 1), { timeout: 20_000 });

    // Gráficos com título e valores legíveis sem hover.
    await expect(page.getByRole('heading', { name: 'Volume por dia' })).toBeVisible();
    await expect(page.getByText(/Recebidas: \d+ no período/)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Receitas por status' })).toContainText('Recebida');
    await page.getByText('Ver dados em tabela').click();
    await expect(
      page.getByRole('table', { name: /recebidas e finalizadas por dia/ }),
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });

  test('gestor: consolidado e por loja; filtros de período refletidos na URL', async ({ page }) => {
    const manager = demoManager();
    await loginPage(page, manager.email, manager.password);
    await page.goto('/admin/dashboard');
    await expect(kpi(page, 'Recebidas no período')).toBeVisible();

    const store = page.getByLabel('Loja', { exact: true });
    await expect(store.locator('option')).toHaveText([
      'Todas as lojas do meu acesso',
      /101/,
      /102/,
    ]);
    const consolidated = await kpiValue(page, 'Recebidas no período');
    const value101 = await store.locator('option', { hasText: '101' }).getAttribute('value');
    await store.selectOption(value101 ?? '');
    await expect(page).toHaveURL(/storeId=/);
    await expect
      .poll(() => kpiValue(page, 'Recebidas no período'))
      .toBeLessThanOrEqual(consolidated);

    await page.getByRole('radio', { name: 'Últimos 30 dias' }).click();
    await expect(page).toHaveURL(/period=30d/);
    await expect(page.getByRole('radio', { name: 'Últimos 30 dias' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.getByRole('radio', { name: 'Personalizado' }).click();
    await page.getByLabel('De', { exact: true }).fill('2026-09-01');
    await page.getByLabel('Até', { exact: true }).fill('2026-09-30');
    await page.getByRole('button', { name: 'Aplicar período' }).click();
    await expect(page).toHaveURL(/period=custom&from=2026-09-01&to=2026-09-30/);
    await expect(
      page.getByText('Receitas recebidas de 01/09 a 30/09 (horário de Brasília).'),
    ).toBeVisible();
  });
});
