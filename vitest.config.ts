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
  },
  esbuild: { jsx: 'automatic' },
});
