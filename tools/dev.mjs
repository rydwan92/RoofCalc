import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { spawn } from 'node:child_process';

if (existsSync('.env')) loadEnvFile('.env');

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
