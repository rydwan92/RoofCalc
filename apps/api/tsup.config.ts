import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/server.ts',
    'src/cli/import-catalog.ts',
    'src/cli/import-pricing.ts',
    'src/cli/wait-for-db.ts',
    'src/cli/seed-all.ts',
    'src/cli/smoke-check.ts',
    'src/cli/doctor.ts',
    'src/cli/status.ts',
    'src/cli/setup-target.ts',
    'src/cli/setup-database.ts',
  ],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  noExternal: [/^@cieslacalc\//],
});
