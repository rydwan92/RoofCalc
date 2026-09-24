import { expect, test } from '@playwright/test';
import { mockBusinessWorkspace } from './business-workspace-fixture';

test('admin sees live readiness categories without a mutation control', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  });
  await page.route('**/api/business/system/status', (route) =>
    route.fulfill({
      json: {
        database: 'connected',
        migrations: { state: 'current', applied: 8, expected: 8 },
        seeds: {
          catalogue: { state: 'current', current: 10, expected: 10 },
          pricing: { state: 'missing', current: 0, expected: 4 },
          business: { state: 'outdated', current: 0, expected: 1 },
        },
      },
    }),
  );
  await page.route('**/api/business/organizations', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'org:demo',
            slug: 'demo',
            name: 'DEMO Hurtownia (dane testowe)',
            currencyCode: 'PLN',
            active: true,
          },
        ],
      },
    }),
  );
  await page.route('**/api/business/organizations/*/assortment?*', (route) =>
    route.fulfill({
      json: {
        organization: {
          id: 'org:demo',
          slug: 'demo',
          name: 'DEMO Hurtownia (dane testowe)',
          currencyCode: 'PLN',
          active: true,
        },
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
    }),
  );
  await mockBusinessWorkspace(page, 'org:demo');
  await page.goto('/#/calculators/common-rafter');
  await page.getByTestId('business-admin-entry').click();
  await page.getByRole('button', { name: 'Stan systemu' }).click();
  const status = page.getByTestId('business-system-status');
  await expect(status).toContainText('Migracje');
  await expect(status).toContainText('Katalog techniczny');
  await expect(status).toContainText('Cenniki');
  await expect(status).toContainText('Wymagają aktualizacji');
  await expect(
    status.getByRole('button', { name: /migr|seed|aktualizuj/i }),
  ).toHaveCount(0);
  const sizes =
    info.project.name === 'mobile'
      ? [{ width: 390, height: 844 }]
      : [
          { width: 1440, height: 900 },
          { width: 1920, height: 1080 },
          { width: 1024, height: 768 },
        ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
