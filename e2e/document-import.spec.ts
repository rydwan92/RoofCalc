import { expect, test } from '@playwright/test';
import {
  createRoofPlanPdf,
  gableRoofPlanSpec,
} from '../fixtures/documents/roof-plan-pdf';

/**
 * VNext document import, end to end in a real browser with the real pdf.js
 * worker: PDF with written dimensions → recognition → review → one new
 * project through the ordinary project-start path. Nothing is uploaded.
 */
test('imports a PDF roof plan, reviews it and creates one project', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') requests.push(request.url());
  });
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('/');
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await expect(importer).toBeVisible();
  await importer.getByTestId('document-import-file').setInputFiles({
    name: 'rzut-dachu-dwuspadowy.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(createRoofPlanPdf(gableRoofPlanSpec())),
  });
  const review = importer.getByTestId('document-import-review');
  await expect(review).toBeVisible({ timeout: 20_000 });

  // Every value carries its unit, its source and a certainty level.
  await expect(
    importer.getByTestId('document-import-buildingLength'),
  ).toHaveValue('1240');
  await expect(
    importer.getByTestId('document-import-buildingWidth'),
  ).toHaveValue('960');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('35');
  await expect(review).toContainText('Długość budynku');
  await expect(review).toContainText('str. 1');
  // The recognised values are highlighted on the rendered page.
  await expect(
    importer.locator('[data-testid="document-import-overlay"] rect'),
  ).not.toHaveCount(0);

  // The detected roof type must be confirmed before anything is created.
  const create = importer.getByTestId('document-import-create');
  await expect(create).toBeDisabled();
  await expect(importer.getByTestId('document-import-blockers')).toContainText(
    'typ dachu',
  );
  await importer
    .getByTestId('document-import-roof-type')
    .getByRole('button', { name: 'Potwierdź typ' })
    .click();
  await importer.getByTestId('document-import-reviewed').check();
  await expect(create).toBeEnabled();

  // A user edit revokes the final review.
  await importer.getByTestId('document-import-eave').fill('60');
  await expect(
    importer.getByTestId('document-import-reviewed'),
  ).not.toBeChecked();
  await importer.getByTestId('document-import-reviewed').check();
  await create.click();

  await expect(importer).toBeHidden();
  await expect(page.locator('.a-project-trigger')).toContainText(
    'Projekt z dokumentu rzut-dachu-dwuspadowy',
  );
  const records = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map((key) => JSON.parse(localStorage.getItem(key)!)),
  );
  expect(records).toHaveLength(1);
  expect(records[0].document.project.roof).toMatchObject({
    type: 'gable',
    buildingLengthMm: 12_400,
    halfRunMm: 4_800,
    pitchDeg: 35,
    eaveOverhangMm: 600,
    rafterSpacing: { spacingMm: 900 },
    rafterSection: { widthMm: 80, depthMm: 180 },
  });
  // No document data reaches the project or any server.
  expect(JSON.stringify(records[0])).not.toContain('rzut-dachu-dwuspadowy.pdf');
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('rejects a file that only pretends to be a PDF', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('project-start-document').click();
  const importer = page.getByTestId('document-import');
  await importer.getByTestId('document-import-file').setInputFiles({
    name: 'rzut.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('MZ this is not a document'),
  });
  await expect(importer.getByRole('alert')).toContainText(
    'nie jest obsługiwany dokument',
  );
  await expect(importer.getByTestId('document-import-review')).toHaveCount(0);
});
