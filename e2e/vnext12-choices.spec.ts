import { expect, test } from '@playwright/test';

/**
 * VNext-12: choosing well. The start screen names three ways in; the
 * Creator's preview follows the step (plan, then cross-section) and every
 * structural option says what it means; the covering families say what the
 * program calculates; the catalogue puts what suits this roof first.
 * Offline: the API answers 503 and the built-in catalogue is used.
 */
test('the start screen, the Creator preview and the catalogue help the choice', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/');
  const start = page.getByTestId('project-start-assistant');

  // Three named ways in; the examples are one click away.
  await expect(start.locator('.a-start-group > h3')).toHaveText([
    'Zacznij projekt',
    'Z pliku lub rysunku',
    'Szybkie obliczenie — bez projektu',
  ]);
  await expect(start.getByTestId('project-start-examples')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('vnext12-start.png'),
    fullPage: true,
  });

  // The building step shows the plan; the geometry step the cross-section.
  await start.getByTestId('project-start-guided').click();
  await expect(start.getByTestId('project-start-plan')).toBeVisible();
  await start.getByTestId('project-start-next').click();
  const section = start.getByTestId('project-start-section');
  await expect(section).toBeVisible();
  await expect(section.locator('text')).toContainText(['35°', '35°']);
  await start.locator('[data-project-start-field="pitch"]').fill('42');
  await expect(section.locator('text').first()).toHaveText('42°');
  // The user can still look at the plan on this step.
  await start.locator('[data-preview-view="plan"]').click();
  await expect(start.getByTestId('project-start-plan')).toBeVisible();
  await start.locator('[data-preview-view="section"]').click();

  // Structure: each option says what it means, the section shows the tie.
  await start.getByTestId('project-start-next').click();
  const tie = start.locator(
    '[data-choice="structure"] [data-choice-value="rafter-collar-tie"]',
  );
  await expect(tie).toContainText('Jętki są w zestawieniu materiałów');
  await tie.click();
  await expect(section.locator('.kind-collar-tie').first()).toBeVisible();
  await expect(
    start.locator(
      '[data-choice="ridge-connection"] [data-choice-value="ridge-board"]',
    ),
  ).toContainText('deskę kalenicową');
  await page.screenshot({
    path: testInfo.outputPath('vnext12-creator.png'),
    fullPage: true,
  });
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-submit').click();
  await expect(start).toBeHidden();

  // Covering: each family says what it is and what is calculated.
  await page.locator('[data-perspective="covering"]:visible').first().click();
  const tile = page.locator('[data-covering-family="roof-tile"]');
  await expect(tile).toContainText('układana rzędami na łatach');
  await expect(tile).toContainText('Liczy: rzędy i pozycje krycia');
  await tile.click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();
  await page.getByRole('button', { name: /wbudowanego katalogu/ }).click();
  const filter = page.getByTestId('catalog-fit-filter');
  await expect(filter).toContainText('Pasujące do kąta dachu 42°');
  await filter.click();
  await expect(filter).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator('.a-catalog-card[data-fit="too-flat"]'),
  ).toHaveCount(0);
  await expect(page.locator('.a-catalog-card').first()).toHaveAttribute(
    'data-fit',
    'fits',
  );
  expect(errors).toEqual([]);
});
