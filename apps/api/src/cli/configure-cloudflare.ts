import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { createInterface, type Interface } from 'node:readline/promises';
import {
  analyzeDeployment,
  analyzeWranglerConfig,
  hyperdriveCachingDisabled,
  hyperdrivePasswordUpdateArgs,
  hyperdriveSslMode,
  missingWorkerSecrets,
  parseHyperdriveOrigin,
  parseJsonc,
  parseLoggedIn,
  parseSecretNames,
  summarizeWrangler,
  type CloudflareIssue,
  type DatabaseOrigin,
  type DeploymentIssue,
  type Probe,
} from '../config/cloudflare';
import { localDatabaseUrl } from '../config/env-file';
import { checkDatabaseConnection } from '../config/local-database';
import { findWorkspaceRoot } from '../environment';
import { ask, askHidden, confirm } from './prompt';
import { runDatabaseSetup } from './run-setup';

/**
 * `pnpm configure:cloudflare` — the Cloudflare side in one pass: tracked
 * wrangler.jsonc, Worker secrets (names only), Hyperdrive query caching, the
 * remote database behind Hyperdrive and the public endpoints of the deployed
 * app. Every account or database change waits for an explicit answer;
 * `--check` never changes anything. The remote database password is asked
 * for, kept in memory for this run only and never written to a file — the
 * local `.env` is never touched. It never deploys and never prints an
 * existing secret.
 */

const check = process.argv.includes('--check');
const ok = (text: string) => console.log(`  ✓ ${text}`);
const warn = (text: string) => console.log(`  ! ${text}`);
const fail = (text: string) => console.log(`  ✗ ${text}`);
const info = (text: string) => console.log(`    ${text}`);
const step = (index: number, text: string) =>
  console.log(`\n${index}/6 ${text}`);

function describeConfigIssue(issue: CloudflareIssue): string {
  switch (issue.code) {
    case 'config-unreadable':
      return 'wrangler.jsonc nie jest poprawnym JSONC.';
    case 'worker-entry':
      return `main=${issue.value ?? '(brak)'} — oczekiwano ./apps/api/src/edge/worker.ts.`;
    case 'nodejs-compat-missing':
      return 'compatibility_flags musi zawierać nodejs_compat (sterownik mysql2).';
    case 'assets-not-spa':
      return 'assets.not_found_handling powinno być single-page-application.';
    case 'api-not-worker-first':
      return 'assets.run_worker_first musi obejmować /api/* — inaczej API odpowie stroną SPA.';
    case 'auth-url-missing':
      return 'vars.BETTER_AUTH_URL nie jest ustawione — logowanie Business nie zadziała.';
    case 'auth-url-invalid':
      return `vars.BETTER_AUTH_URL=${issue.value} — musi być adresem https:// aplikacji, bez ścieżki i ukośnika na końcu.`;
    case 'secret-in-config':
      return `${issue.key} jest w wrangler.jsonc (plik w Git!). Usuń go stamtąd i ustaw jako sekret Workera.`;
    case 'hyperdrive-missing':
      return 'Brak powiązania HYPERDRIVE — Worker nie połączy się z bazą.';
    case 'hyperdrive-id-invalid':
      return `Identyfikator Hyperdrive "${issue.value}" ma zły format (32 znaki hex).`;
  }
}

function describeDeploymentIssue(issue: DeploymentIssue): string {
  switch (issue.code) {
    case 'unreachable':
      return `${issue.path} nie odpowiada — sprawdź, czy Worker jest wdrożony pod tym adresem.`;
    case 'not-worker':
      return `Odpowiada środowisko "${issue.runtime ?? 'nieznane'}" zamiast cloudflare-worker.`;
    case 'database-not-connected':
      return issue.reason === 'access-denied'
        ? 'Worker nie łączy się z bazą — baza odrzuciła hasło zapisane w Hyperdrive.'
        : issue.reason === 'tls'
          ? 'Worker nie łączy się z bazą — błąd TLS między Hyperdrive a bazą.'
          : issue.reason === 'timeout' || issue.reason === 'unreachable'
            ? 'Worker nie łączy się z bazą — serwer bazy nie odpowiada Hyperdrive.'
            : 'Worker nie łączy się z bazą — sprawdź dane źródła w Hyperdrive (host, użytkownik, hasło, TLS).';
    case 'readiness-missing':
      return 'Brak /api/readiness — wdrożona jest starsza wersja kodu. Wypchnij zmiany do gałęzi produkcyjnej (main) albo wdroż ręcznie.';
    case 'schema-not-current':
      return `Schemat zdalnej bazy: ${issue.schema}. Zaktualizuj go w kroku 5 (kopia zapasowa → migracje → dane startowe).`;
    case 'auth-unconfigured':
      return 'Business wyłączony: brak sekretów BETTER_AUTH_SECRET / ROOFCALC_BOOTSTRAP_TOKEN w działającej wersji.';
    case 'first-owner-required':
      return issue.bootstrap === 'available'
        ? 'Brak właściciela — otwórz aplikację → Business i utwórz pierwsze konto kodem konfiguracji.'
        : 'Brak właściciela, a kod konfiguracji jest niedostępny — ustaw ROOFCALC_BOOTSTRAP_TOKEN (krok 3).';
  }
}

interface Run {
  code: number;
  stdout: string;
  /** First meaningful error line from wrangler (never a secret value). */
  reason?: string;
}

/** The workspace's pinned wrangler, run by this Node — no shell, no PATH. */
const wranglerBin = join(
  dirname(createRequire(import.meta.url).resolve('wrangler/package.json')),
  'bin/wrangler.js',
);

/** Runs wrangler from the repository root, output captured. */
function wrangler(root: string, args: string[], input?: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [wranglerBin, ...args], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    const reason = () =>
      stderr
        .split(/\r?\n/)
        .map((line) => stripVTControlCharacters(line).trim())
        .find((line) => /error|failed|\bnot\b|nie /i.test(line))
        ?.slice(0, 240);
    child.once('error', () => resolve({ code: 1, stdout, reason: reason() }));
    child.once('exit', (code) =>
      resolve({ code: code ?? 1, stdout, reason: reason() }),
    );
    child.stdin.end(input ?? '');
  });
}

async function probe(base: string, path: string): Promise<Probe | undefined> {
  try {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => undefined);
    return { status: response.status, body };
  } catch {
    return undefined;
  }
}

/** Generates a Worker secret, stores it and prints a bootstrap code once. */
async function putSecret(root: string, key: string): Promise<boolean> {
  const value =
    key === 'ROOFCALC_BOOTSTRAP_TOKEN'
      ? randomBytes(32).toString('hex')
      : randomBytes(32).toString('base64url');
  const put = await wrangler(
    root,
    ['secret', 'put', key, '--config', 'wrangler.jsonc'],
    value,
  );
  if (put.code !== 0) {
    fail(`Nie udało się zapisać ${key}.`);
    if (put.reason) info(`wrangler: ${put.reason}`);
    if (/latest version|deployed|wdro/i.test(put.reason ?? ''))
      info(
        'Najnowsza wersja Workera nie jest wdrożona (np. podgląd z innej gałęzi). Ustaw sekret w panelu: Workers → roofcalc → Settings → Variables and Secrets.',
      );
    if (key === 'ROOFCALC_BOOTSTRAP_TOKEN')
      info('Poprzedni kod konfiguracji pozostaje ważny — nic nie zmieniono.');
    return false;
  }
  ok(`${key} zapisany w Cloudflare.`);
  if (key === 'ROOFCALC_BOOTSTRAP_TOKEN') {
    console.log(
      '\n    Kod konfiguracji pierwszego konta Business NA CLOUDFLARE (inny niż',
    );
    console.log(
      '    lokalny w .env). Zapisz go TERAZ — Cloudflare nie pokaże go ponownie:\n',
    );
    console.log(`    ${value}\n`);
  }
  return true;
}

/** XAMPP's client first, then one on PATH; MYSQLDUMP overrides both. */
function mysqldumpBinary(): string {
  if (process.env.MYSQLDUMP) return process.env.MYSQLDUMP;
  const xampp = 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
  return existsSync(xampp) ? xampp : 'mysqldump';
}

/**
 * A complete logical backup of the remote database into `backups/` (ignored
 * by Git). The password goes through MYSQL_PWD, never the command line; the
 * connection is encrypted. Returns the file, or undefined when it failed.
 */
function backupRemote(
  root: string,
  origin: DatabaseOrigin,
  password: string,
): Promise<string | undefined> {
  const directory = join(root, 'backups');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(directory, `${origin.database}-${stamp}.sql`);
  return new Promise((resolve) => {
    const child = spawn(
      mysqldumpBinary(),
      [
        '--single-transaction',
        '--routines',
        '--triggers',
        '--hex-blob',
        '--ssl',
        '-h',
        origin.host,
        '-P',
        String(origin.port),
        '-u',
        origin.user,
        `--result-file=${file}`,
        origin.database,
      ],
      {
        env: { ...process.env, MYSQL_PWD: password },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let error = '';
    child.stderr.on('data', (chunk: Buffer) => (error += chunk.toString()));
    const finish = (success: boolean) => {
      if (success && existsSync(file) && statSync(file).size > 0) {
        resolve(file);
        return;
      }
      rmSync(file, { force: true });
      const reason = error.split(/\r?\n/).find((line) => line.trim());
      if (reason) info(`mysqldump: ${reason.trim().slice(0, 200)}`);
      resolve(undefined);
    };
    child.once('error', () => finish(false));
    child.once('exit', (code) => finish(code === 0));
  });
}

/**
 * Step 5: read-only schema check of the database behind Hyperdrive, then —
 * only after a backup and the typed acknowledgement "shared-dev" — the
 * guarded setup (migrations → starter data → smoke check). Returns whether
 * the step left something unresolved.
 */
async function remoteDatabaseStep(
  rl: Interface | undefined,
  root: string,
  origin: DatabaseOrigin,
  /** Receives the password once the database itself accepted it. */
  onVerified: (password: string) => void = () => undefined,
): Promise<boolean> {
  ok(
    `Źródło Hyperdrive: ${origin.user}@${origin.host}:${origin.port}/${origin.database}`,
  );
  if (
    !(await confirm(
      rl,
      'Sprawdzić tę bazę teraz? Potrzebne hasło użytkownika bazy (nie zostanie zapisane)',
      false,
    ))
  ) {
    warn('Pominięto — stan schematu pokaże krok 6.');
    return false;
  }
  const password = await askHidden(rl, `Hasło użytkownika ${origin.user}`);
  if (!password) {
    warn('Nie podano hasła — pominięto.');
    return true;
  }
  const url = localDatabaseUrl({ ...origin, password });
  const state = await checkDatabaseConnection(url);
  if (state.status !== 'connected') {
    fail(
      state.status === 'access-denied'
        ? 'Hasło lub użytkownik odrzucone przez serwer bazy.'
        : state.status === 'server-down'
          ? 'Serwer bazy nie odpowiada z tego komputera.'
          : state.status === 'database-missing'
            ? 'Baza o tej nazwie nie istnieje.'
            : 'Połączenie nie powiodło się (TLS, sieć lub uprawnienia).',
    );
    if (state.detail) info(`Serwer: ${state.detail}`);
    if (state.status === 'access-denied') {
      info(
        `Potrzebne jest hasło UŻYTKOWNIKA BAZY ${origin.user} (u dostawcy bazy: MySQL → Użytkownicy),`,
      );
      info(
        'nie hasło do panelu konta. Hyperdrive łączy się tym samym hasłem — Worker ma połączenie,',
      );
      info(
        'więc w razie wątpliwości ustaw nowe hasło użytkownika u dostawcy i to samo w Hyperdrive.',
      );
    }
    return true;
  }
  onVerified(password);
  if (state.schema === 'current') {
    ok(`Połączono (${state.version}). Schemat aktualny.`);
    return false;
  }
  warn(`Połączono (${state.version}). Schemat: ${state.schema}.`);
  info('Aktualizacja wykona po kolei:');
  info('  1) pełną kopię zapasową tej bazy do katalogu backups/ (poza Git),');
  info(
    '  2) zatwierdzone migracje z kontrolą sum (bez usuwania tabel i danych),',
  );
  info(
    '  3) dane startowe katalogu i cen (dopisywane/aktualizowane; historia cen i dane użytkowników zostają),',
  );
  info('  4) test i raport stanu. Lokalna baza i .env nie są zmieniane.');
  const typed = await ask(rl, 'Aby wykonać, wpisz dokładnie: shared-dev');
  if (typed !== 'shared-dev') {
    warn('Nie potwierdzono — nic nie zmieniono.');
    return true;
  }
  const backup = await backupRemote(root, origin, password);
  if (backup) ok(`Kopia zapasowa: ${relative(root, backup)}`);
  else {
    fail('Nie udało się wykonać kopii zapasowej (mysqldump).');
    const own = await ask(
      rl,
      'Masz własną, aktualną kopię tej bazy (np. z panelu dostawcy)? Wpisz: mam kopię',
    );
    if (own !== 'mam kopię') {
      warn('Bez kopii zapasowej nic nie zmieniono.');
      return true;
    }
  }
  const done = await runDatabaseSetup('shared-dev', {
    ...process.env,
    DATABASE_URL: url,
    ROOFCALC_DB_ENV: 'shared-dev',
  });
  if (done) ok('Zdalna baza zaktualizowana i sprawdzona.');
  else
    fail(
      'Aktualizacja przerwana — przeczytaj komunikat powyżej. Kopia zapasowa pozostaje w backups/.',
    );
  return !done;
}

async function main() {
  console.log('RoofCalc — konfiguracja Cloudflare (Worker + Hyperdrive)');
  // Remote migrations run with this Node: the supported runtime only.
  if (Number(process.versions.node.split('.')[0]) < 22) {
    fail(
      `Node ${process.versions.node} — wymagany 22 lub nowszy. Przełącz: nvm use 22.18.0 i uruchom ponownie.`,
    );
    process.exitCode = 1;
    return;
  }
  const root = findWorkspaceRoot();
  if (!root)
    throw new Error('Nie znaleziono katalogu projektu (pnpm-workspace.yaml).');
  const config = (() => {
    try {
      return parseJsonc(readFileSync(join(root, 'wrangler.jsonc'), 'utf8'));
    } catch {
      return undefined;
    }
  })();
  const summary = summarizeWrangler(config);
  const rl =
    !check && process.stdin.isTTY
      ? createInterface({ input: process.stdin, output: process.stdout })
      : undefined;
  let blocking = false;
  try {
    step(1, 'wrangler.jsonc (plik w repozytorium)');
    const configIssues = analyzeWranglerConfig(config);
    for (const issue of configIssues) fail(describeConfigIssue(issue));
    if (!configIssues.length)
      ok(
        `Worker "${summary.name}", adres ${summary.authUrl}, Hyperdrive ${summary.hyperdriveId?.slice(0, 8)}…`,
      );
    blocking ||= configIssues.length > 0;

    step(2, 'Konto Cloudflare');
    const whoami = await wrangler(root, ['whoami', '--json']);
    const loggedIn = whoami.code === 0 && parseLoggedIn(whoami.stdout);
    if (loggedIn) ok('Wrangler zalogowany.');
    else {
      warn(
        'Wrangler nie jest zalogowany — kroki 3–5 pominięte. Zaloguj się: pnpm cloudflare:login',
      );
      info(
        '(albo ustaw CLOUDFLARE_API_TOKEN z uprawnieniami Workers + Hyperdrive)',
      );
    }

    step(3, 'Sekrety Workera (tylko nazwy)');
    if (loggedIn) {
      const listed = parseSecretNames(
        (await wrangler(root, ['secret', 'list', '--config', 'wrangler.jsonc']))
          .stdout,
      );
      if (!listed) {
        fail(
          'Nie udało się odczytać listy sekretów (czy Worker jest wdrożony?).',
        );
        blocking = true;
      } else {
        const missing = missingWorkerSecrets(listed);
        if (!missing.length) {
          ok('BETTER_AUTH_SECRET i ROOFCALC_BOOTSTRAP_TOKEN ustawione.');
          const setup = summary.authUrl
            ? await probe(summary.authUrl, '/api/setup/status')
            : undefined;
          const firstOwner = (setup?.body as { firstOwner?: string })
            ?.firstOwner;
          if (
            !check &&
            firstOwner !== 'configured' &&
            (await confirm(
              rl,
              'Pierwsze konto nie istnieje. Nadać NOWY kod konfiguracji (gdy poprzedni zginął)?',
              false,
            ))
          )
            blocking =
              !(await putSecret(root, 'ROOFCALC_BOOTSTRAP_TOKEN')) || blocking;
        } else {
          fail(`Brakuje: ${missing.join(', ')}.`);
          if (
            !check &&
            (await confirm(
              rl,
              'Wygenerować losowe wartości i zapisać je jako sekrety Workera (zmiana na koncie Cloudflare)?',
              false,
            ))
          ) {
            for (const key of missing)
              blocking = !(await putSecret(root, key)) || blocking;
            info('Sekrety obowiązują od razu w bieżącej wersji Workera.');
          } else blocking = true;
        }
      }
    } else warn('Pominięto.');

    step(4, 'Hyperdrive — buforowanie zapytań');
    const hyperdrive =
      loggedIn && summary.hyperdriveId
        ? (await wrangler(root, ['hyperdrive', 'get', summary.hyperdriveId]))
            .stdout
        : undefined;
    if (hyperdrive !== undefined && summary.hyperdriveId) {
      const disabled = hyperdriveCachingDisabled(hyperdrive);
      if (disabled === true)
        ok('Buforowanie wyłączone (sesje i uprawnienia zawsze świeże).');
      else if (disabled === undefined) {
        fail('Nie udało się odczytać konfiguracji Hyperdrive.');
        blocking = true;
      } else {
        fail(
          'Buforowanie włączone — logowanie może widzieć nieaktualne sesje i członkostwa.',
        );
        if (
          !check &&
          (await confirm(
            rl,
            'Wyłączyć buforowanie dla tej konfiguracji Hyperdrive (zmiana na koncie Cloudflare)?',
            false,
          ))
        ) {
          const update = await wrangler(root, [
            'hyperdrive',
            'update',
            summary.hyperdriveId,
            '--caching-disabled',
          ]);
          if (update.code === 0) ok('Buforowanie wyłączone.');
          else {
            fail(
              'Zmiana nie powiodła się — wyłącz w panelu: Hyperdrive → Settings → Caching → Disable.',
            );
            blocking = true;
          }
        } else blocking = true;
      }
    } else warn('Pominięto.');

    step(5, 'Zdalna baza (źródło Hyperdrive)');
    /** Kept in memory only, for the Hyperdrive offer in step 6. */
    let verifiedPassword: string | undefined;
    const origin = hyperdrive ? parseHyperdriveOrigin(hyperdrive) : undefined;
    if (check)
      warn('W trybie --check pominięto (wymaga hasła) — patrz krok 6.');
    else if (!origin) warn('Pominięto — brak danych źródła Hyperdrive.');
    // Run the step first: a compound OR-assignment would skip it whenever an
    // earlier step already needed attention (it did, silently).
    else
      blocking =
        (await remoteDatabaseStep(rl, root, origin, (password) => {
          verifiedPassword = password;
        })) || blocking;

    step(6, 'Wdrożona aplikacja (publiczne, tylko do odczytu)');
    let ownerNeeded = false;
    if (!summary.authUrl) warn('Brak adresu — patrz krok 1.');
    else {
      const [health, readiness, setup] = await Promise.all([
        probe(summary.authUrl, '/api/health'),
        probe(summary.authUrl, '/api/readiness'),
        probe(summary.authUrl, '/api/setup/status'),
      ]);
      let issues = analyzeDeployment({ health, readiness, setup });
      for (const issue of issues)
        (issue.code === 'first-owner-required' ? warn : fail)(
          describeDeploymentIssue(issue),
        );
      // VNext-6.1: the database accepted the password typed in step 5, but
      // the Worker cannot connect — Hyperdrive most likely holds another
      // (old) one. Offer to store the verified one; nothing else changes.
      if (
        !check &&
        verifiedPassword &&
        origin &&
        summary.hyperdriveId &&
        issues.some((issue) => issue.code === 'database-not-connected')
      ) {
        info(
          'Ta sama baza przyjęła hasło z kroku 5 — Hyperdrive ma najpewniej inne (stare) hasło.',
        );
        if (
          await confirm(
            rl,
            'Zapisać hasło z kroku 5 w Hyperdrive (zmiana na koncie Cloudflare; host, użytkownik i TLS bez zmian)?',
            false,
          )
        ) {
          const update = await wrangler(
            root,
            hyperdrivePasswordUpdateArgs({
              id: summary.hyperdriveId,
              origin,
              password: verifiedPassword,
              sslmode: hyperdriveSslMode(hyperdrive ?? ''),
            }),
          );
          if (update.code !== 0) {
            fail('Nie udało się zapisać hasła w Hyperdrive.');
            if (update.reason)
              info(
                `wrangler: ${update.reason.split(verifiedPassword).join('••••')}`,
              );
            info(
              'Ustaw je w panelu: Hyperdrive → roofcalc-dev → Settings → edycja połączenia.',
            );
          } else {
            ok('Hasło zapisane w Hyperdrive. Czekam na połączenie Workera…');
            let connected = false;
            for (let attempt = 0; attempt < 12 && !connected; attempt += 1) {
              await new Promise((resolve) => setTimeout(resolve, 5000));
              const again = await probe(summary.authUrl, '/api/health');
              connected =
                (again?.body as { database?: string } | undefined)?.database ===
                'connected';
            }
            if (connected) {
              ok('Worker połączony z bazą.');
              issues = analyzeDeployment({
                health: await probe(summary.authUrl, '/api/health'),
                readiness: await probe(summary.authUrl, '/api/readiness'),
                setup: await probe(summary.authUrl, '/api/setup/status'),
              });
              for (const issue of issues)
                (issue.code === 'first-owner-required' ? warn : fail)(
                  describeDeploymentIssue(issue),
                );
            } else
              fail(
                'Worker nadal bez połączenia po minucie — sprawdź TLS i dostęp z zewnątrz u dostawcy bazy.',
              );
          }
        }
      }
      if (!issues.length)
        ok(
          'Worker działa: baza połączona, schemat aktualny, Business skonfigurowany.',
        );
      ownerNeeded = issues.some(
        (issue) => issue.code === 'first-owner-required',
      );
      blocking ||= issues.some(
        (issue) => issue.code !== 'first-owner-required',
      );
    }

    console.log('\nPanel Cloudflare (wrangler tego nie odczyta):');
    info(
      'Workers & Pages → roofcalc → Settings → Build: wdrożenia z gałęzi main działają —',
    );
    info(
      'zostaw obecne polecenia. Opcjonalna bramka przed wdrożeniem: docs/KONFIGURACJA.md §4.',
    );
    console.log(
      blocking
        ? '\nCloudflare wymaga uwagi — popraw punkty ✗ i uruchom ponownie: pnpm configure:cloudflare'
        : ownerNeeded
          ? `\nGotowe. Teraz otwórz ${summary.authUrl} → Business → utwórz pierwsze konto kodem z kroku 3.`
          : '\nCloudflare skonfigurowany.',
    );
    if (blocking) process.exitCode = 1;
  } finally {
    rl?.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Sprawdzenie nie powiodło się.',
  );
  process.exitCode = 1;
});
