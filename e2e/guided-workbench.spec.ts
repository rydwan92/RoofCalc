import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('home → new project → eight-stage rail → next action, no overflow', async ({
  page,
}, testInfo) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('/');
  await expect(page.getByTestId('home-business')).toHaveAttribute(
    'data-state',
    /setup-/,
  );
  await page.getByTestId('home-new-project').click();
  const start = page.getByTestId('project-start-assistant');
  await start
    .locator('[data-project-start-field="buildingLength"]')
    .fill('1000');
  await start.locator('[data-project-start-field="buildingWidth"]').fill('800');
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-submit').click();
  await expect(start).toBeHidden();
  const rail = page.getByTestId('journey-rail');
  await expect(rail.locator('li')).toHaveCount(8);
  await expect(page.getByTestId('project-next-action')).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
  await rail.locator('[data-journey-step="construction"]').click();
  await expect(page.getByTestId('structure-settings')).toHaveAttribute(
    'open',
    '',
  );
  if (testInfo.project.name === 'mobile')
    await page
      .locator('.a-mobile-sheet-header')
      .getByRole('button', { name: 'Zamknij', exact: true })
      .click();
  await page.getByTestId('journey-rail-overview').click();
  await expect(page.getByTestId('journey-dashboard').locator('li')).toHaveCount(
    8,
  );
  await page.getByTestId('overview-continue').click();
  await expect(page.getByTestId('covering-add-assistant')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test('home lists local projects, reopens one and the quick path saves nothing', async ({
  page,
}) => {
  const source = JSON.parse(
    readFileSync('fixtures/projects/01-basic-gable.cieslacalc.json', 'utf8'),
  );
  const records = ['First roof', 'Second roof'].map((name, index) => ({
    ...source,
    id: `guided-recent-${index}`,
    name,
  }));
  await page.addInitScript((projects) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem(
      'cieslacalc.projects.v1.index',
      JSON.stringify({
        schemaVersion: 1,
        projects: projects.map(({ id, name, createdAt, updatedAt }) => ({
          id,
          name,
          createdAt,
          updatedAt,
        })),
      }),
    );
    for (const project of projects)
      localStorage.setItem(
        'cieslacalc.projects.v1.record.' + project.id,
        JSON.stringify(project),
      );
  }, records);
  await page.goto('/');
  await page
    .getByTestId('home-recent-project')
    .filter({ hasText: 'Second roof' })
    .click();
  await expect(page.getByTestId('journey-rail')).toBeVisible();
  await page.locator('.a-brand').click();
  await expect(page.getByTestId('home-recent-project').first()).toContainText(
    'Second roof',
  );
  const before = await page.evaluate(() => Object.keys(localStorage).length);
  await page.getByTestId('home-quick').click();
  await expect(page.locator('.a-basic-fields')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(
    before,
  );
});
