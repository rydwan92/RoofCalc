import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

/**
 * V48 — commercial planning for battens and counter-battens, in a real browser.
 *
 * Catalogue responses are the seeded swissporTON KODA import batch served
 * through the real HTTP client, exactly as the V43B and V47 specs do, so
 * nothing about the product is invented.
 */

const tiles = JSON.parse(
  readFileSync(
    'apps/api/src/data/import-batches/tiles-2026-09-v35.json',
    'utf8',
  ),
) as CatalogImportBatchV1;
const revision = tiles.revisions.find(
  (item) => item.productId === 'product:swissporton:koda',
)!;
const productSeed = tiles.products.find(
  (item) => item.id === revision.productId,
)!;
const manufacturerSeed = tiles.manufacturers.find(
  (item) => item.id === productSeed.manufacturerId,
)!;
const manufacturer = {
  id: manufacturerSeed.id,
  slug: manufacturerSeed.slug,
  name: manufacturerSeed.name,
  active: true,
};
const product = {
  id: productSeed.id,
  manufacturerId: productSeed.manufacturerId,
  slug: productSeed.slug,
  name: productSeed.name,
  coveringKind: 'roof-tile' as const,
  active: true,
};
const currentRevision = {
  id: revision.id,
  productId: revision.productId,
  revisionCode: revision.revisionCode,
  technicalSpec: revision.technicalSpec,
};

async function stubCatalogue(page: Page) {
  await page.route('**/api/catalog/**', (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    if (path.endsWith('/manufacturers'))
      return route.fulfill({ json: { items: [manufacturer] } });
    if (path.endsWith('/products'))
      return route.fulfill({
        json: {
          items:
            url.searchParams.get('kind') === 'roof-tile'
              ? [
                  {
                    id: product.id,
                    manufacturer: {
                      id: manufacturer.id,
                      name: manufacturer.name,
                    },
                    name: product.name,
                    kind: 'roof-tile',
                    currentRevisionId: revision.id,
                    variantCount: 0,
                    technicalPreview: {},
                  },
                ]
              : [],
        },
      });
    if (path.includes('/revisions/'))
      return route.fulfill({
        json: { item: { manufacturer, product, revision: currentRevision } },
      });
    return route.fulfill({
      json: { item: { manufacturer, product, currentRevision, variants: [] } },
    });
  });
}

async function openPerspective(
  page: Page,
  perspective: 'project' | 'materials' | 'documents',
) {
  await page
    .locator(`[data-perspective="${perspective}"]:visible`)
    .first()
    .click();
}

async function startProject(page: Page, hip: boolean) {
  await stubCatalogue(page);
  await page.goto('/#/calculators/common-rafter');
  if (hip) await page.getByRole('button', { name: 'Krokiew narożna' }).click();
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-advanced').click();
}

async function catalogueTile(page: Page) {
  await openPerspective(page, 'project');
  await page.locator('[data-task="covering"]:visible').first().click();
  const assistant = page.getByTestId('covering-add-assistant');
  await assistant.locator('[data-covering-family="roof-tile"]').click();
  await assistant.locator('[data-covering-source="catalogue"]').click();
  await page.locator('.a-catalog-card button').first().click();
  await page.locator('.a-catalog-apply').click();
  await expect(page.getByTestId('covering-installation-block')).toContainText(
    'KODA',
  );
}

test.describe('V48 — commercial planning', () => {
  // Desktop flows; the phone layout is covered by the component tests.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1440) < 768,
    'Desktop flows.',
  );

  test('gable: tile → Auto battens → Materials → purchase plan → cost row', async ({
    page,
  }) => {
    await startProject(page, false);
    await catalogueTile(page);
    await openPerspective(page, 'materials');

    // A geometric length is never presented as a purchase quantity.
    const panel = page.getByTestId('linear-purchase-batten');
    await expect(panel).toHaveAttribute('data-state', 'requirement');
    await expect(panel).toContainText(/wymaganie montażowe/i);
    await expect(page.getByTestId('material-basis-battens')).toContainText(
      /geometria/i,
    );

    await page.getByTestId('linear-purchase-batten-start').click();

    // The plan is real: pieces of commercial lengths, and the row headline
    // becomes the commercial quantity.
    const plan = page.getByTestId('linear-purchase-batten-plan');
    await expect(plan).toBeVisible();
    await expect(plan).toContainText(/plan zakupu/i);
    await expect(plan).toContainText('szt.');
    await expect(page.getByTestId('material-basis-battens')).toContainText(
      /plan zakupu/i,
    );
    await expect(page.getByTestId('material-quantity-battens')).toContainText(
      'szt.',
    );
    // Waste and reusable offcuts stay distinct concepts.
    await expect(plan).toContainText('Odpad');
    await expect(plan).toContainText('Resztki użytkowe');
    await expect(page.getByTestId('linear-cut-patterns')).toBeVisible();

    // The estimate now has a per-piece material line for the commercial length.
    await openPerspective(page, 'materials');
    await expect(page.getByTestId('material-plan')).toContainText(
      /plan zakupu/i,
    );
  });

  test('choosing lengths is one undoable project edit', async ({ page }) => {
    await startProject(page, false);
    await catalogueTile(page);
    await openPerspective(page, 'materials');
    await page.getByTestId('linear-purchase-batten-start').click();
    await expect(page.getByTestId('linear-purchase-batten-plan')).toBeVisible();

    // Canonical project intent: one undoable edit, not transient UI state.
    await page.getByRole('button', { name: 'Cofnij zmianę' }).click();
    await expect(page.getByTestId('linear-purchase-batten')).toHaveAttribute(
      'data-state',
      'requirement',
    );
  });

  test('hip: an undecided H1 detail blocks the counter-batten plan and routes to the fix', async ({
    page,
  }) => {
    await startProject(page, true);
    await catalogueTile(page);
    await page
      .getByTestId('covering-installation-block')
      .getByRole('button', { name: 'Dodaj kontrłaty z konstrukcji' })
      .click();
    await openPerspective(page, 'materials');

    const panel = page.getByTestId('linear-purchase-counter-batten');
    await expect(panel).toHaveAttribute('data-state', 'blocked');
    await expect(panel).toContainText('detal grzbietów H1');

    await page.getByTestId('linear-purchase-counter-batten-fix').click();
    const detail = page.getByTestId('hip-boundary-detail').first();
    await expect(detail).toBeVisible();
    await detail.locator('input[name="hip-boundary-detail"]').first().check();

    // Once decided, the same panel can plan the purchase.
    await openPerspective(page, 'materials');
    await expect(
      page.getByTestId('linear-purchase-counter-batten'),
    ).not.toHaveAttribute('data-state', 'blocked');
    await page.getByTestId('linear-purchase-counter-batten-start').click();
    await expect(
      page.getByTestId('linear-purchase-counter-batten-plan'),
    ).toContainText(/plan zakupu/i);
  });

  test('hip battens: a raking end is never given a guessed length', async ({
    page,
  }) => {
    await startProject(page, true);
    await catalogueTile(page);
    await openPerspective(page, 'materials');
    await page.getByTestId('linear-purchase-batten-start').click();

    // Hip rows end on a rake, so they stay unplanned until an allowance is set.
    const unresolved = page.getByTestId('linear-purchase-batten-unresolved');
    await expect(unresolved).toBeVisible();
    await expect(unresolved).toContainText('naddatek');

    await page.getByTestId('linear-purchase-batten-allowance').fill('50');
    await expect(unresolved).toHaveCount(0);
  });
});
