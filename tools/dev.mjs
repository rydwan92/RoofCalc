import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve as resolvePath } from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

// Checked before anything else: an older Node fails later with errors that
// look like a database or proxy problem (see docs/KONFIGURACJA.md).
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(
    `CieślaCalc wymaga Node 22 lub nowszego (jest ${process.versions.node}).\n` +
      'Zainstaluj Node 22 LTS (np. nvm install 22 && nvm use 22) i uruchom ponownie.',
  );
  process.exit(1);
}

// The ONE local configuration file. `pnpm check:local` explains every line.
if (existsSync('.env')) process.loadEnvFile('.env');

async function running(url, matches) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return response.ok && matches(await response.text());
  } catch {
    return false;
  }
}

const apiUrl = `http://127.0.0.1:${process.env.PORT ?? 3001}`;
const webUrl = 'http://127.0.0.1:5173';
const isApi = (text) => {
  try {
    return JSON.parse(text).service === 'cieslacalc-api';
  } catch {
    return false;
  }
};
const [apiRunning, webRunning] = await Promise.all([
  running(`${apiUrl}/api/health`, isApi),
  running(
    webUrl,
    (text) => text.includes('/@vite/client') && text.includes('CieślaCalc'),
  ),
]);
console.log(`CieślaCalc: ${webUrl}/#/calculators/common-rafter`);
console.log(`API: ${apiUrl}/api/health`);
if (apiRunning) console.log('API already running — reusing it.');
if (webRunning) console.log('Vite already running — reusing it.');
console.log('Konfiguracja (.env, baza, Business): pnpm check:local');

/**
 * Each server runs with THIS Node (checked above) straight from its package —
 * the same commands as the packages' `dev` scripts — without a nested pnpm:
 * a different global pnpm (e.g. 12.x) re-resolves the pinned 10.15.1 for
 * every nested call and can stall there before the server starts.
 */
const servers = {
  api: {
    cwd: 'apps/api',
    bin: (resolve) => resolve('tsx/cli'),
    args: ['watch', 'src/server.ts'],
  },
  web: {
    cwd: 'apps/web',
    bin: (resolve) =>
      join(dirname(resolve('vite/package.json')), 'bin/vite.js'),
    args: ['--host', '127.0.0.1'],
  },
};
const children = [];
function start(name, stdin) {
  const server = servers[name];
  const cwd = resolvePath(server.cwd);
  const resolve = createRequire(join(cwd, 'package.json')).resolve;
  const child = spawn(process.execPath, [server.bin(resolve), ...server.args], {
    cwd,
    stdio: [stdin, 'inherit', 'inherit'],
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  // One server stopping stops the session, like `pnpm --parallel` did.
  child.on('exit', (code) => {
    process.exitCode ??= code ?? 1;
    for (const other of children) if (other !== child) other.kill();
  });
}

// Started one after the other: on Windows, `tsx watch` started at the same
// moment as Vite (`pnpm --parallel`) could hang before listening, which the
// browser then reported as "cannot connect to the database".
if (!apiRunning) {
  start('api', 'ignore');
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (!ready && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    ready = await running(`${apiUrl}/api/health`, isApi);
  }
  console.log(
    ready
      ? `API gotowe: ${apiUrl}`
      : 'API nie odpowiada po 60 s — sprawdź komunikaty powyżej oraz: pnpm check:local',
  );
}
if (!webRunning) start('web', 'inherit');
