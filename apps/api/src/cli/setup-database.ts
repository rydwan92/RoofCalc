import '../environment';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  assertLocalSetupTarget,
  assertSharedDevSetupTarget,
} from '../db/setup-target';

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const apiDirectory = fileURLToPath(new URL('../..', import.meta.url));
const scripts = (
  JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> }
).scripts;

/**
 * Runs one `tsx …` package script with this same Node and TypeScript
 * loader. package.json stays the single definition of each step; a nested
 * `pnpm` is avoided because a different global pnpm (e.g. 12.x) may stall
 * while it resolves the pinned 10.15.1.
 */
function runScript(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const [runner, ...command] = (scripts[script] ?? '').split(/\s+/);
    if (runner !== 'tsx' || !command.length) {
      reject(new Error(`${script} is not a tsx script`));
      return;
    }
    const child = spawn(
      process.execPath,
      [...process.execArgv, ...command, ...args],
      { cwd: apiDirectory, env: process.env, stdio: 'inherit' },
    );
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolvePromise()
        : reject(
            new Error(`${script} failed with exit code ${code ?? 'unknown'}`),
          ),
    );
  });
}

async function main() {
  const mode = process.argv[2];
  const target =
    mode === 'local'
      ? assertLocalSetupTarget(process.env.DATABASE_URL)
      : mode === 'shared-dev'
        ? assertSharedDevSetupTarget({
            databaseUrl: process.env.DATABASE_URL,
            environment: process.env.ROOFCALC_DB_ENV,
            apply: process.argv.includes('--apply'),
            confirmation: valueAfter('--confirm'),
          })
        : undefined;
  if (!target) throw new Error('Expected setup target: local or shared-dev.');
  console.log(`Verified ${target.environment}: ${target.description}`);
  for (const script of [
    'db:wait',
    'db:doctor',
    'db:migrate',
    'db:seed',
    'db:seed-business',
    'db:smoke-check',
    'db:status',
  ])
    await runScript(
      script,
      script === 'db:status'
        ? ['--require-ready']
        : script === 'db:migrate' && target.environment === 'shared-dev'
          ? ['--apply', '--confirm', 'shared-dev']
          : [],
    );
  console.log(`DATABASE READY: ${target.environment}.`);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Database setup failed.',
  );
  process.exitCode = 1;
});
