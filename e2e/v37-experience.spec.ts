import { expect, test, type Page } from '@playwright/test';

/**
 * V37 product experience: guided Creator, example projects, perspective
 * navigation with a contextual return, and truthful covering edge semantics.
 * Selects by stable data-* hooks; catalogue access is not required.
 */

async function noHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1,
    ),
  ).toBe(true);
}

async function openPerspectiveTask(
  page: Page,
  perspective: string,
  task?: string,
) {
  await page
    .locator(`[data-perspective="${perspective}"]:visible`)
    .first()
    .click();
  if (task) await page.locator(`[data-task="${task}"]:visible`).first().click();
}

async function addManualTile(page: Page) {
  const assistant = page.getByTestId('covering-add-assistant');
  await assistant.locator('[data-covering-family="roof-tile"]').click();
  await assistant.locator('[data-covering-source="manual"]').click();
  for (const [field, value] of Object.entries({
    name: 'Dachówka V37',
    physicalWidth: '33',
    physicalLength: '42',
    coverWidth: '30',
    gaugeMin: '30',
    gaugeMax: '38',
    minimumPitch: '19',
  }))
    await assistant.locator(`[data-manual-field="${field}"]`).fill(value);
  await assistant.getByTestId('confirm-manual-covering').click();
  await expect(page.getByTestId('tile-layout-drawing')).toBeVisible();
  // V46: Auto battens arrive with the first covering.
  await expect(
    page.getByTestId('tile-layout-drawing').locator('.a-covering-batten'),
  ).not.toHaveCount(0);
}

test.describe('V37 — new user', () => {
  test('guided gable project → covering views → Materials → Back to Covering', async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/#/calculators/common-rafter');
    await page.locator('[data-mode="builder"]').click();
    const assistant = page.getByTestId('project-start-assistant');
    await assistant.getByTestId('project-start-guided').click();
    await assistant
      .locator('[data-choice="roof-type"] [data-choice-value="gable"]')
      .click();
    await expect(
      assistant.locator('[data-illustration="building-length"]'),
    ).toBeVisible();
    await assistant
      .locator('[data-project-start-field="buildingLength"]')
      .fill('1000');
    await assistant
      .locator('[data-project-start-field="buildingWidth"]')
      .fill('800');
    await expect(assistant.getByTestId('project-start-plan')).toBeVisible();
    await assistant.getByTestId('project-start-next').click();
    await expect(
      assistant.locator('[data-illustration="pitch"]'),
    ).toBeVisible();
    await assistant.locator('[data-project-start-field="pitch"]').fill('38');
    await assistant.locator('[data-project-start-field="eave"]').fill('60');
    await assistant.getByTestId('project-start-next').click();
    await assistant.locator('[data-project-start-field="spacing"]').fill('90');
    await assistant.getByTestId('project-start-next').click();
    const review = assistant.getByTestId('project-start-review');
    await expect(
      review.locator('[data-readiness="k1Cutting"]'),
    ).toHaveAttribute('data-state', 'ready');
    await assistant.getByTestId('project-start-submit').click();
    await expect(assistant).toBeHidden();

    // Lands in Project › Konstrukcja with a readable breadcrumb.
    await expect(
      page
        .locator('[data-perspective="project"][aria-selected="true"]:visible')
        .first(),
    ).toBeVisible();
    await expect(page.getByTestId('workbench-context-bar')).toContainText(
      'Projekt',
    );
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();

    await openPerspectiveTask(page, 'project', 'covering');
    await addManualTile(page);
    const drawing = page.getByTestId('tile-layout-drawing');
    await expect(drawing).toHaveAttribute('data-covering-mode', 'technical');
    const counts = await page.locator('.a-covering-counts').textContent();
    await page.locator('[data-covering-view="visual"]').click();
    await expect(drawing).toHaveAttribute('data-covering-mode', 'visual');
    await expect(page.locator('.a-tile-glyph')).not.toHaveCount(0);
    await expect(page.locator('.a-covering-counts')).toHaveText(counts!);
    await page.locator('[data-covering-view="technical"]').click();

    // Cross-context jump from the material plan back to Covering.
    await openPerspectiveTask(page, 'materials');
    await expect(page.getByTestId('material-plan')).toBeVisible();
    await page
      .getByTestId('material-plan')
      .getByRole('button', { name: /Wybierz wariant w Pokryciu/ })
      .first()
      .click();
    await expect(
      page
        .locator('[data-task="covering"][aria-selected="true"]:visible')
        .first(),
    ).toBeVisible();
    const back = page.getByTestId('workbench-back');
    await expect(back).toContainText('Plan materiałów');
    await back.click();
    await expect(page.getByTestId('material-plan')).toBeVisible();
    await noHorizontalOverflow(page);
    if (!mobile)
      await page.screenshot({
        path: testInfo.outputPath('v37-material-plan.png'),
        fullPage: true,
      });
    expect(errors).toEqual([]);
  });
});

test.describe('V37 — example project', () => {
  test('hip example creates a new project and never overwrites the active one', async ({
    page,
  }) => {
    await page.goto('/#/calculators/common-rafter');
    await page.locator('[data-mode="builder"]').click();
    const assistant = page.getByTestId('project-start-assistant');
    await page.locator('.a-start-secondary > summary').click();
    await assistant.getByTestId('project-start-advanced').click();
    await expect(assistant).toBeHidden();
    const countProjects = () =>
      page.evaluate(
        () =>
          Object.keys(localStorage).filter((key) =>
            key.startsWith('cieslacalc.projects.v1.record.'),
          ).length,
      );
    await expect.poll(countProjects).toBeGreaterThan(0);
    const before = await countProjects();

    await page.getByRole('button', { name: 'Projekty' }).first().click();
    await page.getByRole('button', { name: 'Nowy projekt' }).click();
    const start = page.getByTestId('project-start-assistant');
    await page.locator('.a-start-secondary > summary').click();
    await start.getByTestId('project-start-examples').click();
    await expect(start).toContainText(
      'Projekt przykładowy — nie projekt konstrukcyjny.',
    );
    await start.getByTestId('project-example-hip').click();
    await expect(start).toBeHidden();
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    await expect.poll(countProjects).toBe(before + 1);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const id = localStorage.getItem('cieslacalc.activeProject.v1');
          const record = id
            ? localStorage.getItem(`cieslacalc.projects.v1.record.${id}`)
            : null;
          return record ? JSON.parse(record).document.project.roof.type : null;
        }),
      )
      .toBe('hip');
    await openPerspectiveTask(page, 'materials');
    await expect(page.getByTestId('material-plan')).toBeVisible();
    await noHorizontalOverflow(page);
  });
});

test.describe('V37 — covering edge behaviour', () => {
  test('technical view shows clipped coverage, nominal edge cells and no physical overhang claim', async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await page.goto('/#/calculators/common-rafter');
    await page.locator('[data-mode="builder"]').click();
    await page.locator('.a-start-secondary > summary').click();
    await page.getByTestId('project-start-advanced').click();
    await openPerspectiveTask(page, 'project', 'covering');
    await addManualTile(page);
    await expect(page.locator('.a-covering-plane-outline')).toHaveCount(1);
    await expect(page.locator('.a-tile-fragment')).not.toHaveCount(0);
    const edge = page.getByTestId('covering-edge-summary');
    await expect(edge.locator('[data-edge="edge"] b')).not.toHaveText('0');
    await expect(page.locator('.a-covering-nominal-ghost')).not.toHaveCount(0);
    await expect(page.locator('.a-covering-legend .ghost')).toBeVisible();
    await expect(page.getByTestId('covering-edge-note')).toContainText(
      'nie jest modelowany',
    );
    // Ghost cells are presentation only: quantities follow visible fragments.
    const edgeCount = Number(
      await edge.locator('[data-edge="edge"] b').textContent(),
    );
    await expect(page.locator('.a-covering-nominal-ghost')).toHaveCount(
      edgeCount,
    );
    await expect(edge).toContainText('symetrycznie');
    // Exact covering parameters live in the Inspector; on phones that is a
    // sheet opened explicitly from the workspace (UX contract §6).
    if (mobile)
      await page
        .getByRole('button', { name: 'Parametry / Popraw' })
        .first()
        .click();
    const scope = mobile ? page.getByRole('dialog') : page;
    await scope
      .getByTestId('horizontal-alignment')
      .locator('[data-alignment="from-u-min"] input')
      .check();
    if (mobile)
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Zamknij', exact: true })
        .click();
    await expect(page.getByTestId('covering-edge-summary')).toContainText(
      'od lewej krawędzi',
    );
  });
});
