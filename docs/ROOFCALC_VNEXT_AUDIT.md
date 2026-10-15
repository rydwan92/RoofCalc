# RoofCalc VNext — audyt stanu i priorytety

Data audytu: 2026-10-15. Punkt startowy: gałąź robocza od `main` @ `c185a16`
(„v61 in progress” — guided workbench journey). Dokument opisuje stan
**faktyczny**, sprawdzony uruchomieniem kodu, a nie tylko deklarowany w
dokumentacji. Sekcja „Stan po iteracji VNext” na końcu jest aktualizowana na
zakończenie iteracji.

## 1. Baseline (przed zmianami)

Środowisko: Windows 10, Node 22.18.0 (nvm; powłoka domyślnie ma Node 20.16,
którego `wrangler` nie akceptuje), `npx pnpm@10.15.1`. Globalny shim `pnpm`
na tej maszynie zawiesza się (prawdopodobnie oczekuje na potwierdzenie
corepack) — należy używać przypiętego `npx pnpm@10.15.1`.

| Bramka | Wynik |
| --- | --- |
| `pnpm typecheck` | ✅ |
| `pnpm lint` | ✅ |
| `pnpm format:check` | ✅ |
| `pnpm test` | ✅ 160 plików (2 pominięte), **1696 testów**, 13 pominiętych |
| `pnpm build` (web + API + Worker dry-run + granice bundla) | ✅ (ostrzeżenie Vite o rozmiarze chunków) |
| Testy architektury / fixture'y | ✅ (część `pnpm test`) |

Rozmiar startowy aplikacji web: `index` 1,17 MB (337 kB gzip) + CSS 250 kB
(45 kB gzip). Three.js (580 kB) i parser IFC ładują się leniwie.

## 2. Co faktycznie istnieje

Monorepo jest dojrzałe: 21 pakietów domenowych + `apps/web` (~65 tys. linii
TS/TSX) + `apps/api` (Express + Cloudflare Worker na wspólnym handlerze).

- **Geometria** (`roof-math`, 7 tys. LOC, 26 plików testów): dach
  dwuspadowy i kopertowy, K1/H1/J1 z jawnymi płaszczyznami odniesienia kątów,
  topologia dachu (kalenice, naroża, okapy, szczyty), otwory, łaty,
  kontrłaty, membrana. Pomiar: dach kopertowy 60×20 m przy rozstawie 30 cm
  (545 elementów) rozwiązuje się w ~15 ms — **solver nie jest wąskim
  gardłem**; projekcja jest memoizowana po tożsamości szablonu.
- **Wspólny model**: `RoofProjectDocumentV1` (jeden dach), `ProjectRecordV1`,
  lokalny zapis (`localStorage`) z autosave i historią Undo/Redo (40 kroków,
  transakcje gestów). Szybkie obliczenie, Kreator i import IFC prowadzą do
  tego samego `RoofTemplateSpec` przez `createProjectStartTemplate`.
- **Pokrycia**: cztery strategie (dachówka, blacha modułowa, rąbek, blacha
  cięta na wymiar) — osobne solvery wybierane po kształcie snapshotu
  technicznego, nie po przełączniku UI. Dachówka liczona z rzeczywistego
  układu (pozycje pełne/cięte/przy otworach), nie z powierzchni.
- **Zakupy**: `procurement-core` (rozkrój drewna), `linear-procurement`
  (łaty/kontrłaty jako niepodzielne odcinki), `tile-procurement` (dachówki,
  opakowania, akcesoria), `roof-system-core` (odwodnienie, obróbki, okna).
- **Koszty**: `cost-core` (grosze, VAT w punktach bazowych, brak ceny ≠ 0),
  `pricing-core` (cenniki z oknem ważności, zapis „write-once”),
  `quote-core` (oferta), `business-core` (hurtownia, asortyment, import CSV).
- **Eksport**: `document-core` — wersjonowany (`version: 1`), niezależny od
  renderera dokument wykonawczy z 12 typami sekcji; druk/PDF przez
  przeglądarkę. Dane eksportu pochodzą z kanonicznego dokumentu i
  resolverów, nie z lokalnego stanu komponentów.
- **IFC**: lokalny parser `web-ifc` w Web Workerze, rozpoznanie regularnego
  dachu dwuspadowego, jawne potwierdzenie parametrów.
- **SQL**: MariaDB/MySQL + Drizzle, 8 migracji, manifest seedów, `db:doctor`,
  `db:status`, `db:setup:local` (tylko loopback), `db:setup:shared-dev`
  (podwójne potwierdzenie), Worker przez Hyperdrive na tym samym handlerze.

## 3. Weryfikacja SQL (wykonana, nie deklarowana)

Lokalny serwer: XAMPP MariaDB **10.4.27** na porcie 3306.

1. Istniejąca baza `cieslacalc` ma **1/8 migracji** (nieaktualna od V24).
   `pnpm db:status` zamiast to zgłosić kończył się ogólnym „Database
   operation failed”. **Błąd:** `missingTable()` nie rozpakowywał
   `DrizzleQueryError.cause` (drizzle 0.45 opakowuje błąd mysql2), więc
   brak tabeli z późniejszej migracji wywracał też panel „Stan systemu”.
2. `pnpm db:setup:local` na czystej bazie zatrzymywał się na migracji:
   - **Błąd:** `drizzle.config.ts` w katalogu głównym importował
     `drizzle-kit` w czasie wykonania, a pnpm instaluje go tylko w
     `apps/api` — na czystej instalacji `drizzle-kit migrate` kończył się
     „Cannot find module 'drizzle-kit'”.
   - **Błąd:** drizzle-kit odrzuca puste hasło (`root` bez hasła to
     domyślne konto XAMPP), więc lokalny bootstrap z `.env.example` nie
     mógł ruszyć.
   - **Niezgodność środowiska:** MariaDB < 10.10 ma domyślnie
     `explicit_defaults_for_timestamp=OFF`. Migracja `0005` (tabele auth)
     pada w połowie (`ERROR 1067 Invalid default value`) i zostawia schemat
     w stanie 5/8; na takim serwerze kolumny TIMESTAMP bez `NULL` stają się
     też po cichu `NOT NULL`. Migracje są niezmienne, więc poprawną reakcją
     jest wykrycie tego **przed** migracją.
3. Pełny bootstrap zweryfikowano na izolowanej instancji MariaDB 10.4.27
   uruchomionej z binariów XAMPP (osobny katalog danych, port 3317,
   `explicit_defaults_for_timestamp=ON`) — konfiguracja serwera użytkownika
   nie została zmieniona: **8/8 migracji, katalog 10/10, cenniki 4/4,
   business 1/1, smoke-check bez problemów, `DATABASE READY`**. Drugi
   przebieg: 0 nowych / 0 zmienionych / 0 konfliktów — bootstrap jest
   idempotentny.
4. API (Node) na tej bazie: `/api/health` → `database: connected`,
   `/api/catalog/status` → 87 produktów, 89 rewizji, 67 wariantów;
   `/api/pricing/variants` zwraca ceny publicznych cenników z datą
   obserwacji; cennik Ruukki z `valid_to = 2026-08-27` **poprawnie nie jest
   zwracany** jako aktualny; cenniki organizacji (DEMO) nie wyciekają do
   publicznej trasy.
5. Worker: `wrangler deploy --dry-run` buduje się z wiązaniem `HYPERDRIVE`
   i tym samym handlerem HTTP (`apps/api/src/http/handler.ts`) — kontrakt
   danych Node i Worker jest wspólny. Połączenia Hyperdrive ze współdzieloną
   bazą DEV nie da się sprawdzić z tej maszyny (brak poświadczeń w checkoutcie);
   to pozostaje operacją operatora.

## 4. Dług architektoniczny i UX — ustalenia

| # | Obszar | Ustalenie | Wpływ |
| --- | --- | --- | --- |
| 1 | Nawigacja | Cztery nałożone warstwy: pasek 6 etapów (V53), pasek „CO TERAZ” (V47), 5 perspektyw + „Przejdź do” (V37), pod-zakładki zadań, osobny pasek widoku i okruszki. Przy 1440×900 płótno zaczyna się ~420 px od góry. | Wysoki — mniej miejsca na geometrię, dwie równoległe mapy aplikacji |
| 2 | Design system | Tokeny `--ui-*` istnieją, ale ~800 kolorów hex jest zakodowanych w CSS; brak ciemnego motywu; nagłówek ma stałe `#fff`. | Średni |
| 3 | Import dokumentów | Brak. Jedyny import to IFC. | Wysoki (nowy kierunek produktu) |
| 4 | SQL first-run | Trzy błędy pierwszego uruchomienia + niezgodność MariaDB 10.4 (sekcja 3). | Wysoki dla nowych stanowisk |
| 5 | Ceny | Okno ważności cennika jest respektowane, ale cena otwarta (`valid_to = NULL`) z obserwacji sprzed miesięcy jest prezentowana jak bieżąca, bez wieku obserwacji. | Średni — ryzyko pokazania starej ceny jako aktualnej |
| 6 | Eksport | `ExecutionDocument.source` nie zawiera odcisku danych wejściowych — nie da się później dowieść, z jakiego stanu projektu powstał dokument. | Średni — przeszkoda dla przyszłych rewizji dokumentów |
| 7 | Wydajność | Solver szybki. Koszt startu to głównie bundle `index` (1,17 MB; tłumaczenia PL+EN ~200 kB w źródle). `Page.tsx` (3,4 tys. linii) subskrybuje cały store. | Niski–średni |
| 8 | Kod | `Page.tsx`, `CoveringWorkspace.tsx`, `translations.ts` są bardzo duże; logika domenowa pozostaje jednak poza Reactem (projekcje w `*.ts`). | Średni (koszt zmian) |

## 5. Decyzje architektoniczne tej iteracji

1. **Jedna nawigacja główna** zamiast paska etapów + perspektyw:
   *Projekt / Konstrukcja / Pokrycie / Materiały / Kosztorys / Dokumenty*.
   Każda sekcja niesie dyskretny status z istniejącej projekcji
   `deriveProjectJourney` (bez nowego stanu, bez zapisu). „Co teraz” staje
   się kompaktowym elementem tego samego paska. Zadania sekcji i narzędzia
   widoku dzielą jeden wiersz. Stan nawigacji pozostaje przejściowy (ADR-002).
2. **Nowy pakiet `packages/document-import-core`** — czysty (bez Reacta,
   DOM, sieci i parsera PDF): klasyfikacja pliku po sygnaturze bajtów,
   rozpoznawanie wymiarów i opisów, normalizacja jednostek, wersjonowany
   model pośredni `ImportedRoofDraftV1`, walidacja wiarygodności, kalibracja
   skali i mapowanie do istniejących `ProjectStartValues`. Parser PDF
   (`pdfjs-dist`) żyje wyłącznie w adapterze `apps/web/src/document-import/`,
   ładowanym leniwie, z workerem serwowanym lokalnie. Nowa geometria nie
   powstaje: projekt tworzy istniejące `createProjectStartTemplate` →
   `createRoofProjectDocument` → `ProjectSession.createFromDocument`.
3. **Silniki rozpoznawania jako adaptery**: warstwa tekstowa PDF (działa),
   ręczne wskazanie na podkładzie z kalibracją skali (działa), OCR i AI
   Vision jako jawnie *niedostępne* deskryptory (brak dostawcy) z
   wymaganiem świadomej zgody przed wysłaniem pliku poza urządzenie. Żaden
   „udawany AI” nie jest implementowany.
4. **SQL**: naprawa błędów first-run bez zmiany żadnej migracji; doctor
   blokuje migrację na serwerze z `explicit_defaults_for_timestamp=OFF`.
5. **Aktualność cen**: wiek obserwacji ceny i status „może być
   nieaktualna” jako czysta funkcja w `pricing-core` z jawną datą odniesienia.

## 6. Priorytety (kolejność realizacji)

1. Bezpieczeństwo istniejących projektów — brak zmian schematu V1, brak
   zmian formuł; pełny `pnpm verify` + E2E.
2. Workspace: jedna nawigacja, więcej miejsca na płótno, zwijane panele,
   skróty klawiszowe, spójne tokeny.
3. Import dokumentu MVP end-to-end (PDF z warstwą tekstową → edycja →
   walidacja → projekt) + kalibracja/pomiar na podkładzie.
4. SQL first-run i ścieżka katalog → obliczenie → zestawienie → koszt.
5. Dokumentacja zgodna z kodem i checkpoint.
