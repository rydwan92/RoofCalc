import { expect, test } from '@playwright/test';

/**
 * VNext-9: an asymmetric gable through the whole application — the Creator,
 * the workbench, materials and the execution document with K1 and K2.
 * Offline; every number comes from the shared rafter solver.
 */
test('an asymmetric gable from the Creator to its K1 and K2 documents', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'unavailable' } } }),
  );
  await page.goto('/#/calculators/common-rafter');
  await page.locator('[data-mode="builder"]').click();
  const assistant = page.getByTestId('project-start-assistant');
  await assistant.getByTestId('project-start-guided').click();
  await assistant
    .locator('[data-choice="roof-type"] [data-choice-value="asymmetric-gable"]')
    .click();
  await assistant
    .locator('[data-project-start-field="buildingLength"]')
    .fill('1000');
  await assistant
    .locator('[data-project-start-field="buildingWidth"]')
    .fill('800');
  await assistant.getByTestId('project-start-next').click();
  // A4: a steep left side and a flat right one leave K2 without a seat —
  // the Creator stays on the step and says why, at the right pitch.
  await assistant.locator('[data-project-start-field="pitch"]').fill('60');
  await assistant.locator('[data-project-start-field="rightPitch"]').fill('20');
  await assistant.getByTestId('project-start-next').click();
  await expect(assistant).toContainText(
    'Przy tych spadkach prawa krokiew nie oprze się na murłacie.',
  );
  await expect(
    assistant.locator('[data-project-start-field="rightPitch"]'),
  ).toBeVisible();
  // A1 of docs/domain/ASYMMETRIC_GABLE.md: 45° and atan(3/5) ≈ 30.96°.
  await assistant.locator('[data-project-start-field="pitch"]').fill('45');
  await assistant
    .locator('[data-project-start-field="rightPitch"]')
    .fill('30.9638');
  await assistant.locator('[data-project-start-field="eave"]').fill('50');
  await assistant.getByTestId('project-start-next').click();
  await assistant.locator('[data-project-start-field="spacing"]').fill('90');
  await assistant.getByTestId('project-start-next').click();
  await expect(assistant).toContainText('45° / 30.9638°');
  await assistant.getByTestId('project-start-submit').click();
  await expect(assistant).toBeHidden();

  // The session saves after a short debounce: wait for the stored roof.
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.startsWith('cieslacalc.projects.v1.record.'))
          .map(
            (key) =>
              JSON.parse(localStorage.getItem(key)!).document.project.roof,
          ),
      ),
    )
    .toContainEqual(
      expect.objectContaining({
        type: 'asymmetric-gable',
        spanMm: 8000,
        pitchDeg: 45,
        rightPitchDeg: 30.9638,
      }),
    );
  await expect(page.getByTestId('skeleton-drawing').first()).toHaveAttribute(
    'aria-label',
    'Aksonometryczny szkielet niesymetrycznego dachu dwuspadowego',
  );

  await page.locator('[data-perspective="materials"]:visible').first().click();
  await expect(page.getByTestId('material-plan')).toContainText('K2');
  await page.locator('[data-perspective="documents"]:visible').first().click();
  await expect(page.getByTestId('document-scope')).toContainText(
    'dach dwuspadowy niesymetryczny liczony przez RoofCalc',
  );
  await page.getByTestId('document-preview-execution').click();
  const pages = page.locator('.doc-page h1');
  await expect(
    pages.filter({ hasText: 'K1 - przygotowanie elementu' }),
  ).toHaveCount(1);
  await expect(
    pages.filter({ hasText: 'K2 - przygotowanie elementu' }),
  ).toHaveCount(1);
  await page.screenshot({
    path: testInfo.outputPath('vnext9-asymmetric-documents.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
