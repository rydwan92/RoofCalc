import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';
import { technicalPreview } from '../packages/catalog-core/src/index';

/**
 * V49 — stock-aware planning with real catalogue battens, in a real browser.
 *
 * Every product and price served here is read from the committed import
 * batches (`timber-linear-stock-2026-09.json`,
 * `timber-linear-prices-2026-09-18.json`) and the KODA tile batch, so the
 * browser sees exactly what a seeded database would return.
 */

const read = <T>(name: string) =>
  JSON.parse(
    readFileSync(`apps/api/src/data/import-batches/${name}`, 'utf8'),
  ) as T;
const tiles = read<CatalogImportBatchV1>('tiles-2026-09-v35.json');
const timber = read<CatalogImportBatchV1>('timber-linear-stock-2026-09.json');
const prices = read<{
  priceLists: { id: string; ownerLabel: string; currencyCode: string }[];
  entries: { commercialVariantId: string; priceListId: string }[];
}>('timber-linear-prices-2026-09-18.json');

const koda = tiles.revisions.find(
  (item) => item.productId === 'product:swissporton:koda',
)!;
const kodaProduct = tiles.products.find((item) => item.id === koda.productId)!;
const kodaMaker = tiles.manufacturers.find(
  (item) => item.id === kodaProduct.manufacturerId,
)!;

function timberSummary(productId: string) {
  const product = timber.products.find((item) => item.id === productId)!;
  const revision = timber.revisions.find(
    (item) => item.productId === productId,
  )!;
  const maker = timber.manufacturers.find(
    (item) => item.id === product.manufacturerId,
  )!;
  return {
    id: product.id,
    manufacturer: { id: maker.id, name: maker.name },
    name: product.name,
    kind: 'timber-stock',
    currentRevisionId: revision.id,
    variantCount: 1,
    technicalPreview: JSON.parse(
      JSON.stringify(technicalPreview(revision.technicalSpec)),
    ),
  };
}

async function stub(page: Page, options: { timberDown?: boolean } = {}) {
  await page.route('**/api/pricing/**', (route) => {
    const ids = new URL(route.request().url()).searchParams
      .get('ids')!
      .split(',');
    return route.fulfill({
      json: {
        items: prices.entries
          .filter((entry) => ids.includes(entry.commercialVariantId))
          .map((entry) => {
            const list = prices.priceLists.find(
              (item) => item.id === entry.priceListId,
            )!;
            return {
              variantId: entry.commercialVariantId,
              entry,
              currencyCode: list.currencyCode,
              ownerLabel: list.ownerLabel,
            };
          }),
      },
    });
  });
  await page.route('**/api/catalog/**', (route) => {
    const url = new URL(route.request().url());
    const path = decodeURIComponent(url.pathname);
    const kind = url.searchParams.get('kind');
    if (path.endsWith('/manufacturers'))
      return route.fulfill({
        json: { items: [{ ...kodaMaker, active: true }] },
      });
    if (path.endsWith('/products')) {
      if (kind === 'timber-stock')
        return options.timberDown
          ? route.fulfill({
              status: 503,
              json: { error: { code: 'catalog-unavailable' } },
            })
          : route.fulfill({
              json: {
                items: timber.products.map((item) => timberSummary(item.id)),
              },
            });
      return route.fulfill({
        json: {
          items:
            kind === 'roof-tile'
              ? [
                  {
                    id: kodaProduct.id,
                    manufacturer: { id: kodaMaker.id, name: kodaMaker.name },
                    name: kodaProduct.name,
                    kind: 'roof-tile',
                    currentRevisionId: koda.id,
                    variantCount: 0,
                    technicalPreview: {},
                  },
                ]
              : [],
        },
      });
    }
    if (path.includes('/revisions/'))
      return route.fulfill({
        json: {
          item: {
            manufacturer: { ...kodaMaker, active: true },
            product: { ...kodaProduct, active: true },
            revision: {
              id: koda.id,
              productId: koda.productId,
              revisionCode: koda.revisionCode,
              technicalSpec: koda.technicalSpec,
            },
          },
        },
      });
    const productId = path.split('/products/')[1];
    const timberProduct = timber.products.find((item) => item.id === productId);
    if (timberProduct) {
      const revision = timber.revisions.find(
        (item) => item.productId === productId,
      )!;
      const maker = timber.manufacturers.find(
        (item) => item.id === timberProduct.manufacturerId,
      )!;
      return route.fulfill({
        json: {
          item: {
            manufacturer: maker,
            product: timberProduct,
            currentRevision: revision,
            variants: timber.variants.filter(
              (item) => item.productId === productId,
            ),
          },
        },
      });
    }
    return route.fulfill({
      json: {
        item: {
          manufacturer: { ...kodaMaker, active: true },
          product: { ...kodaProduct, active: true },
          currentRevision: {
            id: koda.id,
            productId: koda.productId,
            revisionCode: koda.revisionCode,
            technicalSpec: koda.technicalSpec,
          },
          variants: [],
        },
      },
    });
  });
}

async function openPerspective(page: Page, perspective: string) {
  await page
    .locator(`[data-perspective="${perspective}"]:visible`)
    .first()
    .click();
}

async function gableWithTile(page: Page, options?: { timberDown?: boolean }) {
  await stub(page, options);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-advanced').click();
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
  await openPerspective(page, 'materials');
  await page.getByTestId('linear-purchase-batten-start').click();
}

test.describe('V49 — stock-aware planning and catalogue battens', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1440) < 768,
    'Desktop flows.',
  );

  test('A: catalogue battens → plan with product identity → piece pricing', async ({
    page,
  }) => {
    await gableWithTile(page);
    await page.getByTestId('linear-purchase-batten-source-catalogue').click();
    const items = page.getByTestId('linear-purchase-batten-catalogue-item');
    // Declared battens in the project's 60×40 section only: two Castorama
    // lengths and the BAT 4 m. The 25×50 garden timber is never offered.
    await expect(items).toHaveCount(3);
    await page
      .locator(
        '[data-testid="linear-purchase-batten-catalogue-item"][data-product="product:timber:bat-lata-40x60x4000"]',
      )
      // Controlled: it checks once the product detail (its variant) loads.
      .click();

    const plan = page.getByTestId('linear-purchase-batten-plan');
    await expect(plan).toBeVisible();
    await expect(
      page.getByTestId('linear-purchase-batten-breakdown'),
    ).toContainText('Tarcica iglasta, łata konstrukcyjna');
    await expect(
      page.getByTestId('linear-purchase-batten-breakdown'),
    ).toContainText(/katalog/i);
    await expect(page.getByTestId('material-identity-battens')).toContainText(
      /katalog/i,
    );
    // A planned row is priced per piece in the estimate, never per metre here.
    await expect(
      page.getByTestId('material-piece-pricing-battens'),
    ).toBeVisible();
  });

  test('B + F: manual lengths, and changing them recomputes the plan', async ({
    page,
  }) => {
    await gableWithTile(page);
    const plan = page.getByTestId('linear-purchase-batten-plan');
    await expect(plan).toBeVisible();
    const before = await page
      .getByTestId('linear-purchase-batten-breakdown')
      .innerText();
    // A custom length is added in metres and becomes a real option…
    await page.getByTestId('linear-purchase-batten-add-length').fill('4,8');
    await page.getByTestId('linear-purchase-batten-add-length-button').click();
    await expect(
      page.locator('.lp-lengths label', { hasText: '4,8 m' }).locator('input'),
    ).toBeChecked();
    // …and removing the length the plan relies on recomputes it.
    await page
      .locator('.lp-lengths label', { hasText: /^4 m$/ })
      .locator('input')
      .uncheck();
    await expect
      .poll(() =>
        page.getByTestId('linear-purchase-batten-breakdown').innerText(),
      )
      .not.toBe(before);
    // Plan quality is stated in plain language, never as "optymalny".
    await expect(
      page.getByTestId('linear-purchase-batten-plan-status'),
    ).toContainText(/plan (gotowy|znaleziony)/i);
    await expect(plan).not.toContainText(/optymalny/i);
  });

  test('E: catalogue unavailable keeps manual planning fully usable', async ({
    page,
  }) => {
    await gableWithTile(page, { timberDown: true });
    await page.getByTestId('linear-purchase-batten-source-catalogue').click();
    await expect(
      page.getByTestId('linear-purchase-batten-catalogue-unavailable'),
    ).toContainText('możesz podać długości ręcznie');
    await page.getByTestId('linear-purchase-batten-source-manual').click();
    await expect(page.getByTestId('linear-purchase-batten-plan')).toBeVisible();
  });
});
