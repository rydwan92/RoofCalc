import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

for (const unit of ['metre', 'millimetre'] as const) {
  test(`IFC ${unit} gable confirms exactly one canonical project`, async ({
    page,
  }, testInfo) => {
    await page.goto('/#/calculators/common-rafter');
    await page.locator('[data-mode="builder"]').click();
    await page.locator('.a-start-secondary > summary').click();
    await page.getByTestId('project-start-advanced').click();
    const before = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith('cieslacalc.projects.v1.record.'),
        ),
      ),
    );
    await page.getByRole('button', { name: 'Projekty', exact: true }).click();
    await page.getByTestId('project-import-ifc').click();
    const importer = page.getByTestId('ifc-import-workspace');
    let content = readFileSync(resolve('fixtures/ifc/gable.ifc'), 'utf8');
    if (unit === 'millimetre') {
      content = content
        .replace('.LENGTHUNIT.,$,.METRE.', '.LENGTHUNIT.,.MILLI.,.METRE.')
        .replace(
          /(#19=IFCCARTESIANPOINTLIST3D\()(.+)(\);)/,
          (_, start: string, coordinates: string, end: string) =>
            start +
            coordinates.replace(/-?\d+(?:\.\d*)?/g, (value) =>
              String(Number(value) * 1000),
            ) +
            end,
        );
    }
    await importer.locator('input[type="file"]').setInputFiles({
      name: `${unit}.ifc`,
      mimeType: 'text/plain',
      buffer: Buffer.from(content),
    });
    await importer
      .getByRole('button', { name: 'Gable roof IfcRoof' })
      .click({ timeout: 30_000 });
    await importer
      .getByRole('button', { name: 'Analizuj dach', exact: true })
      .click();
    await expect(
      importer.getByRole('heading', { name: 'Parametry projektu RoofCalc' }),
    ).toBeVisible();
    await importer
      .getByRole('heading', { name: 'Parametry projektu RoofCalc' })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`ifc-parameters-${unit}.png`),
    });
    for (const [field, expected] of [
      ['buildingLength', 12000],
      ['buildingWidth', 8000],
      ['pitch', 35],
    ] as const)
      expect(
        Number(await importer.getByTestId(`ifc-${field}`).inputValue()),
      ).toBeCloseTo(expected, 2);
    const create = importer.getByRole('button', {
      name: 'Utwórz projekt RoofCalc',
      exact: true,
    });
    await expect(create).toBeDisabled();
    await importer.getByTestId('ifc-buildingLength').fill('');
    await expect(importer.getByTestId('ifc-buildingLength')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(create).toBeDisabled();
    await importer.getByTestId('ifc-buildingLength').fill('13500');
    await importer.getByRole('checkbox').check();
    await expect(create).toBeEnabled();
    expect(
      await page.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([key]) =>
            key.startsWith('cieslacalc.projects.v1.record.'),
          ),
        ),
      ),
    ).toEqual(before);
    expect(
      await importer.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await create.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`ifc-confirm-${unit}.png`),
    });
    await create.click();
    await expect(importer).toBeHidden();
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    const after = await page.evaluate(() =>
      Object.fromEntries(
        Object.entries(localStorage).filter(([key]) =>
          key.startsWith('cieslacalc.projects.v1.record.'),
        ),
      ),
    );
    const created = Object.keys(after).filter((key) => !before[key]);
    expect(created).toHaveLength(1);
    const document = JSON.parse(after[created[0]!]!).document;
    expect(document.project.roof).toMatchObject({
      type: 'gable',
      buildingLengthMm: 13500,
      halfRunMm: 4000,
    });
    expect(document.project.roof.pitchDeg).toBeCloseTo(35, 2);
    expect(JSON.stringify(document)).not.toMatch(
      /expressId|sourceRoof|analysisGeometry|displayOrigin|spatialNodes/,
    );
    for (const key of Object.keys(before)) expect(after[key]).toBe(before[key]);
    await page.reload();
    await page.locator('[data-mode="builder"]').click();
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    expect(
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).document,
        created[0]!,
      ),
    ).toEqual(document);
  });
}

test('pyramid IFC is rejected with a clear reason and cannot create a project', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.locator('.a-start-secondary > summary').click();
  await page.getByTestId('project-start-advanced').click();
  await page.getByRole('button', { name: 'Projekty', exact: true }).click();
  await page.getByTestId('project-import-ifc').click();
  const importer = page.getByTestId('ifc-import-workspace');
  await importer
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/ifc/pyramid.ifc'));
  await importer
    .getByRole('button', { name: 'Pyramid roof IfcRoof' })
    .click({ timeout: 30_000 });
  await importer
    .getByRole('button', { name: 'Analizuj dach', exact: true })
    .click();
  await expect(importer.getByRole('alert')).toContainText(
    'Ten kształt dachu nie jest jeszcze wspierany',
  );
  await expect(
    importer.getByRole('button', { name: 'Utwórz projekt RoofCalc' }),
  ).toHaveCount(0);
});

test('local IFC reference import shows a roof without changing the project', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const assistant = page.getByTestId('project-start-assistant');
  await page.locator('.a-start-secondary > summary').click();
  await assistant.getByTestId('project-start-advanced').click();
  await expect(assistant).toBeHidden();
  await page.getByRole('button', { name: 'Projekty' }).click();
  await page.getByTestId('project-import-ifc').click();
  const importer = page.getByTestId('ifc-import-workspace');
  await expect(importer).toBeVisible();
  await importer
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/ifc/gable.ifc'));
  await expect(
    importer.getByRole('button', { name: 'Gable roof IfcRoof' }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(importer.getByText('Kandydaci na dach: 1')).toBeVisible();
  await importer.getByRole('button', { name: 'Gable roof IfcRoof' }).click();
  await expect(importer.getByText('GABLE_ROOF').first()).toBeVisible();
  await importer.getByRole('button', { name: 'Dach', exact: true }).click();
  await expect(importer.locator('canvas')).toBeVisible();
  await importer.getByRole('button', { name: 'Zamknij importer' }).click();
  await expect(importer).toBeHidden();
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
});

test('unsupported IFC file fails safely and remains in the importer', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.locator('.a-start-secondary > summary').click();
  await page
    .getByTestId('project-start-assistant')
    .getByTestId('project-start-advanced')
    .click();
  await page.getByRole('button', { name: 'Projekty' }).click();
  await page.getByTestId('project-import-ifc').click();
  const importer = page.getByTestId('ifc-import-workspace');
  await importer.locator('input[type="file"]').setInputFiles({
    name: 'bad.ifc',
    mimeType: 'text/plain',
    buffer: Buffer.from('invalid'),
  });
  await expect(importer.getByRole('alert')).toContainText('nagłówka IFC');
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
});

test('regular hip IFC converts to one hip project and overlays as reference', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByTestId('home-import-ifc').click();
  const importer = page.getByTestId('ifc-import-workspace');
  await importer
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/ifc/hip.ifc'));
  await importer
    .getByRole('button', { name: 'Hip roof IfcRoof' })
    .click({ timeout: 30_000 });
  await importer
    .getByRole('button', { name: 'Analizuj dach', exact: true })
    .click();
  await expect(importer.getByTestId('ifc-recognized-roof')).toHaveAttribute(
    'data-roof-type',
    'hip',
  );
  for (const [field, expected] of [
    ['buildingLength', 12000],
    ['buildingWidth', 8000],
    ['pitch', 35],
  ] as const)
    expect(
      Number(await importer.getByTestId(`ifc-${field}`).inputValue()),
    ).toBeCloseTo(expected, 2);
  await importer.getByRole('checkbox').check();
  await importer
    .getByRole('button', { name: 'Utwórz projekt RoofCalc', exact: true })
    .click();
  await expect(importer).toBeHidden();
  const records = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([key]) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map(([, value]) => JSON.parse(value).document.project.roof),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    type: 'hip',
    buildingLengthMm: 12000,
    halfRunMm: 4000,
  });
  // The 3D overlay is checked where the renderer switch is in the toolbar.
  if (testInfo.project.name === 'mobile') return;
  await page.locator('[data-workspace-renderer="3d"]').first().click();
  await expect(page.getByTestId('technical-scene-3d')).toBeVisible();
  const toggle = page.locator('[data-scene-action="ifc-reference"]');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('scene-3d-ifc-compare')).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId('scene-3d-ifc-compare')).toBeHidden();
});
