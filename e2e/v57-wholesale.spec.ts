import { expect, test, type Page, type Route } from '@playwright/test';
import { mockBusinessWorkspace } from './business-workspace-fixture';

const ORGANIZATION = {
  id: 'org:v57',
  slug: 'hurtownia-abc',
  name: 'Hurtownia ABC',
  currencyCode: 'PLN',
  active: true,
  taxId: '6790000000',
  address: 'ul. Dekarska 1, Kraków',
};
const VARIANT_ID = 'variant:koda:v57';
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
  id: 'revision:koda:v57',
  productId: PRODUCT.id,
  revisionCode: '2026-09',
  technicalSpec: {
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
        coursePattern: {
          layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
          battenRowOffsetCycle: [0],
        },
      },
    ],
  },
};
const VARIANT = {
  id: VARIANT_ID,
  productId: PRODUCT.id,
  name: 'Antracytowa angoba',
  active: true,
};
const PRICE = {
  priceListId: 'price-list:v57',
  priceListLabel: 'Aktualny cennik hurtowni',
  entryId: 'entry:v57',
  netAmountMinor: 482,
  currencyCode: 'PLN',
  saleUnit: 'piece',
  validFrom: '2026-09-01',
};

async function stubApis(page: Page) {
  await page.route('**/api/business/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/organizations')) {
      await route.fulfill({ json: { items: [ORGANIZATION] } });
      return;
    }
    if (url.pathname.endsWith('/assortment')) {
      const row = {
        item: {
          id: 'assortment:koda',
          organizationId: ORGANIZATION.id,
          commercialVariantId: VARIANT_ID,
          externalKey: 'DACH-00384',
          sourceName: 'Dachówka KODA Antracyt',
          active: true,
          preferred: true,
        },
        state: 'matched',
        catalog: {
          productId: PRODUCT.id,
          productName: PRODUCT.name,
          manufacturerId: MANUFACTURER.id,
          manufacturerName: MANUFACTURER.name,
          kind: 'roof-tile',
          currentRevisionId: REVISION.id,
          variantId: VARIANT_ID,
          variantName: VARIANT.name,
        },
        price: PRICE,
      };
      await route.fulfill({
        json: {
          organization: ORGANIZATION,
          items: [row],
          summary: {
            total: 1,
            matched: 1,
            unmatched: 0,
            inactive: 0,
            withoutPrice: 0,
          },
        },
      });
      return;
    }
    if (url.pathname.endsWith('/prices')) {
      const ids = (url.searchParams.get('ids') ?? '')
        .split(',')
        .filter(Boolean);
      await route.fulfill({
        json: {
          organizationId: ORGANIZATION.id,
          items: ids.map((commercialVariantId) => ({
            commercialVariantId,
            externalKey: 'DACH-00384',
            price: PRICE,
          })),
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: 'not-found' } },
    });
  });
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
  await mockBusinessWorkspace(page, ORGANIZATION.id);
}

async function perspective(page: Page, name: string) {
  await page.locator(`[data-perspective="${name}"]:visible`).first().click();
}

test('V57 salesperson: customer → roof → company tile → materials → draft quote', async ({
  page,
}, testInfo) => {
  await stubApis(page);
  await page.addInitScript(() => {
    localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  });
  await page.goto('/#/calculators/common-rafter');

  const home = page.getByTestId('business-home');
  await expect(home).toBeVisible();
  if (process.env.V57_VISUAL_QA === '1')
    await page.screenshot({
      path: `test-results/v57-home-${testInfo.project.name}.png`,
      fullPage: true,
    });
  await home.getByTestId('business-new-estimation').click();
  await home
    .getByRole('button', { name: '+ Nowy klient', exact: true })
    .click();
  await home.getByLabel(/Klient — nazwa lub firma/).fill('Jan Kowalski');
  await home.getByLabel('Nazwa inwestycji').fill('Dom Kowalski');
  await home.getByLabel(/Lokalizacja/).fill('Kraków');
  await home.getByRole('button', { name: /Utwórz wycenę/ }).click();

  const creator = page.getByTestId('project-start-assistant');
  await expect(creator).toBeVisible();
  await creator.getByTestId('project-start-guided').click();
  await creator.locator('[data-choice-value="gable"]').click();
  await creator
    .locator('[data-project-start-field="buildingLength"]')
    .fill('1000');
  await creator
    .locator('[data-project-start-field="buildingWidth"]')
    .fill('800');
  await creator.getByTestId('project-start-next').click();
  await creator.locator('[data-project-start-field="pitch"]').fill('38');
  await creator.locator('[data-project-start-field="eave"]').fill('60');
  await creator.getByTestId('project-start-next').click();
  await creator.locator('[data-project-start-field="spacing"]').fill('90');
  await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-submit').click();
  await expect(creator).toBeHidden();
  await expect(page.getByTestId('business-estimation-context')).toContainText(
    'Dom Kowalski',
  );
  await expect(page.getByTestId('business-journey')).toContainText(
    'Wybierz pokrycie',
  );

  await perspective(page, 'project');
  await page.locator('[data-task="covering"]:visible').first().click();
  await page
    .getByRole('button', { name: /Dachówka/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();
  const assortmentRow = page.getByTestId('business-picker-row').first();
  await expect(assortmentRow).toContainText('DACH-00384');
  await expect(assortmentRow).toContainText('4,82');
  await assortmentRow
    .getByRole('button', { name: /Sprawdź i wybierz/ })
    .click();
  const detail = page.getByTestId('business-product-detail');
  await expect(detail).toContainText('390–430 mm');
  await detail.getByRole('button', { name: /Użyj produktu/ }).click();
  await expect(page.getByTestId('covering-product-card')).toContainText('KODA');

  await perspective(page, 'materials');
  const materialPlan = page.getByTestId('material-plan');
  await expect(materialPlan).toBeVisible();
  await expect(materialPlan).toContainText(/Gotowe handlowo/);
  await expect(materialPlan).toContainText('DACH-00384');
  await materialPlan.getByTestId('tile-purchase-prepare').click();
  await expect(materialPlan.getByTestId('tile-purchase-status')).toBeVisible();
  const battens = materialPlan.getByTestId('material-row-battens');
  await battens
    .getByRole('button', { name: 'Cena dla tej wyceny', exact: true })
    .click();
  await battens.getByLabel(/Cena ręczna netto/).fill('3,25');
  await battens.getByLabel(/Cena ręczna netto/).blur();

  await perspective(page, 'costing');
  await expect(
    page.getByRole('heading', { name: 'Wycena materiałów' }),
  ).toBeVisible();
  const coveringSuggestion = page
    .locator('.cw-suggestions li')
    .filter({ hasText: 'KODA' })
    .first();
  await expect(coveringSuggestion).toContainText('4,82');
  await coveringSuggestion.getByRole('button', { name: 'Dodaj' }).click();
  await page.getByTestId('cost-prepare-quote').click();
  const quote = page.getByTestId('quote-workspace');
  await expect(quote).toBeVisible();
  await expect(quote).toContainText('Jan Kowalski');
  await expect(quote).toContainText('Dom Kowalski');
  await expect(quote.getByTestId('quote-precheck')).toBeVisible();
  await expect(
    quote
      .getByTestId('quote-line')
      .filter({ hasText: 'Łaty' })
      .getByLabel(/Cena netto/),
  ).toHaveValue('3,25');
  await expect(quote.getByTestId('quote-line').first()).toBeVisible();
  const coveringQuoteLine = quote
    .getByTestId('quote-line')
    .filter({ hasText: 'DACH-00384' })
    .first();
  const snapshottedTechnicalQuantity = await coveringQuoteLine
    .locator('.bz-quote-technical')
    .textContent();
  const quotePrice = coveringQuoteLine.getByLabel(/Cena netto/);
  await quotePrice.fill('4,50');
  await quotePrice.blur();
  await expect(coveringQuoteLine).toContainText('Ręcznie — ta wycena');
  await expect(coveringQuoteLine).toContainText(/Cena cennikowa.*4,82/);
  await expect(coveringQuoteLine.locator('.bz-quote-technical')).toHaveText(
    snapshottedTechnicalQuantity ?? '',
  );
  await quote.getByRole('button', { name: /Podgląd dla klienta/ }).click();
  await expect(page.locator('.bz-quote-shell')).toHaveAttribute(
    'data-preview',
    'true',
  );
  await expect(coveringQuoteLine.locator('.bz-no-preview:visible')).toHaveCount(
    0,
  );
  if (process.env.V57_VISUAL_QA === '1')
    await page.screenshot({
      path: `test-results/v57-quote-${testInfo.project.name}.png`,
      fullPage: true,
    });

  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);

  if (testInfo.project.name === 'desktop') {
    await quote.getByRole('button', { name: /Wróć do wyceny/ }).click();
    await perspective(page, 'project');
    await page.locator('[data-task="construction"]:visible').first().click();
    const pitch = page.getByLabel('Kąt połaci', { exact: true }).first();
    await pitch.fill('42');
    await pitch.blur();
    await perspective(page, 'costing');
    await page.getByTestId('cost-prepare-quote').click();
    await expect(page.getByTestId('quote-stale')).toContainText(
      'Projekt zmienił się',
    );
    await expect(
      quote
        .getByTestId('quote-line')
        .filter({ hasText: 'DACH-00384' })
        .first()
        .locator('.bz-quote-technical'),
    ).toHaveText(snapshottedTechnicalQuantity ?? '');
    await page.getByRole('button', { name: 'Odśwież ofertę' }).click();
    await expect(page.getByTestId('quote-stale')).toBeHidden();
  }
  await quote.getByRole('button', { name: /Wróć do wyceny/ }).click();
  await page.getByRole('button', { name: '← Wyceny', exact: true }).click();
  await expect(home).toBeVisible();
  await home
    .getByRole('button', { name: /^Dom Kowalski Jan Kowalski/ })
    .click();
  await expect(quote).toBeVisible();
  await expect(quote).toContainText('Jan Kowalski');
  await expect(quote.getByTestId('quote-save-status')).toHaveText('Zapisano');
  await page.reload();
  await expect(quote).toBeVisible();
  await expect(quote).toContainText('Dom Kowalski');
});

test('V57 sales dashboard fits the required desktop viewports', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop');
  await stubApis(page);
  await page.addInitScript(() => {
    localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/#/calculators/common-rafter');
    await expect(page.getByTestId('business-home')).toBeVisible();
    await expect(page.getByTestId('business-new-estimation')).toBeVisible();
    if (process.env.V57_VISUAL_QA === '1')
      await page.screenshot({
        path: `test-results/v57-home-${viewport.width}x${viewport.height}.png`,
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  }
});
