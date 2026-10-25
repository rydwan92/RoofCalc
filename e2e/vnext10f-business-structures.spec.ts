import { expect, test, type Page, type Route } from '@playwright/test';
import { mockBusinessWorkspace } from './business-workspace-fixture';

/**
 * VNext-10F (ADR-017 §8–9): a business estimation of a house and a garage.
 * The estimation carries every structure; the quote has a section per
 * structure, each built while its structure is open. HTTP is the
 * deterministic workspace fixture; nothing reaches a database.
 */
const ORGANIZATION = {
  id: 'org:v10f',
  slug: 'hurtownia-v10f',
  name: 'Hurtownia ABC',
  currencyCode: 'PLN',
  active: true,
};

async function stubApis(page: Page) {
  await page.route('**/api/business/**', async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/organizations')) {
      await route.fulfill({ json: { items: [ORGANIZATION] } });
      return;
    }
    if (url.pathname.endsWith('/prices')) {
      await route.fulfill({
        json: { organizationId: ORGANIZATION.id, items: [] },
      });
      return;
    }
    if (url.pathname.endsWith('/assortment')) {
      await route.fulfill({
        json: {
          organization: ORGANIZATION,
          items: [],
          summary: {
            total: 0,
            matched: 0,
            unmatched: 0,
            inactive: 0,
            withoutPrice: 0,
            withoutVat: 0,
          },
        },
      });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { error: { code: 'not-found' } },
    });
  });
  await page.route('**/api/catalog/**', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route('**/api/pricing/**', (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await mockBusinessWorkspace(page, ORGANIZATION.id);
}

/** What the browser sent: estimation projects and quote snapshots. */
function recordRequests(page: Page) {
  const sent = {
    projects: [] as { schemaVersion: number; document: unknown }[],
    quotes: [] as { sections?: { id: string; label: string }[] }[],
  };
  page.on('request', (request) => {
    if (!request.url().includes('/estimations/')) return;
    const body = request.postDataJSON() as {
      project?: { schemaVersion: number; document: unknown };
      snapshot?: { sections?: { id: string; label: string }[] };
    } | null;
    if (request.method() === 'PATCH' && body?.project)
      sent.projects.push(body.project);
    if (request.url().endsWith('/quote') && body?.snapshot)
      sent.quotes.push(body.snapshot);
  });
  return sent;
}

test('a house and a garage in one business estimation, quoted structure by structure', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await stubApis(page);
  const sent = recordRequests(page);
  await page.addInitScript(() => {
    localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  });
  await page.goto('/#/calculators/common-rafter');

  // A new estimation: the customer and the house.
  const home = page.getByTestId('business-home');
  await home.getByTestId('business-new-estimation').click();
  await home
    .getByRole('button', { name: '+ Nowy klient', exact: true })
    .click();
  await home.getByLabel(/Klient — nazwa lub firma/).fill('Jan Kowalski');
  await home.getByLabel('Nazwa inwestycji').fill('Dom z garażem');
  await home.getByRole('button', { name: /Utwórz wycenę/ }).click();
  const creator = page.getByTestId('project-start-assistant');
  await creator.getByTestId('project-start-guided').click();
  await creator.locator('[data-choice-value="gable"]').click();
  for (let step = 0; step < 3; step += 1)
    await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-submit').click();
  await expect(creator).toBeHidden();
  await expect(page.getByTestId('business-estimation-context')).toContainText(
    'Dom z garażem',
  );

  // The garage: a structure of the same estimation.
  await page.getByRole('button', { name: 'Projekty', exact: true }).click();
  await page.getByTestId('project-add-structure').click();
  await expect(creator).toContainText('Nowa bryła projektu');
  await creator
    .locator('[data-choice="roof-type"] [data-choice-value="mono-pitch"]')
    .click();
  await creator
    .locator('[data-project-start-field="buildingLength"]')
    .fill('600');
  await creator
    .locator('[data-project-start-field="buildingWidth"]')
    .fill('400');
  for (let step = 0; step < 3; step += 1)
    await creator.getByTestId('project-start-next').click();
  await creator.getByTestId('project-start-submit').click();
  await expect(creator).toBeHidden();
  const chips = page.getByTestId('structure-bar').locator('.a-structure-chip');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');

  // The estimation carries both structures (ADR-017 §8).
  await expect
    .poll(() => sent.projects.at(-1)?.schemaVersion, { timeout: 10_000 })
    .toBe(2);

  // The quote, prepared with the garage open: its section, and the house
  // named as having none yet.
  await page.locator('[data-perspective="costing"]:visible').first().click();
  await page.getByTestId('cost-prepare-quote').click();
  const quote = page.getByTestId('quote-workspace');
  await expect(quote).toBeVisible();
  const sections = quote.locator('.bz-quote-section');
  await expect(sections).toHaveCount(1);
  await expect(sections.first()).toContainText('Bryła 2');
  const missing = quote.getByTestId('quote-missing-structures');
  await expect(missing).toContainText('Bez pozycji w ofercie: Budynek główny');

  // Open the house from the quote; its section is one refresh away.
  await missing.getByTestId('quote-open-structure').click();
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true');
  const stale = quote.getByTestId('quote-stale');
  await stale
    .getByRole('button', { name: 'Odśwież pozycje bryły „Budynek główny”' })
    .click();
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0)).toContainText('Budynek główny');
  await expect(sections.nth(1)).toContainText('Bryła 2');
  await expect(quote.getByTestId('quote-missing-structures')).toHaveCount(0);
  await expect(quote.getByTestId('quote-stale')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('vnext10f-quote.png'),
    fullPage: true,
  });
  await expect
    .poll(() => sent.quotes.at(-1)?.sections?.map((section) => section.id), {
      timeout: 10_000,
    })
    .toEqual(['structure:roof', 'structure:2']);

  // Reopened from the server, the estimation has both structures again.
  await quote.getByRole('button', { name: 'Zamknij', exact: true }).click();
  await page.reload();
  await expect(chips).toHaveCount(2, { timeout: 10_000 });
  expect(errors).toEqual([]);
});
