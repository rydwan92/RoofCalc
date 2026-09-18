import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

/**
 * V50 roof-tile purchase planning in a real browser. Offline on purpose: the
 * project carries its catalogue snapshot (technical spec + variant packaging),
 * so the plan, the covering evidence and the estimate need no API.
 */
async function openTileProject(page: Page, withWindow = false) {
  const record = JSON.parse(
    readFileSync(
      'fixtures/projects/05-gable-roof-tile.cieslacalc.json',
      'utf8',
    ),
  ) as ProjectRecordV1;
  const v35 = JSON.parse(
    readFileSync(
      'apps/api/src/data/import-batches/tiles-2026-09-v35.json',
      'utf8',
    ),
  ) as CatalogImportBatchV1;
  const v50 = JSON.parse(
    readFileSync(
      'apps/api/src/data/import-batches/tiles-commercial-2026-09-v50.json',
      'utf8',
    ),
  ) as CatalogImportBatchV1;
  const revision = v35.revisions.find(
    (item) => item.productId === 'product:swissporton:simpla',
  )!;
  const variant = v50.variants.find(
    (item) => item.productId === 'product:swissporton:simpla',
  )!;
  if (revision.technicalSpec.kind !== 'roof-tile') throw Error('Tile seed');
  record.id = 'v50-tile-purchase';
  record.name = 'V50 · plan zakupu dachówki';
  record.document.project.coverings[0]!.product = {
    technicalSpecSnapshot: revision.technicalSpec,
    catalogRef: {
      productId: revision.productId,
      technicalRevisionId: revision.id,
      variantId: variant.id,
    },
    displaySnapshot: {
      manufacturer: 'swissporTON',
      familyName: 'SIMPLA',
      variantName: variant.name,
      revisionCode: revision.revisionCode,
    },
    commercialSnapshot: { packaging: variant.metadata!.packaging },
  };
  record.document.project.buildUp.battenLayout!.gaugeMm = 350;
  if (withWindow)
    record.document.project.features = [
      {
        id: 'feature:roof-window-1',
        kind: 'roof-window',
        roofPlaneId: 'roof-plane:left',
        widthMm: 780,
        heightMm: 1180,
        position: { uMm: 2130, vMm: 1500 },
        clearanceMm: 0,
      },
    ];
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

test('V50 tile purchase plan: reserve, packaging, overage and no page overflow', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTileProject(page);
  const panel = page.getByTestId('tile-purchase-panel');
  await expect(panel).toContainText('Plan zakupu nie jest przygotowany');
  await page.getByTestId('tile-purchase-prepare').click();
  await expect(page.getByTestId('tile-purchase-status')).toHaveText(
    /KONSERWATYWNY|DOKŁADNY/,
  );
  const physical = Number(
    (await page.getByTestId('tile-purchase-physical').innerText()).replace(
      /\D/g,
      '',
    ),
  );
  expect(physical).toBeGreaterThan(0);
  await expect(page.getByTestId('tile-purchase-reserve')).toHaveText('+0 szt.');
  await page.getByTestId('tile-reserve-5').click();
  const reserve = Math.ceil((physical * 500) / 10_000);
  await expect(page.getByTestId('tile-purchase-reserve')).toContainText(
    `+${reserve}`,
  );
  // A custom pack that does not divide the requirement shows the overage.
  await page.getByTestId('tile-sale-unit-custom').click();
  await page.getByTestId('tile-custom-pack').fill('1000');
  await page.getByTestId('tile-custom-pack').blur();
  await expect(page.getByTestId('tile-purchase-overage')).toContainText(
    'Nadwyżka handlowa',
  );
  // The catalogue minipack comes from the variant snapshot.
  await page.getByTestId('tile-sale-unit-pack').click();
  await expect(page.getByTestId('tile-purchase-to-buy')).toContainText(
    '× 4 szt.',
  );
  // The declared consumption is now a collapsed cross-check, not the headline.
  await expect(
    page.getByTestId('material-quantity-tileBase'),
  ).not.toContainText('–');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test('V50 number ↔ roof: cut positions highlight and a tile explains itself', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openTileProject(page, true);
  await page.getByTestId('tile-purchase-prepare').click();
  await page.getByTestId('tile-purchase-cut').click();
  await expect(page.getByTestId('covering-tile-demand-buy')).toBeVisible();
  const highlight = page.getByTestId('covering-tile-highlight');
  await expect(highlight).toBeVisible();
  expect(Number(await highlight.getAttribute('data-count'))).toBeGreaterThan(0);
  await page
    .locator(
      '[data-tile-class="cut-opening"], [data-tile-class="split-by-opening"]',
    )
    .first()
    .click({ force: true });
  const inspector = page.getByTestId('tile-inspector');
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId('tile-inspector-class')).toContainText('otwor');
  await expect(page.getByTestId('tile-inspector-contribution')).toContainText(
    'rezerwuje',
  );
  // Cost prices the purchase quantity once; no duplicate consumption line.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  const suggestions = page.locator('.cw-suggestions');
  await expect(suggestions).toContainText('Dachówka podstawowa — plan zakupu');
  await expect(suggestions).not.toContainText('wg zużycia producenta');
  expect(errors).toEqual([]);
});
