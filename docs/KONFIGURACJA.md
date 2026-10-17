# Konfiguracja RoofCalc — lokalnie i na Cloudflare

Jedna strona: co gdzie leży, jakie polecenie to ustawia i co znaczą typowe
błędy. Szczegóły odzyskiwania bazy i bram wdrożenia:
[DATABASE_RECOVERY_AND_CLOUDFLARE.md](DATABASE_RECOVERY_AND_CLOUDFLARE.md).

Kalkulatory, Kreator i projekty zapisane w przeglądarce działają **bez bazy
danych**. Baza jest potrzebna dla katalogu z serwera, cen i trybu Business.
Wbudowany katalog offline (ADR-013) działa bez niej.

## 1. Gdzie co jest ustawione

| Miejsce | Co zawiera | Kto to ustawia |
| --- | --- | --- |
| `.env` w katalogu głównym (lokalny, poza Git) | `DATABASE_URL`, `HOST`, `PORT`, lokalne `BETTER_AUTH_*`, `ROOFCALC_BOOTSTRAP_TOKEN` | `pnpm configure:local` |
| `wrangler.jsonc` (w Git, **bez sekretów**) | nazwa Workera, publiczny `BETTER_AUTH_URL`, identyfikator Hyperdrive | edycja w repozytorium |
| Sekrety Workera (Cloudflare) | `BETTER_AUTH_SECRET`, `ROOFCALC_BOOTSTRAP_TOKEN` (inne niż lokalne!) | `pnpm configure:cloudflare` |
| Hyperdrive `roofcalc-dev` (Cloudflare) | host, użytkownik i hasło zdalnej bazy; buforowanie **wyłączone** | panel Cloudflare; buforowanie: `pnpm configure:cloudflare` |
| Workers Builds (panel Cloudflare) | gałąź `main`, Node 22, polecenia budowania i wdrożenia, zmienne budowania | panel Cloudflare (lista w §4) |
| `.node-version` (w Git) | wersja Node dla Cloudflare i menedżerów wersji | repozytorium |

Lokalna baza XAMPP i zdalna baza Hyperdrive są **niezależne**. Mają ten sam
schemat i te same migracje, ale dane nie są kopiowane ani synchronizowane.

## 2. Lokalnie — trzy polecenia

Wymagany **Node 22 lub nowszy** (`node -v`). Na Node 20 aplikacja kończy się
błędami, które wyglądają jak problem z bazą.

```powershell
pnpm configure:local
pnpm check:local
pnpm dev
```

(Bez globalnego pnpm: `npx pnpm@10.15.1 configure:local` itd.)

`pnpm configure:local` prowadzi przez pięć kroków i niczego nie zmienia bez
pytania:

1. **Node.js** — sprawdza wersję.
2. **Plik `.env`** — tworzy go, jeśli nie istnieje; wskazuje każdą linię,
   którą Node by pominął (np. wklejony SQL), i proponuje zamianę jej na
   komentarz; ustawia `PORT=3001`, jeśli brak.
3. **Baza danych** — łączy się z `DATABASE_URL`. Jeśli bazy albo
   użytkownika nie ma, pyta o administratora MariaDB (w XAMPP: `root`, bez
   hasła) i tworzy **jedną bazę** oraz **osobnego użytkownika aplikacji** z
   uprawnieniami tylko do niej. Hasło jest generowane i trafia do `.env`.
   Działa wyłącznie na `127.0.0.1` — zdalnej bazy nigdy nie tworzy ani nie
   zmienia.
4. **Business** — generuje brakujące lokalne sekrety logowania. Kod
   pierwszego konta to `ROOFCALC_BOOTSTRAP_TOKEN` w `.env`.
5. **Schemat i dane startowe** — uruchamia `pnpm db:setup:local`
   (migracje z weryfikacją sum kontrolnych, katalog, cennik, test). Istniejące
   dane i historia cen nie są usuwane.

Przed każdym zapisem powstaje kopia `.env.backup-<data>` (ignorowana przez
Git). `pnpm check:local` wykonuje te same sprawdzenia tylko do odczytu i
nigdy nie wyświetla haseł ani sekretów.

**Port w jednym miejscu:** `PORT` z `.env` czyta API, serwer Vite (proxy
`/api`) i statyczny build otwierany z XAMPP (`apps/web/dist`, port wpisany
podczas `pnpm build`). Zmieniasz go tylko w `.env`. Nie używaj 5173 — to port
Vite.

### Ręcznie przez phpMyAdmin (zamiast kroku 3)

Polecenia SQL wykonuje się w **phpMyAdmin → zakładka SQL**, nigdy w `.env`:

```sql
CREATE DATABASE IF NOT EXISTS `cieslacalc`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'roofcalc_app'@'localhost' IDENTIFIED BY 'TU_WPISZ_MOCNE_HASLO';
CREATE USER 'roofcalc_app'@'127.0.0.1' IDENTIFIED BY 'TU_WPISZ_MOCNE_HASLO';
GRANT ALL PRIVILEGES ON `cieslacalc`.* TO 'roofcalc_app'@'localhost';
GRANT ALL PRIVILEGES ON `cieslacalc`.* TO 'roofcalc_app'@'127.0.0.1';
```

Do `.env` wpisz wtedy jedną linię (znaki `@ : / #` w haśle zakoduj jako
`%40 %3A %2F %23`):

```text
DATABASE_URL=mysql://roofcalc_app:TU_WPISZ_MOCNE_HASLO@127.0.0.1:3306/cieslacalc
```

i uruchom `pnpm db:setup:local`.

### MariaDB z XAMPP 8 (10.4)

Migracje wymagają `explicit_defaults_for_timestamp=ON`. Dopisz tę linię w
sekcji `[mysqld]` pliku `C:\xampp\mysql\bin\my.ini` i zrestartuj MySQL w
panelu XAMPP. `pnpm db:doctor` wykrywa to przed migracją.

## 3. Typowe komunikaty i ich przyczyny

| Objaw | Przyczyna | Co zrobić |
| --- | --- | --- |
| „Nie można połączyć się z bazą” w aplikacji | API nie działa, działa na innym porcie albo Node < 22 | `pnpm check:local`, potem `pnpm dev` |
| `check:local`: „to jest polecenie SQL” | SQL wklejony do `.env` | wykonaj go w phpMyAdmin, a w `.env` zostaw tylko `KLUCZ=wartość` |
| „Użytkownik lub hasło zostały odrzucone” | hasło w `DATABASE_URL` nie pasuje lub nie jest zakodowane | `pnpm configure:local` (wygeneruje nowe) |
| „MariaDB nie odpowiada” | MySQL w XAMPP zatrzymany | Start w panelu XAMPP |
| Business: „wymagany pierwszy właściciel” | baza gotowa, brak konta | Business → utwórz konto kodem `ROOFCALC_BOOTSTRAP_TOKEN` |
| `schema-not-ready` (503) | brakujące migracje | `pnpm db:setup:local` |

## 4. Cloudflare

```powershell
pnpm cloudflare:login
pnpm configure:cloudflare
```

`pnpm configure:cloudflare` (oraz `pnpm check:cloudflare`, tylko odczyt):

1. sprawdza `wrangler.jsonc`: punkt wejścia Workera, `nodejs_compat`,
   `/api/*` obsługiwane przez Workera, adres `BETTER_AUTH_URL` (https, bez
   ścieżki), powiązanie `HYPERDRIVE` i brak sekretów w pliku;
2. sprawdza logowanie wranglera;
3. czyta **nazwy** sekretów Workera; brakujące może wygenerować i zapisać po
   Twoim potwierdzeniu — kod pierwszego konta pokazuje wtedy **jeden raz**;
4. sprawdza, czy Hyperdrive ma wyłączone buforowanie zapytań (sesje i
   uprawnienia muszą być świeże) i po potwierdzeniu je wyłącza;
5. odpytuje publiczne `/api/health`, `/api/readiness` i `/api/setup/status`
   wdrożonej aplikacji.

Nigdy nie wdraża, nie migruje zdalnej bazy i nie wyświetla istniejących
sekretów.

**Ustawienia w panelu** (Workers & Pages → `roofcalc` → Settings → Build) —
wrangler ich nie odczyta:

- gałąź produkcyjna: `main` (wdrażany jest kod z `main`, nie z gałęzi roboczej);
- Node 22 — z pliku `.node-version` (albo zmienna `NODE_VERSION=22`);
- polecenie budowania: `pnpm cloudflare:build`;
- polecenie wdrożenia: `pnpm deploy:cloudflare`;
- zmienne budowania: `DATABASE_URL` jako **sekret** (zdalna baza, ta sama co
  w Hyperdrive) i `ROOFCALC_DB_ENV=shared-dev`. Bramka budowania sprawdza
  schemat i dane startowe zdalnej bazy (tylko odczyt) i zatrzymuje wdrożenie,
  jeśli baza jest nieaktualna.

**Konserwacja zdalnej bazy** (migracje, dane startowe) jest osobną,
świadomą operacją: najpierw kopia zapasowa u dostawcy bazy, potem workflow
„Database maintenance – shared DEV” w GitHub Actions albo lokalnie, z
prywatnym zdalnym `DATABASE_URL` podanym tylko dla tego procesu:

```text
pnpm db:setup:shared-dev -- --apply --confirm shared-dev
pnpm db:status -- --require-ready
```

## 5. Zasady bezpieczeństwa

- `.env`, kopie `.env.backup-*` i zrzuty baz nie trafiają do Git.
- Sekrety Cloudflare są niezależne od lokalnych; nie kopiuj ich.
- Żaden sekret nie ma prefiksu `VITE_` (trafiłby do przeglądarki).
- Seedy nie usuwają danych użytkowników ani historii cen.
- Migracje zdalnej bazy wymagają jawnego potwierdzenia `--confirm shared-dev`.
