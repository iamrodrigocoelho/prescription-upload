import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { activeStore, adminApi, demoCollaborator, loginPage, submitPrescription } from './helpers';

/** Paciente fictício do MockPatientProvider (mock-pat-0001). */
const JOAO_EMAIL = 'joao.teste@example.com';

/** CPF fictício de mock-pat-0001: 100000001 + dígitos verificadores. */
function mockCpf(base = '100000001'): string {
  const digit = (digits: string, factor: number) => {
    const sum = [...digits].reduce((acc, d, i) => acc + Number(d) * (factor - i), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const first = digit(base, 10);
  return `${base}${first}${digit(`${base}${first}`, 11)}`;
}

/** Axe restrito ao diálogo (toasts em animação de entrada geram falso contraste). */
async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Envia uma receita sem CPF e abre a mais recente da fila como colaborador. */
async function openNewPrescription(page: Page): Promise<string> {
  const store = await activeStore();
  await submitPrescription(store.slug);
  const collaborator = demoCollaborator();
  await loginPage(page, collaborator.email, collaborator.password);
  await page.goto('/admin/receitas?identificationStatus=NOT_IDENTIFIED');
  await page.getByTestId('queue-row').first().getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Paciente' })).toBeVisible();
  return page.url().split('/').pop() ?? '';
}

async function searchByEmail(page: Page, email: string) {
  const dialog = page.getByRole('dialog', { name: 'Vincular paciente' });
  await dialog.getByRole('radio', { name: 'E-mail' }).click();
  await dialog.getByLabel('E-mail').fill(email);
  await dialog.getByRole('button', { name: 'Buscar' }).click();
  await expect(dialog.getByTestId('patient-result').first()).toBeVisible();
  return dialog;
}

test('CA-002: envio com CPF é identificado automaticamente (integração ativa)', async ({
  page,
}) => {
  const store = await activeStore();
  await submitPrescription(store.slug, undefined, mockCpf());
  const collaborator = demoCollaborator();
  await loginPage(page, collaborator.email, collaborator.password);
  await page.goto('/admin/receitas?identificationStatus=IDENTIFIED_AUTO_CPF');
  // O worker consome o evento do outbox e consulta o provider (mock) em segundos.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('queue-row').first()).toContainText('João T.', {
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
  await page.getByTestId('queue-row').first().getByRole('link').first().click();
  await expect(page.getByText('Identificado automaticamente por CPF').first()).toBeVisible();
  await expect(page.getByText('Paciente identificado automaticamente pelo CPF')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Vincular paciente' })).toHaveCount(0);
});

test.describe('Vínculo de paciente', () => {
  test('CA-008: busca, seleção, confirmação explícita e feedback', async ({ page }) => {
    await openNewPrescription(page);
    await page.getByRole('button', { name: 'Vincular paciente' }).click();

    const dialog = page.getByRole('dialog', { name: 'Vincular paciente' });
    // Foco gerenciado: o campo de busca recebe o foco ao abrir.
    await expect(dialog.getByLabel('CPF')).toBeFocused();
    await searchByEmail(page, JOAO_EMAIL);
    // Resultado anunciado e exibido só com dados mascarados.
    await expect(dialog.getByRole('status')).toHaveText('1 paciente encontrado.');
    const result = dialog.getByTestId('patient-result');
    await expect(result).toContainText('João T.');
    await expect(result).toContainText(/CPF \*{3}\.\*{3}\.\*{3}-\d{2}/);
    await expect(result).not.toContainText(JOAO_EMAIL);

    // Confirmação exige seleção explícita.
    const confirm = dialog.getByRole('button', { name: 'Confirmar vínculo' });
    await expect(confirm).toBeDisabled();
    await result.getByRole('radio').check();
    await expect(dialog.getByText(/Confirme o vínculo de/)).toBeVisible();
    await expectNoSeriousA11yViolations(page);
    await confirm.click();

    await expect(page.getByText('Paciente vinculado.', { exact: true }).first()).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Identificado manualmente').first()).toBeVisible();
    await expect(page.getByText(/João T\. · CPF/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vincular paciente' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Paciente' })).toBeFocused();
    await expect(page.getByText('Paciente vinculado manualmente')).toBeVisible();
  });

  test('conflito: outro usuário vincula antes da confirmação → aviso e estado atualizado', async ({
    page,
  }) => {
    const id = await openNewPrescription(page);
    await page.getByRole('button', { name: 'Vincular paciente' }).click();
    const dialog = await searchByEmail(page, JOAO_EMAIL);
    await dialog.getByTestId('patient-result').first().getByRole('radio').check();

    // Outro usuário (Admin, via API) vincula a mesma receita.
    const { api, csrf } = await adminApi();
    const search = await api.post('/api/patients/search', {
      headers: { 'X-CSRF-Token': csrf },
      data: { type: 'email', query: 'maria.ficticia@example.com', context: { prescriptionId: id } },
    });
    const { results } = (await search.json()) as { results: { selectionRef: string }[] };
    const linked = await api.post(`/api/prescriptions/${id}/patient-link`, {
      headers: { 'X-CSRF-Token': csrf },
      data: { selectionRef: results[0]?.selectionRef },
    });
    expect(linked.status()).toBe(200);
    await api.dispose();

    await dialog.getByRole('button', { name: 'Confirmar vínculo' }).click();
    await expect(dialog.getByText('Esta receita já tem um paciente vinculado.')).toBeVisible();
    await expect(dialog.getByText(/O vínculo não foi feito/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar' }).last().click();
    await expect(page.getByText(/Maria F\. · CPF/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vincular paciente' })).toHaveCount(0);
  });

  test('busca sem resultados e navegação por teclado no diálogo', async ({ page }) => {
    await openNewPrescription(page);
    const trigger = page.getByRole('button', { name: 'Vincular paciente' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Vincular paciente' });
    await expect(dialog.getByLabel('CPF')).toBeFocused();

    await dialog.getByRole('radio', { name: 'E-mail' }).click();
    await dialog.getByLabel('E-mail').fill('ninguem@example.com');
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('status')).toHaveText('Nenhum paciente encontrado.');
    await expect(dialog.getByText(/Nenhum paciente encontrado\. Confira/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('gerar link personalizado usa a mesma busca: loja → paciente → gerar → copiar', async ({
    page,
  }) => {
    const store = await activeStore();
    const collaborator = demoCollaborator();
    await loginPage(page, collaborator.email, collaborator.password);
    await page.goto('/admin/links/novo');
    await expect(
      page.getByRole('heading', { name: 'Gerar link para envio de receita' }),
    ).toBeVisible();

    const loja = page.getByLabel('Loja');
    if (await loja.isEnabled()) {
      const value = await loja
        .locator('option', { hasText: store.storeNumber })
        .first()
        .getAttribute('value');
      if (value) await loja.selectOption(value);
    }
    await page.getByRole('radio', { name: 'E-mail' }).click();
    await page.getByLabel('E-mail').fill(JOAO_EMAIL);
    await page.getByRole('button', { name: 'Buscar' }).click();
    const result = page.getByTestId('patient-result').first();
    await expect(result).toContainText('João T.');
    await result.getByRole('radio').check();
    await page.getByRole('button', { name: 'Gerar link' }).click();

    await expect(page.getByRole('heading', { name: 'Link gerado' })).toBeVisible();
    await expect(page.getByLabel(/Link \(envie ao paciente/)).toHaveValue(
      /\/p\/[A-Za-z0-9_-]{43}$/,
    );
    await expect(page.getByText(/João T\. · CPF/)).toBeVisible();
  });
});
