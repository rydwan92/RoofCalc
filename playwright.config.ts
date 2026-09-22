import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser smoke coverage for the workbench.
 *
 * Not part of `pnpm verify`: it needs a browser binary downloaded separately
 * (`pnpm e2e:install`). Run it with `pnpm e2e`; CI runs it as its own job.
 *
 * Deliberately few and behavioural — layout overflow, rendering regressions and
 * a project round trip — because the domain itself is covered by fast unit
 * tests. No per-pixel screenshot assertions: they go stale and get muted.
 */
const PORT = 4173;
const externalUrl = process.env.ROOFCALC_E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // A single preview server is deliberately exercised serially. On Windows,
  // parallel browser starts can otherwise starve Vite preview and turn a
  // layout smoke test into a navigation-timeout lottery.
  workers: 1,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalUrl ?? `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        screen: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        hasTouch: true,
      },
    },
  ],
  webServer: externalUrl
    ? undefined
    : {
        command: 'pnpm --filter @cieslacalc/web preview',
        url: `http://127.0.0.1:${PORT}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
