import { expect, test, type Page } from '@playwright/test';

/**
 * VNext-2: the project checklist ("Sprawdzenie projektu") can stay pinned
 * beside the workbench, so what is done and what is missing is always in
 * view. Pinning is a wide-screen layout; phones keep the on-demand sheet.
 */

test.skip(
  ({ viewport }) => (viewport?.width ?? 1440) < 1200,
  'Pinning is a wide-screen layout; phones keep the sheet.',
);

async function openBuilder(page: Page) {
  await page.locator('[data-mode="builder"]').click();
  const assistant = page.getByTestId('project-start-assistant');
  if (await assistant.isVisible()) {
    await page.locator('.a-start-secondary > summary').click();
    await assistant.getByTestId('project-start-advanced').click();
    await expect(assistant).toBeHidden();
  }
  await expect(page.getByTestId('skeleton-drawing')).toBeVisible();
}

test('the checklist stays pinned beside the workbench while working', async ({
  page,
}) => {
  await page.goto('/#/calculators/common-rafter');
  await openBuilder(page);
  await page.getByTestId('project-progress').click();
  await page.getByTestId('project-readiness-pin').click();
  const panel = page.getByTestId('project-readiness-panel');
  await expect(panel).toHaveAttribute('role', 'complementary');
  await expect(page.locator('.a-readiness-backdrop')).toHaveCount(0);

  // Going to a stage keeps the list and marks where the user is.
  await panel.getByTestId('journey-stage-covering').click();
  await expect(
    page.locator('[data-task="covering"][aria-selected="true"]:visible'),
  ).toBeVisible();
  await expect(panel.locator('li[data-current]')).toHaveAttribute(
    'data-stage',
    'covering',
  );
  // The workbench beside it stays usable and nothing scrolls sideways.
  await page.locator('[data-perspective="project"]').first().click();
  await expect(panel).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);

  // A device preference: it survives a reload, and Unpin closes it.
  await page.reload();
  await openBuilder(page);
  await expect(page.getByTestId('project-readiness-panel')).toHaveAttribute(
    'data-pinned',
    'true',
  );
  await page.getByRole('button', { name: 'Odepnij' }).click();
  await expect(page.getByTestId('project-readiness-panel')).toHaveCount(0);
});
