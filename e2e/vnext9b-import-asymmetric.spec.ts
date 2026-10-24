import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-9B: a sample asymmetric-gable plan through the import — both
 * pitches read by their side, a project with K1 and K2, materials and
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

test('a sample asymmetric gable plan becomes a K1 + K2 project', async ({
  page,
}, testInfo) => {
  const { errors, writes } = await offline(page);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await importer.getByTestId('document-import-sample-asymmetric-gable').click();

  const review = importer.getByTestId('document-import-review');
  await expect(review).toBeVisible({ timeout: 20_000 });
  const roofType = importer.getByTestId('document-import-roof-type');
  await expect(
    roofType.getByRole('button', {
      name: 'Dwuspadowy niesymetryczny',
      exact: true,
    }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(roofType).toContainText(
    'W dokumencie: „dwuspadowy niesymetryczny”',
  );
  // Each pitch by its side, as the Creator names them.
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('45');
  await expect(importer.getByTestId('document-import-rightPitch')).toHaveValue(
    '30',
  );
  await expect(review).toContainText('Kąt lewej połaci');
  await expect(review).toContainText('Kąt prawej połaci');
  await expect(importer.getByTestId('project-start-plan')).toBeVisible();
  await roofType.getByRole('button', { name: 'Potwierdź typ' }).click();
  await importer.getByTestId('document-import-reviewed').check();
  await importer.getByTestId('document-import-create').click();
  await expect(importer).toBeHidden();

  await expect(page.locator('.a-project-trigger')).toContainText(
    'Projekt z dokumentu rzut-dachu-dwuspadowy-niesymetryczny',
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
          .map(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).document.project.roof,
          ),
      ),
    )
    .toContainEqual(
      expect.objectContaining({
        type: 'asymmetric-gable',
        buildingLengthMm: 10_000,
        spanMm: 8_000,
        pitchDeg: 45,
        rightPitchDeg: 30,
        eaveOverhangMm: 500,
      }),
    );
  await expect(page.getByTestId('skeleton-drawing').first()).toHaveAttribute(
    'aria-label',
    'Aksonometryczny szkielet niesymetrycznego dachu dwuspadowego',
  );

  await openPerspective(page, 'materials');
  await expect(page.getByTestId('material-plan')).toContainText('K2');
  await openPerspective(page, 'documents');
  await expect(page.getByTestId('document-scope')).toContainText(
    'dach dwuspadowy niesymetryczny liczony przez RoofCalc',
  );
  await page.screenshot({
    path: testInfo.outputPath('vnext9b-import-asymmetric.png'),
    fullPage: true,
  });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
