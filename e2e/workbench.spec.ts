import { expect, test, type Page, type TestInfo } from '@playwright/test';

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
  const assistant = page.getByTestId('project-start-assistant');
  await expect(assistant).toBeVisible();
  await assistant.getByTestId('project-start-submit').click();
  await expect(assistant).toBeHidden();
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

async function addTile(page: Page, gaugeMin = '30', gaugeMax = '38') {
  await openTask(page, 'covering');
  const assistant = page.getByTestId('covering-add-assistant');
  await assistant.locator('[data-covering-family="roof-tile"]').click();
  await assistant.locator('[data-covering-source="manual"]').click();
  const values = {
    name: 'Dachówka testowa',
    physicalWidth: '33',
    physicalLength: '42',
    coverWidth: '30',
    gaugeMin,
    gaugeMax,
    minimumPitch: '19',
  };
  for (const [field, value] of Object.entries(values))
    await assistant.locator(`[data-manual-field="${field}"]`).fill(value);
  await assistant.getByTestId('confirm-manual-covering').click();
  await expect(page.getByTestId('tile-layout-drawing')).toBeVisible();
}

async function openResolvedTileSchedule(page: Page) {
  await addTile(page);
  const automaticFit = page
    .locator('button:visible')
    .filter({ hasText: /Dopasuj łaty automatycznie/ })
    .first();
  await expect(automaticFit).toBeVisible();
  await automaticFit.click();
  await expect(automaticFit).toBeHidden();
  await expect(
    page.getByTestId('tile-layout-drawing').locator('.a-covering-batten'),
  ).not.toHaveCount(0);
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
        .filter((element) => {
          if (element.getBoundingClientRect().right <= root.clientWidth + 1)
            return false;
          // A clipped, intentionally scrollable strip can contain children
          // beyond its own viewport without making the page scroll sideways.
          let parent = element.parentElement;
          while (parent) {
            const overflowX = getComputedStyle(parent).overflowX;
            if (
              ['auto', 'scroll', 'hidden'].includes(overflowX) &&
              parent.getBoundingClientRect().right <= root.clientWidth + 1
            )
              return false;
            parent = parent.parentElement;
          }
          return true;
        })
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

test.describe('V31 — guided Creator start', () => {
  test('creates one project from friendly building dimensions on desktop and mobile', async ({
    page,
  }) => {
    await page.goto('/#/calculators/common-rafter');
    await page.locator(BUILDER).click();
    const assistant = page.getByTestId('project-start-assistant');
    await expect(assistant).toBeVisible();
    const values = {
      buildingLength: '1200',
      buildingWidth: '900',
      pitch: '35',
      eave: '50',
      spacing: '80',
    };
    for (const [field, value] of Object.entries(values))
      await assistant
        .locator(`[data-project-start-field="${field}"]`)
        .fill(value);
    await assistant.getByTestId('project-start-submit').click();
    await expect(assistant).toBeHidden();
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const key = Object.keys(localStorage).find((candidate) =>
            candidate.startsWith('cieslacalc.projects.v1.record.'),
          );
          if (!key) return undefined;
          return JSON.parse(localStorage.getItem(key)!).document.project.roof
            .halfRunMm;
        }),
      )
      .toBe(4500);
    await expectNoHorizontalOverflow(page);
  });
});

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

test.describe('G — guided project workflow', () => {
  test('routes from a new roof through covering, summary and the existing K1 planner', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);
    const workflow = page.getByTestId('project-workflow');
    await expect(workflow.locator('li')).toHaveCount(6);
    await expect(workflow.locator('[data-stage="covering"]')).toHaveAttribute(
      'data-status',
      'incomplete',
    );
    await page.getByTestId('project-next-action').click();
    await expect(
      page.locator('[data-task="covering"][aria-selected="true"]:visible'),
    ).toBeVisible();
    await openResolvedTileSchedule(page);
    await expect(workflow.locator('[data-stage="covering"]')).toHaveAttribute(
      'data-status',
      'complete',
    );
    await page.locator('.a-material-local-switch [role="tab"]').first().click();
    await expect(page.getByTestId('project-summary')).toBeVisible();
    await page.getByTestId('summary-k1-cutting-cta').click();
    await expect(page.getByTestId('k1-cutting-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize(
      testInfo.project.name === 'mobile'
        ? { width: 360, height: 800 }
        : { width: 1024, height: 768 },
    );
    await expect(page.getByTestId('k1-cutting-panel')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('H — execution package', () => {
  test('selects truthful sections, previews pages and sends the preview to print', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);
    await page.getByTestId('project-execution-export').click();
    const config = page.getByTestId('execution-config');
    await expect(config).toBeVisible();
    await expect(
      config.getByRole('checkbox', { name: /Rozkrój K1/ }),
    ).toBeDisabled();
    await config.getByRole('button', { name: 'Podgląd dokumentu' }).click();
    const preview = page.getByTestId('execution-preview');
    await expect(preview).toBeVisible();
    await expect(
      preview.locator('[data-section="project-summary"]'),
    ).toBeVisible();
    await expect(
      preview.locator('[data-section="roof-overview"]'),
    ).toBeVisible();
    await expect(
      preview.locator('[data-section="member-fabrication"]'),
    ).toBeVisible();
    await expect(preview.locator('[data-section="cutting-plan"]')).toHaveCount(
      0,
    );
    await expectNoHorizontalOverflow(page);
    await page.evaluate(() => {
      (window as Window & { printCalled?: boolean }).print = () => {
        (window as Window & { printCalled?: boolean }).printCalled = true;
      };
    });
    await page.getByTestId('execution-print').click();
    expect(
      await page.evaluate(
        () => (window as Window & { printCalled?: boolean }).printCalled,
      ),
    ).toBe(true);
    await page.setViewportSize(
      testInfo.project.name === 'mobile'
        ? { width: 360, height: 800 }
        : { width: 1024, height: 768 },
    );
    await expect(preview).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('includes only the current K1 plan after planning it from export', async ({
    page,
  }) => {
    await openBuilder(page);
    await page.getByTestId('project-execution-export').click();
    await page
      .getByTestId('execution-config')
      .getByRole('button', { name: /Zaplanuj rozkrój K1/ })
      .click();
    const panel = page.getByTestId('k1-cutting-panel');
    await expect(panel).toBeVisible();
    await panel.getByTestId('k1-stock-length').fill('700');
    await panel.getByTestId('k1-run-plan').click();
    await expect(panel.getByTestId('k1-cutting-result')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Zamknij' })
      .click();
    await page.getByTestId('project-execution-export').click();
    const config = page.getByTestId('execution-config');
    await expect(
      config.getByRole('checkbox', { name: /Rozkrój K1/ }),
    ).toBeEnabled();
    await config.getByRole('button', { name: 'Podgląd dokumentu' }).click();
    await expect(
      page
        .getByTestId('execution-preview')
        .locator('[data-section="cutting-plan"]'),
    ).toBeVisible();
  });
});

/** The roof's advanced section (ridge, structural system) lives in the same
 * Inspector on desktop and, on mobile, inside the Toolbox sheet after
 * selecting "Połać" — mirroring `pitchField`'s existing mobile route. */
async function openRoofAdvanced(page: Page, project: string) {
  const scope = await (async () => {
    if (project !== 'mobile') return page;
    await page.getByTestId('mobile-open-tools').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog
      .getByRole('button', { name: 'Połać', exact: true })
      .first()
      .click();
    await expect(dialog).toBeVisible();
    return dialog;
  })();
  const details = scope.locator('details.a-inspector-advanced');
  if (!(await details.getAttribute('open')))
    await scope.getByText('Zaawansowane').click();
  return scope;
}

/** The mobile Toolbox/Inspector sheet blocks the task dock underneath it
 * until dismissed — mirroring `openResolvedTileSchedule`'s existing pattern. */
async function closeRoofAdvanced(page: Page, project: string) {
  if (project === 'mobile') await page.keyboard.press('Escape');
}

test.describe('I — structural system and ridge connection', () => {
  test('collar tie enters the schedule and the ridge connection gates K1 truthfully', async ({
    page,
  }, testInfo) => {
    await openBuilder(page);
    const scope = await openRoofAdvanced(page, testInfo.project.name);

    await scope
      .getByRole('button', { name: 'Więźba krokwiowo-jętkowa' })
      .click();
    await closeRoofAdvanced(page, testInfo.project.name);
    await openTask(page, 'materials');
    await expect(
      page
        .locator('.a-schedule-family > header strong')
        .filter({ hasText: 'C1' }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await openTask(page, 'construction');
    const backScope = await openRoofAdvanced(page, testInfo.project.name);
    await backScope
      .getByRole('button', { name: 'Nakładka', exact: true })
      .click();
    await expect(
      backScope.getByText(/nakładki nie jest jeszcze opracowana/),
    ).toBeVisible();
    await closeRoofAdvanced(page, testInfo.project.name);
    await openTask(page, 'materials');
    await expect(page.getByTestId('k1-cutting-cta')).toHaveCount(0);

    await openTask(page, 'construction');
    const finalScope = await openRoofAdvanced(page, testInfo.project.name);
    await finalScope
      .getByRole('button', { name: 'Połączenie bezpośrednie' })
      .click();
    await closeRoofAdvanced(page, testInfo.project.name);
    await openTask(page, 'materials');
    await expect(page.getByTestId('k1-cutting-cta')).toBeVisible();
    await expectNoHorizontalOverflow(page);
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
  }) => {
    await openBuilder(page);
    const schedule = await openResolvedTileSchedule(page);
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
    const assistant = page.getByTestId('project-start-assistant');
    await expect(assistant).toBeVisible();
    await assistant.getByTestId('project-start-submit').click();
    await expect(assistant).toBeHidden();
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

  test('hip counter-battens expose useful K1/J1 axes with a partial H1 boundary', async ({
    page,
  }, testInfo) => {
    await page.goto('/#/calculators/common-rafter');
    await page.getByRole('button', { name: 'Krokiew narożna' }).click();
    await page.locator(BUILDER).click();
    const assistant = page.getByTestId('project-start-assistant');
    await assistant.getByTestId('project-start-submit').click();
    await openTask(page, 'layers');
    const tools =
      testInfo.project.name === 'mobile'
        ? await (async () => {
            await page.getByTestId('mobile-open-tools').click();
            return page.getByRole('dialog');
          })()
        : page;
    await tools.getByRole('switch', { name: /Kontrłaty/ }).click();
    if (testInfo.project.name === 'mobile') await page.keyboard.press('Escape');
    await expect(page.locator('[data-counter-batten-row]')).not.toHaveCount(0);
    await expect(page.locator('.a-build-up-summary')).toContainText(
      'Częściowo',
    );
    await openTask(page, 'materials');
    await expect(
      page.locator('.a-build-up-intelligence [data-status="partial"]'),
    ).toContainText('Częściowo');
    await expectNoHorizontalOverflow(page);
  });
});

async function closeMobileSheet(page: Page) {
  const dialog = page.getByRole('dialog');
  if (await dialog.count())
    await dialog.getByRole('button', { name: 'Zamknij', exact: true }).click();
}

async function layerInspector(page: Page, layer: string, mobile: boolean) {
  await openTask(page, 'layers');
  if (mobile) await page.getByTestId('mobile-open-tools').click();
  const tools = mobile ? page.getByRole('dialog') : page.locator('.a-toolbox');
  await tools
    .locator('.a-layer-tool-row')
    .getByRole('button', { name: layer, exact: true })
    .click();
  if (mobile) {
    await closeMobileSheet(page);
    await page
      .getByRole('button', { name: 'Edytuj', exact: true })
      .first()
      .click();
  }
  return page.getByTestId(
    layer === 'Łaty' ? 'batten-inspector' : 'counter-batten-inspector',
  );
}

async function captureV33(page: Page, testInfo: TestInfo, name: string) {
  const sizes =
    testInfo.project.name === 'mobile'
      ? [{ width: 390, height: 844 }]
      : [
          { width: 1920, height: 1080 },
          { width: 1440, height: 900 },
          { width: 1024, height: 768 },
        ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${name}-${size.width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize(
    testInfo.project.name === 'mobile'
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
  );
}

test.describe('V33 — build-up closeout', () => {
  test('A: hip tile to automatic battens, compatible covering and useful counter-battens', async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await page.goto('/#/calculators/common-rafter');
    await page.getByRole('button', { name: 'Krokiew narożna' }).click();
    await page.locator(BUILDER).click();
    await page.getByTestId('project-start-submit').click();
    await addTile(page, '33', '36');
    // The project starts with one selected plane. Explicitly apply the tile to the roof.
    const assignAll = page.getByRole('button', {
      name: /Przypisz wszystkie połacie/,
    });
    if (await assignAll.count()) await assignAll.click();
    const inspector = await layerInspector(page, 'Łaty', mobile);
    await inspector
      .getByRole('button', { name: 'Automatycznie z pokrycia' })
      .click();
    await expect(inspector.getByTestId('batten-layout-status')).toHaveText(
      'Gotowe',
    );
    await expect(inspector.getByTestId('batten-auto-source')).toContainText(
      '33',
    );
    await captureV33(page, testInfo, 'auto-battens');
    if (mobile) await closeMobileSheet(page);
    await openTask(page, 'covering');
    await expect(page.locator('.a-covering-warning')).toHaveCount(0);
    await expect(page.locator('.a-covering-batten')).not.toHaveCount(0);
    const counter = await layerInspector(page, 'Kontrłaty', mobile);
    if (mobile) await closeMobileSheet(page);
    // The summary selects a layer; its Toolbox switch enables canonical intent.
    if (mobile) await page.getByTestId('mobile-open-tools').click();
    await (mobile ? page.getByRole('dialog') : page.locator('.a-toolbox'))
      .getByRole('switch', { name: /Kontrłaty/ })
      .click();
    if (mobile) {
      await closeMobileSheet(page);
      await page
        .getByRole('button', { name: 'Edytuj', exact: true })
        .first()
        .click();
    }
    await expect(
      counter.getByTestId('counter-batten-layout-status'),
    ).toContainText('Częściowo');
    await captureV33(page, testInfo, 'counter-battens');
    if (mobile) await closeMobileSheet(page);
    await openTask(page, 'covering');
    await page
      .locator('.a-covering-detail-controls')
      .getByLabel('Kontrłaty', { exact: true })
      .check();
    await expect(page.locator('.a-covering-counter-batten')).not.toHaveCount(0);
    await captureV33(page, testInfo, 'hip-overlays');
    await page.getByRole('tab', { name: /^Przednia połać/ }).click();
    await expect(page.locator('.a-covering-counter-batten')).not.toHaveCount(0);
    const view = page.locator('.a-covering-detail-controls');
    await view.getByLabel('Pokrycie', { exact: true }).uncheck();
    await expect(page.locator('.a-covering-fragment')).toHaveCount(0);
    await expect(page.locator('.a-covering-batten')).not.toHaveCount(0);
    await view.getByLabel('Pokrycie', { exact: true }).check();
    await openTask(page, 'materials');
    await expect(
      page.locator('.a-build-up-intelligence [data-status="partial"]'),
    ).toContainText('Częściowo');
    await expect(page.locator('.a-build-up-intelligence')).toContainText(
      'Automatycznie',
    );
  });

  test('B: invalid manual gauge has one grouped warning and automatic repair clears it', async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await openBuilder(page);
    await addTile(page, '33', '36');
    const assignAll = page.getByRole('button', {
      name: /Przypisz wszystkie połacie/,
    });
    if (await assignAll.count()) await assignAll.click();
    const inspector = await layerInspector(page, 'Łaty', mobile);
    await inspector
      .getByRole('button', { name: 'Ręcznie', exact: true })
      .click();
    const gauge = inspector.getByLabel('Moduł łat', { exact: true });
    await gauge.fill('40');
    await gauge.blur();
    await expect(inspector.getByTestId('batten-layout-status')).toHaveText(
      'Wymaga uwagi',
    );
    if (mobile) await closeMobileSheet(page);
    await openTask(page, 'covering');
    const warning = page.locator('.a-covering-warning');
    await expect(warning).toHaveCount(1);
    await expect(warning.locator('p')).toHaveCount(1);
    await expect(warning).toContainText('dotyczy 2 połaci');
    await expect(
      page.locator('[data-guidance="covering-warning"]'),
    ).toHaveCount(0);
    await captureV33(page, testInfo, 'manual-warning');
    await warning
      .getByRole('button', { name: 'Dopasuj łaty automatycznie' })
      .click();
    await expect(warning).toHaveCount(0);
    await expect(page.locator('.a-covering-batten')).not.toHaveCount(0);
    await layerInspector(page, 'Kontrłaty', mobile);
    if (mobile) {
      await closeMobileSheet(page);
      await page.getByTestId('mobile-open-tools').click();
    }
    await (mobile ? page.getByRole('dialog') : page.locator('.a-toolbox'))
      .getByRole('switch', { name: /Kontrłaty/ })
      .click();
    if (mobile) await closeMobileSheet(page);
    await openTask(page, 'covering');
    await page
      .locator('.a-covering-detail-controls')
      .getByLabel('Kontrłaty', { exact: true })
      .check();
    await expect(page.locator('.a-covering-counter-batten')).not.toHaveCount(0);
    await captureV33(page, testInfo, 'gable-overlays');
  });
});
