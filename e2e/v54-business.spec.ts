import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * V54 Business mode, end to end in a real browser.
 *
 * The business API is stubbed the way every other spec here stubs the
 * catalogue: hermetic, no database, and the *shape* of the contract is already
 * guaranteed by the Zod schemas the client parses with. What these tests prove
 * is the behaviour that only a real browser can show — that the salesperson
 * path defaults to the company assortment, that a product outside it never
 * disturbs the roof, and that Standard mode is untouched.
 */

const ORGANIZATION = {
  id: 'org:demo',
  slug: 'demo-hurtownia',
  name: 'DEMO Hurtownia',
  currencyCode: 'PLN',
  active: true,
};

const KODA_VARIANT = 'variant:swissporton:koda:antracytowa-angoba';

const TILE_SPEC = {
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 304,
  physicalLengthMm: 503,
  installationModes: [
    {
      id: 'standard',
      name: 'Standardowy',
      coverWidthMm: 260,
      gaugeRangeMm: { min: 390, max: 430 },
      minPitchDeg: 10,
      coursePattern: 'aligned',
    },
  ],
};

const MANUFACTURER = {
  id: 'manufacturer:swissporton',
  slug: 'swissporton',
  name: 'swissporTON',
  active: true,
};
const PRODUCT = {
  id: 'product:swissporton:koda',
  manufacturerId: MANUFACTURER.id,
  slug: 'koda',
  name: 'KODA',
  coveringKind: 'roof-tile',
  active: true,
};
const REVISION = {
  id: 'revision:koda:2026-09',
  productId: PRODUCT.id,
  revisionCode: '2026-09',
  technicalSpec: TILE_SPEC,
};
const VARIANT = {
  id: KODA_VARIANT,
  productId: PRODUCT.id,
  name: 'Antracytowa angoba',
  active: true,
};

const PRICE = {
  priceListId: 'price-list:demo',
  priceListLabel: 'DEMO Hurtownia — cennik testowy',
  entryId: 'entry:1',
  netAmountMinor: 482,
  currencyCode: 'PLN',
  saleUnit: 'piece',
  validFrom: '2026-09-01',
};

function assortmentRow(overrides: Record<string, unknown> = {}) {
  return {
    item: {
      id: 'oai:1',
      organizationId: ORGANIZATION.id,
      commercialVariantId: KODA_VARIANT,
      externalKey: 'DACH-00384',
      sourceName: 'Dachówka KODA antracytowa angoba',
      active: true,
      preferred: true,
    },
    state: 'matched',
    catalog: {
      productId: PRODUCT.id,
      productName: 'KODA',
      manufacturerId: MANUFACTURER.id,
      manufacturerName: 'swissporTON',
      kind: 'roof-tile',
      currentRevisionId: REVISION.id,
      variantId: KODA_VARIANT,
      variantName: 'Antracytowa angoba',
    },
    price: PRICE,
    ...overrides,
  };
}

const UNMATCHED_ROW = {
  item: {
    id: 'oai:2',
    organizationId: ORGANIZATION.id,
    externalKey: 'MEM-00901',
    sourceName: 'Membrana dachowa 150 g/m2',
    active: true,
    preferred: false,
  },
  state: 'unmatched',
};

/** Which variants the stubbed wholesaler sells. Empty = sells nothing. */
async function stubBusinessApi(
  page: Page,
  options: { sells?: string[]; unavailable?: boolean } = {},
) {
  const sells = options.sells ?? [KODA_VARIANT];
  await page.route('**/api/business/**', async (route: Route) => {
    if (options.unavailable) {
      await route.fulfill({
        status: 503,
        json: { error: { code: 'business-unavailable' } },
      });
      return;
    }
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/organizations')) {
      await route.fulfill({ json: { items: [ORGANIZATION] } });
      return;
    }
    if (url.pathname.endsWith('/assortment')) {
      const items = [
        ...(sells.includes(KODA_VARIANT) ? [assortmentRow()] : []),
        ...(url.searchParams.get('kind') ? [] : [UNMATCHED_ROW]),
      ];
      await route.fulfill({
        json: {
          organization: ORGANIZATION,
          items,
          summary: {
            total: items.length,
            matched: items.filter((row) => row.state === 'matched').length,
            unmatched: items.filter((row) => row.state === 'unmatched').length,
            inactive: 0,
            withoutPrice: 0,
          },
        },
      });
      return;
    }
    if (url.pathname.endsWith('/prices')) {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean);
      await route.fulfill({
        json: {
          organizationId: ORGANIZATION.id,
          items: ids.map((commercialVariantId) =>
            sells.includes(commercialVariantId)
              ? {
                  commercialVariantId,
                  externalKey: 'DACH-00384',
                  price: PRICE,
                }
              : { commercialVariantId, missing: 'not-in-assortment' },
          ),
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: { code: 'not-found' } } });
  });
}

async function stubCatalogApi(page: Page) {
  await page.route('**/api/catalog/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/manufacturers')) {
      await route.fulfill({ json: { items: [MANUFACTURER] } });
      return;
    }
    if (url.pathname.includes('/revisions/')) {
      await route.fulfill({
        json: {
          item: {
            manufacturer: MANUFACTURER,
            product: PRODUCT,
            revision: REVISION,
          },
        },
      });
      return;
    }
    if (url.pathname.includes('/products/')) {
      await route.fulfill({
        json: {
          item: {
            manufacturer: MANUFACTURER,
            product: PRODUCT,
            currentRevision: REVISION,
            variants: [VARIANT],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { items: [] } });
  });
  await page.route('**/api/pricing/**', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
}

async function openBuilder(page: Page, mode: 'standard' | 'business') {
  await page.addInitScript((value) => {
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
    if (value === 'business')
      localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    else localStorage.removeItem('cieslacalc.businessMode.v1');
  }, mode);
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
}

/** Project → Pokrycie → Dachówka → Wybierz z katalogu. */
async function openCoveringPicker(page: Page) {
  await page.locator('[data-perspective="project"]').click();
  await page.locator('[data-task="covering"]').click();
  await page.getByRole('button', { name: /Dachówka/ }).first().click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();
}

test.describe('V54 business mode', () => {
  test.beforeEach(async ({ page }) => {
    await stubCatalogApi(page);
  });

  /** §61: the salesperson path. */
  test('the picker defaults to the company assortment and applies a product', async ({
    page,
  }) => {
    await stubBusinessApi(page);
    await openBuilder(page, 'business');

    await expect(page.getByTestId('business-header')).toBeVisible();
    await openCoveringPicker(page);

    const picker = page.getByTestId('business-picker');
    await expect(picker).toBeVisible();
    await expect(
      page.locator('.bz-picker-tabs button[aria-selected="true"]'),
    ).toHaveText(/Asortyment firmy/);

    const row = page.getByTestId('business-picker-row').first();
    // §16: the wholesaler's own code, not only a RoofCalc ID.
    await expect(row).toContainText('DACH-00384');
    await expect(row).toContainText(/Cena: dostępna/);
    await row.getByRole('button', { name: /Użyj produktu/ }).click();

    // The technical engine still produced the layout: a business pick is a
    // normal catalogue pick with a wholesaler's code attached (§71).
    await expect(page.getByTestId('covering-product-card')).toContainText(
      'KODA',
    );
    await expect(page.getByTestId('covering-product-card')).toContainText(
      '26 cm',
    );
  });

  test('the full technical catalogue stays reachable from the picker', async ({
    page,
  }) => {
    await stubBusinessApi(page);
    await openBuilder(page, 'business');
    await openCoveringPicker(page);
    await page.locator('.bz-picker-tabs button[data-tab="catalog"]').click();
    await expect(page.getByTestId('catalog-results')).toBeVisible();
  });

  /** §62: a product the wholesaler does not sell never invalidates the roof. */
  test('a product outside the assortment keeps the roof technically valid', async ({
    page,
  }) => {
    await stubBusinessApi(page);
    await openBuilder(page, 'business');
    await openCoveringPicker(page);
    await page
      .getByTestId('business-picker-row')
      .first()
      .getByRole('button', { name: /Użyj produktu/ })
      .click();
    await expect(page.getByTestId('covering-product-card')).toBeVisible();

    await page.locator('[data-perspective="materials"]').click();
    const quantitiesBefore = await page
      .locator('[data-testid^="material-quantity-"]')
      .allInnerTexts();
    expect(quantitiesBefore.length).toBeGreaterThan(0);

    // The wholesaler stops selling it; everything technical must be unchanged.
    await stubBusinessApi(page, { sells: [] });
    await page.reload();
    await page.locator('[data-mode="builder"]').click();
    await page.locator('[data-perspective="materials"]').click();

    await expect(page.getByTestId('material-commercial')).toContainText(
      /Brak w asortymencie/,
    );
    expect(
      await page.locator('[data-testid^="material-quantity-"]').allInnerTexts(),
    ).toEqual(quantitiesBefore);

    // §17/§18: an explicit choice, never an automatic substitution.
    await page.locator('[data-perspective="project"]').click();
    await page.locator('[data-task="covering"]').click();
    const notice = page.getByTestId('outside-assortment');
    await expect(notice).toContainText(/Obliczenia techniczne pozostają ważne/);
    await expect(notice.getByTestId('outside-find-replacement')).toBeVisible();
    await expect(notice.getByTestId('outside-keep')).toBeVisible();
  });

  /** §66: a business outage degrades the business surfaces only. */
  test('company data being unavailable never breaks the roof', async ({
    page,
  }) => {
    await stubBusinessApi(page, { unavailable: true });
    await openBuilder(page, 'business');
    await expect(page.getByTestId('business-header-offline')).toContainText(
      /chwilowo niedostępne/,
    );
    await openCoveringPicker(page);
    await expect(page.getByTestId('business-picker')).toContainText(
      /chwilowo niedostępne/,
    );
    // The catalogue route is still offered, so work can continue.
    await page
      .getByRole('button', { name: /Przeglądaj cały katalog techniczny/ })
      .click();
    await expect(page.getByTestId('catalog-results')).toBeVisible();
  });

  /** §19/§37: the Admin MVP, reachable but secondary. */
  test('admin assortment lists rows, counts and the unmatched filter', async ({
    page,
  }) => {
    await stubBusinessApi(page);
    await openBuilder(page, 'business');
    await page.getByTestId('business-admin-entry').click();

    await expect(page.getByTestId('admin-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-row')).toHaveCount(2);
    await page.getByRole('tab', { name: 'Niepowiązane' }).click();
    await expect(page.getByTestId('admin-row')).toHaveCount(2);

    await page.getByTestId('admin-row').nth(1).click();
    const detail = page.getByTestId('assortment-detail');
    await expect(detail).toContainText('MEM-00901');
    await expect(detail).toContainText(
      /nie może być użyta jako materiał techniczny/,
    );
  });
});

/** §65: with Business mode off, nothing about the workbench changed. */
test.describe('V54 standard-mode regression', () => {
  test('shows no business surface and issues no business request', async ({
    page,
  }) => {
    await stubCatalogApi(page);
    const businessCalls: string[] = [];
    await page.route('**/api/business/**', async (route) => {
      businessCalls.push(route.request().url());
      await route.fulfill({ status: 503, json: { error: { code: 'x' } } });
    });
    await openBuilder(page, 'standard');

    await expect(page.getByTestId('business-header')).toHaveCount(0);
    await expect(page.getByTestId('business-admin-entry')).toHaveCount(0);

    await openCoveringPicker(page);
    // No tabs at all: the picker is exactly its pre-V54 self.
    await expect(page.locator('.bz-picker-tabs')).toHaveCount(0);
    await expect(page.getByTestId('catalog-results')).toBeVisible();
    expect(businessCalls).toEqual([]);
  });
});
