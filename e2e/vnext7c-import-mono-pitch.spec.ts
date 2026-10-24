import { expect, test } from '@playwright/test';

/**
 * VNext-7C: a sample drawing through the whole import into the mono-pitch
 * calculation — real pdf.js, the shared solver, no network beyond the
 * app's own static sample file.
 */
test('a sample mono-pitch plan opens the mono-pitch calculation, prefilled', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await importer.getByTestId('document-import-sample-mono-pitch').click();

  const review = importer.getByTestId('document-import-review');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(
    importer.getByTestId('document-import-buildingLength'),
  ).toHaveValue('720');
  await expect(
    importer.getByTestId('document-import-buildingWidth'),
  ).toHaveValue('420');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('12');
  // The rafter section is drawn by the solver while the user reviews.
  await expect(
    importer.locator('[data-testid="document-import-mono-preview"] svg'),
  ).toBeVisible();
  const open = importer.getByTestId('document-import-create');
  await expect(open).toHaveText('Otwórz w kalkulatorze dachu jednospadowego');
  await expect(open).toBeDisabled();
  await importer
    .getByTestId('document-import-roof-type')
    .getByRole('button', { name: 'Potwierdź typ' })
    .click();
  await importer.getByTestId('document-import-reviewed').check();
  await open.click();

  const workspace = page.getByTestId('mono-pitch-workspace');
  await expect(workspace).toBeVisible();
  await expect(importer).toBeHidden();
  await expect(page.getByTestId('mono-pitch-import-note')).toContainText(
    'rzut-dachu-jednospadowy.pdf',
  );
  await expect(page.locator('[id="mono-pitch.runMm"]')).toHaveValue('420');
  await expect(page.getByTestId('mono-pitch-result-rafters')).toContainText(
    '10 szt. · co 80 cm',
  );
  // Datum tags never cover each other.
  const tags = await page
    .locator('[data-testid="mono-pitch-section"] .mono-marker rect')
    .evaluateAll((rects) =>
      rects.map((rect) => rect.getBoundingClientRect().toJSON() as DOMRect),
    );
  expect(tags.length).toBeGreaterThan(2);
  for (const [i, a] of tags.entries())
    for (const b of tags.slice(i + 1))
      expect(
        a.right <= b.left + 0.5 ||
          b.right <= a.left + 0.5 ||
          a.bottom <= b.top + 0.5 ||
          b.bottom <= a.top + 0.5,
      ).toBe(true);

  // Measured on site: the pitch follows from the two plate tops.
  await page.getByTestId('mono-pitch-source-plate-tops').check();
  await page.locator('[id="mono-pitch.lowPlateTopMm"]').fill('250');
  await page.locator('[id="mono-pitch.highPlateTopMm"]').fill('336');
  await expect(page.getByTestId('mono-pitch-derived-pitch')).toContainText('°');
  await expect(page.getByTestId('mono-pitch-result-plates')).toContainText(
    '86 cm',
  );
  await page.screenshot({
    path: testInfo.outputPath('vnext7c-import-mono.png'),
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
