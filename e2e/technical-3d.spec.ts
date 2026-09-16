import { expect, test, type Page } from '@playwright/test';

/**
 * V38 technical 3D scene. Real-browser only: JSDOM has no WebGL, so this is
 * where the renderer is actually proved. It asserts behaviour — selection
 * identity, isolation, view presets and the return to 2D — never pixels.
 */

const CANVAS = '[data-testid="technical-scene-3d-canvas"]';
const HUD = '[data-testid="scene-3d-hud"]';

async function openBuilder(page: Page) {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const assistant = page.getByTestId('project-start-assistant');
  await expect(assistant).toBeVisible();
  await assistant.getByTestId('project-start-advanced').click();
  await expect(assistant).toBeHidden();
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
}

async function openExample(
  page: Page,
  example: 'basic-gable' | 'hip' | 'collar-tie',
) {
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const start = page.getByTestId('project-start-assistant');
  await start.getByTestId('project-start-examples').click();
  await start.getByTestId(`project-example-${example}`).click();
  await expect(start).toBeHidden();
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
}

/** Switches the workspace renderer at whichever viewport is rendered. */
async function switchRenderer(page: Page, renderer: '2d' | '3d') {
  const control = page
    .locator(`[data-workspace-renderer="${renderer}"]:visible`)
    .first();
  if (await control.isVisible().catch(() => false)) {
    await control.click();
  } else {
    // Phone shell: the switch lives in the View sheet.
    await page.getByRole('button', { name: 'Widok', exact: true }).click();
    await page
      .locator(`[data-workspace-renderer="${renderer}"]:visible`)
      .first()
      .click();
    await page.locator('.a-mobile-sheet [aria-label="Zamknij"]').click();
  }
}

/**
 * Clicks scene entities on a grid until the HUD names the wanted family, and
 * returns what the HUD said. Picking is a real raycast, so scanning is the
 * honest way to reach a member without asserting pixel positions. The canvas
 * box is re-read every click, because selecting an element opens the detail
 * dock and the viewport re-frames itself.
 */
async function selectFamily(page: Page, code: string) {
  const canvas = page.locator(CANVAS);
  const hud = page.locator(HUD);
  // One settling click so the detail dock and the re-frame happen once.
  const first = (await canvas.boundingBox())!;
  await page.mouse.click(first.x + first.width / 2, first.y + first.height / 2);
  await page.waitForTimeout(250);
  for (let i = 1; i < 18; i += 1)
    for (let j = 1; j < 13; j += 1) {
      const box = await canvas.boundingBox();
      if (!box) continue;
      await page.mouse.click(
        box.x + (box.width * i) / 18,
        box.y + (box.height * j) / 13,
      );
      if (
        (await hud.count()) > 0 &&
        ((await hud.innerText()) ?? '').startsWith(code)
      )
        return await hud.innerText();
    }
  return undefined;
}

test.describe('V38 — gable roof in 3D', () => {
  test('2D → 3D → select K1 → isolate → presets → back to 2D keeps the selection', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'basic-gable');

    await switchRenderer(page, '3d');
    await expect(page.getByTestId('technical-scene-3d')).toBeVisible();
    await expect(page.locator(CANVAS)).toBeVisible();

    const hud = await selectFamily(page, 'K1');
    expect(hud).toBeTruthy();
    expect(hud).toContain('Krokiew zwykła');

    // The canonical selection, not a 3D-only one: the context bar follows.
    const contextBar = page.getByTestId('workbench-context-bar');
    await expect(contextBar).toContainText('K1');
    const selectedId = await page.evaluate(() =>
      document
        .querySelector('[data-testid="workbench-context-bar"]')
        ?.textContent?.trim(),
    );

    // Isolate, then show everything again. Both are transient.
    const isolate = page.locator('[data-scene-action="isolate"]');
    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'true');
    await isolate.click();
    await expect(isolate).toHaveAttribute('aria-pressed', 'false');

    await page.locator('[data-scene-preset="top"]').click();
    await expect(page.locator('[data-scene-preset="top"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.locator('[data-scene-preset="isometric"]').click();
    await page.locator('[data-scene-projection="orthographic"]').click();
    await expect(page.locator(CANVAS)).toBeVisible();

    await switchRenderer(page, '2d');
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    // The same member is still selected in the 2D drawing.
    await expect(page.locator('.a-skeleton-member.is-selected')).toHaveCount(1);
    await expect(contextBar).toContainText('K1');
    expect(
      await page.evaluate(() =>
        document
          .querySelector('[data-testid="workbench-context-bar"]')
          ?.textContent?.trim(),
      ),
    ).toBe(selectedId);

    if (testInfo.project.name !== 'mobile')
      await page.screenshot({
        path: testInfo.outputPath('v38-gable-3d.png'),
        fullPage: true,
      });
    expect(errors).toEqual([]);
  });

  test('hover highlights a member without changing the selection', async ({
    page,
  }) => {
    await openExample(page, 'basic-gable');
    await switchRenderer(page, '3d');
    const canvas = page.locator(CANVAS);
    await expect(canvas).toBeVisible();
    const contextBefore = await page
      .getByTestId('workbench-context-bar')
      .innerText();
    let hovered = false;
    for (let i = 1; i < 14 && !hovered; i += 1)
      for (let j = 1; j < 10 && !hovered; j += 1) {
        const box = (await canvas.boundingBox())!;
        await page.mouse.move(
          box.x + (box.width * i) / 14,
          box.y + (box.height * j) / 10,
        );
        await page.waitForTimeout(40);
        hovered = (await canvas.getAttribute('class'))!.includes(
          'is-over-member',
        );
      }
    expect(hovered).toBe(true);
    // Hover is renderer-local: no canonical selection changed (§18).
    expect(await page.getByTestId('workbench-context-bar').innerText()).toBe(
      contextBefore,
    );
    await expect(page.locator(HUD)).toHaveCount(0);
  });

  test('no page overflow and a DOM route back to 2D', async ({ page }) => {
    await openBuilder(page);
    await switchRenderer(page, '3d');
    await expect(page.locator(CANVAS)).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth + 1,
      ),
    ).toBe(true);
    // Returning to 2D never requires touching the canvas (§44).
    await switchRenderer(page, '2d');
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
  });
});

test.describe('V38 — hip roof in 3D', () => {
  test('contains K1, H1 and J1, and never claims a finished H1/J1 joint', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'hip');
    await switchRenderer(page, '3d');
    await expect(page.locator(CANVAS)).toBeVisible();

    // The family filter lists exactly the families this roof resolves.
    await page.locator('.a-scene3d-families > summary').click();
    for (const family of ['common-rafter', 'hip-rafter', 'jack-rafter'])
      await expect(
        page.locator(`[data-scene-family="${family}"]`),
      ).toBeVisible();
    await page.locator('.a-scene3d-families > summary').click();

    const hip = await selectFamily(page, 'H1');
    expect(hip).toBeTruthy();
    expect(hip).toContain('nie jest jeszcze modelowany');
    await expect(page.getByTestId('workbench-context-bar')).toContainText('H1');

    const jack = await selectFamily(page, 'J1');
    expect(jack).toBeTruthy();
    expect(jack).toContain('nie jest jeszcze modelowany');
    await expect(page.getByTestId('workbench-context-bar')).toContainText('J1');

    expect(errors).toEqual([]);
  });
});

test.describe('V38 — collar ties in 3D', () => {
  test('draws collar ties and keeps the Inspector coherent when one is selected', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openExample(page, 'collar-tie');
    await switchRenderer(page, '3d');
    await expect(page.locator(CANVAS)).toBeVisible();

    // Hiding the common rafters both exercises the family filter and exposes
    // the collar ties, which the K1 fan would otherwise stand in front of.
    await page.locator('.a-scene3d-families > summary').click();
    await expect(
      page.locator('[data-scene-family="collar-tie"]'),
    ).toBeVisible();
    await page.locator('[data-scene-family="common-rafter"] input').uncheck();
    await page.locator('.a-scene3d-families > summary').click();

    const tie = await selectFamily(page, 'C1');
    expect(tie).toBeTruthy();
    expect(tie).toContain('Jętka');

    // Filtering is transient presentation: restoring it changes nothing else.
    await page.locator('.a-scene3d-families > summary').click();
    await page.locator('[data-scene-family="common-rafter"] input').check();
    await page.locator('.a-scene3d-families > summary').click();

    // The same canonical selection carries back into the 2D drawing.
    await switchRenderer(page, '2d');
    await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
    await expect(
      page.locator('.a-skeleton-member.kind-collar-tie.is-selected').first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});
