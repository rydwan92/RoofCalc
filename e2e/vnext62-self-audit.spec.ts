import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';

/**
 * VNext-6.2 self-audit: the defects found by walking the app, kept fixed.
 * Offline on purpose — none of them needs the catalogue.
 */
const RECORD_KEY = 'cieslacalc.projects.v1.record.audit-05';

async function openTileProject(page: Page) {
  const record = JSON.parse(
    readFileSync(
      'fixtures/projects/05-gable-roof-tile.cieslacalc.json',
      'utf8',
    ),
  ) as ProjectRecordV1;
  record.id = 'audit-05';
  record.name = 'Audyt — dachówka';
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.addInitScript((project) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
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
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  await expect(page.locator('.a-project-trigger')).toContainText(
    'Audyt — dachówka',
  );
}

const storedCoverings = (page: Page) =>
  page.evaluate(
    (key) =>
      JSON.parse(localStorage.getItem(key) ?? 'null')?.document.project
        .coverings.length ?? -1,
    RECORD_KEY,
  );

test('"Przywróć przykład" is an undoable edit, not a silent overwrite of the saved project', async ({
  page,
}, testInfo) => {
  await openTileProject(page);
  expect(await storedCoverings(page)).toBe(1);
  if (testInfo.project.name === 'mobile') {
    await page.locator('.a-header-overflow > summary').click();
    await page
      .locator('.a-header-overflow')
      .getByRole('button', { name: 'Przywróć przykład' })
      .click();
  } else await page.getByRole('button', { name: 'Przywróć przykład' }).click();
  const feedback = page.getByTestId('action-feedback');
  await expect(feedback).toContainText('Wczytano przykładowy dach');
  await expect.poll(() => storedCoverings(page)).toBe(0);
  // One click back — in the notice, as in the header.
  await feedback.getByTestId('action-feedback-undo').click();
  await expect.poll(() => storedCoverings(page)).toBe(1);
  await expect(page.locator('.a-project-trigger')).toContainText(
    'Audyt — dachówka',
  );
});

for (const width of [1366, 1440]) {
  test(`the one next action keeps its whole label at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop row only');
    await page.setViewportSize({ width, height: 800 });
    await openTileProject(page);
    const next = page.locator('[data-testid="project-next-action"]:visible');
    await expect(next).toHaveText('Ustaw pierwszą łatę od okapu');
    const clipped = await next.evaluate(
      (button) => button.scrollWidth > button.clientWidth + 1,
    );
    expect(clipped).toBe(false);
    // The row still never pushes the page sideways.
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
  });
}

test('phone: six readable dock labels and one way to the covering parameters', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone dock only');
  await openTileProject(page);
  const dock = page.locator('.a-mobile-task-dock');
  const labels = dock.locator('button span');
  await expect(labels).toHaveCount(6);
  const cut = await labels.evaluateAll((spans) =>
    spans
      .filter((span) => span.scrollWidth > span.clientWidth + 1)
      .map((span) => span.textContent),
  );
  expect(cut).toEqual([]);
  const sizes = await labels.evaluateAll((spans) =>
    spans.map((span) => parseFloat(getComputedStyle(span).fontSize)),
  );
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  await dock.locator('[data-perspective="covering"]').click();
  await expect(
    page.getByRole('button', { name: 'Parametry / Popraw' }),
  ).toHaveCount(1);
});
