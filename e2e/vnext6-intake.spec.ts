import { readFileSync } from 'node:fs';
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

/** Imports a PDF from the start dialog and walks the review to a project. */
async function importToProject(page: Page, file: string) {
  const start = await openStart(page);
  await start.locator('input[type="file"]').setInputFiles(resolve(file));
  const importer = page.getByTestId('document-import');
  await expect(importer.getByTestId('document-import-review')).toBeVisible({
    timeout: 20_000,
  });
  const next = importer.getByTestId('document-import-next');
  for (let guard = 0; guard < 8; guard += 1) {
    const step = await next.getAttribute('data-step');
    if (step === 'create') break;
    if (step === 'final-review') {
      await importer.getByTestId('document-import-reviewed').check();
      continue;
    }
    // Keyboard: the next step moves the focus to the exact control, and
    // Enter there decides.
    await next.focus();
    await page.keyboard.press('Enter');
    await expect(next).not.toBeFocused();
    await page.keyboard.press('Enter');
    await expect(next).not.toHaveAttribute('data-step', step ?? '');
  }
  await importer.getByTestId('document-import-create').click();
  await expect(importer).toBeHidden();
}

test('VNext-6.1: imported defaults stay unconfirmed until confirmed explicitly — also after a reload', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // The hip plan states length, width and slope — not eave, spacing, section.
  await importToProject(page, 'fixtures/documents/rzut-dachu-kopertowy.pdf');
  const card = page.getByTestId('project-preparation');
  const defaults = card.getByTestId('project-preparation-defaults');
  await expect(defaults).toHaveAttribute('data-status', 'needs-review');
  for (const key of ['eave', 'spacing', 'rafterWidth', 'rafterDepth'])
    await expect(
      card.getByTestId(`project-preparation-default-${key}`),
    ).toHaveAttribute('data-state', 'needs-review');
  await expect(
    page.locator('[data-testid="project-next-action"]:visible').first(),
  ).toHaveAttribute('data-readiness-action', 'review-import-defaults');

  // Opening the editor is NOT a confirmation (audit P0).
  await card.getByTestId('project-preparation-next').click();
  await expect(card).toHaveAttribute('data-collapsed', 'true');
  await expect(card.getByTestId('project-preparation-next')).toContainText(
    'Potwierdź wartości domyślne',
  );
  // Leave without confirming, then come back after a reload.
  const closeSheet = async () => {
    if (testInfo.project.name === 'mobile')
      await page
        .locator('.a-mobile-sheet-header')
        .getByRole('button', { name: 'Zamknij', exact: true })
        .click();
  };
  await closeSheet();
  await card
    .getByRole('button', { name: 'Zamknij przygotowanie projektu' })
    .click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await page.locator('[data-mode="builder"]').click();
  // The last project reopens directly, or from the start dialog's list.
  const start = page.getByTestId('project-start-assistant');
  await expect(card.or(start)).toBeVisible();
  if (await start.isVisible())
    await start
      .locator('.a-start-recent-list')
      .first()
      .getByRole('button')
      .first()
      .click();
  await expect(card).toHaveAttribute('data-collapsed', 'true');
  await expect(
    page.locator('[data-testid="project-next-action"]:visible').first(),
  ).toHaveAttribute('data-readiness-action', 'review-import-defaults');

  // "Pokaż w edytorze" puts the cursor in the exact numeric input.
  await card.getByTestId('project-preparation-expand').click();
  await card
    .getByTestId('project-preparation-default-spacing')
    .getByRole('button')
    .click();
  const spacing = page.locator('[id="template.rafterSpacingMm"]');
  await expect(spacing).toBeFocused();
  await spacing.fill('90');
  await spacing.press('Enter');
  // On a phone the inspector is a sheet over the card: close it first.
  await closeSheet();
  await card.getByTestId('project-preparation-expand').click();
  await expect(
    card.getByTestId('project-preparation-default-spacing'),
  ).toHaveAttribute('data-state', 'changed');

  // The explicit confirmation settles exactly the values shown.
  await card.getByTestId('project-preparation-confirm-defaults').click();
  await expect(defaults).toHaveAttribute('data-status', 'reviewed');
  await expect(
    card.getByTestId('project-preparation-structure'),
  ).toHaveAttribute('data-state', 'done');
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`vnext61-review-${testInfo.project.name}.png`),
  });

  // Undo brings the spacing back to the unconfirmed default: the
  // confirmation was for 90 cm's absence, so 80 cm needs a look again.
  await page
    .getByRole('button', { name: 'Cofnij zmianę' })
    .locator('visible=true')
    .first()
    .click();
  await expect(
    card.getByTestId('project-preparation-default-spacing'),
  ).toHaveAttribute('data-state', 'needs-review');
  // Redo restores 90 cm — the user's own value, not a default any more.
  await page
    .getByRole('button', { name: 'Ponów zmianę' })
    .locator('visible=true')
    .first()
    .click();
  await expect(
    card.getByTestId('project-preparation-default-spacing'),
  ).toHaveAttribute('data-state', 'changed');
  await expect(defaults).toHaveAttribute('data-status', 'reviewed');

  // The exported project file is the canonical document only: where the
  // values came from and what was confirmed stays a browser sidecar.
  await page.locator('.a-project-trigger').click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Eksportuj' }).click();
  const text = readFileSync((await (await download).path())!, 'utf8');
  const record = JSON.parse(text);
  expect(record.document.schemaVersion).toBe(1);
  expect(record.document.project.roof.rafterSpacing.spacingMm).toBe(900);
  expect(text).not.toMatch(
    /importEvidence|fingerprint|confirmedAt|startValues/,
  );
  expect(errors).toEqual([]);
});

test('VNext-6.1: the same import path on a 1366×768 laptop', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'laptop viewport only');
  await page.setViewportSize({ width: 1366, height: 768 });
  await importToProject(page, 'fixtures/documents/projekt-domu-4-strony.pdf');
  const card = page.getByTestId('project-preparation');
  await expect(card).toBeVisible();
  // The card's next step stays reachable without scrolling the page.
  const next = card.getByTestId('project-preparation-next');
  await expect(next).toBeInViewport();
  expect(await noHorizontalOverflow(page)).toBe(true);
  // Documents are one click away and say what they rest on.
  await card
    .getByTestId('project-preparation-documents')
    .getByRole('button')
    .click();
  await expect(page.getByTestId('document-scope')).toContainText(
    'geometria dachu zamknięta i sprawdzona',
  );
  await page.screenshot({
    path: testInfo.outputPath('vnext61-laptop-documents.png'),
  });
});
