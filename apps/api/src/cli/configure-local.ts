import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface, type Interface } from 'node:readline/promises';
import {
  analyzeLocalEnv,
  envValues,
  issueSeverity,
  parseEnvFile,
  setEnvValue,
  type EnvIssue,
} from '../config/env-file';
import { describeDatabaseTarget, parseDatabaseUrl } from '../db/config';
import {
  checkLocalConnection,
  provisionLocalDatabase,
} from '../config/local-database';
import { findWorkspaceRoot } from '../environment';

/**
 * `pnpm configure:local` — ONE place to set up a local RoofCalc: the root
 * `.env`, the database and its own user, local Business secrets, schema and
 * starter data. `--check` only reads and reports. Never prints a secret,
 * never touches a remote database, never edits SQL migrations.
 */

const check = process.argv.includes('--check');
const assumeYes = process.argv.includes('--yes');
const ok = (text: string) => console.log(`  ✓ ${text}`);
const warn = (text: string) => console.log(`  ! ${text}`);
const fail = (text: string) => console.log(`  ✗ ${text}`);
const step = (index: number, text: string) =>
  console.log(`\n${index}/5 ${text}`);

function describeIssue(issue: EnvIssue): string {
  switch (issue.code) {
    case 'not-key-value':
      return issue.looksLikeSql
        ? `linia ${issue.line}: to jest polecenie SQL — .env przyjmuje tylko KLUCZ=wartość. SQL uruchamia się w phpMyAdmin → zakładka SQL (albo pozwól temu kreatorowi utworzyć bazę i użytkownika).`
        : `linia ${issue.line}: brak formatu KLUCZ=wartość — Node pominie tę linię.`;
    case 'duplicate-key':
      return `${issue.key} występuje kilka razy (linie ${issue.lines.join(', ')}) — obowiązuje pierwsza.`;
    case 'database-url-missing':
      return 'brak DATABASE_URL — kalkulator działa, ale katalog i tryb Business nie.';
    case 'database-url-invalid':
      return `DATABASE_URL: ${issue.message}`;
    case 'database-url-remote':
      return `DATABASE_URL wskazuje zdalny serwer (${issue.host}). Lokalnie używaj XAMPP; zdalną bazę obsługuje Cloudflare (Hyperdrive).`;
    case 'port-invalid':
      return `PORT="${issue.value}" nie jest numerem portu.`;
    case 'port-collides-with-web':
      return `PORT=${issue.port} koliduje z Vite (5173). Ustaw np. PORT=3001.`;
    case 'auth-url-not-local-dev':
      return `BETTER_AUTH_URL=${issue.value} — lokalnie powinno być http://127.0.0.1:5173 (adres, który otwierasz w przeglądarce).`;
    case 'secret-too-short':
      return `${issue.key} ma ${issue.length} znaków — wymagane co najmniej 32.`;
    case 'auth-incomplete':
      return `Business: brakuje ${issue.missing.join(', ')}.`;
  }
}

async function ask(
  rl: Interface | undefined,
  question: string,
  fallback = '',
): Promise<string> {
  if (!rl) return fallback;
  const answer = (
    await rl.question(`  ${question}${fallback ? ` [${fallback}]` : ''}: `)
  ).trim();
  return answer || fallback;
}

async function confirm(rl: Interface | undefined, question: string) {
  if (assumeYes) return true;
  if (!rl) return false;
  const answer = (await rl.question(`  ${question} [T/n]: `))
    .trim()
    .toLowerCase();
  return answer === '' || answer === 't' || answer === 'y' || answer === 'tak';
}

/** A password prompt that does not echo what is typed. */
async function askHidden(rl: Interface | undefined, question: string) {
  if (!rl) return '';
  const writable = rl as unknown as { _writeToOutput?: (text: string) => void };
  const original = writable._writeToOutput;
  process.stdout.write(`  ${question}: `);
  writable._writeToOutput = () => undefined;
  try {
    return (await rl.question('')).trim();
  } finally {
    writable._writeToOutput = original;
    process.stdout.write('\n');
  }
}

/** Asks for names and credentials, then provisions through the module. */
async function provision(
  rl: Interface | undefined,
  defaults: { database: string; user: string },
): Promise<string | undefined> {
  const adminUser = await ask(rl, 'Administrator MariaDB (XAMPP)', 'root');
  const adminPassword = await askHidden(
    rl,
    'Hasło administratora (Enter = brak, domyślnie w XAMPP)',
  );
  const database = await ask(rl, 'Nazwa bazy', defaults.database);
  const user = await ask(rl, 'Użytkownik aplikacji', defaults.user);
  const existingUserPassword = await askHidden(
    rl,
    'Jeśli ten użytkownik już istnieje — jego hasło (Enter = wygeneruj nowe)',
  );
  const result = await provisionLocalDatabase({
    admin: { user: adminUser, password: adminPassword },
    database,
    user,
    ...(existingUserPassword ? { existingUserPassword } : {}),
  });
  if (result.status === 'ready') {
    ok(
      `Baza ${database} i użytkownik ${user} gotowi (uprawnienia tylko do tej bazy${result.userExisted ? ', użytkownik istniał' : ''}).`,
    );
    return result.databaseUrl;
  }
  fail(
    result.status === 'invalid-name'
      ? 'Nazwy mogą zawierać tylko litery, cyfry i _ (do 64 znaków).'
      : result.status === 'admin-denied'
        ? 'Administrator odrzucony — sprawdź login i hasło administratora.'
        : result.status === 'server-down'
          ? 'MariaDB nie odpowiada na 127.0.0.1:3306 — uruchom MySQL w panelu XAMPP.'
          : `Nie udało się utworzyć bazy/użytkownika (${result.code ?? 'błąd'}).`,
  );
  return undefined;
}

/** `db:setup:local` in this same Node and loader — no shell, no PATH. */
function runSetup(): Promise<boolean> {
  return new Promise((resolve) => {
    const script = fileURLToPath(
      new URL('./setup-database.ts', import.meta.url),
    );
    const child = spawn(
      process.execPath,
      [...process.execArgv, script, 'local'],
      { stdio: 'inherit' },
    );
    child.once('error', () => resolve(false));
    child.once('exit', (code) => resolve(code === 0));
  });
}

async function main() {
  console.log('RoofCalc — konfiguracja lokalna');
  console.log('Jedno miejsce: plik .env w katalogu głównym projektu.');
  const root = findWorkspaceRoot();
  if (!root)
    throw new Error('Nie znaleziono katalogu projektu (pnpm-workspace.yaml).');
  const envPath = join(root, '.env');
  const interactive = !check && process.stdin.isTTY && !assumeYes;
  const rl = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : undefined;
  let changed = false;
  let blocking = false;
  try {
    step(1, 'Node.js');
    const major = Number(process.versions.node.split('.')[0]);
    if (major >= 22) ok(`Node ${process.versions.node}`);
    else {
      fail(
        `Node ${process.versions.node} — wymagany 22 lub nowszy. Zainstaluj i przełącz: nvm install 22 && nvm use 22`,
      );
      blocking = true;
    }

    step(2, 'Plik .env');
    let text = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
    if (!text) {
      warn('Brak pliku .env.');
      if (
        !check &&
        (await confirm(rl, 'Utworzyć .env z ustawieniami lokalnymi?'))
      ) {
        text = 'HOST=127.0.0.1\nPORT=3001\n';
        changed = true;
      }
    }
    const before = text;
    const issues = analyzeLocalEnv(parseEnvFile(text));
    for (const issue of issues)
      (issueSeverity(issue) === 'error' ? fail : warn)(describeIssue(issue));
    if (!issues.length) ok('Składnia i wartości poprawne.');
    const invalidLines = issues.filter(
      (issue) => issue.code === 'not-key-value',
    );
    if (
      invalidLines.length &&
      !check &&
      (await confirm(
        rl,
        'Zamienić te linie w komentarze (# …), żeby nie przeszkadzały?',
      ))
    ) {
      const lines = text.split(/\r?\n/);
      for (const issue of invalidLines)
        lines[issue.line - 1] = `# ${lines[issue.line - 1]}`;
      text = lines.join(text.includes('\r\n') ? '\r\n' : '\n');
      changed = true;
    }
    if (!envValues(parseEnvFile(text)).PORT && !check) {
      text = setEnvValue(text, 'PORT', '3001');
      changed = true;
    }

    step(3, 'Baza danych (XAMPP MariaDB)');
    let databaseUrl = envValues(parseEnvFile(text)).DATABASE_URL;
    if (databaseUrl)
      try {
        ok(`Cel: ${describeDatabaseTarget(parseDatabaseUrl(databaseUrl))}`);
      } catch {
        /* reported in step 2 */
      }
    let connection = databaseUrl
      ? await checkLocalConnection(databaseUrl).catch(
          () => ({ status: 'failed' }) as const,
        )
      : undefined;
    if (connection?.status === 'connected')
      ok(`Połączono: ${connection.version}, schemat: ${connection.schema}.`);
    else if (connection?.status === 'server-down') {
      fail('MariaDB nie odpowiada — uruchom MySQL w panelu XAMPP i powtórz.');
      blocking = true;
    } else {
      if (connection)
        fail(
          connection.status === 'access-denied'
            ? 'Użytkownik lub hasło z DATABASE_URL zostały odrzucone.'
            : connection.status === 'database-missing'
              ? 'Baza z DATABASE_URL nie istnieje.'
              : 'Połączenie nie powiodło się.',
        );
      if (
        !check &&
        (await confirm(rl, 'Utworzyć bazę i osobnego użytkownika aplikacji?'))
      ) {
        const current = databaseUrl
          ? (() => {
              try {
                return parseDatabaseUrl(databaseUrl);
              } catch {
                return undefined;
              }
            })()
          : undefined;
        const url = await provision(rl, {
          database: current?.database ?? 'cieslacalc',
          user:
            current?.user && current.user !== 'root'
              ? current.user
              : 'roofcalc_app',
        });
        if (url) {
          databaseUrl = url;
          text = setEnvValue(text, 'DATABASE_URL', url);
          changed = true;
          connection = await checkLocalConnection(url);
          if (connection.status === 'connected')
            ok(`Połączono jako nowy użytkownik: ${connection.version}.`);
        }
      } else if (!databaseUrl) blocking = blocking || check;
    }

    step(4, 'Tryb Business (logowanie) — opcjonalnie');
    const values = envValues(parseEnvFile(text));
    const missingAuth = [
      'BETTER_AUTH_SECRET',
      'ROOFCALC_BOOTSTRAP_TOKEN',
      'BETTER_AUTH_URL',
    ].filter((key) => !values[key]);
    if (!missingAuth.length)
      ok('Sekrety lokalne ustawione (wartości nie są wyświetlane).');
    else if (
      !check &&
      (await confirm(
        rl,
        `Wygenerować brakujące ustawienia (${missingAuth.join(', ')})?`,
      ))
    ) {
      if (!values.BETTER_AUTH_SECRET)
        text = setEnvValue(
          text,
          'BETTER_AUTH_SECRET',
          randomBytes(32).toString('base64url'),
        );
      if (!values.ROOFCALC_BOOTSTRAP_TOKEN)
        text = setEnvValue(
          text,
          'ROOFCALC_BOOTSTRAP_TOKEN',
          randomBytes(32).toString('hex'),
        );
      if (!values.BETTER_AUTH_URL)
        text = setEnvValue(text, 'BETTER_AUTH_URL', 'http://127.0.0.1:5173');
      changed = true;
      ok(
        'Wygenerowano. Kod pierwszego konta: ROOFCALC_BOOTSTRAP_TOKEN w .env.',
      );
    } else
      warn(
        `Business wyłączony do czasu ustawienia: ${missingAuth.join(', ')}.`,
      );

    if (changed && text !== before) {
      if (existsSync(envPath)) {
        const backup = `${envPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        copyFileSync(envPath, backup);
        ok(
          `Kopia poprzedniego .env: ${backup.slice(root.length + 1)} (ignorowana przez git).`,
        );
      }
      writeFileSync(envPath, text);
      ok('Zapisano .env.');
    }

    step(5, 'Schemat i dane startowe');
    if (connection?.status === 'connected' && connection.schema === 'current')
      ok('Schemat aktualny (8/8 migracji, sumy kontrolne zgodne).');
    else if (connection?.status === 'connected') {
      warn(`Schemat: ${connection.schema}.`);
      if (
        !check &&
        (await confirm(
          rl,
          'Uruchomić migracje i dane startowe (pnpm db:setup:local)?',
        ))
      ) {
        process.env.DATABASE_URL = databaseUrl;
        if (!(await runSetup())) blocking = true;
      } else blocking = blocking || check;
    } else warn('Pominięto — najpierw połączenie z bazą.');

    console.log(
      blocking
        ? '\nKonfiguracja niekompletna — popraw punkty oznaczone ✗ i uruchom ponownie: pnpm configure:local'
        : '\nGotowe. Uruchom: pnpm dev  →  http://127.0.0.1:5173',
    );
    if (blocking) process.exitCode = 1;
  } finally {
    rl?.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Konfiguracja nie powiodła się.',
  );
  process.exitCode = 1;
});
