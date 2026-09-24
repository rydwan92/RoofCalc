import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

/**
 * V43B — covering → battens → counter-battens as one workflow.
 *
 * The preview server has no catalogue API, so catalogue responses are served
 * from the seeded import batch (swissporTON KODA) through the real HTTP client,
 * schema validation and snapshot creation. Nothing about the product is
 * invented here.
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
const replacementRevision = tiles.revisions.find(
  (item) => item.productId === 'product:swissporton:simpla',
)!;
const productSeed = tiles.products.find(
  (item) => item.id === revision.productId,
)!;
const replacementProductSeed = tiles.products.find(
  (item) => item.id === replacementRevision.productId,
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
const replacementProduct = {
  id: replacementProductSeed.id,
  manufacturerId: replacementProductSeed.manufacturerId,
  slug: replacementProductSeed.slug,
  name: replacementProductSeed.name,
  coveringKind: 'roof-tile' as const,
  active: true,
};
const replacementCurrentRevision = {
  id: replacementRevision.id,
  productId: replacementRevision.productId,
  revisionCode: replacementRevision.revisionCode,
  technicalSpec: replacementRevision.technicalSpec,
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
                  {
                    id: replacementProduct.id,
                    manufacturer: {
                      id: manufacturer.id,
                      name: manufacturer.name,
                    },
                    name: replacementProduct.name,
                    kind: 'roof-tile',
                    currentRevisionId: replacementRevision.id,
                    variantCount: 0,
                    technicalPreview: {},
                  },
                ]
              : [],
        },
      });
    const replacement = path.includes('simpla');
    if (path.includes('/revisions/'))
      return route.fulfill({
        json: {
          item: {
            manufacturer,
            product: replacement ? replacementProduct : product,
            revision: replacement
              ? replacementCurrentRevision
              : currentRevision,
          },
        },
      });
    return route.fulfill({
      json: {
        item: {
          manufacturer,
          product: replacement ? replacementProduct : product,
          currentRevision: replacement
            ? replacementCurrentRevision
            : currentRevision,
          variants: [],
        },
      },
    });
  });
}

async function openTask(page: Page, task: 'covering' | 'layers') {
  await page.locator('[data-perspective="project"]:visible').first().click();
  await page.locator(`[data-task="${task}"]:visible`).first().click();
}

async function createHipWithCatalogueTile(page: Page) {
  await stubCatalogue(page);
  await page.goto('/#/calculators/common-rafter');
  await page.getByRole('button', { name: 'Krokiew narożna' }).click();
  await page.locator('[data-mode="builder"]').click();
  await page.locator('.a-start-secondary > summary').click();
  await page.getByTestId('project-start-advanced').click();
  await openTask(page, 'covering');
  const assistant = page.getByTestId('covering-add-assistant');
  await assistant.locator('[data-covering-family="roof-tile"]').click();
  await assistant.locator('[data-covering-source="catalogue"]').click();
  await page.locator('.a-catalog-card button').first().click();
  await page.locator('.a-catalog-apply').click();
  const block = page.getByTestId('covering-installation-block');
  await expect(block).toBeVisible();
  await expect(block).toContainText('KODA');
  return block;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      excess: root.scrollWidth - root.clientWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter((element) => {
          if (element.getBoundingClientRect().right <= root.clientWidth + 1)
            return false;
          let parent = element.parentElement;
          while (parent) {
            if (
              ['auto', 'scroll', 'hidden'].includes(
                getComputedStyle(parent).overflowX,
              ) &&
              parent.getBoundingClientRect().right <= root.clientWidth + 1
            )
              return false;
            parent = parent.parentElement;
          }
          return true;
        })
        .slice(0, 5)
        .map(
          (element) =>
            `${element.tagName}.${String(element.className)}:${Math.round(element.getBoundingClientRect().right)}`,
        ),
    };
  });
  expect(overflow.offenders, JSON.stringify(overflow)).toEqual([]);
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const sizes =
    testInfo.project.name === 'mobile'
      ? [{ width: 390, height: 844 }]
      : [
          { width: 1920, height: 1080 },
          { width: 1440, height: 900 },
          { width: 1024, height: 768 },
        ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-${size.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize(
    testInfo.project.name === 'mobile'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
}

test.describe('V43B — covering installation workflow', () => {
  test('connected-empty catalogue explains initialization and keeps manual fallback', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop flow.');
    await page.route('**/api/catalog/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json: path.endsWith('/manufacturers') ? { items: [] } : { items: [] },
      });
    });
    await page.goto('/#/calculators/common-rafter');
    await page.locator('[data-mode="builder"]').click();
    await page.locator('.a-start-secondary > summary').click();
    await page.getByTestId('project-start-advanced').click();
    await openTask(page, 'covering');
    const assistant = page.getByTestId('covering-add-assistant');
    await assistant.locator('[data-covering-family="roof-tile"]').click();
    await assistant.locator('[data-covering-source="catalogue"]').click();
    await expect(
      page.getByText('Katalog nie został jeszcze zasilony.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Użyj parametrów ręcznych' }),
    ).toBeVisible();
  });

  test('Auto product replacement refreshes battens and Undo restores one coherent product', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Desktop flow.');
    const block = await createHipWithCatalogueTile(page);
    const status = block.getByTestId('batten-workflow-status');
    const oldGauge = await status.locator('[data-batten-gauge]').textContent();
    const oldLength = await status
      .locator('[data-batten-total-length]')
      .getAttribute('data-batten-total-length');

    await page
      .getByRole('button', { name: 'Zmień produkt', exact: true })
      .click();
    const replacementCard = page.locator('.a-catalog-card', {
      hasText: 'SIMPLA',
    });
    await replacementCard.getByRole('button', { name: 'Szczegóły' }).click();
    await page.locator('.a-catalog-apply').click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Zmień produkt', exact: true })
      .click();

    await expect(status).toHaveAttribute('data-workflow-state', 'auto-ready');
    await expect(block).toContainText('SIMPLA');
    await expect(status.locator('[data-batten-gauge]')).not.toHaveText(
      oldGauge ?? '',
    );
    await expect(
      status.locator('[data-batten-total-length]'),
    ).not.toHaveAttribute('data-batten-total-length', oldLength ?? '');

    await page.getByRole('button', { name: 'Cofnij zmianę' }).click();
    await expect(block).toContainText('KODA');
    await expect(status.locator('[data-batten-gauge]')).toHaveText(
      oldGauge ?? '',
    );
    await expect(status.locator('[data-batten-total-length]')).toHaveAttribute(
      'data-batten-total-length',
      oldLength ?? '',
    );
  });

  test('normal user: catalogue tile → Auto battens → hip detail → Material Plan', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'Desktop flow; the phone smoke is separate.',
    );
    const block = await createHipWithCatalogueTile(page);
    const battenStatus = block.getByTestId('batten-workflow-status');
    // V46: the first covering creates Auto battens from its own data.
    await expect(block.locator('[data-row="pitch"]')).toContainText('✓');
    await expect(
      block.getByRole('button', { name: 'Rozmieść łaty automatycznie' }),
    ).toHaveCount(0);
    await expect(battenStatus).toHaveAttribute(
      'data-workflow-state',
      'auto-ready',
    );
    await expect(battenStatus).toContainText('AUTO');
    await expect(battenStatus).toContainText(/rzęd/);
    // KODA range is 39–43 cm: the whole-interval gauge must lie inside it.
    const gaugeText = (await battenStatus
      .locator('[data-batten-gauge]')
      .textContent())!;
    const gaugeCm = Number(gaugeText.replace(',', '.').replace(/[^\d.]/g, ''));
    expect(gaugeCm).toBeGreaterThanOrEqual(39);
    expect(gaugeCm).toBeLessThanOrEqual(43);
    await block
      .getByRole('button', { name: 'Dodaj kontrłaty z konstrukcji' })
      .click();
    const counterStatus = block.getByTestId('counter-batten-workflow-status');
    await expect(counterStatus).toHaveAttribute(
      'data-workflow-state',
      'needs-hip-detail',
    );
    await expect(counterStatus).toContainText('4 grzbiety H1');
    await capture(page, testInfo, 'v43b-covering-block');

    await block.getByTestId('open-installation-details').click();
    await expect(page.getByTestId('installation-legend')).toBeVisible();
    await expect(
      page.locator('[data-testid="installation-covering-underlay"] polygon'),
    ).toHaveCount(4);
    await expect(page.locator('.a-batten-segment')).not.toHaveCount(0);
    await expect(page.locator('.a-counter-batten-segment')).not.toHaveCount(0);
    const summary = page.locator('.a-build-up-summary');
    await expect(summary.locator('[data-summary="battens"]')).toContainText(
      'Zgodne z pokryciem',
    );
    await expect(
      summary.locator('[data-summary="counter-battens"]'),
    ).toContainText('Częściowo');
    // SVG row groups: dispatch the click on the row itself (a legend may
    // overlap the plan corner at small viewports).
    await page.locator('[data-batten-row]').nth(3).dispatchEvent('click');
    await expect(page.getByTestId('batten-row-detail')).toContainText(
      'Odległość od okapu',
    );
    await capture(page, testInfo, 'v43b-installation-plan');

    await page
      .getByTestId('installation-inspector')
      .getByRole('button', { name: 'Uzupełnij detal grzbietu' })
      .click();
    const hip = page.getByTestId('hip-boundary-detail');
    await expect(hip).toBeVisible();
    await hip
      .locator('[data-hip-detail-option="paired-plane-runs"] input')
      .check();
    await expect(
      summary.locator('[data-summary="counter-battens"] [data-workflow-state]'),
    ).toHaveAttribute('data-workflow-state', 'complete');
    const battenTotal = Number(
      await summary
        .locator('[data-summary="battens"] [data-batten-total-length]')
        .getAttribute('data-batten-total-length'),
    );
    const counterTotal = Number(
      await summary
        .locator(
          '[data-summary="counter-battens"] [data-counter-batten-total-length]',
        )
        .getAttribute('data-counter-batten-total-length'),
    );
    expect(battenTotal).toBeGreaterThan(0);
    expect(counterTotal).toBeGreaterThan(0);
    await capture(page, testInfo, 'v43b-counter-battens-complete');

    await page
      .locator('[data-perspective="materials"]:visible')
      .first()
      .click();
    const plan = page.getByTestId('material-plan');
    await expect(plan).toBeVisible();
    const fmt = (valueMm: number) =>
      new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 })
        .format(valueMm / 1000)
        .replace(/\s/g, '');
    const battenRow = plan.getByTestId('material-row-battens');
    const counterRow = plan.getByTestId('material-row-counterBattens');
    await expect(battenRow).toBeVisible();
    await expect(counterRow).toBeVisible();
    const compact = async (locator: ReturnType<Page['locator']>) =>
      ((await locator.textContent()) ?? '').replace(/\s/g, '');
    expect(await compact(battenRow)).toContain(fmt(battenTotal).split(',')[0]!);
    expect(await compact(counterRow)).toContain(
      fmt(counterTotal).split(',')[0]!,
    );
    await capture(page, testInfo, 'v43b-material-plan');
  });

  test('expert: Manual gauge is validated, kept after product change, and Auto is one history step', async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'Desktop flow; the phone smoke is separate.',
    );
    // Offline catalogue: the expert path works from manual technical data.
    await page.route('**/api/catalog/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"error":{"code":"catalog_unavailable"}}',
      }),
    );
    await page.goto('/#/calculators/common-rafter');
    await page.getByRole('button', { name: 'Krokiew narożna' }).click();
    await page.locator('[data-mode="builder"]').click();
    await page.locator('.a-start-secondary > summary').click();
    await page.getByTestId('project-start-advanced').click();
    const fillTile = async (
      name: string,
      gaugeMin: string,
      gaugeMax: string,
    ) => {
      const assistant = page.getByTestId('covering-add-assistant');
      for (const [field, value] of Object.entries({
        name,
        physicalWidth: '33',
        physicalLength: '42',
        coverWidth: '30',
        gaugeMin,
        gaugeMax,
        minimumPitch: '19',
      }))
        await assistant.locator(`[data-manual-field="${field}"]`).fill(value);
      await assistant.getByTestId('confirm-manual-covering').click();
    };
    const replaceProduct = async (
      name: string,
      gaugeMin: string,
      gaugeMax: string,
    ) => {
      await page
        .getByRole('button', { name: 'Zmień produkt', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Użyj parametrów ręcznych', exact: true })
        .click();
      await fillTile(name, gaugeMin, gaugeMax);
    };
    await openTask(page, 'covering');
    const assistant = page.getByTestId('covering-add-assistant');
    await assistant.locator('[data-covering-family="roof-tile"]').click();
    await assistant.locator('[data-covering-source="manual"]').click();
    await fillTile('Dachówka 33–36', '33', '36');
    const block = page.getByTestId('covering-installation-block');
    await expect(block.getByTestId('batten-workflow-status')).toHaveAttribute(
      'data-workflow-state',
      'auto-ready',
    );

    await openTask(page, 'layers');
    await page
      .locator('.a-toolbox .a-layer-tool-row')
      .getByRole('button', { name: 'Łaty', exact: true })
      .click();
    const inspector = page.getByTestId('batten-inspector');
    await inspector
      .getByRole('button', { name: 'Ręcznie', exact: true })
      .click();
    const gauge = inspector.getByLabel('Rozstaw łat', { exact: true });
    await gauge.fill('38');
    await gauge.blur();
    const status = inspector.getByTestId('batten-workflow-status');
    await expect(status).toHaveAttribute(
      'data-workflow-state',
      'manual-incompatible',
    );
    await expect(inspector.getByTestId('manual-gauge-mismatch')).toContainText(
      'poza zakresem',
    );
    await expect(
      inspector
        .getByTestId('batten-references')
        .locator('[data-reference="regular"]'),
    ).toContainText('RĘCZNIE');
    await capture(page, testInfo, 'v43b-manual-mismatch');

    // A product whose range includes 38 cm: the manual value is kept and now valid.
    await openTask(page, 'covering');
    await replaceProduct('Dachówka 37–40', '37', '40');
    const coveringStatus = page
      .getByTestId('covering-installation-block')
      .getByTestId('batten-workflow-status');
    await expect(coveringStatus).toHaveAttribute(
      'data-workflow-state',
      'manual-compatible',
    );
    // Back to a range that excludes it: warning, then one-step Auto repair.
    await replaceProduct('Dachówka 30–32', '30', '32');
    await expect(coveringStatus).toHaveAttribute(
      'data-workflow-state',
      'manual-incompatible',
    );
    await expect(page.getByTestId('covering-installation-block')).toContainText(
      '38 cm',
    );
    await page
      .getByTestId('covering-installation-block')
      .getByRole('button', { name: 'Dopasuj automatycznie' })
      .click();
    await expect(coveringStatus).toHaveAttribute(
      'data-workflow-state',
      'auto-ready',
    );
    // One canonical history action: a single undo restores the manual gauge.
    await page.getByRole('button', { name: 'Cofnij zmianę' }).click();
    await expect(coveringStatus).toHaveAttribute(
      'data-workflow-state',
      'manual-incompatible',
    );
  });

  test('phone smoke: installation block and plan fit 390 px', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'One 390×844 smoke only.');
    const block = await createHipWithCatalogueTile(page);
    await expect(block.getByTestId('batten-workflow-status')).toHaveAttribute(
      'data-workflow-state',
      'auto-ready',
    );
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'v43b-phone-block');
    await block.getByTestId('open-installation-details').click();
    await expect(page.getByTestId('installation-legend')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await capture(page, testInfo, 'v43b-phone-plan');
  });
});

test('V46: switching hip ↔ gable keeps the tile covering and Auto battens in sync', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop flow.');
  const block = await createHipWithCatalogueTile(page);
  const status = () =>
    page
      .getByTestId('covering-installation-block')
      .getByTestId('batten-workflow-status');
  await expect(status()).toHaveAttribute('data-workflow-state', 'auto-ready');
  for (const roofType of ['Dwuspadowy', 'Kopertowy']) {
    await page.getByRole('tab', { name: 'Konstrukcja' }).first().click();
    await page.getByRole('button', { name: roofType }).first().click();
    await page.getByRole('tab', { name: 'Pokrycie' }).first().click();
    await expect(status()).toHaveAttribute('data-workflow-state', 'auto-ready');
    await expect(page.locator('.a-covering-warning')).toHaveCount(0);
    await expect(
      page.getByTestId('tile-layout-drawing').locator('.a-covering-batten'),
    ).not.toHaveCount(0);
  }
  await expect(block).toContainText('KODA');
});
