import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';

/**
 * V52 complete roof-detail system in a real browser. Offline by default (a
 * manual element must always work); the window flow serves the real V52
 * catalogue batch through a mocked API so the compatible-kit path is tested
 * with the seeded technical facts.
 */
interface BatchLike {
  manufacturers: {
    id: string;
    slug: string;
    name: string;
    countryCode?: string;
    websiteUrl?: string;
    active: boolean;
  }[];
  products: {
    id: string;
    manufacturerId: string;
    slug: string;
    name: string;
    coveringKind: string;
    active: boolean;
  }[];
  revisions: {
    id: string;
    productId: string;
    revisionCode: string;
    validFrom?: string;
    source?: unknown;
    technicalSpec: Record<string, unknown> & {
      kind: string;
      role: string;
    };
  }[];
}

const batch = JSON.parse(
  readFileSync(
    'apps/api/src/data/import-batches/roof-system-2026-09-v52.json',
    'utf8',
  ),
) as BatchLike;

function preview(spec: BatchLike['revisions'][number]['technicalSpec']) {
  if (spec.kind === 'roof-system-component') {
    const compatibility = spec.compatibility as {
      scope: string;
      productIds?: string[];
    };
    return {
      systemRole: spec.role,
      ...(spec.rollLengthMm ? { rollLengthMm: spec.rollLengthMm } : {}),
      ...(compatibility.scope === 'covering-products'
        ? { compatibleProductIds: compatibility.productIds }
        : {}),
    };
  }
  const covering = spec.covering as { class: string } | undefined;
  return {
    windowRole: spec.role,
    windowSystemKey: spec.windowSystemKey,
    sizeCode: spec.sizeCode,
    ...(covering ? { flashingCoveringClass: covering.class } : {}),
  };
}

async function serveCatalogue(page: Page) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const manufacturer = (id: string) =>
      batch.manufacturers.find((item) => item.id === id)!;
    if (url.pathname.endsWith('/catalog/products')) {
      const kind = url.searchParams.get('kind');
      const items = batch.products
        .filter((product) => product.coveringKind === kind)
        .map((product) => {
          const revision = batch.revisions.find(
            (item) => item.productId === product.id,
          )!;
          const owner = manufacturer(product.manufacturerId);
          return {
            id: product.id,
            manufacturer: { id: owner.id, name: owner.name },
            name: product.name,
            kind: product.coveringKind,
            currentRevisionId: revision.id,
            variantCount: 0,
            technicalPreview: preview(revision.technicalSpec),
          };
        });
      return route.fulfill({ json: { items } });
    }
    const match = url.pathname.match(/\/catalog\/products\/([^/]+)$/);
    if (match) {
      const id = decodeURIComponent(match[1]!);
      const product = batch.products.find((item) => item.id === id);
      if (!product)
        return route.fulfill({
          status: 404,
          json: { error: { code: 'not-found' } },
        });
      const revision = batch.revisions.find((item) => item.productId === id)!;
      return route.fulfill({
        json: {
          item: {
            manufacturer: manufacturer(product.manufacturerId),
            product,
            currentRevision: revision,
            variants: [],
          },
        },
      });
    }
    return route.fulfill({
      status: 503,
      json: { error: { code: 'unavailable' } },
    });
  });
}

async function openProject(
  page: Page,
  fixture: string,
  id: string,
  catalogue = false,
) {
  const record = JSON.parse(
    readFileSync(`fixtures/projects/${fixture}`, 'utf8'),
  ) as ProjectRecordV1;
  record.id = id;
  record.name = `V52 · ${id}`;
  if (catalogue) await serveCatalogue(page);
  else
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

async function openSystem(page: Page) {
  await page.locator('[data-materials-view="system"]:visible').first().click();
  await expect(page.getByTestId('roof-system-workspace')).toBeVisible();
}

async function addManualComponent(
  page: Page,
  values: { role?: string; name: string; rule?: string; value?: string },
) {
  await page.getByTestId('rs-add-component').click();
  await page.getByTestId('rs-picker-manual').click();
  if (values.role)
    await page.getByTestId('rs-manual-role').selectOption(values.role);
  await page.getByTestId('rs-manual-name').fill(values.name);
  if (values.rule)
    await page.getByTestId('rs-manual-rule').selectOption(values.rule);
  if (values.value)
    await page.getByTestId('rs-manual-value').fill(values.value);
  await page.getByTestId('rs-manual-save').click();
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

test('V52 gable: tile plan → ridge tape → eave element → drainage with offset → plan → cost → list', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openProject(page, '05-gable-roof-tile.cieslacalc.json', 'v52-gable');
  // Tile purchase plan first (V50), so ridge tiles can be counted.
  await page.getByTestId('tile-purchase-prepare').click();
  await expect(page.getByTestId('roof-system-summary')).toBeVisible();
  // One guided entry point instead of per-accessory forms.
  await page.getByTestId('roof-system-complete').click();
  await expect(page.getByTestId('rs-checklist')).toBeVisible();
  await expect(page.getByTestId('rs-check-base-covering')).toContainText('✓');
  await page.getByTestId('rs-check-ridge-tape').click();
  await expect(page.getByTestId('rs-area-title')).toHaveText(
    'Kalenica / grzbiety',
  );
  await addManualComponent(page, { name: 'Taśma kalenicowa test', value: '5' });
  const tape = page.getByTestId('rs-component-ridge-tape');
  await expect(tape.getByTestId('rs-component-quantity')).toContainText(
    /\d+ rol/,
  );
  await expect(tape).toContainText('Nadwyżka handlowa');
  await expect(tape.getByTestId('rs-applies-to')).toContainText('Kalenica');
  // Eave: one element on one eave only.
  await page.getByTestId('rs-back').click();
  await page.getByTestId('rs-area-eave').click();
  await addManualComponent(page, {
    role: 'drip-edge',
    name: 'Okapnik 2 m',
    rule: 'linear-effective-cover',
    value: '190',
  });
  const drip = page.getByTestId('rs-component-drip-edge');
  const before = await drip.getByTestId('rs-component-quantity').innerText();
  await drip.getByTestId('rs-feature-chip').nth(1).click();
  await expect(drip.getByTestId('rs-component-quantity')).not.toHaveText(
    before,
  );
  await expect(drip.getByTestId('rs-applies-to')).toContainText('Okap O1');
  await noHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('v52-system-gable.png'),
    fullPage: true,
  });
  // Drainage: manual system, one outlet with an offset → two elbows derived.
  await page.getByTestId('rs-back').click();
  await page.getByTestId('rs-area-drainage').click();
  await page.getByRole('button', { name: 'Otwórz odwodnienie' }).click();
  await page.getByTestId('drainage-enable').click();
  await page.getByTestId('drainage-manual-name').fill('Rynna testowa');
  await page.getByTestId('drainage-manual-gutters').fill('3; 4');
  await page.getByTestId('drainage-manual-pipes').fill('1; 3');
  await page.getByTestId('drainage-manual-hook').fill('60');
  await page.getByTestId('drainage-manual-apply').click();
  await page.getByTestId('drainage-eave-open-1').click();
  await page.getByTestId('drainage-add-outlet').click();
  const editor = page.getByTestId('drainage-outlet-editor');
  await editor.getByTestId('drainage-downpipe-height').fill('290');
  await editor.getByTestId('drainage-downpipe-height').press('Enter');
  await editor.getByTestId('drainage-route-offset').click();
  await expect(editor.getByTestId('drainage-elbows-derived')).toContainText(
    'Kolana: 2',
  );
  await page.getByRole('button', { name: '← Cały układ' }).click();
  await expect(page.getByTestId('drainage-hook-rules')).toContainText(
    'nie w miejscu łączenia',
  );
  await page.getByTestId('drainage-show-hooks').click();
  await expect(page.getByTestId('drainage-hook-marker').first()).toBeVisible();
  const bom = page.getByTestId('drainage-bom');
  await expect(bom.locator('li', { hasText: 'Kolano' })).toContainText(
    '2 szt.',
  );
  await expect(page.getByTestId('drainage-purchase-policy')).toContainText(
    'KONSERWATYWNIE',
  );
  // Material Plan: roof-system rows in their groups, units from the plan.
  await page.locator('[data-materials-view="plan"]:visible').first().click();
  await expect(
    page.locator('[data-testid="material-row-roofSystem.ridge-tape"]'),
  ).toContainText('rol.');
  await expect(page.getByTestId('material-group-eave')).toContainText(
    'Okapnik',
  );
  await expect(
    page.locator('[data-testid="material-row-drainage.downpipe-elbow"]'),
  ).toContainText('2');
  // Cost: the tape is a roll line, not metres.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  await expect(page.locator('main')).toContainText('Taśma kalenicowa');
  // Material list and execution document read the same facts.
  await page.locator('[data-perspective="documents"]:visible').first().click();
  await page.getByTestId('document-preview-materials').click();
  await expect(
    page.locator('[data-material-category="covering"]'),
  ).toContainText('Taśma kalenicowa test');
  expect(errors).toEqual([]);
});

test('V52 hip: ridge/hip accessory highlights exactly the ridge and four hips', async ({
  page,
}) => {
  await openProject(
    page,
    '09-hip-catalogue-snapshot.cieslacalc.json',
    'v52-hip',
  );
  await openSystem(page);
  await page.getByTestId('rs-area-ridge').click();
  await addManualComponent(page, { name: 'Taśma 5 m', value: '5' });
  await addManualComponent(page, {
    role: 'ridge-end',
    name: 'Zakończenie',
    rule: 'one-per-feature-end',
  });
  // Topology decides: four open hip feet, the ridge ends meet hips.
  await expect(
    page
      .getByTestId('rs-component-ridge-end')
      .getByTestId('rs-component-quantity'),
  ).toHaveText('4 szt.');
  await page
    .getByTestId('rs-component-ridge-tape')
    .getByTestId('rs-applies-to')
    .click();
  for (const id of ['ridge-1', 'hip-1', 'hip-2', 'hip-3', 'hip-4'])
    await expect(page.getByTestId(`rs-feature-${id}`)).toHaveAttribute(
      'data-lit',
      'true',
    );
  await expect(page.getByTestId('rs-feature-eave-1')).toHaveAttribute(
    'data-lit',
    'false',
  );
  // Layer toggles keep the drawing technical and uncluttered.
  await page.getByTestId('rs-layer-ridge').click();
  await expect(page.getByTestId('rs-feature-ridge-1')).toHaveCount(0);
  await page.getByTestId('rs-layer-ridge').click();
  // Drainage perimeter comes from the same eaves.
  await page.getByTestId('rs-back').click();
  await page.getByTestId('rs-area-drainage').click();
  await expect(page.getByTestId('rs-area-title')).toHaveText('Odwodnienie');
  await noHorizontalOverflow(page);
});

test('V52 window: flashing needs a choice → compatible VELUX kit → readiness updates', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openProject(
    page,
    '03-gable-three-roof-windows.cieslacalc.json',
    'v52-window',
    true,
  );
  const openings = page.getByTestId('material-group-openings');
  await expect(openings).toContainText('Okno 1');
  await expect(openings).toContainText('Kołnierz okna dachowego');
  await openings.getByTestId('material-opening-choose').first().click();
  const editor = page.getByTestId('rs-opening-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('rs-flashing-required')).toHaveText(
    'Wymaga wyboru',
  );
  // Generic opening: every kit is visibly unavailable, none is "compatible".
  await expect(
    editor.locator('[data-testid="rs-kit"][data-compatibility="compatible"]'),
  ).toHaveCount(0);
  // Assign the window size identity, then the covering class.
  await editor
    .getByTestId('rs-window')
    .filter({ hasText: 'MK06' })
    .getByTestId('rs-window-choose')
    .click();
  await editor.getByTestId('rs-covering-profiled').click();
  const mk04 = editor.getByTestId('rs-kit').filter({ hasText: 'MK04' });
  await expect(mk04).toHaveAttribute('data-compatibility', 'incompatible');
  await editor
    .getByTestId('rs-kit')
    .filter({ hasText: 'EDW 0000 MK06' })
    .getByTestId('rs-kit-choose')
    .click();
  await expect(editor.getByTestId('rs-flashing-name')).toHaveText(
    'VELUX kołnierz EDW 0000 MK06',
  );
  await expect(page.getByTestId('rs-opening-1')).toHaveAttribute(
    'data-status',
    'resolved',
  );
  await page.screenshot({
    path: testInfo.outputPath('v52-window.png'),
    fullPage: true,
  });
  // A flat-covering kit on a profiled roof is shown as incompatible.
  await page.getByTestId('rs-opening-open-2').click();
  const second = page.getByTestId('rs-opening-editor');
  await second
    .getByTestId('rs-window')
    .filter({ hasText: 'MK06' })
    .getByTestId('rs-window-choose')
    .click();
  // A flat-covering kit is listed as incompatible before anything is chosen.
  await second.getByTestId('rs-covering-profiled').click();
  await expect(
    second.getByTestId('rs-kit').filter({ hasText: 'EDS 0000 MK06' }),
  ).toHaveAttribute('data-compatibility', 'incompatible');
  // Choosing a profiled kit, then switching the covering to flat, makes
  // the chosen kit visibly incompatible — never silently corrected.
  await second
    .getByTestId('rs-kit')
    .filter({ hasText: 'EDW 0000 MK06' })
    .getByTestId('rs-kit-choose')
    .click();
  await second.getByTestId('rs-covering-flat').click();
  await expect(second.getByTestId('rs-flashing-incompatible')).toBeVisible();
  await expect(second).toContainText(
    'Kołnierz jest do innego rodzaju pokrycia.',
  );
  // Third window: manual flashing always works.
  await page.getByTestId('rs-opening-open-3').click();
  const third = page.getByTestId('rs-opening-editor');
  await third.getByTestId('rs-flashing-manual-open').click();
  await third.getByTestId('rs-flashing-manual-name').fill('Kołnierz ręczny');
  await third.getByTestId('rs-flashing-manual-save').click();
  await expect(third.getByTestId('rs-flashing-name')).toHaveText(
    'Kołnierz ręczny',
  );
  // Material Plan: two resolved kits, one incompatible still asks.
  await page.locator('[data-materials-view="plan"]:visible').first().click();
  await expect(openings.getByTestId('material-opening-choose')).toHaveCount(1);
  await expect(page.getByTestId('roof-system-summary-openings')).toContainText(
    'Wymaga decyzji',
  );
  expect(errors).toEqual([]);
});
