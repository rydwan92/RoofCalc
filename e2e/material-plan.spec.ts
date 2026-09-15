import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';
import type { CatalogImportBatchV1 } from '../packages/catalog-core/src/index';

async function openMaterialProject(
  page: Page,
  url = '/#/calculators/common-rafter',
) {
  const record = JSON.parse(
    readFileSync(
      'fixtures/projects/05-gable-roof-tile.cieslacalc.json',
      'utf8',
    ),
  ) as ProjectRecordV1;
  record.id = 'v36-browser-project';
  record.name = 'V36 · plan materiałów';
  record.document.project.roof.halfRunMm = 2000;
  record.document.project.roof.rafterSection = { widthMm: 45, depthMm: 145 };
  const tiles = JSON.parse(
    readFileSync(
      'apps/api/src/data/import-batches/tiles-2026-09-v35.json',
      'utf8',
    ),
  ) as CatalogImportBatchV1;
  const revision = tiles.revisions.find(
    (item) => item.productId === 'product:swissporton:koda',
  )!;
  if (revision.technicalSpec.kind !== 'roof-tile') throw Error('Tile seed');
  record.document.project.coverings[0]!.product = {
    technicalSpecSnapshot: revision.technicalSpec,
    catalogRef: {
      productId: revision.productId,
      technicalRevisionId: revision.id,
    },
    displaySnapshot: {
      manufacturer: 'swissporTON',
      familyName: 'KODA',
      revisionCode: revision.revisionCode,
    },
  };
  record.document.project.buildUp.battenLayout!.gaugeMm = 400;
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
  await page.goto(url);
  await page.locator('[data-mode="builder"]').click();
  await page.locator('[data-task="materials"]:visible').first().click();
  await expect(page.getByTestId('material-plan')).toBeVisible();
}

test('V36 XAMPP build reads catalogue and prices without changing project origin', async ({
  page,
}, testInfo) => {
  test.skip(
    process.env.ROOFCALC_XAMPP !== '1',
    'Requires local XAMPP Apache and Node API',
  );
  await openMaterialProject(
    page,
    'http://localhost/RoofCalc/apps/web/dist/#/calculators/common-rafter',
  );
  await page
    .getByTestId('material-row-k1')
    .getByRole('button', { name: 'Dobierz tarcicę w rozkroju K1' })
    .click();
  await page.getByTestId('k1-add-from-catalogue').click();
  const card = page
    .locator('.a-catalog-card')
    .filter({ hasText: 'C24 45×145×4000 (impregnowane)' });
  await expect(card).toContainText('113,01');
  await expect(card).toContainText('Zweryfikuj cenę przed zakupem');
  await page.screenshot({ path: testInfo.outputPath('xampp-catalogue.png') });
  expect(new URL(page.url()).origin).toBe('http://localhost');
  expect(
    await page.evaluate(() =>
      localStorage.getItem('cieslacalc.activeProject.v1'),
    ),
  ).toBe('v36-browser-project');
});

test('V36 offline material plan, manual estimate and mobile layout', async ({
  page,
}, testInfo) => {
  await page.route('**/api/catalog/**', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'catalog-unavailable' } },
    }),
  );
  await page.route('**/api/pricing/**', (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: 'pricing-unavailable' } },
    }),
  );
  await openMaterialProject(page);
  const plan = page.getByTestId('material-plan');
  await expect(plan).toContainText(
    'Katalog niedostępny — obliczenia lokalne działają',
  );
  const battens = page.getByTestId('material-row-battens');
  await expect(battens).toContainText('GEOMETRIA');
  await battens.getByRole('combobox').selectOption('manual');
  await battens.getByRole('textbox').fill('2,50');
  await battens.getByRole('textbox').blur();
  await battens.getByRole('button', { name: 'Dodaj do kosztorysu' }).click();
  await expect(
    battens.getByRole('button', { name: 'Dodaj do kosztorysu' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('material-row-tile')).toContainText(
    'SZACUNEK PRODUCENTA',
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('v36-material-plan.png'),
    fullPage: true,
  });
  const download = page.waitForEvent('download');
  await plan.getByRole('button', { name: 'Pobierz listę CSV' }).click();
  expect((await download).suggestedFilename()).toContain('materialy.csv');
});

test('V36 live catalogue → timber procurement/price → membrane → estimate → material document', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop' ||
      process.env.ROOFCALC_LIVE_CATALOGUE !== '1',
    'Live XAMPP QA is explicitly enabled locally; CI needs no database.',
  );
  await openMaterialProject(page);
  await expect(page.getByTestId('material-plan')).toContainText(
    'Katalog online',
  );
  await page
    .getByTestId('material-row-k1')
    .getByRole('button', { name: 'Dobierz tarcicę w rozkroju K1' })
    .click();
  await page.getByTestId('k1-add-from-catalogue').click();
  await page
    .locator('.a-catalog-card')
    .filter({ hasText: 'C24 45×145×4000 (impregnowane)' })
    .getByRole('button', { name: 'Szczegóły' })
    .click();
  await page.getByRole('button', { name: 'Użyj tej długości' }).click();
  await page.getByTestId('k1-run-plan').click();
  await expect(page.getByTestId('k1-cutting-result')).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Rozkrój krokwi K1', exact: true })
    .getByRole('button', { name: 'Zamknij', exact: true })
    .click();
  const timber = page.getByTestId('material-row-k1');
  await expect(timber).toContainText('PLAN ZAKUPU');
  const select = timber.getByRole('combobox');
  await expect(select.locator('option')).toHaveCount(3);
  const priceId = await select.locator('option').nth(1).getAttribute('value');
  await select.selectOption(priceId!);
  await expect(timber).toContainText('Zweryfikuj cenę przed zakupem');
  await expect(timber).toContainText('2026-09-15');
  await timber.getByRole('button', { name: 'Dodaj do kosztorysu' }).click();
  const membrane = page.getByTestId('material-row-membrane');
  await membrane.getByRole('button', { name: 'Zmień produkt' }).click();
  await page
    .locator('.a-catalog-card')
    .filter({ hasText: 'DELTA-MAXX PLUS' })
    .getByRole('button', { name: 'Szczegóły' })
    .click();
  await page.locator('.a-catalog-apply').click();
  await expect(membrane).toContainText('Powierzchnia z zakładami');
  await expect(membrane).toContainText('Liczba rolek');
  const tile = page.getByTestId('material-row-tile');
  await tile.getByRole('combobox').selectOption('manual');
  await tile.getByRole('textbox').fill('9,24');
  await tile.getByRole('textbox').blur();
  await expect(tile).toContainText('Zakres kosztu');
  await page.screenshot({
    path: testInfo.outputPath('v36-live-material-plan.png'),
    fullPage: true,
  });
  await page
    .getByTestId('material-plan')
    .getByRole('button', { name: 'Lista materiałów / druk' })
    .click();
  for (const input of await page
    .getByTestId('execution-config')
    .locator('input[type="checkbox"]:enabled')
    .all())
    await input.uncheck();
  await page
    .getByTestId('execution-config')
    .getByRole('checkbox', { name: /Lista materiałów/ })
    .check();
  await page
    .getByTestId('execution-config')
    .getByRole('button', { name: 'Podgląd dokumentu' })
    .click();
  await expect(page.locator('[data-section="material-list"]')).toContainText(
    'Lista materiałów',
  );
  await expect(page.locator('[data-section="material-list"]')).toContainText(
    'PLAN ZAKUPU',
  );
  await page.locator('[data-section="material-list"]').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('v36-material-document.png'),
  });
});
