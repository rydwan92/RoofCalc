import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-10C (ADR-017): one design, two roofs. The import reads a house and
 * a garage under their own headings, each is reviewed on its own, and the
 * result is one project with a structure per roof. Real pdf.js, offline.
 */
async function offline(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  return errors;
}

test('a house-and-garage design becomes one project with two structures', async ({
  page,
}, testInfo) => {
  const errors = await offline(page);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await importer.getByTestId('document-import-sample-house-and-garage').click();
  await expect(importer.getByTestId('document-import-review')).toBeVisible({
    timeout: 20_000,
  });

  const chooser = importer.getByTestId('document-import-structures');
  const structures = chooser.locator('[data-structure-reading]');
  await expect(structures).toHaveCount(2);
  await expect(structures.nth(0)).toContainText('Budynek mieszkalny');
  await expect(structures.nth(1)).toContainText('Garaż');
  const roofType = importer.getByTestId('document-import-roof-type');
  const confirmType = roofType.getByRole('button', { name: 'Potwierdź typ' });

  // The house: its own values, confirmed.
  await expect(structures.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(
    importer.getByTestId('document-import-buildingLength'),
  ).toHaveValue('1200');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('38');
  await confirmType.click();
  await expect(structures.nth(0)).toHaveAttribute('data-state', 'ready');

  // The garage: never the house's numbers.
  await structures.nth(1).click();
  await expect(
    importer.getByTestId('document-import-buildingLength'),
  ).toHaveValue('600');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('10');
  await expect(structures.nth(1)).toHaveAttribute('data-state', 'review');
  await confirmType.click();
  await expect(structures.nth(1)).toHaveAttribute('data-state', 'ready');
  await page.screenshot({
    path: testInfo.outputPath('vnext10c-import-structures.png'),
    fullPage: true,
  });

  await importer.getByTestId('document-import-reviewed').check();
  const create = importer.getByTestId('document-import-create');
  await expect(create).toHaveText('Utwórz projekt RoofCalc z 2 bryłami');
  await create.click();
  await expect(importer).toBeHidden();

  const chips = page.getByTestId('structure-bar').locator('.a-structure-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText('Budynek mieszkalny');
  await expect(chips.nth(1)).toContainText('Garaż');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
          .map((key) => JSON.parse(localStorage.getItem(key)!))
          .filter((record) => record.schemaVersion === 2)
          .map((record) =>
            record.document.structures.map(
              (structure: {
                name: string;
                project: { roof: { type: string; buildingLengthMm: number } };
              }) => [
                structure.name,
                structure.project.roof.type,
                structure.project.roof.buildingLengthMm,
              ],
            ),
          ),
      ),
    )
    .toEqual([
      [
        ['Budynek mieszkalny', 'gable', 12_000],
        ['Garaż', 'mono-pitch', 6_000],
      ],
    ]);
  expect(errors).toEqual([]);
});
