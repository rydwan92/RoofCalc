/**
 * What to do when Business cannot start. The same state needs a different
 * next step on the developer's own machine (one command that explains the
 * cause, docs/KONFIGURACJA.md) and on a deployed host (an operator task on
 * Cloudflare). Never mentions a secret value.
 */

export type SetupProblem =
  | 'static-build'
  | 'server-unreachable'
  | 'database-unavailable'
  | 'auth-unconfigured'
  | 'schema-unknown';

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

export function isLocalHost(
  hostname = globalThis.location?.hostname ?? '',
): boolean {
  return LOOPBACK.includes(hostname);
}

export function setupGuidance(
  problem: SetupProblem,
  local: boolean,
  pl: boolean,
): string {
  const text = (polish: string, english: string) => (pl ? polish : english);
  switch (problem) {
    case 'static-build':
      return text(
        'Logowanie RoofCalc Business działa tylko przez serwer aplikacji. Ta strona jest statycznym buildem (np. z XAMPP), więc nie może utworzyć sesji logowania. Uruchom w katalogu projektu „pnpm dev” i otwórz http://127.0.0.1:5173. Tryb Standard działa bez serwera.',
        'RoofCalc Business sign-in works only through the application server. This page is a static build (e.g. from XAMPP) and cannot hold a sign-in session. Run “pnpm dev” in the project folder and open http://127.0.0.1:5173. Standard mode works without a server.',
      );
    case 'server-unreachable':
      return local
        ? text(
            'Serwer RoofCalc (API) nie odpowiada. Uruchom „pnpm dev”. Jeśli już działa, „pnpm check:local” wskaże przyczynę (np. inny port w .env albo Node starszy niż 22).',
            'The RoofCalc server (API) does not respond. Run “pnpm dev”. If it is already running, “pnpm check:local” shows the cause (e.g. a different port in .env or Node older than 22).',
          )
        : text(
            'Serwer RoofCalc (API) chwilowo nie odpowiada. Spróbuj ponownie za chwilę; jeśli problem trwa, powiadom administratora.',
            'The RoofCalc server (API) is not responding. Try again shortly; if it persists, tell your administrator.',
          );
    case 'database-unavailable':
      return local
        ? text(
            'Serwer RoofCalc działa, ale nie łączy się z bazą danych. Uruchom „pnpm check:local” — sprawdzi plik .env, MySQL w XAMPP i hasło, a „pnpm configure:local” naprawi konfigurację.',
            'The RoofCalc server runs but cannot reach its database. Run “pnpm check:local” to check .env, MySQL in XAMPP and the password; “pnpm configure:local” repairs the setup.',
          )
        : text(
            'Serwer RoofCalc działa, ale nie łączy się z bazą danych. Administrator: sprawdź konfigurację Hyperdrive („pnpm check:cloudflare”).',
            'The RoofCalc server runs but cannot reach its database. Administrator: check the Hyperdrive configuration (“pnpm check:cloudflare”).',
          );
    case 'auth-unconfigured':
      return local
        ? text(
            'Logowanie RoofCalc Business nie jest jeszcze skonfigurowane. Uruchom „pnpm configure:local” — wygeneruje brakujące ustawienia w pliku .env.',
            'RoofCalc Business sign-in is not configured yet. Run “pnpm configure:local” to generate the missing settings in .env.',
          )
        : text(
            'Logowanie RoofCalc Business nie jest jeszcze skonfigurowane. Administrator: ustaw sekrety Workera BETTER_AUTH_SECRET i ROOFCALC_BOOTSTRAP_TOKEN („pnpm configure:cloudflare”).',
            'RoofCalc Business sign-in is not configured yet. Administrator: set the Worker secrets BETTER_AUTH_SECRET and ROOFCALC_BOOTSTRAP_TOKEN (“pnpm configure:cloudflare”).',
          );
    case 'schema-unknown':
      return local
        ? text(
            'Baza jest połączona, ale jej schemat nie pasuje do tej wersji aplikacji. Uruchom „pnpm db:setup:local” (dane i historia cen zostają).',
            'The database is connected, but its schema does not match this version. Run “pnpm db:setup:local” (data and price history are kept).',
          )
        : text(
            'Baza jest połączona, ale stan kont nie jest dostępny. Administrator musi wykonać zatwierdzone migracje bazy.',
            'Database connected, but account status is unavailable. The administrator must run the approved database migrations.',
          );
  }
}
