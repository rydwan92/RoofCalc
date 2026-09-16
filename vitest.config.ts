import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/**/*.test.{ts,tsx}',
      'tools/**/*.test.ts',
      'fixtures/**/*.test.ts',
    ],
    environment: 'node',
    /**
     * The heaviest suites here render the whole application in jsdom:
     * `Page.test.tsx` costs ~2.1s per test, `MobilePage.test.tsx` ~1.8s and
     * `ProjectManager.test.tsx` ~2.6s even on an idle machine. Vitest's
     * 5000ms default is a *unit*-test threshold, so under fork contention a
     * different healthy test crossed it on almost every full run while
     * passing in well under a second in isolation.
     *
     * 20s keeps a real hang detectable — it is ~10x the slowest healthy test
     * — while removing a false gate. If a test ever needs more than this,
     * the test is wrong, not the threshold.
     */
    testTimeout: 20000,
    /** Keep jsdom suites within the workstation/CI memory budget. */
    maxWorkers: 4,
  },
  esbuild: { jsx: 'automatic' },
});
