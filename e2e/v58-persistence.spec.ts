import { expect, test, type Page } from '@playwright/test';

const enabled = !!process.env.ROOFCALC_BUSINESS_E2E;
test.skip(
  !enabled,
  'Requires an explicitly configured disposable SQL workspace.',
);

async function signIn(page: Page) {
  await page
    .getByTestId('business-mode-toggle')
    .locator('select')
    .selectOption('business');
  const login = page.getByTestId('business-login');
  await login.getByLabel('E-mail').fill(process.env.ROOFCALC_USER_EMAIL!);
  await login.getByLabel('Hasło').fill(process.env.ROOFCALC_USER_PASSWORD!);
  await login.getByRole('button', { name: 'Zaloguj', exact: true }).click();
  await expect(page.getByTestId('business-home')).toBeVisible();
}
const perspective = async (page: Page, name: string) => {
  await page.locator(`[data-perspective="${name}"]:visible`).first().click();
};

test('V58 SQL sales workflow survives reload, detects stale writes and preserves the technical roof on logout', async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1'),
  );
  await page.goto('/#/calculators/common-rafter');
  await expect(
    page.getByRole('textbox', { name: 'Kąt połaci', exact: true }),
  ).toHaveValue('35');
  await signIn(page);
  await expect(page.getByTestId('business-admin-entry')).toHaveCount(0);
  const home = page.getByTestId('business-home');
  if (info.project.name === 'desktop') {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await page.setViewportSize(viewport);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/v58-home-${viewport.width}.png`,
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await home.getByTestId('business-new-estimation').click();
  await home
    .getByRole('button', { name: '+ Nowy klient', exact: true })
    .click();
  const name = `Dom V58 ${info.project.name} ${Date.now()}`;
  await home.getByLabel(/Klient — nazwa lub firma/).fill('Jan Kowalski');
  await home.getByLabel('Nazwa inwestycji').fill(name);
  await home.getByLabel(/Lokalizacja/).fill('Świdnica');
  const createdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/estimations') &&
      response.request().method() === 'POST',
  );
  await home.getByRole('button', { name: 'Utwórz wycenę' }).click();
  const response = await createdResponse;
  expect(response.status()).toBe(201);
  const created = (await response.json()).item;
  const creator = page.getByTestId('project-start-assistant');
  await creator.getByTestId('project-start-guided').click();
  await creator.locator('[data-choice-value="gable"]').click();
  await creator
    .locator('[data-project-start-field="buildingLength"]')
    .fill('1000');
  await creator
    .locator('[data-project-start-field="buildingWidth"]')
    .fill('800');
  await creator.getByTestId('project-start-next').click();
  await creator.locator('[data-project-start-field="pitch"]').fill('38');
  await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-submit').click();
  await expect(creator).toBeHidden();
  await expect(page.getByTestId('business-save-status')).toHaveText('Zapisano');
  await perspective(page, 'project');
  await page.locator('[data-task="covering"]:visible').first().click();
  await page
    .getByRole('button', { name: /Dachówka/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();
  const row = page
    .getByTestId('business-picker-row')
    .filter({ hasText: 'KODA' })
    .first();
  await row.getByRole('button', { name: /Sprawdź i wybierz/ }).click();
  await page
    .getByTestId('business-product-detail')
    .getByRole('button', { name: /Użyj produktu/ })
    .click();
  await expect(page.getByTestId('covering-product-card')).toContainText('KODA');
  await perspective(page, 'materials');
  const materials = page.getByTestId('material-plan');
  await expect(materials).toContainText(/Łaty/);
  await materials.getByTestId('tile-purchase-prepare').click();
  await perspective(page, 'costing');
  const suggestion = page
    .locator('.cw-suggestions li')
    .filter({ hasText: 'KODA' })
    .first();
  await suggestion.getByRole('button', { name: 'Dodaj', exact: true }).click();
  await page.getByTestId('cost-prepare-quote').click();
  const quote = page.getByTestId('quote-workspace');
  await expect(quote).toContainText(name);
  const tileLine = quote
    .getByTestId('quote-line')
    .filter({ hasText: 'KODA' })
    .first();
  await tileLine.getByLabel(/Cena netto/).fill('4,65');
  await tileLine.getByLabel(/Cena netto/).blur();
  await quote.getByLabel('Notatki / warunki').fill('Odbiór w hurtowni.');
  await expect(quote.getByTestId('quote-save-status')).toHaveText('Zapisano');
  await expect(quote).toContainText(/OF\/\d{4}\/\d{6}/);
  await page.reload();
  await expect(quote).toBeVisible();
  await expect(quote.getByLabel('Notatki / warunki')).toHaveValue(
    'Odbiór w hurtowni.',
  );
  await expect(tileLine.getByLabel(/Cena netto/)).toHaveValue('4,65');
  await quote.getByRole('button', { name: 'Podgląd dla klienta' }).click();
  await expect(quote.locator('.bz-no-preview:visible')).toHaveCount(0);
  await page.screenshot({
    path: `test-results/v58-quote-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await quote.getByRole('button', { name: 'Wróć do wyceny' }).click();
  const prefix = `/api/business/organizations/${encodeURIComponent(created.estimation.organizationId)}/estimations/${created.estimation.id}`;
  const detail = (await (await page.request.get(prefix)).json()).item;
  const origin = new URL(page.url()).origin;
  const save = await page.request.patch(prefix, {
    headers: { Origin: origin },
    data: {
      version: detail.estimation.version,
      project: { ...detail.project, name: 'Changed in another tab' },
    },
  });
  expect(save.status()).toBe(200);
  await perspective(page, 'project');
  await page.locator('[data-task="construction"]:visible').first().click();
  if (info.project.name === 'desktop') {
    const pitch = page.getByLabel('Kąt połaci', { exact: true }).first();
    await pitch.fill('42');
    await pitch.blur();
    await expect(page.getByTestId('business-save-status')).toContainText(
      'zmieniona w innym miejscu',
    );
    await expect(
      page.getByRole('button', { name: 'Pobierz moją kopię JSON' }),
    ).toBeVisible();
    page.once('dialog', (dialog) => dialog.accept());
    await page
      .getByRole('button', { name: 'Wczytaj wersję z serwera' })
      .click();
    await expect(page.getByTestId('business-save-status')).toHaveText(
      'Zapisano',
    );
  }
  if (await quote.isVisible())
    await quote.getByRole('button', { name: 'Wróć do wyceny' }).click();
  await page.getByRole('button', { name: /Wyloguj/ }).click();
  await expect(page.getByTestId('business-login')).toBeVisible();
  await page
    .getByTestId('business-login')
    .getByRole('button', { name: 'Standard', exact: true })
    .click();
  await expect(page.getByTestId('business-login')).toBeHidden();
  await expect(
    page.locator('[data-perspective="project"]:visible').first(),
  ).toBeVisible();
});

test('V58 rejects invalid credentials and restores an authenticated session after refresh', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await page
    .getByTestId('business-mode-toggle')
    .locator('select')
    .selectOption('business');
  const login = page.getByTestId('business-login');
  await login.getByLabel('E-mail').fill('invalid@example.test');
  await login.getByLabel('Hasło').fill('invalid-password-for-test');
  await login.getByRole('button', { name: 'Zaloguj', exact: true }).click();
  await expect(login.getByRole('alert')).toHaveText(
    'Nieprawidłowy e-mail lub hasło.',
  );
  await signIn(page);
  await page.reload();
  await expect(page.getByTestId('business-home')).toBeVisible();
});
