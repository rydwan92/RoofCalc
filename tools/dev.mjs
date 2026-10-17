import { existsSync } from 'node:fs';
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
const [apiRunning, webRunning] = await Promise.all([
  running(`${apiUrl}/api/health`, (text) => {
    try {
      return JSON.parse(text).service === 'cieslacalc-api';
    } catch {
      return false;
    }
  }),
  running(
    webUrl,
    (text) => text.includes('/@vite/client') && text.includes('CieślaCalc'),
  ),
]);
const filters = [];
if (!apiRunning) filters.push('--filter', '@cieslacalc/api');
if (!webRunning) filters.push('--filter', '@cieslacalc/web');
console.log(`CieślaCalc: ${webUrl}/#/calculators/common-rafter`);
console.log(`API: ${apiUrl}/api/health`);
if (apiRunning) console.log('API already running — reusing it.');
if (webRunning) console.log('Vite already running — reusing it.');
console.log('Konfiguracja (.env, baza, Business): pnpm check:local');
if (filters.length) {
  const child = spawn('pnpm', ['--parallel', ...filters, 'dev'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}
