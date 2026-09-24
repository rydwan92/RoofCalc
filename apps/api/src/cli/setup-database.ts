import '../environment';
import { spawn } from 'node:child_process';
import {
  assertLocalSetupTarget,
  assertSharedDevSetupTarget,
} from '../db/setup-target';

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function runScript(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    // Re-use the pnpm that launched this command (npm_execpath) so a broken
    // global shim cannot stall setup; fall back to the shim otherwise.
    const pnpm = process.env.npm_execpath;
    const child = pnpm?.endsWith('.cjs')
      ? spawn(process.execPath, [pnpm, script, ...args], {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'inherit',
        })
      : spawn('pnpm', [script, ...args], {
          cwd: process.cwd(),
          env: process.env,
          stdio: 'inherit',
          // Windows cannot execute a .cmd shim directly through spawn(). The
          // command and argument are both internal constants, never user input.
          shell: process.platform === 'win32',
        });
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
      script === 'db:status' ? ['--', '--require-ready'] : [],
    );
  console.log(`DATABASE READY: ${target.environment}.`);
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Database setup failed.',
  );
  process.exitCode = 1;
});
