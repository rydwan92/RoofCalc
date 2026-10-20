import { expect, test } from '@playwright/test';
import { CATALOGUE_DATA_AS_OF } from '../packages/catalog-data/src/index';

/**
 * ADR-013: with the catalogue API down, the user can deliberately switch to
 * the built-in technical catalogue, choose a real product and get the same
 * technical snapshot. Nothing is chosen for them: the default is unchanged
 * (catalogue unavailable + manual path), and the offline source is labelled
 * with its data date the whole time.
 */
test('chooses a tile from the built-in catalogue when the server is down', async ({
  page,
}) => {
  const posted: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') posted.push(request.url());
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await page.locator('.a-start-secondary > summary').click();
  await start.getByTestId('project-start-advanced').click();
  await expect(start).toBeHidden();
  await page.locator('[data-perspective="covering"]:visible').first().click();
  const assistant = page.getByTestId('covering-add-assistant');
  await assistant.locator('[data-covering-family="roof-tile"]').click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();

  // Default unchanged: unavailable, manual path offered, nothing switched.
  const results = page.getByTestId('catalog-results');
  await expect(results).toContainText('Katalog jest obecnie niedostępny.');
  await expect(
    results.getByRole('button', { name: 'Użyj parametrów ręcznych' }),
  ).toBeVisible();

  await results.getByTestId('catalog-use-bundled').click();
  await expect(page.getByTestId('catalog-bundled-notice')).toContainText(
    CATALOGUE_DATA_AS_OF,
  );
  const card = results
    .locator('.a-catalog-card')
    .filter({ hasText: 'BALANCE' });
  await expect(card).toContainText('≥ minimum produktu');
  await card.getByRole('button', { name: 'Szczegóły' }).click();
  await page.locator('.a-catalog-apply').click();

  await expect(page.getByText('swissporTON').first()).toBeVisible();
  await page.waitForTimeout(1500);
  const coverings = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .flatMap(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).document.project.coverings,
      ),
  );
  expect(coverings).toHaveLength(1);
  expect(JSON.stringify(coverings[0])).toContain('BALANCE');
  // Offline means offline: no write, no upload, no third party.
  expect(posted).toEqual([]);
});
