import { expect, test } from '@playwright/test';

test('first owner form stays usable at desktop and mobile widths', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    localStorage.setItem('cieslacalc.businessMode.v1', 'business');
    localStorage.setItem('cieslacalc.creatorStartSeen.v1', '1');
  });
  await page.route('**/api/business/session', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'authentication-required' } }),
    }),
  );
  await page.route('**/api/setup/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        database: 'connected',
        auth: 'configured',
        firstOwner: 'required',
        bootstrap: 'available',
        organization: 'new',
      }),
    }),
  );
  await page.goto('/');
  const login = page.getByTestId('business-login');
  await expect(login).toBeVisible();
  await login
    .getByRole('button', { name: /Skonfiguruj pierwsze konto/ })
    .click();
  await expect(login.getByLabel('Kod konfiguracji')).toBeVisible();
  await expect(login.getByLabel('Nazwa firmy')).toBeVisible();
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
    const input = login.getByLabel('E-mail');
    await input.focus();
    expect(
      await input.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none');
    expect((await input.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
});
