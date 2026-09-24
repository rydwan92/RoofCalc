import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

/**
 * V47 — project readiness and guided guardrails, in a real browser.
 *
 * The preview server has no catalogue API, so catalogue responses are the
 * seeded swissporTON KODA import batch served through the real HTTP client
 * (same approach as the V43B spec). Nothing about the product is invented.
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
      json: {
        item: { manufacturer, product, currentRevision, variants: [] },
      },
    });
  });
}

async function openPerspective(
  page: Page,
  perspective: 'project' | 'documents',
) {
  await page
    .locator(`[data-perspective="${perspective}"]:visible`)
    .first()
    .click();
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

async function startProject(page: Page, hip: boolean) {
  await stubCatalogue(page);
  await page.goto('/#/calculators/common-rafter');
  if (hip) await page.getByRole('button', { name: 'Krokiew narożna' }).click();
  await page.locator('[data-mode="builder"]').click();
  await page.locator('.a-start-secondary > summary').click();
  await page.getByTestId('project-start-advanced').click();
}

const primary = (page: Page) => page.getByTestId('project-primary-issue');

test.describe('V47 — guided readiness', () => {
  // Desktop flows; the phone layout is covered by the readiness unit tests.
  test.skip(
    ({ viewport }) => (viewport?.width ?? 1440) < 768,
    'Desktop flows.',
  );

  test('new hip project: covering → Auto battens → H1 detail via readiness → documents', async ({
    page,
  }) => {
    await startProject(page, true);
    // A missing covering is a next step, never shown as an error.
    await expect(primary(page)).toHaveAttribute(
      'data-issue',
      'covering-missing',
    );
    await expect(primary(page)).toHaveAttribute('data-severity', 'info');
    await catalogueTile(page);
    await expect(
      page
        .getByTestId('covering-installation-block')
        .getByTestId('batten-workflow-status'),
    ).toHaveAttribute('data-workflow-state', 'auto-ready');
    await page
      .getByTestId('covering-installation-block')
      .getByRole('button', { name: 'Dodaj kontrłaty z konstrukcji' })
      .click();

    // The H1 detail is surfaced; its CTA lands on the exact editor.
    await page.getByTestId('project-progress').click();
    const hipIssue = page
      .getByTestId('project-readiness-panel')
      .locator('[data-issue="hip-detail-required"]');
    await expect(hipIssue).toContainText('4 grzbiety H1');
    await hipIssue.getByRole('button', { name: 'Uzupełnij detal H1' }).click();
    const detail = page.getByTestId('hip-boundary-detail').first();
    await expect(detail).toBeVisible();
    await detail.locator('input[name="hip-boundary-detail"]').first().check();

    // Readiness updates immediately.
    await page.getByTestId('project-progress').click();
    await expect(
      page
        .getByTestId('project-readiness-panel')
        .locator('[data-issue="hip-detail-required"]'),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await openPerspective(page, 'documents');
    const execution = page.getByTestId('document-status-execution');
    await expect(execution).toBeVisible();
    await expect(execution).not.toContainText('do poprawy');
  });

  test('broken saved project: stale plane scope is identified, fixed in one step and undone', async ({
    page,
  }, testInfo) => {
    await startProject(page, false);
    await catalogueTile(page);
    await page.locator('.a-project-trigger').click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Eksportuj' }).click();
    const record = JSON.parse(
      readFileSync((await (await download).path())!, 'utf8'),
    );
    // A project saved before V46 on a roof whose planes changed.
    record.document.project.coverings[0].roofPlaneIds = [
      'roof-plane:front',
      'roof-plane:left',
    ];
    record.document.project.buildUp.battenLayout.roofPlaneIds = [
      'roof-plane:rear',
    ];
    record.name = 'Uszkodzony projekt';
    const broken = testInfo.outputPath('broken.cieslacalc.json');
    writeFileSync(broken, JSON.stringify(record));
    await page.locator('.a-project-file').setInputFiles(broken);
    await expect(page.locator('.a-project-trigger')).toContainText(
      'Uszkodzony projekt',
    );
    await page.keyboard.press('Escape');

    // Loaded as saved: identified, never silently rewritten.
    await expect(primary(page)).toHaveAttribute(
      'data-issue',
      'plane-scope-stale',
    );
    await expect(primary(page)).toHaveAttribute('data-severity', 'blocker');
    await expect(page.getByTestId('project-next-action')).toHaveText(
      'Dopasuj pokrycie i łaty do dachu',
    );
    await page.getByTestId('project-next-action').click();
    await expect(page.getByTestId('action-feedback')).toContainText(
      'Dopasowano pokrycie i warstwy do dachu.',
    );
    await expect(primary(page)).not.toHaveAttribute(
      'data-issue',
      'plane-scope-stale',
    );
    await page.getByTestId('action-feedback-undo').click();
    await expect(primary(page)).toHaveAttribute(
      'data-issue',
      'plane-scope-stale',
    );
  });

  test('export preflight: a warning keeps a working document printable; fixing it makes it ready', async ({
    page,
  }) => {
    await startProject(page, false);
    await catalogueTile(page);
    // KODA (503 mm) hung from the default first batten (250 mm) reaches
    // 25,3 cm past the eave: a real, explainable limitation of this project.
    await openPerspective(page, 'documents');
    await expect(page.getByTestId('document-status-execution')).toContainText(
      'ogranicz',
    );
    await expect(
      page.getByTestId('document-preflight-execution'),
    ).toContainText('Sprawdź detal okapu');
    await page.getByTestId('document-preview-execution').click();
    await expect(page.getByTestId('document-state')).toContainText(
      'Dokument roboczy',
    );
    await expect(page.getByTestId('document-status-banner')).toContainText(
      'Sprawdź detal okapu',
    );
    await expect(page.getByTestId('execution-print')).toBeEnabled();
    await expect(page.getByTestId('execution-print')).toHaveText(
      'Drukuj / Zapisz PDF',
    );
    await page.getByTestId('document-preview-back').click();

    // The readiness action opens and focuses the exact field.
    await page.getByTestId('project-progress').click();
    await page
      .getByTestId('project-readiness-panel')
      .locator('[data-issue="tile-eave-projection"]')
      .getByRole('button', { name: 'Ustaw pierwszą łatę od okapu' })
      .click();
    const eave = page
      .getByTestId('batten-advanced-settings')
      .getByLabel('Pierwsza łata od okapu');
    await expect(eave).toBeFocused();
    await eave.fill('45');
    await eave.press('Enter');
    await eave.blur();
    await expect(
      page.locator('[data-issue="tile-eave-projection"]'),
    ).toHaveCount(0);

    await openPerspective(page, 'documents');
    await expect(page.getByTestId('document-status-execution')).toContainText(
      'Gotowy',
    );
    await page.getByTestId('document-preview-execution').click();
    await expect(page.getByTestId('document-state')).toContainText('Gotowy');
    await expect(page.getByTestId('document-status-banner')).toHaveCount(0);
  });
});
