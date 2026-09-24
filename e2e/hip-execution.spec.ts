import { expect, test, type Page } from '@playwright/test';

/**
 * V39 execution geometry in a real browser: the hip-boundary dead end becomes
 * an actionable decision, the counter-batten quantity follows it everywhere,
 * and K1 gains a finished fabrication solid in 3D.
 *
 * Every number asserted here is read from the running resolver, never
 * hard-coded from a screenshot.
 */

const HIP_DETAIL = '[data-testid="hip-boundary-detail"]';

async function openHipExample(page: Page) {
  await page.goto('/#/calculators/common-rafter');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await page.locator('.a-start-secondary > summary').click();
  await start.getByTestId('project-start-examples').click();
  await start.getByTestId('project-example-hip').click();
  await expect(start).toBeHidden();
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
}

/** Reveals the Toolbox, which lives inside a sheet on a phone. */
async function openTools(page: Page, mobile: boolean) {
  if (!mobile) return;
  await page.getByTestId('mobile-open-tools').click();
  await expect(page.locator('.a-mobile-sheet')).toBeVisible();
}

async function closeSheet(page: Page, mobile: boolean) {
  if (!mobile) return;
  const close = page.locator('.a-mobile-sheet [aria-label="Zamknij"]');
  if (await close.isVisible().catch(() => false)) await close.click();
}

/** Opens Layers › Counter-battens with the layer switched on. */
async function openCounterBattens(page: Page, mobile = false) {
  await page.locator('[data-perspective="project"]:visible').first().click();
  await page.locator('[data-task="layers"]:visible').first().click();
  await openTools(page, mobile);
  // Enable the layer first: selecting it can close the phone's tools sheet.
  const toggle = page.locator('[data-layer-toggle="counterBattens"]:visible');
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute('aria-checked')) !== 'true')
    await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await page
    .locator('button:visible', { hasText: 'Kontrłaty' })
    .first()
    .click();
  await closeSheet(page, mobile);
  if (mobile) {
    // Exact values live in the Inspector, which is its own sheet on a phone.
    await page.getByTestId('mobile-open-inspector').click();
  }
  await expect(page.getByTestId('counter-batten-inspector')).toBeVisible();
}

const metres = async (page: Page, selector: string) =>
  Number(
    ((await page.locator(selector).textContent()) ?? '')
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.]/g, ''),
  );

test.describe('V39 — hip counter-batten boundary', () => {
  // The full decision flow is asserted on desktop; the phone gets its own
  // reachability smoke test below (V39 prompt section 44).
  test('partial dead end becomes an actionable decision that resolves', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'covered by the phone smoke');
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHipExample(page);
    await openCounterBattens(page);

    // Before: the hip boundaries are undecided and visibly marked.
    const detail = page.locator(HIP_DETAIL);
    await expect(detail).toHaveAttribute(
      'data-hip-boundary-status',
      'needs-choice',
    );
    await expect(detail).toContainText('wymaga');
    const dashed = page.getByTestId('unresolved-hip-boundary');
    await expect(dashed).toHaveCount(4);
    await expect(
      page.getByTestId('counter-batten-layout-status'),
    ).toContainText('Częściowo');
    const before = await metres(page, '[data-counter-batten-total]');
    expect(before).toBeGreaterThan(0);
    await expect(page.locator('[data-counter-batten-breakdown]')).toContainText(
      '0 ciągów',
    );

    // Both documented options are offered, with a sketch and an explanation.
    for (const option of ['no-dedicated-run', 'paired-plane-runs'])
      await expect(
        page.locator(`[data-hip-detail-option="${option}"] svg`),
      ).toBeVisible();

    // After: the paired detail resolves the layout and adds real length.
    await page
      .locator('[data-hip-detail-option="paired-plane-runs"] input')
      .check();
    await expect(detail).toHaveAttribute(
      'data-hip-boundary-status',
      'resolved',
    );
    await expect(detail).toContainText('kompletny');
    await expect(
      page.getByTestId('counter-batten-layout-status'),
    ).toContainText('Gotowe');
    await expect(dashed).toHaveCount(0);
    await expect(page.locator('[data-hip-boundary-runs]')).toHaveText('8');
    const after = await metres(page, '[data-counter-batten-total]');
    expect(after).toBeGreaterThan(before);
    const added = await metres(page, '[data-hip-boundary-added]');
    expect(after - before).toBeCloseTo(added, 1);

    // The Material Plan follows the resolver without recomputing geometry.
    await page
      .locator('[data-perspective="materials"]:visible')
      .first()
      .click();
    const plan = page.getByTestId('material-plan');
    await expect(plan).toBeVisible();
    await expect(plan).toContainText(after.toFixed(2).replace('.', ','));
    await expect(plan).not.toContainText('CZĘŚCIOWE');

    if (testInfo.project.name !== 'mobile')
      await page.screenshot({
        path: testInfo.outputPath('v39-hip-boundary-resolved.png'),
        fullPage: true,
      });
    expect(errors).toEqual([]);
  });

  test('the holder detail resolves the layout without adding length', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'covered by the phone smoke');
    await openHipExample(page);
    await openCounterBattens(page);
    const before = await metres(page, '[data-counter-batten-total]');
    await page
      .locator('[data-hip-detail-option="no-dedicated-run"] input')
      .check();
    await expect(page.locator(HIP_DETAIL)).toHaveAttribute(
      'data-hip-boundary-status',
      'resolved',
    );
    await expect(page.locator('[data-hip-boundary-runs]')).toHaveText('0');
    expect(await metres(page, '[data-counter-batten-total]')).toBeCloseTo(
      before,
      2,
    );
    await expect(page.getByTestId('unresolved-hip-boundary')).toHaveCount(0);
  });

  test('choosing a detail is one undoable project edit', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'covered by the phone smoke');
    await openHipExample(page);
    await openCounterBattens(page);
    await page
      .locator('[data-hip-detail-option="paired-plane-runs"] input')
      .check();
    await expect(page.locator(HIP_DETAIL)).toHaveAttribute(
      'data-hip-boundary-status',
      'resolved',
    );
    await page
      .getByRole('button', { name: /Cofnij zmianę/ })
      .first()
      .click();
    await expect(page.locator(HIP_DETAIL)).toHaveAttribute(
      'data-hip-boundary-status',
      'needs-choice',
    );
  });
});

test.describe('V39 — finished K1 geometry in 3D', () => {
  test('shows execution geometry and can fall back to the reference blank', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openHipExample(page);
    await page.locator('[data-perspective="project"]:visible').first().click();
    await page.locator('[data-task="construction"]:visible').first().click();
    const switch3d = page.locator('[data-workspace-renderer="3d"]:visible');
    if (
      await switch3d
        .first()
        .isVisible()
        .catch(() => false)
    )
      await switch3d.first().click();
    else {
      await page.getByRole('button', { name: 'Widok', exact: true }).click();
      await page
        .locator('[data-workspace-renderer="3d"]:visible')
        .first()
        .click();
      await page.locator('.a-mobile-sheet [aria-label="Zamknij"]').click();
    }
    await expect(page.getByTestId('technical-scene-3d-canvas')).toBeVisible();

    // K1 is drawn as finished geometry, and says so without over-claiming.
    const note = page.locator('[data-scene-geometry-mode]');
    await expect(note).toHaveAttribute('data-scene-geometry-mode', 'finished');
    await expect(note).toContainText('H1/J1 pozostają referencyjne');
    const finished = page.locator('[data-scene-action="finished"]');
    await expect(finished).toHaveAttribute('aria-pressed', 'true');

    // Before/after is a transient display choice, not a project edit.
    await finished.click();
    await expect(note).toHaveAttribute('data-scene-geometry-mode', 'reference');
    await expect(note).toContainText('bez detalu cięć');
    await finished.click();
    await expect(note).toHaveAttribute('data-scene-geometry-mode', 'finished');

    // Build-up context can be shown in 3D and is off by default.
    const buildUp = page.locator('[data-scene-action="build-up"]');
    await expect(buildUp).toHaveAttribute('aria-pressed', 'false');
    await buildUp.click();
    await expect(buildUp).toHaveAttribute('aria-pressed', 'true');

    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe('V39 — J1 execution status', () => {
  test('states plainly that the hip connection is not selected', async ({
    page,
  }, testInfo) => {
    const mobile = testInfo.project.name === 'mobile';
    await openHipExample(page);
    await page.locator('[data-perspective="project"]:visible').first().click();
    await page.locator('[data-task="construction"]:visible').first().click();
    await openTools(page, mobile);
    // The Toolbox offers J1 on a hip roof; selecting it must not claim a
    // finished fabrication result that no intent has chosen.
    await page
      .locator('button:visible', { hasText: 'Kulawek J1' })
      .first()
      .click();
    await closeSheet(page, mobile);
    await expect(page.getByTestId('workbench-context-bar')).toContainText('J1');
    if (mobile)
      await page
        .getByRole('button', { name: 'Edytuj', exact: true })
        .first()
        .click();
    const inspector = page.locator('.a-inspector, .a-mobile-sheet').first();
    await expect(inspector).toBeVisible();
    await expect(inspector).not.toContainText('Długość wykonawcza');
  });
});

test.describe('V39 — phone smoke', () => {
  test('the hip detail is reachable at 390x844 without overflow', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'phone-only check');
    await openHipExample(page);
    await openCounterBattens(page, true);
    const detail = page.locator(HIP_DETAIL);
    await detail.scrollIntoViewIfNeeded();
    await expect(detail).toHaveAttribute(
      'data-hip-boundary-status',
      'needs-choice',
    );
    await page
      .locator('[data-hip-detail-option="paired-plane-runs"] input')
      .check();
    await expect(detail).toHaveAttribute(
      'data-hip-boundary-status',
      'resolved',
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    // 2D stays fully usable behind the sheet.
    await closeSheet(page, true);
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
  });
});
