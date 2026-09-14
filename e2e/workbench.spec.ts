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
  await page.locator(`[data-task="${task}"]`).first().click();
  await expect(
    page.locator(`[data-task="${task}"][aria-selected="true"]`).first(),
  ).toBeVisible();
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
