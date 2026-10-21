import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import process from 'node:process';

/**
 * `pnpm deploy:local` — bring the local XAMPP install up to date in one
 * command (VNext-6):
 *
 *   1. fast-forward `main` to `origin/main` — only when on `main` with a
 *      clean working tree; it never discards, stashes or rewrites anything;
 *   2. install the locked dependencies;
 *   3. build the static web app Apache serves (`apps/web/dist`);
 *   4. run the read-only local checks (`.env`, database schema, Business).
 *
 * It never migrates or seeds a database by itself and never touches a
 * remote one. Cloudflare deploys `main` through Workers Builds on push.
 */

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(
    `CieślaCalc wymaga Node 22 lub nowszego (jest ${process.versions.node}).`,
  );
  process.exit(1);
}

const windows = process.platform === 'win32';
// The pnpm that started this script (pinned 10.15.1 in package.json).
const pnpm = process.env.npm_execpath
  ? [process.execPath, process.env.npm_execpath]
  : ['npx', 'pnpm@10.15.1'];

function run(command, args, { optional = false } = {}) {
  console.log(`\n› ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: windows && command === 'npx',
  });
  if (result.status !== 0 && !optional) {
    console.error(`\n✗ Polecenie nie powiodło się (kod ${result.status}).`);
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

console.log('CieślaCalc — wdrożenie lokalne (XAMPP)');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
// Tracked changes only: untracked notes (e.g. docs/Vnext/) do not block an
// update, and `merge --ff-only` itself refuses to overwrite an untracked file.
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (branch === undefined) {
  console.log('! To nie jest repozytorium Git — buduję bieżące pliki.');
} else if (branch !== 'main') {
  console.log(
    `! Jesteś na gałęzi „${branch}” — nie aktualizuję jej, buduję to, co jest w katalogu.`,
  );
} else if (dirty) {
  console.log(
    '! Masz niezatwierdzone zmiany — nie aktualizuję kodu (nic nie zostanie nadpisane), buduję bieżące pliki.',
  );
} else {
  run('git', ['fetch', 'origin', 'main']);
  if (!run('git', ['merge', '--ff-only', 'origin/main'], { optional: true })) {
    console.error(
      '✗ main rozszedł się z origin/main — scal ręcznie; nic nie zostało zmienione.',
    );
    process.exit(1);
  }
}

run(pnpm[0], [...pnpm.slice(1), 'install', '--frozen-lockfile']);
run(pnpm[0], [...pnpm.slice(1), '--filter', '@cieslacalc/web', 'build']);

const checks = existsSync('.env')
  ? run(pnpm[0], [...pnpm.slice(1), 'check:local'], { optional: true })
  : false;

const dist = resolve('apps/web/dist');
const htdocs = dist.toLowerCase().indexOf(`${windows ? '\\' : '/'}htdocs`);
console.log('\n✓ Zbudowano apps/web/dist.');
if (htdocs >= 0) {
  const root = dist.slice(0, htdocs + '/htdocs'.length);
  const path = relative(root, dist)
    .split(windows ? '\\' : '/')
    .join('/');
  console.log(`  Otwórz: http://localhost/${path}/`);
}
if (!existsSync('.env'))
  console.log('  Brak .env — konfiguracja bazy i API: pnpm configure:local');
else if (!checks)
  console.log(
    '  Sprawdzenie lokalne zgłosiło problem — szczegóły wyżej; naprawa: pnpm configure:local',
  );
console.log(
  '  Cloudflare: push do main wdraża Workers Builds (pnpm check:cloudflare pokazuje stan).',
);
