import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

/**
 * V51 drainage in a real browser. Offline on purpose: a manual gutter system
 * must work without the catalogue or the database.
 */
async function openProject(page: Page, fixture: string, id: string) {
  const record = JSON.parse(
    readFileSync(`fixtures/projects/${fixture}`, 'utf8'),
  ) as ProjectRecordV1;
  record.id = id;
  record.name = `V51 · ${id}`;
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.addInitScript((project) => {
    localStorage.setItem(
      'cieslacalc.projects.v1.record.' + project.id,
      JSON.stringify(project),
    );
    localStorage.setItem(
      'cieslacalc.projects.v1.index',
      JSON.stringify({
        schemaVersion: 1,
        projects: [
          {
            id: project.id,
            name: project.name,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          },
        ],
      }),
    );
    localStorage.setItem('cieslacalc.activeProject.v1', project.id);
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  }, record);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.locator('[data-perspective="materials"]:visible').first().click();
  await expect(page.getByTestId('material-plan')).toBeVisible();
}

async function useManualSystem(
  page: Page,
  values: { name: string; gutters: string; pipes: string; hook?: string },
) {
  const picker = page.getByTestId('drainage-system-picker');
  await expect(picker).toBeVisible();
  await page.getByTestId('drainage-manual-name').fill(values.name);
  await page.getByTestId('drainage-manual-gutters').fill(values.gutters);
  await page.getByTestId('drainage-manual-pipes').fill(values.pipes);
  if (values.hook)
    await page.getByTestId('drainage-manual-hook').fill(values.hook);
  await page.getByTestId('drainage-manual-clamp').fill('180');
  await page.getByTestId('drainage-manual-apply').click();
  await expect(page.getByTestId('drainage-system-name')).toHaveText(
    values.name,
  );
}

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

test('V51 hip: add gutters → system → proposed layout → outlets → BOM → cost → material list', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openProject(
    page,
    '09-hip-catalogue-snapshot.cieslacalc.json',
    'v51-hip',
  );
  // Not configured: one compact row, no zero-value drainage rows.
  await expect(page.getByTestId('drainage-not-configured')).toBeVisible();
  await expect(
    page.locator('[data-testid^="material-row-drainage."]'),
  ).toHaveCount(0);
  await page.getByTestId('material-add-gutters').click();
  await expect(page.getByTestId('drainage-workspace')).toBeVisible();
  await expect(page.getByTestId('drainage-limitation')).toContainText(
    'nie został jeszcze zweryfikowany hydraulicznie',
  );
  await useManualSystem(page, {
    name: 'System testowy 125/90',
    gutters: '3; 4',
    pipes: '3',
    hook: '60',
  });
  await expect(page.getByTestId('drainage-mode')).toHaveText(
    'PROPONOWANY UKŁAD',
  );
  // Every canonical eave is guttered; corners come from the roof.
  for (const ordinal of [1, 2, 3, 4])
    await expect(page.getByTestId(`drainage-eave-${ordinal}`)).toHaveAttribute(
      'data-guttered',
      'true',
    );
  await expect(page.getByTestId('drainage-proposed-outlet')).toHaveCount(2);
  await page.getByTestId('drainage-confirm-proposed').click();
  await expect(page.getByTestId('drainage-outlet')).toHaveCount(2);
  // Enter both downpipe heights and confirm elbows, eave by eave.
  for (const ordinal of [1, 2, 3, 4]) {
    await page.getByTestId(`drainage-eave-open-${ordinal}`).click();
    const editors = page.getByTestId('drainage-outlet-editor');
    for (let index = 0; index < (await editors.count()); index += 1) {
      const editor = editors.nth(index);
      await editor.getByTestId('drainage-downpipe-height').fill('540');
      await editor.getByTestId('drainage-downpipe-height').press('Enter');
      await editor.getByTestId('drainage-elbows-2').click();
      await expect(editor.getByTestId('drainage-pipe-plan')).toContainText(
        '3 m + 3 m',
      );
    }
    await page.getByRole('button', { name: '← Cały układ' }).click();
  }
  const bom = page.getByTestId('drainage-bom');
  await expect(bom).toContainText('Narożnik zewnętrzny');
  await expect(bom).not.toContainText('Zaślepka');
  await expect(bom).not.toContainText('WYMAGA USTALENIA');
  await expect(bom).toContainText('Rura spustowa 3 m');
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('v51-drainage-hip.png'),
    fullPage: true,
  });
  // Material Plan shows the drainage group with commercial rows.
  await page.locator('[data-materials-view="plan"]:visible').first().click();
  await expect(page.getByTestId('drainage-configured')).toContainText(
    'System testowy 125/90',
  );
  await expect(
    page.locator('[data-testid="material-row-drainage.gutter-hook"]'),
  ).toBeVisible();
  await expect(page.getByTestId('roof-system-summary')).toContainText(
    'Odwodnienie',
  );
  // Cost: drainage rows are ordinary piece suggestions.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  await expect(page.locator('main')).toContainText('Hak rynnowy');
  await expect(page.locator('main')).toContainText('Rura spustowa 3 m');
  // Material list document states the same BOM.
  await page.locator('[data-perspective="documents"]:visible').first().click();
  await page.getByTestId('document-preview-materials').click();
  const list = page.locator('[data-material-category="drainage"]');
  await expect(list).toContainText('Odwodnienie');
  await expect(list).toContainText('Łącznik rynny');
  expect(errors).toEqual([]);
});

test('V51 gable manual: one guttered eave, custom length, manual price, one outlet', async ({
  page,
}) => {
  await openProject(page, '05-gable-roof-tile.cieslacalc.json', 'v51-gable');
  await page.getByTestId('material-add-gutters').click();
  await useManualSystem(page, {
    name: 'Rynna własna',
    gutters: '3,5',
    pipes: '3',
    hook: '50',
  });
  // Switch O2 off: the layout becomes manual and O2 creates no material.
  await page.getByTestId('drainage-eave-check-2').click();
  await expect(page.getByTestId('drainage-mode')).toHaveText('RĘCZNIE');
  await expect(page.getByTestId('drainage-eave-2')).toHaveAttribute(
    'data-guttered',
    'false',
  );
  await page.getByTestId('drainage-eave-open-1').click();
  await page.getByTestId('drainage-add-outlet').click();
  const editor = page.getByTestId('drainage-outlet-editor');
  await editor.getByTestId('drainage-downpipe-height').fill('290');
  await editor.getByTestId('drainage-downpipe-height').press('Enter');
  await editor.getByTestId('drainage-elbows-2').click();
  await page.getByRole('button', { name: '← Cały układ' }).click();
  const bom = page.getByTestId('drainage-bom');
  await expect(bom).toContainText('Rynna 3,5 m');
  await expect(bom).toContainText('Zaślepka rynny');
  await expect(bom).toContainText('2 szt.');
  await expect(bom).not.toContainText('Narożnik');
  await expect(bom).toContainText('Rura spustowa 3 m');
  // One eave, not two: the end cap row counts exactly one run.
  const endCaps = bom.locator('li', { hasText: 'Zaślepka rynny' });
  await expect(endCaps).toContainText('2 szt.');
  // Manual price on the gutter row, accepted into the estimate.
  await page.locator('[data-materials-view="plan"]:visible').first().click();
  const gutter = page.locator(
    '[data-testid="material-row-drainage.gutter-section"]',
  );
  await gutter.getByRole('combobox').selectOption('manual');
  await gutter.getByRole('textbox').fill('42,00');
  await gutter.getByRole('textbox').blur();
  await gutter.getByRole('button', { name: 'Dodaj do kosztorysu' }).click();
  await expect(
    gutter.getByRole('button', { name: 'Dodaj do kosztorysu' }),
  ).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('V51 catalogue system: Galeco STAL2 from the seed batch, hooks at the source spacing', async ({
  page,
}) => {
  const batch = JSON.parse(
    readFileSync(
      'apps/api/src/data/import-batches/drainage-galeco-stal2-2026-09-v51.json',
      'utf8',
    ),
  ) as CatalogImportBatchV1;
  const manufacturer = batch.manufacturers[0]!;
  const detail = (productId: string) => {
    const product = batch.products.find((item) => item.id === productId)!;
    const revision = batch.revisions.find(
      (item) => item.productId === productId,
    )!;
    return { manufacturer, product, currentRevision: revision, variants: [] };
  };
  await openProject(page, '01-basic-gable.cieslacalc.json', 'v51-catalogue');
  // Registered after the offline route, so these win for catalogue calls.
  await page.route('**/api/catalog/products?*', (route) =>
    route.fulfill({
      json: {
        items: batch.products.map((product) => {
          const spec = batch.revisions.find(
            (item) => item.productId === product.id,
          )!.technicalSpec;
          if (spec.kind !== 'roof-drainage-component') throw Error('kind');
          return {
            id: product.id,
            manufacturer: { id: manufacturer.id, name: manufacturer.name },
            name: product.name,
            kind: product.coveringKind,
            currentRevisionId: `revision:${product.id}`,
            variantCount: 0,
            technicalPreview: {
              drainageSystemKey: spec.systemKey,
              drainageRole: spec.role,
              nominalSystemSize: spec.nominalSystemSize,
              ...(spec.lengthMm ? { lengthMm: spec.lengthMm } : {}),
              ...(spec.maxSpacingMm ? { maxSpacingMm: spec.maxSpacingMm } : {}),
              ...(spec.hand ? { hand: spec.hand } : {}),
            },
          };
        }),
      },
    }),
  );
  await page.route('**/api/catalog/products/*', (route) =>
    route.fulfill({
      json: {
        item: detail(
          decodeURIComponent(new URL(route.request().url()).pathname)
            .split('/')
            .at(-1)!,
        ),
      },
    }),
  );
  await page.getByTestId('material-add-gutters').click();
  await page.getByTestId('drainage-system-galeco-stal2-125-80').click();
  await expect(page.getByTestId('drainage-system-name')).toContainText(
    'Galeco',
  );
  await expect(page.getByTestId('drainage-hooks')).toContainText('60 cm');
  const bom = page.getByTestId('drainage-bom');
  // Source-stated left/right end caps: one of each per open run.
  await expect(bom).toContainText('Zaślepka rynny lewa');
  await expect(bom).toContainText('Zaślepka rynny prawa');
  await expect(bom).toContainText('Rynna 4 m');
  await noHorizontalOverflow(page);
});
