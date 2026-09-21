import '../environment';
import {
  assertLocalSetupTarget,
  assertSharedDevSetupTarget,
} from '../db/setup-target';

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
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
  console.log(`TARGET: ${target.environment}`);
  console.log(`SERVER: ${target.description}`);
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Target check failed.',
  );
  process.exitCode = 1;
}
