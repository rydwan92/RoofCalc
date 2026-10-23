import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-7B-3: the mono-pitch roof workspace, end to end in a real browser.
 * Offline on purpose — every number comes from the local solvers.
 */
async function openMonoPitch(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await page.getByTestId('project-start-mono-pitch').click();
  const workspace = page.getByTestId('mono-pitch-workspace');
  await expect(workspace).toBeVisible();
  return workspace;
}

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => {
    const layer = document.querySelector('.mono-layer');
    return (
      document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1 &&
      (!layer || layer.scrollWidth <= layer.clientWidth + 1)
    );
  });

test('mono-pitch: from the start dialog to rafters, cuts and the schedule', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const workspace = await openMonoPitch(page);
  await expect(page.getByTestId('mono-pitch-result-stock')).toContainText(
    '502,3 cm',
  );
  await expect(page.getByTestId('mono-pitch-result-rafters')).toContainText(
    '8 szt.',
  );
  // The exact input recalculates everything at once.
  const pitch = page.locator('[id="mono-pitch.pitchDeg"]');
  await pitch.fill('25');
  await expect(page.getByTestId('mono-pitch-result-plates')).toContainText(
    '180 cm',
  );
  await expect(page.getByTestId('mono-pitch-cuts')).toContainText(
    '65° do krawędzi krokwi',
  );
  await expect(
    page.getByTestId('mono-pitch-marking').locator('li'),
  ).toHaveCount(7);
  await expect(page.getByTestId('mono-pitch-list')).toContainText('Krokiew K1');
  if (testInfo.project.name === 'mobile')
    await expect(page.getByTestId('mono-pitch-key')).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`vnext7b-mono-${testInfo.project.name}.png`),
  });

  // Against a wall: a ledger and no high overhang.
  await page.getByTestId('mono-pitch-top-abutment').check();
  await expect(page.locator('[id="mono-pitch.highOverhangMm"]')).toHaveCount(0);
  await expect(page.getByTestId('mono-pitch-result-plates')).toContainText(
    'łata przyścienna',
  );

  // A blocking value is named at its field; the result stays readable.
  const seat = page.locator('[id="mono-pitch.lowSeatMm"]');
  await seat.fill('20');
  await expect(seat).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('mono-pitch-invalid')).toBeVisible();
  await seat.fill('10');
  await expect(page.getByTestId('mono-pitch-invalid')).toHaveCount(0);

  // Close, reopen: the draft of this browser is still there.
  await workspace
    .getByRole('button', { name: 'Zamknij dach jednospadowy' })
    .click();
  await expect(workspace).toHaveCount(0);
  await page.reload();
  await page.locator('[data-mode="builder"]').click();
  // The last project reopens; Home (the logo) leads back to the start.
  const start = page.getByTestId('project-start-assistant');
  if (!(await start.isVisible())) await page.locator('.a-brand').click();
  await start.getByTestId('project-start-mono-pitch').click();
  await expect(page.locator('[id="mono-pitch.pitchDeg"]')).toHaveValue('25');
  await expect(page.getByTestId('mono-pitch-top-abutment')).toBeChecked();
  expect(errors).toEqual([]);
});

test('mono-pitch: keyboard only — Tab to the inputs, Escape closes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard path on desktop');
  const workspace = await openMonoPitch(page);
  const length = page.locator('[id="mono-pitch.buildingLengthMm"]');
  await length.focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('1000');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('mono-pitch-result-rafters')).toContainText(
    '13 szt.',
  );
  await page.keyboard.press('Escape');
  await expect(workspace).toHaveCount(0);
});

test('mono-pitch: the quick calculator leads there too', async ({ page }) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.getByTestId('quick-open-mono-pitch').click();
  await expect(page.getByTestId('mono-pitch-workspace')).toBeVisible();
  await expect(page.getByTestId('mono-pitch-result-rafters')).toContainText(
    'K1',
  );
});
