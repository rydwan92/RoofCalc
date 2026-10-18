import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Runs the guarded `setup-database.ts` in this same Node and TypeScript
 * loader — no shell, no PATH, no nested pnpm. `env` carries the target: a
 * remote `DATABASE_URL` exists only in the child's environment and is never
 * written to a file.
 */
export function runDatabaseSetup(
  mode: 'local' | 'shared-dev',
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return new Promise((resolve) => {
    const script = fileURLToPath(
      new URL('./setup-database.ts', import.meta.url),
    );
    const args =
      mode === 'local'
        ? ['local']
        : ['shared-dev', '--apply', '--confirm', 'shared-dev'];
    const child = spawn(
      process.execPath,
      [...process.execArgv, script, ...args],
      {
        cwd: fileURLToPath(new URL('../..', import.meta.url)),
        env,
        stdio: 'inherit',
      },
    );
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}
