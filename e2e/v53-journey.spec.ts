import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectRecordV1 } from '@cieslacalc/project-core';

/**
 * V53 guided project experience: the app tells the user what to do next,
 * sends them straight to the missing decision and updates after it. Offline:
 * guidance never needs the catalogue.
 */
async function openRecord(page: Page, record: ProjectRecordV1) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.addInitScript((project) => {
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
}

function fixture(name: string, id: string) {
  const record = JSON.parse(
    readFileSync(`fixtures/projects/${name}`, 'utf8'),
  ) as ProjectRecordV1;
  record.id = id;
  record.name = `V53 · ${id}`;
  return record;
}

test('V53 new roof: the bar says what to do next and leads through the flow', async ({
  page,
}) => {
  await openRecord(page, fixture('01-basic-gable.cieslacalc.json', 'v53-new'));
  const bar = page.getByTestId('project-readiness-bar');
  await expect(bar).toContainText('Co teraz', { ignoreCase: true });
  // No covering yet: the one next action is choosing it, never cost.
  await expect(page.getByTestId('project-next-action')).toHaveAttribute(
    'data-readiness-action',
    'choose-covering',
  );
  // The journey explains why later stages wait.
  await page.getByTestId('project-progress').click();
  const journey = page.getByTestId('project-journey');
  await expect(journey).toBeVisible();
  await expect(
    journey.locator('[data-stage="covering"][data-recommended]'),
  ).toBeVisible();
  await expect(journey.locator('[data-stage="layers"]')).toContainText(
    'Czeka na pokrycie',
  );
  await expect(journey.locator('[data-stage="cost"]')).toContainText(
    'Opcjonalne',
  );
  // Completed stages summarise themselves and open their workspace.
  await expect(journey.locator('[data-stage="geometry"]')).toContainText(
    'Dwuspadowy',
  );
  await page.getByTestId('journey-stage-covering').click();
  await expect(page.getByTestId('project-journey')).toHaveCount(0);
  // Experts may still go anywhere: Cost opens, and points at materials.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  await expect(page.locator('main')).toBeVisible();
});

test('V53 imperfect project: "Kołnierz O1" goes straight to the window and updates', async ({
  page,
}) => {
  const record = fixture('05-gable-roof-tile.cieslacalc.json', 'v53-window');
  const project = (
    record as unknown as {
      document: { project: { features: unknown[] } };
    }
  ).document.project;
  project.features = [
    {
      id: 'feature:roof-window-1',
      kind: 'roof-window',
      roofPlaneId: 'roof-plane:left',
      widthMm: 780,
      heightMm: 1180,
      position: { uMm: 1000, vMm: 1200 },
      clearanceMm: 0,
    },
  ];
  await openRecord(page, record);
  // Materials: the attention filter shows only what still needs a decision.
  await page.locator('[data-perspective="materials"]:visible').first().click();
  await expect(page.getByTestId('material-filter')).toBeVisible();
  await page.getByTestId('material-filter-attention').click();
  const openings = page.getByTestId('material-group-openings');
  await expect(openings).toContainText('Okno 1');
  await expect(
    page.locator('[data-testid="material-row-tileBase"]'),
  ).toHaveCount(0);
  await page.getByTestId('material-filter-all').click();
  // The journey's roof-system step focuses the exact opening.
  await page.getByTestId('project-progress').click();
  await page.getByTestId('journey-stage-roof-system').click();
  await expect(page.getByTestId('roof-system-workspace')).toBeVisible();
  const editor = page.getByTestId('rs-opening-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText('1. Określ okno');
  await editor.getByTestId('rs-flashing-manual-open').click();
  await editor.getByTestId('rs-flashing-manual-name').fill('Kołnierz ręczny');
  await editor.getByTestId('rs-flashing-manual-save').click();
  await expect(editor.getByTestId('rs-flashing-name')).toHaveText(
    'Kołnierz ręczny',
  );
  // The window no longer needs a flashing anywhere.
  await page.getByTestId('project-progress').click();
  await expect(
    page.getByTestId('project-journey').locator('[data-stage="roof-system"]'),
  ).not.toContainText('Wymaga decyzji');
  await page.keyboard.press('Escape');
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
});
