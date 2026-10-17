import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-2 connection plan, end to end: Konstrukcja → Połączenia on the
 * collar-tie example. Planning writes the canonical project, is one undo
 * step, survives a reload, and the EN 1995-1-1 detailing check reports the
 * row of bolts against the modelled section — never a capacity.
 */
async function openCollarTieExample(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await page.locator('.a-start-secondary > summary').click();
  await start.getByTestId('project-start-examples').click();
  await start.getByTestId('project-example-collar-tie').click();
  await expect(start).toBeHidden();
}

async function openConnections(page: Page) {
  await page
    .getByLabel('Sekcja: Konstrukcja')
    .locator('visible=true')
    .first()
    .click();
  await page.getByRole('tab', { name: 'Połączenia' }).click();
  await expect(page.getByTestId('connection-plan')).toBeVisible();
}

test('plans the connections of a collar-tie roof', async ({ page }) => {
  await openCollarTieExample(page);
  await openConnections(page);
  const plan = page.getByTestId('connection-plan');
  for (const kind of [
    'wall-plate-anchorage',
    'rafter-wall-plate',
    'collar-tie-rafter',
    'rafter-ridge',
  ])
    await expect(plan.getByTestId(`connection-node-${kind}`)).toBeVisible();
  await expect(plan).toContainText('PN-EN 1995-1-1');

  // A rafter tie at every rafter–wall plate node: 22 pieces, as evidence.
  const seat = plan.getByTestId('connection-node-rafter-wall-plate');
  await seat
    .getByTestId('connection-connector-rafter-wall-plate')
    .selectOption('rafter-tie');
  await expect(seat).toHaveAttribute('data-status', 'planned');
  await expect(seat).toContainText('22 szt.');

  // One edit, one undo step — and redo brings it back.
  const undo = page.getByRole('button', { name: 'Cofnij zmianę' });
  const redo = page.getByRole('button', { name: 'Ponów zmianę' });
  await undo.locator('visible=true').first().click();
  await expect(seat).toHaveAttribute('data-status', 'not-planned');
  await redo.locator('visible=true').first().click();
  await expect(seat).toHaveAttribute('data-status', 'planned');

  // Two M12 bolts per collar–rafter lap, checked against Table 8.4.
  const collar = plan.getByTestId('connection-node-collar-tie-rafter');
  await collar
    .getByTestId('connection-fastener-collar-tie-rafter')
    .selectOption('bolts');
  await collar
    .getByTestId('connection-diameter-collar-tie-rafter')
    .selectOption('12');
  await collar.getByTestId('connection-count-collar-tie-rafter').fill('2');
  const detailing = collar.getByTestId(
    'connection-detailing-collar-tie-rafter',
  );
  await expect(detailing).toContainText('Tablica 8.4');
  await expect(detailing).toContainText('nie nośności');
  // The example's collar tie is 38 mm deep: a row of two M12 cannot fit.
  await expect(collar).toHaveAttribute('data-status', 'check-detailing');
  await expect(plan.getByTestId('connection-plan-planned')).toHaveText('2');

  // The plan is canonical project data: autosaved, it survives a reload.
  await page.waitForTimeout(1500);
  const saved = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
      .map(
        (key) =>
          JSON.parse(localStorage.getItem(key)!).document.project
            .connectionPlan,
      ),
  );
  expect(saved).toContainEqual({
    version: 1,
    nodes: {
      'rafter-wall-plate': { connector: 'rafter-tie' },
      'collar-tie-rafter': {
        fastening: { type: 'bolts', diameterMm: 12, perNode: 2 },
      },
    },
  });
  await page.reload();
  await page.locator('[data-mode="builder"]').click();
  await openConnections(page);
  await expect(
    page.getByTestId('connection-node-rafter-wall-plate'),
  ).toHaveAttribute('data-status', 'planned');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
