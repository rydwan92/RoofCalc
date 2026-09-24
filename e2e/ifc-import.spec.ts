import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('local IFC reference import shows a roof without changing the project', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const assistant = page.getByTestId('project-start-assistant');
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
