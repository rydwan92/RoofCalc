import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

/** Root .env is local configuration; the real environment always wins. */
export function findWorkspaceRoot(
  startDirectory = process.cwd(),
): string | undefined {
  let directory = resolve(startDirectory);
  for (;;) {
    if (existsSync(join(directory, 'pnpm-workspace.yaml'))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

export function loadRootEnvironment(startDirectory = process.cwd()): void {
  const root = findWorkspaceRoot(startDirectory);
  if (!root) return;
  const file = join(root, '.env');
  if (existsSync(file)) loadEnvFile(file);
}

loadRootEnvironment();
