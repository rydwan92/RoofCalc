import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-14: fitting the battens to the tile, and the whole site in 3D.
 * A tile from the bundled catalogue sets the batten gauge; the slope
 * section draws the stations the engine resolved, the first batten from
 * the eave is typed exactly, and when equal courses no longer fit the
 * section offers the nearest top gap that does. The structures of a project stand
 * together in the workbench's own 3D renderer. Offline.
 */
const UNIT_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000 };
/** A bundled tile and its stated batten gauge range (mm). */
const TILE = { name: 'Turmalin', min: 355, max: 380 };
const admits = (span: number) =>
  Math.ceil(span / TILE.max - 1e-9) <= Math.floor(span / TILE.min + 1e-9);

async function offline(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  return errors;
}

async function stations(page: Page): Promise<number[]> {
  return page
    .getByTestId('batten-slope-section')
    .locator('.bs-batten')
    .evaluateAll((battens) =>
      battens.map((batten) => Number(batten.getAttribute('data-station'))),
    );
}

test('the tile sets the batten gauge; a first batten that breaks it gets a one-click fix', async ({
  page,
}, testInfo) => {
  const errors = await offline(page);
  await page.goto('/#/');
  const start = page.getByTestId('project-start-assistant');
  await start.getByTestId('project-start-guided').click();
  for (let step = 0; step < 3; step += 1)
    await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-submit').click();
  await expect(start).toBeHidden();

  await page.locator('[data-perspective="covering"]:visible').first().click();
  await page.locator('[data-covering-family="roof-tile"]').click();
  await page.getByRole('button', { name: /Wybierz z katalogu/ }).click();
  await page.getByRole('button', { name: /wbudowanego katalogu/ }).click();
  await page
    .locator('.a-catalog-card')
    .filter({ hasText: TILE.name })
    .getByRole('button')
    .click();
  await page.getByRole('button', { name: /Użyj produktu/ }).click();
  await page.locator('[data-perspective="covering"]:visible').first().click();

  const section = page.getByTestId('batten-slope-section');
  await expect(section).toBeVisible();
  await expect(section.locator('[data-dimension="first"]')).toBeVisible();
  await expect(section.locator('[data-dimension="gauge"]')).toContainText('×');
  // The product's own range is quoted beside the gauge.
  await expect(section.locator('figcaption')).toContainText('karta produktu');

  const before = await stations(page);
  expect(before.length).toBeGreaterThan(3);
  const gauge = (before.at(-1)! - before[0]!) / (before.length - 1);
  expect(gauge).toBeGreaterThanOrEqual(TILE.min - 0.5);
  expect(gauge).toBeLessThanOrEqual(TILE.max + 0.5);

  // The first batten moves by exactly what is typed; the gauge follows the tile.
  const field = page.getByTestId('batten-eave-offset');
  const input = field.locator('input');
  const unit = (await field.locator('.a-field > div > span').textContent())!;
  const factor = UNIT_MM[unit.trim()]!;
  const current = Number((await input.inputValue()).replace(',', '.'));
  // The smallest whole-millimetre shift after which equal courses within
  // the range no longer fit: n·min <= span <= n·max has no whole n.
  const span = before.at(-1)! - before[0]!;
  let shift = 10;
  while (admits(span - shift) && shift < span / 2) shift += 1;
  expect(admits(span - shift)).toBe(false);
  const typed = Math.round((current + shift / factor) * 1000) / 1000;
  await input.fill(String(typed).replace('.', ','));
  await input.press('Enter');

  // The section stays, says why, and offers the nearest positions.
  await expect(section).toHaveClass(/is-unresolved/);
  await expect(section.locator('.bs-unresolved')).toContainText(
    'Równe rzędy się nie mieszczą',
  );
  await expect(page.getByTestId('batten-ridge-offset')).toBeVisible();
  await section.screenshot({
    path: testInfo.outputPath('vnext14-battens-no-rows.png'),
  });
  // Moving the last batten keeps the first exactly where it was typed.
  await section.getByTestId('batten-top-fit').first().click();
  await expect(section).not.toHaveClass(/is-unresolved/);
  await expect
    .poll(async () => (await stations(page))[0])
    .toBeCloseTo(before[0]! + shift, 0);
  const after = await stations(page);
  const gaugeAfter = (after.at(-1)! - after[0]!) / (after.length - 1);
  expect(gaugeAfter).toBeGreaterThanOrEqual(TILE.min - 0.5);
  expect(gaugeAfter).toBeLessThanOrEqual(TILE.max + 0.5);

  await section.screenshot({
    path: testInfo.outputPath('vnext14-battens.png'),
  });
  expect(errors).toEqual([]);
});

test('the structures of a project stand together in 3D', async ({
  page,
}, testInfo) => {
  const errors = await offline(page);
  await page.goto('/#/');
  const start = page.getByTestId('project-start-assistant');
  await start.getByTestId('project-start-examples').click();
  await start.getByTestId('project-example-house-and-carport').click();
  await expect(start).toBeHidden();

  const bar = page.getByTestId('structure-bar');
  await bar.getByTestId('structure-site').click();
  await expect(bar.locator('[data-site-view="plan"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await bar.locator('[data-site-view="3d"]').click();
  const scene = page.getByTestId('site-scene-3d');
  await expect(scene).toBeVisible();
  const canvas = scene.locator('canvas');
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(200);
  expect(box!.height).toBeGreaterThan(200);
  // Honest about what is not calculated.
  await expect(bar.locator('.a-site-3d-hint')).toContainText('nie są liczone');
  await scene.locator('[data-scene-preset="top"]').click();
  await expect(scene.locator('[data-scene-preset="top"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await scene.screenshot({ path: testInfo.outputPath('vnext14-site-3d.png') });

  await bar.locator('[data-site-view="plan"]').click();
  await expect(scene).toBeHidden();

  // The documents carry what a truss manufacturer asks for before a quote.
  await page.locator('[data-perspective="documents"]:visible').first().click();
  const sheet = page.getByTestId('truss-enquiry');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('article')).toHaveCount(2);
  await expect(sheet.locator('[data-row="area"]').first()).toContainText('m²');
  await expect(page.getByTestId('truss-enquiry-total')).toContainText('m²');
  await expect(sheet).toContainText('nie projektuje wiązarów');
  await page.getByTestId('truss-enquiry-copy').click();
  await expect(sheet.locator('.te-copied')).toBeVisible();
  await sheet.screenshot({
    path: testInfo.outputPath('vnext14-truss-enquiry.png'),
  });
  expect(errors).toEqual([]);
});
