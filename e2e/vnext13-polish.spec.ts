import { expect, test } from '@playwright/test';

/**
 * VNext-13: the workbench fits the screen. An example opens as the only
 * project; a project of several structures keeps its structure row one
 * line high; on a phone the canvas ends above the task dock, so the fitted
 * roof is seen whole; the documents say whose they are. Offline.
 */
test('an example of two structures opens as one project and fits the screen', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/');
  const start = page.getByTestId('project-start-assistant');
  await start.getByTestId('project-start-examples').click();
  const example = start.locator('[data-example="house-and-carport"]');
  await expect(example.locator('.a-start-example-badge')).toHaveText(
    'Bryły projektu: 2',
  );
  // The buttons of one row of examples end on one line.
  const tops = await start
    .locator('[data-example] > .a-button')
    .evaluateAll((buttons) =>
      buttons.map((button) => Math.round(button.getBoundingClientRect().top)),
    );
  expect(new Set(tops.slice(0, 3).filter(Boolean)).size).toBeLessThanOrEqual(
    testInfo.project.name === 'mobile' ? 3 : 1,
  );
  await example.getByTestId('project-example-house-and-carport').click();
  await expect(start).toBeHidden();

  // The example is the only record: no empty "Projekt 1" stays behind.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith('cieslacalc.projects.v1.record.'),
          ).length,
      ),
    )
    .toBe(1);

  // One line of structures; the open one is still announced.
  const bar = page.getByTestId('structure-bar');
  const barBox = await bar.boundingBox();
  expect(barBox!.height).toBeLessThan(80);
  await expect(bar).toContainText('pokazują teraz bryłę „Dom”');

  // The canvas fits: above the window's bottom, above the phone dock.
  const canvas = page.getByTestId('skeleton-drawing').first();
  const canvasBox = await canvas.boundingBox();
  const viewport = page.viewportSize()!;
  if (testInfo.project.name === 'mobile') {
    const dock = await page.locator('.a-mobile-task-dock').boundingBox();
    expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(dock!.y + 1);
  } else {
    expect(canvasBox!.y + canvasBox!.height).toBeLessThanOrEqual(
      viewport.height,
    );
  }
  await page.screenshot({
    path: testInfo.outputPath('vnext13-workbench.png'),
    fullPage: false,
  });

  // The documents of a project of several structures name the structure.
  await page.locator('[data-perspective="documents"]:visible').first().click();
  await expect(
    page.getByTestId('document-hub').getByRole('heading', { level: 2 }),
  ).toContainText('Centrum dokumentów · Dom');
  expect(errors).toEqual([]);
});
