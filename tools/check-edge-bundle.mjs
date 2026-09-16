import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const worker = readFileSync(
  join(root, '.wrangler/v42-dryrun/worker.js'),
  'utf8',
);
for (const marker of [
  'loadRootEnvironment',
  'loadEnvFile',
  'DATABASE_URL',
  'node:fs',
]) {
  if (worker.includes(marker))
    throw new Error(`Node environment code entered Worker bundle: ${marker}`);
}
const assets = join(root, 'apps/web/dist/assets');
for (const file of readdirSync(assets).filter((name) => name.endsWith('.js'))) {
  const text = readFileSync(join(assets, file), 'utf8');
  for (const marker of ['DATABASE_URL', 'HYPERDRIVE.password']) {
    if (text.includes(marker))
      throw new Error(`Server database code entered client bundle: ${file}`);
  }
}
console.log('Edge and browser bundle boundaries: clean');
