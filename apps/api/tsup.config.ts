import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/cli/import-catalog.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  noExternal: [/^@cieslacalc\//],
});
