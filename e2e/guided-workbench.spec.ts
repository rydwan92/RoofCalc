import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('start → geometry → structure → next action, with exact inputs and no overflow', async ({
  page,
}, testInfo) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto('/');
  const start = page.getByTestId('project-start-assistant');
  await expect(start.getByTestId('project-start-guided')).toBeVisible();
  await expect(start.getByTestId('project-start-quick')).toBeVisible();
  await expect(start.getByTestId('project-start-ifc')).toBeVisible();
  await expect(start.getByTestId('project-start-advanced')).toBeHidden();
  await page.screenshot({
    path: `test-results/guided-start-${testInfo.project.name}.png`,
    animations: 'disabled',
  });
  await start.getByTestId('project-start-guided').click();
  await start
    .locator('[data-project-start-field="buildingLength"]')
    .fill('1000');
  await start.locator('[data-project-start-field="buildingWidth"]').fill('800');
  await start.getByTestId('project-start-next').click();
  await start.locator('[data-project-start-field="pitch"]').fill('35');
  await start.getByTestId('project-start-next').click();
  await expect(start.getByRole('status')).toContainText('ustaw konstrukcję');
  await start.locator('[data-project-start-field="spacing"]').fill('80');
  await start.getByTestId('project-start-next').click();
  await expect(start.getByRole('status')).toContainText('przejdź do pokrycia');
  await start.getByTestId('project-start-submit').click();
  await expect(start).toBeHidden();
  const journey = page.getByTestId('journey-overview');
  await expect(journey.locator('li')).toHaveCount(6);
  await expect(page.getByTestId('project-next-action')).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
  await journey.locator('[data-journey-step="construction"]').click();
  const fields = page.getByTestId('structure-settings');
  await expect(fields).toHaveAttribute('open', '');
  const width = fields.locator('input').first();
  await width.fill('9');
  await width.press('Enter');
  if (testInfo.project.name === 'mobile')
    await page
      .locator('.a-mobile-sheet-header')
      .getByRole('button', { name: 'Zamknij', exact: true })
      .click();
  await expect(page.getByTestId('project-next-action')).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
  await page.getByTestId('project-next-action').click();
  await expect(page.getByTestId('covering-add-assistant')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/guided-workbench-${testInfo.project.name}.png`,
    animations: 'disabled',
  });
});

test('home quick path creates no project and IFC path opens the existing importer', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByTestId('project-start-quick').click();
  await expect(page.locator('.a-basic-fields')).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        key.startsWith('cieslacalc.projects.v1.record.'),
      ),
    ),
  ).toEqual([]);
  await page.reload();
  await page.getByTestId('project-start-ifc').click();
  await expect(page.getByTestId('ifc-import-workspace')).toBeVisible();
});

test('an unresolved structure leads to its exact decision, then updates to covering', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const start = page.getByTestId('project-start-assistant');
  await start.getByTestId('project-start-guided').click();
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-next').click();
  await start
    .locator('[data-choice="ridge-connection"] [data-choice-value="half-lap"]')
    .click();
  await start.getByTestId('project-start-next').click();
  await start.getByTestId('project-start-submit').click();
  const next = page.getByTestId('project-next-action');
  await expect(next).toHaveAttribute(
    'data-readiness-action',
    'review-structure',
  );
  await next.click();
  const fields = page.getByTestId('structure-settings');
  await expect(fields).toHaveAttribute('open', '');
  await fields
    .getByRole('button', { name: 'Deska kalenicowa', exact: true })
    .click();
  if (testInfo.project.name === 'mobile')
    await page
      .locator('.a-mobile-sheet-header')
      .getByRole('button', { name: 'Zamknij', exact: true })
      .click();
  await expect(next).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
  await expect(page.getByRole('status')).toContainText('Konstrukcja');
  await page.getByTestId('project-overview-action').click();
  await expect(page.getByTestId('journey-dashboard')).toContainText(
    'Dwuspadowy',
  );
  await expect(page.getByTestId('journey-dashboard').locator('li')).toHaveCount(
    6,
  );
  await page.screenshot({
    path: `test-results/guided-overview-${testInfo.project.name}.png`,
    animations: 'disabled',
  });
  await page.locator('.a-brand').click();
  await expect(start).toBeVisible();
  await expect(
    start.locator('.a-start-recent-list').first().getByRole('button'),
  ).toHaveCount(1);
  await start
    .locator('.a-start-recent-list')
    .first()
    .getByRole('button')
    .click();
  await expect(start).toBeHidden();
  await expect(next).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
});

test('recent and all projects reopen local records; start copy follows English', async ({
  page,
}) => {
  const source = JSON.parse(
    readFileSync('fixtures/projects/01-basic-gable.cieslacalc.json', 'utf8'),
  );
  const records = [
    'First roof',
    'Second roof',
    'Third roof',
    'Fourth roof',
  ].map((name, index) => ({ ...source, id: `guided-recent-${index}`, name }));
  await page.addInitScript((projects) => {
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
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  }, records);
  await page.goto('/');
  const start = page.getByTestId('project-start-assistant');
  await expect(
    start.locator('.a-start-recent-list').first().getByRole('button'),
  ).toHaveCount(3);
  await start.getByTestId('start-all-projects').locator('summary').click();
  await start
    .getByTestId('start-all-projects')
    .getByRole('button', { name: 'Fourth roof' })
    .click();
  await expect(start).toBeHidden();
  await page.locator('.a-brand').click();
  await expect(
    start.locator('.a-start-recent-list').first().getByRole('button').first(),
  ).toHaveText('Fourth roof');
  await start.getByTestId('project-start-quick').click();
  // The desktop and mobile settings expose the same language action.
  const language = page.getByRole('button', {
    name: 'Zmień język na angielski',
  });
  if (!(await language.isVisible()))
    await page.getByRole('button', { name: 'Ustawienia', exact: true }).click();
  await language.click();
  await page.locator('.a-brand').click();
  await expect(start.getByTestId('project-start-guided')).toContainText(
    'New project',
  );
  await expect(start.getByTestId('project-start-ifc')).toContainText(
    'Import IFC project',
  );
});
