import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadRootEnvironment } from './environment';

const directories: string[] = [];
afterEach(() => {
  delete process.env.ROOFCALC_ENV_TEST;
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'roofcalc-env-'));
  directories.push(root);
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []');
  mkdirSync(join(root, 'apps/api'), { recursive: true });
  return root;
}

it('loads root .env when invoked from an API workspace', () => {
  const root = workspace();
  writeFileSync(join(root, '.env'), 'ROOFCALC_ENV_TEST="from root"\n');
  loadRootEnvironment(join(root, 'apps/api'));
  expect(process.env.ROOFCALC_ENV_TEST).toBe('from root');
});

it('preserves explicit environment values, including empty values', () => {
  const root = workspace();
  writeFileSync(join(root, '.env'), 'ROOFCALC_ENV_TEST=from-file\n');
  process.env.ROOFCALC_ENV_TEST = '';
  loadRootEnvironment(root);
  expect(process.env.ROOFCALC_ENV_TEST).toBe('');
  process.env.ROOFCALC_ENV_TEST = 'from terminal';
  loadRootEnvironment(root);
  expect(process.env.ROOFCALC_ENV_TEST).toBe('from terminal');
});

it('allows CI/production with no .env and ignores nested .env', () => {
  const root = workspace();
  writeFileSync(join(root, 'apps/api/.env'), 'ROOFCALC_ENV_TEST=wrong\n');
  expect(() => loadRootEnvironment(join(root, 'apps/api'))).not.toThrow();
  expect(process.env.ROOFCALC_ENV_TEST).toBeUndefined();
});
