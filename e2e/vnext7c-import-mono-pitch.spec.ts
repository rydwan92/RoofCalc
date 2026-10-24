import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-7C / VNext-8 (ADR-016): a sample drawing through the whole
 * application — import, a mono-pitch project, the workbench, materials and
 * documents. Real pdf.js, the shared solver, nothing sent anywhere.
 */
async function offline(page: Page) {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  return { errors, writes };
}

const openPerspective = (page: Page, perspective: string) =>
  page.locator(`[data-perspective="${perspective}"]:visible`).first().click();

test('a sample mono-pitch plan becomes a mono-pitch project across the app', async ({
  page,
}, testInfo) => {
  const { errors, writes } = await offline(page);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await importer.getByTestId('document-import-sample-mono-pitch').click();

  const review = importer.getByTestId('document-import-review');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(
    importer.getByTestId('document-import-buildingWidth'),
  ).toHaveValue('420');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('12');
  // The plan and the rafter section come from the project's own resolver.
  await expect(importer.getByTestId('project-start-plan')).toBeVisible();
  await expect(
    importer.locator('[data-testid="document-import-mono-preview"] svg'),
  ).toBeVisible();
  const create = importer.getByTestId('document-import-create');
  await expect(create).toHaveText('Utwórz projekt RoofCalc');
  await expect(create).toBeDisabled();
  await importer
    .getByTestId('document-import-roof-type')
    .getByRole('button', { name: 'Potwierdź typ' })
    .click();
  await importer.getByTestId('document-import-reviewed').check();
  await create.click();
  await expect(importer).toBeHidden();

  // A saved project whose roof is the mono-pitch family.
  await expect(page.locator('.a-project-trigger')).toContainText(
    'Projekt z dokumentu rzut-dachu-jednospadowy',
  );
  const roofs = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map(
        (key) => JSON.parse(localStorage.getItem(key)!).document.project.roof,
      ),
  );
  expect(roofs).toContainEqual(
    expect.objectContaining({
      type: 'mono-pitch',
      buildingLengthMm: 7_200,
      runMm: 4_200,
      pitchDeg: 12,
      eaveOverhangMm: 400,
    }),
  );
  await expect(page.getByTestId('skeleton-drawing').first()).toHaveAttribute(
    'aria-label',
    'Aksonometryczny szkielet dachu jednospadowego',
  );

  // Materials and documents read the same project.
  await openPerspective(page, 'materials');
  await expect(page.getByTestId('material-plan')).toBeVisible();
  await expect(page.getByTestId('material-plan')).toContainText('K1');
  await openPerspective(page, 'documents');
  await expect(page.getByTestId('document-scope')).toContainText(
    'dach jednospadowy liczony przez RoofCalc',
  );
  await page.screenshot({
    path: testInfo.outputPath('vnext8-mono-project-documents.png'),
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('the mono-pitch calculator takes the pitch from measured plate tops', async ({
  page,
}) => {
  const { errors } = await offline(page);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-mono-pitch').click();
  await expect(page.getByTestId('mono-pitch-workspace')).toBeVisible();
  await page.getByTestId('mono-pitch-source-plate-tops').check();
  await page.locator('[id="mono-pitch.lowPlateTopMm"]').fill('250');
  await page.locator('[id="mono-pitch.highPlateTopMm"]').fill('336');
  await expect(page.getByTestId('mono-pitch-derived-pitch')).toContainText('°');
  await expect(page.getByTestId('mono-pitch-result-plates')).toContainText(
    '86 cm',
  );
  // Datum tags in the section never cover each other.
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
  expect(errors).toEqual([]);
});

test('the mono-pitch calculator becomes a project with one button', async ({
  page,
}) => {
  const { errors, writes } = await offline(page);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-mono-pitch').click();
  await page.locator('[id="mono-pitch.runMm"]').fill('450');
  await page.getByTestId('mono-pitch-create-project').click();
  await expect(page.getByTestId('mono-pitch-workspace')).toBeHidden();
  await expect(page.locator('.a-project-trigger')).toContainText(
    'Dach jednospadowy',
  );
  const projects = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!).document.project),
  );
  expect(projects).toContainEqual(
    expect.objectContaining({
      roof: expect.objectContaining({ type: 'mono-pitch', runMm: 4500 }),
      buildUp: expect.objectContaining({
        battenLayout: expect.objectContaining({ enabled: true }),
      }),
    }),
  );
  await expect(page.getByTestId('skeleton-drawing').first()).toHaveAttribute(
    'aria-label',
    'Aksonometryczny szkielet dachu jednospadowego',
  );
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
