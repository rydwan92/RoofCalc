import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import {
  analyzeDeployment,
  analyzeWranglerConfig,
  hyperdriveCachingDisabled,
  missingWorkerSecrets,
  parseJsonc,
  parseLoggedIn,
  parseSecretNames,
  summarizeWrangler,
  type CloudflareIssue,
  type DeploymentIssue,
  type Probe,
} from '../config/cloudflare';
import { findWorkspaceRoot } from '../environment';

/**
 * `pnpm configure:cloudflare` — checks the Cloudflare side in one pass:
 * tracked wrangler.jsonc, Worker secrets (names only), Hyperdrive query
 * caching and the public endpoints of the deployed app. Account changes
 * (setting a missing secret, disabling caching) happen only after an
 * explicit "yes"; `--check` never changes anything. It never touches the
 * remote database, never deploys and never prints an existing secret.
 */

const check = process.argv.includes('--check');
const ok = (text: string) => console.log(`  ✓ ${text}`);
const warn = (text: string) => console.log(`  ! ${text}`);
const fail = (text: string) => console.log(`  ✗ ${text}`);
const info = (text: string) => console.log(`    ${text}`);
const step = (index: number, text: string) =>
  console.log(`\n${index}/5 ${text}`);

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
      return 'Worker nie łączy się z bazą — sprawdź dane źródła w Hyperdrive (host, użytkownik, hasło, TLS).';
    case 'readiness-missing':
      return 'Brak /api/readiness — wdrożona jest starsza wersja kodu. Wypchnij zmiany do gałęzi produkcyjnej (main) albo wdroż ręcznie.';
    case 'schema-not-current':
      return `Schemat zdalnej bazy: ${issue.schema}. Wymaga zatwierdzonej konserwacji shared DEV (patrz docs/KONFIGURACJA.md §4).`;
    case 'auth-unconfigured':
      return 'Business wyłączony: brak sekretów BETTER_AUTH_SECRET / ROOFCALC_BOOTSTRAP_TOKEN w działającej wersji.';
    case 'first-owner-required':
      return issue.bootstrap === 'available'
        ? 'Brak właściciela — otwórz aplikację → Business i utwórz pierwsze konto kodem konfiguracji.'
        : 'Brak właściciela, a kod konfiguracji jest niedostępny — ustaw ROOFCALC_BOOTSTRAP_TOKEN.';
  }
}

interface Run {
  code: number;
  stdout: string;
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
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', () => undefined);
    child.once('error', () => resolve({ code: 1, stdout }));
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout }));
    child.stdin.end(input ?? '');
  });
}

async function confirm(rl: Interface | undefined, question: string) {
  if (!rl) return false;
  const answer = (await rl.question(`  ${question} [t/N]: `))
    .trim()
    .toLowerCase();
  return answer === 't' || answer === 'y' || answer === 'tak';
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

async function main() {
  console.log('RoofCalc — konfiguracja Cloudflare (Worker + Hyperdrive)');
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
  const configFlag = ['--config', 'wrangler.jsonc'];
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
        'Wrangler nie jest zalogowany — kroki 3 i 4 pominięte. Zaloguj się: pnpm cloudflare:login',
      );
      info(
        '(albo ustaw CLOUDFLARE_API_TOKEN z uprawnieniami Workers + Hyperdrive)',
      );
    }

    step(3, 'Sekrety Workera (tylko nazwy)');
    if (loggedIn) {
      const listed = parseSecretNames(
        (await wrangler(root, ['secret', 'list', ...configFlag])).stdout,
      );
      if (!listed) {
        fail(
          'Nie udało się odczytać listy sekretów (czy Worker jest wdrożony?).',
        );
        blocking = true;
      } else {
        const missing = missingWorkerSecrets(listed);
        if (!missing.length)
          ok('BETTER_AUTH_SECRET i ROOFCALC_BOOTSTRAP_TOKEN ustawione.');
        else {
          fail(`Brakuje: ${missing.join(', ')}.`);
          if (
            !check &&
            (await confirm(
              rl,
              'Wygenerować losowe wartości i zapisać je jako sekrety Workera (zmiana na koncie Cloudflare)?',
            ))
          ) {
            for (const key of missing) {
              const value =
                key === 'ROOFCALC_BOOTSTRAP_TOKEN'
                  ? randomBytes(32).toString('hex')
                  : randomBytes(32).toString('base64url');
              const put = await wrangler(
                root,
                ['secret', 'put', key, ...configFlag],
                value,
              );
              if (put.code !== 0) {
                fail(`Nie udało się zapisać ${key}.`);
                blocking = true;
                continue;
              }
              ok(`${key} zapisany w Cloudflare.`);
              if (key === 'ROOFCALC_BOOTSTRAP_TOKEN') {
                console.log(
                  '\n    Kod konfiguracji pierwszego konta Business (zapisz go TERAZ —',
                );
                console.log(
                  '    Cloudflare nie pokaże go ponownie; jest jednorazowy):\n',
                );
                console.log(`    ${value}\n`);
              }
            }
            info('Sekrety obowiązują od razu w bieżącej wersji Workera.');
          } else blocking = true;
        }
      }
    } else warn('Pominięto.');

    step(4, 'Hyperdrive — buforowanie zapytań');
    if (loggedIn && summary.hyperdriveId) {
      const disabled = hyperdriveCachingDisabled(
        (await wrangler(root, ['hyperdrive', 'get', summary.hyperdriveId]))
          .stdout,
      );
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
              'Zmiana nie powiodła się — wyłącz w panelu: Hyperdrive → Settings → Caching.',
            );
            blocking = true;
          }
        } else blocking = true;
      }
    } else warn('Pominięto.');

    step(5, 'Wdrożona aplikacja (publiczne, tylko do odczytu)');
    if (!summary.authUrl) warn('Brak adresu — patrz krok 1.');
    else {
      const [health, readiness, setup] = await Promise.all([
        probe(summary.authUrl, '/api/health'),
        probe(summary.authUrl, '/api/readiness'),
        probe(summary.authUrl, '/api/setup/status'),
      ]);
      const issues = analyzeDeployment({ health, readiness, setup });
      for (const issue of issues)
        (issue.code === 'first-owner-required' ? warn : fail)(
          describeDeploymentIssue(issue),
        );
      if (!issues.length)
        ok(
          'Worker działa: baza połączona, schemat aktualny, Business skonfigurowany.',
        );
      blocking ||= issues.some(
        (issue) => issue.code !== 'first-owner-required',
      );
    }

    console.log(
      '\nUstawienia, których wrangler nie odczyta (panel Cloudflare):',
    );
    info('Workers & Pages → roofcalc → Settings → Build:');
    info(
      '  • gałąź produkcyjna: main; Node 22 (plik .node-version w repozytorium)',
    );
    info('  • polecenie budowania: pnpm cloudflare:build');
    info('  • polecenie wdrożenia: pnpm deploy:cloudflare');
    info(
      '  • zmienne budowania: DATABASE_URL (sekret, baza zdalna), ROOFCALC_DB_ENV=shared-dev',
    );
    info('Szczegóły: docs/KONFIGURACJA.md');
    console.log(
      blocking
        ? '\nCloudflare wymaga uwagi — popraw punkty ✗ i uruchom ponownie: pnpm configure:cloudflare'
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
