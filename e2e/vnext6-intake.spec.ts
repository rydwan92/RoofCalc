import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-6 intelligent project intake, end to end in a real browser with
 * the real pdf.js worker. One supported multi-page design goes
 * "Otwórz plik… → Sprawdź → Utwórz projekt → Przygotowanie projektu →
 * the next editor"; an L-shaped DXF is recognised and honestly refused.
 * Offline on purpose: nothing leaves the device.
 */

async function openStart(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await expect(start.getByTestId('project-start-drop-hint')).toBeVisible();
  return start;
}

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );

test('a four-page design PDF: page roles, one next step, preparation card, next editor', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const uploads: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') uploads.push(request.url());
  });
  const start = await openStart(page);
  // The universal entry: the bytes decide that this is a PDF.
  await start
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/documents/projekt-domu-4-strony.pdf'));
  const importer = page.getByTestId('document-import');
  await expect(importer.getByTestId('document-import-review')).toBeVisible({
    timeout: 20_000,
  });

  // Page roles from the sheet titles; the importer opens on the roof plan.
  const pages = importer.getByTestId('document-import-pages');
  await expect(pages.locator('li')).toHaveCount(4);
  await expect(importer.getByTestId('document-import-page-2')).toHaveAttribute(
    'data-role',
    'roof-plan',
  );
  await expect(importer.getByTestId('document-import-page-3')).toHaveAttribute(
    'data-role',
    'section',
  );
  await expect(importer.getByTestId('document-import-page-4')).toHaveAttribute(
    'data-role',
    'schedule',
  );
  await expect(importer.getByTestId('document-import-page')).toHaveText(
    'Strona 2 z 4',
  );

  // The schedule quotes another length: the import asks, it never chooses.
  const next = importer.getByTestId('document-import-next');
  await expect(next).toHaveAttribute('data-step', 'resolve-conflict');
  await expect(importer.getByTestId('document-import-settled')).toHaveText(
    'Rozpoznano 6 z 8',
  );
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`vnext6-import-${testInfo.project.name}.png`),
  });

  // Set the schedule aside: the plan's value stands, with its page.
  await importer.getByTestId('document-import-page-4').click();
  await importer.getByTestId('document-import-page-skip').click();
  await expect(next).toHaveAttribute('data-step', 'confirm-roof-type');
  await expect(
    importer.getByTestId('document-import-buildingLength'),
  ).toHaveValue('1240');
  await expect(importer.getByTestId('document-import-pitch')).toHaveValue('40');

  // One next step at a time: it takes the user to the exact control.
  await next.click();
  await expect(
    importer.getByTestId('document-import-roof-type').locator('.dimp-confirm'),
  ).toBeFocused();
  await importer
    .getByTestId('document-import-roof-type')
    .locator('.dimp-confirm')
    .click();
  await expect(next).toHaveAttribute('data-step', 'final-review');
  await next.click();
  await expect(importer.getByTestId('document-import-reviewed')).toBeFocused();
  await importer.getByTestId('document-import-reviewed').check();
  await expect(next).toHaveAttribute('data-step', 'create');
  // A fast double click on "create" still makes exactly one project.
  await importer.getByTestId('document-import-create').dblclick();
  await expect(importer).toBeHidden();

  // The preparation card: what the document gave and ONE next step.
  const card = page.getByTestId('project-preparation');
  await expect(card).toBeVisible();
  await expect(card.getByTestId('project-preparation-intake')).toContainText(
    'Z dokumentu',
  );
  await expect(card.getByTestId('project-preparation-intake')).toContainText(
    '1 pominięta',
  );
  await expect(
    card.getByTestId('project-preparation-structure'),
  ).toHaveAttribute('data-state', 'done');
  await expect(
    card.getByTestId('project-preparation-covering'),
  ).toHaveAttribute('data-state', 'check');
  await expect(
    card.getByTestId('project-preparation-document-execution'),
  ).toHaveAttribute('data-state', 'ready');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(
      `vnext6-preparation-${testInfo.project.name}.png`,
    ),
  });
  const records = await page.evaluate(
    () =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('cieslacalc.projects.v1.record.'),
      ).length,
  );
  expect(records).toBe(1);

  // The next step opens the existing covering editor; the card stays as a pill.
  await card.getByTestId('project-preparation-next').click();
  await expect(card).toHaveAttribute('data-collapsed', 'true');
  await expect(page.getByText('Dodaj pokrycie').first()).toBeVisible();
  // Escape-free return: the pill expands the same card again.
  await card.getByTestId('project-preparation-expand').click();
  await expect(card.getByTestId('project-preparation-structure')).toBeVisible();
  await card.getByTestId('project-preparation-close').click();
  await expect(card).toHaveCount(0);

  expect(uploads).toEqual([]);
  expect(errors).toEqual([]);
});

test('an L-shaped DXF is recognised, split into its parts and not calculated', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const start = await openStart(page);
  await start
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/cad/l-shape-12x8-wing-6x6.dxf'));
  const panel = page.getByTestId('cad-compound-outline');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('w kształcie litery L');
  await expect(page.getByTestId('cad-compound-wings')).toContainText(
    '12 m × 8 m',
  );
  await expect(page.getByTestId('cad-compound-limit')).toContainText(
    'nie liczy jeszcze dachów złożonych',
  );
  await expect(page.getByTestId('cad-create')).toHaveCount(0);
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`vnext6-l-shape-${testInfo.project.name}.png`),
  });
  expect(errors).toEqual([]);
});
