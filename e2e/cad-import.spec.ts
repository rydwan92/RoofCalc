import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * VNext-4: a CAD plan (DXF) opened from the start dialog's universal
 * "Open a file…" becomes a RoofCalc project after one confirmation.
 * Offline on purpose: nothing leaves the device.
 */
test('DXF hip plan → recognised walls, eave, hips and pitch → confirmed project', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await expect(start.getByTestId('project-start-drop-hint')).toBeVisible();
  await start
    .locator('input[type="file"]')
    .setInputFiles(resolve('fixtures/cad/hip-12x8-eave-50.dxf'));
  const workspace = page.getByTestId('cad-import-workspace');
  await expect(workspace).toBeVisible();
  await expect(page.getByTestId('cad-confirmation')).toBeVisible();
  await expect(page.getByTestId('cad-roof-hip')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('cad-pitch')).toHaveValue('35');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`cad-import-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByTestId('cad-confirm').check();
  await page.getByTestId('cad-create').click();
  await expect(workspace).toHaveCount(0);
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
  await expect(
    page.locator('.a-project-trigger:visible').first(),
  ).toContainText('hip-12x8-eave-50');
  expect(errors).toEqual([]);
});
