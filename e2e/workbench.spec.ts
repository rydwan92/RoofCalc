import { expect, test, type Page } from '@playwright/test';

/**
 * Real-browser smoke coverage. These tests exist because unit tests in JSDOM
 * cannot see layout overflow, a black SVG caused by a missing CSS custom
 * property, or a viewport that does not fit. They assert behaviour and layout
 * health, not pixels, and select by stable `data-*` hooks rather than copy.
 */

const BUILDER = '[data-mode="builder"]';
const TASKS = [
  'construction',
  'openings',
  'layers',
  'covering',
  'cuts',
  'materials',
] as const;

async function openBuilder(page: Page) {
  await page.goto('/#/calculators/common-rafter');
  await page.locator(BUILDER).click();
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
}

async function openTask(page: Page, task: string) {
  // Desktop controls and the mobile dock coexist in the DOM. Target the
  // currently rendered control so the click also proves that route is
  // physically reachable at the active viewport.
  const taskControl = page.locator(`[data-task="${task}"]:visible`).first();
  await taskControl.click();
  await expect(
    page.locator(`[data-task="${task}"][aria-selected="true"]:visible`).first(),
  ).toBeVisible();
}

async function openResolvedTileSchedule(page: Page, project: string) {
  await openTask(page, 'layers');
  const toolbox =
    project === 'mobile'
      ? await (async () => {
          await page.getByTestId('mobile-open-tools').click();
          return page.getByRole('dialog');
        })()
      : page;
  const battens = toolbox.getByRole('switch', { name: /Łaty/ }).first();
  if ((await battens.getAttribute('aria-checked')) !== 'true')
    await battens.click();
  if (project === 'mobile') await page.keyboard.press('Escape');

  await openTask(page, 'covering');
  await page.getByRole('button', { name: 'Dodaj dachówkę ręcznie' }).click();
  await expect(page.getByTestId('tile-layout-drawing')).toBeVisible();
  await openTask(page, 'materials');
  return page.getByTestId('covering-quantity');
}

/** Horizontal overflow is the failure mode that keeps reappearing on mobile. */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(
          (element) =>
            element.getBoundingClientRect().right > root.clientWidth + 1,
        )
        .slice(0, 5)
        .map((element) => `${element.tagName}.${element.className}`),
    };
  });
  expect(
    overflow.offenders,
    `page scrolls horizontally (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  ).toEqual([]);
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/**
 * On mobile the exact numeric fields live in the Inspector sheet by design
 * (V20): the Toolbox chooses the object, the Inspector owns its values.
 */
async function pitchField(page: Page, project: string) {
  if (project === 'mobile') {
    await page.getByTestId('mobile-open-tools').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Połać', exact: true })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
  }
  // The drag handle shares part of this accessible name, so target the exact
  // numeric field: every editable geometric value must also have one.
  return page.getByLabel('Kąt połaci', { exact: true }).first();
}

test.describe('A — Builder loads and fits', () => {
  test('the workbench renders and does not scroll sideways', async ({
    page,
  }) => {
    await openBuilder(page);

    const drawing = page.getByTestId('skeleton-drawing');
    const box = await drawing.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(150);

    await expectNoHorizontalOverflow(page);

    // No unresolved translation key leaked into the shell.
    await expect(page.locator('body')).not.toContainText('assembly.');
  });

  test('every task view opens without a runtime error', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await openBuilder(page);
    for (const task of TASKS) {
      await openTask(page, task);
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
  });
});

test.describe('B — Exact roof geometry is reachable on mobile', () => {
  test('the Toolbox routes the roof to an exact numeric field', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);
    const pitch = await pitchField(page, testInfo.project.name);
    await expect(pitch).toBeEditable();
    await expect(pitch).toHaveValue('35');
  });
});

test.describe('C — Covering renders without the black-SVG regression', () => {
  test('roof plane fills resolve to a real colour', async ({ page }) => {
    await openBuilder(page);
    await openTask(page, 'covering');

    // V21 traced a black covering plane to an SVG `fill` referencing a CSS
    // custom property the assembly root never declared. An invalid fill falls
    // back to the SVG initial value, which is black.
    const unresolved = await page.evaluate(() => {
      const root = document.querySelector('.assembly-app');
      const scope = getComputedStyle(root ?? document.documentElement);
      return [
        '--ui-canvas',
        '--ui-surface',
        '--ui-line',
        '--ui-line-strong',
        '--ui-accent',
        '--ui-text',
      ].filter((name) => !scope.getPropertyValue(name).trim());
    });
    expect(
      unresolved,
      'semantic UI tokens must resolve on the assembly root',
    ).toEqual([]);

    const blackFills = await page.evaluate(() =>
      [
        ...document.querySelectorAll<SVGGraphicsElement>(
          'svg polygon, svg path, svg rect',
        ),
      ]
        .filter((element) => {
          const fill = getComputedStyle(element).fill;
          return fill === 'rgb(0, 0, 0)' && element.getBBox().width > 50;
        })
        .map((element) => element.getAttribute('class') ?? element.tagName)
        .slice(0, 5),
    );
    expect(
      blackFills,
      'large SVG shapes must not fall back to the initial black fill',
    ).toEqual([]);

    await expectNoHorizontalOverflow(page);
  });
});

test.describe('D — A saved project survives a reload', () => {
  test('an edit is autosaved and restored offline', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);

    const pitch = await pitchField(page, testInfo.project.name);
    await pitch.fill('42');
    await pitch.blur();

    // V23 autosaves the newest committed snapshot after 800 ms of inactivity.
    await page.waitForTimeout(1500);
    const stored = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('cieslacalc.')),
    );
    expect(stored.length).toBeGreaterThan(0);

    // Reload with the catalogue API unreachable: ADR-006 says a local project
    // must still open and calculate.
    await page.route('**/api/**', (route) => route.abort());
    await page.reload();
    await page.locator(BUILDER).click();
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    await expect(await pitchField(page, testInfo.project.name)).toHaveValue(
      '42',
    );
  });
});

test.describe('E — Result semantics remain truthful and reachable', () => {
  test('covering schedule exposes coverage positions, basis and unresolved purchase', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);
    const schedule = await openResolvedTileSchedule(
      page,
      testInfo.project.name,
    );
    await expect(schedule).toBeVisible();

    const row = schedule.locator(
      'article[data-semantic="effective-coverage-position"]',
    );
    await expect(row).toContainText('pozycji krycia');
    await expect(row.getByTestId('result-basis')).toContainText(
      'Krycie efektywne',
    );

    const progression = page.getByTestId('result-layer-progress-schedule');
    await progression.locator('summary').click();
    await expect(
      progression.locator('[data-layer="purchase"][data-state="pending"]'),
    ).toContainText('jeszcze nie wyliczony');
    await expect(
      progression.locator('[data-layer="cutting"][data-state="pending"]'),
    ).toContainText('jeszcze nie wyliczony');
    await expect(
      progression.locator('[data-layer="purchase"][data-state="resolved"]'),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('F — K1 physical blank to cutting plan', () => {
  test('plans two entered lengths and exposes a readable material list', async ({
    page,
    context,
  }, testInfo) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openBuilder(page);
    await openTask(page, 'materials');
    const cta = page.getByTestId('k1-cutting-cta');
    await expect(cta).toBeVisible();
    await cta.click();
    const panel = page.getByTestId('k1-cutting-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.a-k1-advanced')).not.toHaveAttribute('open');
    await panel.getByTestId('k1-stock-length').first().fill('700');
    await panel.getByRole('button', { name: /Dodaj długość/ }).click();
    await panel.getByTestId('k1-stock-length').nth(1).fill('800');
    await panel.getByTestId('k1-objective').selectOption('minimum-stock-count');
    await panel.getByTestId('k1-run-plan').click();
    await expect(panel.getByTestId('k1-purchase-list')).toBeVisible();
    await expect(panel.getByTestId('k1-purchase-list')).toContainText('K1');
    await panel.getByRole('button', { name: 'Kopiuj listę' }).click();
    await expect(
      panel.getByRole('button', { name: 'Skopiowano' }),
    ).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('K1');
    await panel.getByText('Układ cięć').scrollIntoViewIfNeeded();
    await panel.locator('.a-k1-layouts summary').first().click();
    await expect(panel.getByTestId('k1-stock-layout').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize(
      testInfo.project.name === 'mobile'
        ? { width: 360, height: 800 }
        : { width: 1024, height: 768 },
    );
    await expect(panel.getByTestId('k1-purchase-list')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await panel.getByTestId('k1-stock-length').first().fill('100');
    await panel.getByTestId('k1-stock-length').nth(1).fill('200');
    await panel.getByTestId('k1-run-plan').click();
    await expect(panel.getByTestId('k1-unassigned-warning')).toBeVisible();
  });

  test('hip schedule offers cutting only for whole K1 rafters', async ({
    page,
  }) => {
    await page.goto('/#/calculators/common-rafter');
    await page.getByRole('button', { name: 'Krokiew narożna' }).click();
    await page.locator(BUILDER).click();
    await openTask(page, 'materials');
    await expect(page.getByTestId('k1-cutting-cta')).toHaveCount(1);
    await expect(
      page
        .locator('.a-schedule-family > header strong')
        .filter({ hasText: 'H1' }),
    ).toBeVisible();
    await expect(
      page
        .locator('.a-schedule-family > header strong')
        .filter({ hasText: 'J1' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
