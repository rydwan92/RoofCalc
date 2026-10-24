import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-10 (ADR-017): a project of several roof structures — a house and a
 * garage. The workbench edits one structure at a time; the project is saved
 * as one record and reopens with every structure. Offline.
 */
async function storedRecords(page: Page) {
  return page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
}

test('a house and a garage in one project, switched, renamed, reopened and removed', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.locator('.a-start-secondary > summary').click();
  await page.getByTestId('project-start-advanced').click();
  // A project of one roof shows no structure bar.
  await expect(page.getByTestId('structure-bar')).toHaveCount(0);

  // Add a garage: the Creator in its structure mode.
  await page.getByRole('button', { name: 'Projekty', exact: true }).click();
  await page.getByTestId('project-add-structure').click();
  const creator = page.getByTestId('project-start-assistant');
  await expect(creator).toContainText('Nowa bryła projektu');
  await creator
    .locator('[data-choice="roof-type"] [data-choice-value="mono-pitch"]')
    .click();
  await creator
    .locator('[data-project-start-field="buildingLength"]')
    .fill('600');
  await creator
    .locator('[data-project-start-field="buildingWidth"]')
    .fill('400');
  for (let step = 0; step < 3; step += 1)
    await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-submit').click();
  await expect(creator).toBeHidden();

  const bar = page.getByTestId('structure-bar');
  const chips = bar.locator('.a-structure-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText('Budynek główny');
  await expect(chips.nth(1)).toContainText('Bryła 2');
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('skeleton-drawing').first()).toHaveAttribute(
    'aria-label',
    'Aksonometryczny szkielet dachu jednospadowego',
  );

  // Name it and place it with exact values.
  await bar.getByTestId('structure-settings').click();
  const panel = bar.getByTestId('structure-panel');
  await panel.locator('[data-structure-field="name"]').fill('Garaż');
  await panel.locator('[data-structure-field="x"]').fill('1500');
  await panel.locator('[data-structure-field="rotation"]').fill('90');
  await panel.getByRole('button', { name: 'Zapisz' }).click();
  await expect(panel).toBeHidden();
  await expect(chips.nth(1)).toContainText('Garaż');

  // The perspective stays when the structure changes.
  await page.locator('[data-perspective="materials"]:visible').first().click();
  await chips.nth(0).click();
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('material-plan')).toBeVisible();
  await expect(bar).toContainText('pokazują teraz bryłę „Budynek główny”');

  // VNext-10B: each structure has its own estimate; the whole project's sits
  // above it, and a row opens that structure's estimate.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  const pricing = page.getByTestId('project-pricing');
  const rows = pricing.locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');
  await expect(rows.nth(1)).toContainText('Garaż');
  await expect(rows.nth(1)).toContainText('Brak kosztorysu');
  await rows.nth(1).getByRole('button', { name: 'Garaż' }).click();
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  const addReady = page.getByTestId('cost-add-ready');
  if (await addReady.isVisible()) {
    await addReady.click();
    await expect(rows.nth(1)).not.toContainText('Brak kosztorysu');
  }
  await page.screenshot({
    path: testInfo.outputPath('vnext10b-pricing.png'),
    fullPage: true,
  });
  await chips.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute('aria-current', 'true');

  const records = await storedRecords(page);
  const project = records.find((record) => record.schemaVersion === 2);
  expect(
    project.document.structures.map(
      (structure: { name: string; project: { roof: { type: string } } }) => [
        structure.name,
        structure.project.roof.type,
      ],
    ),
  ).toEqual([
    ['Budynek główny', 'gable'],
    ['Garaż', 'mono-pitch'],
  ]);
  expect(
    project.document.structures[1].transform.rotationAboutVerticalDeg,
  ).toBe(90);

  // A reload opens the project on its first structure, with both listed.
  await page.reload();
  await page.locator('[data-mode="builder"]').click();
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({
    path: testInfo.outputPath('vnext10-structures.png'),
    fullPage: true,
  });

  // Removing the garage makes it a project of one roof again (V1).
  await chips.nth(1).click();
  await bar.getByTestId('structure-settings').click();
  await bar.getByTestId('structure-remove').click();
  await bar.getByTestId('structure-remove-confirm').click();
  await expect(page.getByTestId('structure-bar')).toHaveCount(0);
  await expect
    .poll(async () =>
      (await storedRecords(page)).map((record) => record.schemaVersion),
    )
    .not.toContain(2);
  expect(errors).toEqual([]);
});
