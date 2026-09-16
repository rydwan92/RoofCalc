# CieślaCalc / RoofCalc

Parametryczny warsztat ciesielski z dwoma interfejsami: **Szybkie** i **Kreator**. Oba edytują jeden dyskryminowany `RoofTemplateSpec`, wyprowadzają z niego wspólny `AssemblySpec` i korzystają z tego samego silnika geometrii, zaciosów i trasowania.

Wymagania i stan pracy: [PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md). Aktualny kierunek architektury: [Architecture V8](docs/ARCHITECTURE_V8_CUT_PREVIEWS_AND_DETAIL_DRAWER.md). Kontrakty matematyczne: [Assembly V3 geometry](docs/ASSEMBLY_V3_GEOMETRY.md), [Hip rafter geometry](docs/HIP_RAFTER_GEOMETRY.md) i [Jack rafter geometry](docs/JACK_RAFTER_GEOMETRY.md).

## Uruchomienie

Node.js >= 20.16, pnpm 10.15.1. W katalogu repozytorium:

```powershell
npx pnpm@10.15.1 install --frozen-lockfile
npx pnpm@10.15.1 dev
```

Frontend: http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health. Przy globalnym pnpm można używać bezpośrednio `pnpm`.

## Baza danych i katalog materiałów (opcjonalnie)

Geometria, tryby Szybkie/Kreator i lokalne projekty działają w pełni bez
bazy danych. Katalog materiałów (dachówki, membrany, tarcica) i moduł cen
wymagają osiągalnego `DATABASE_URL` w lokalnym Node API — bez niego `/api/catalog` i
`/api/pricing` zwracają kontrolowany błąd 503, a UI po prostu nie pokazuje
wyboru z katalogu ani cen.

Skopiuj `.env.example` do `.env` i wybierz jeden z dwóch wariantów:

```powershell
Copy-Item .env.example .env
```

API i wszystkie CLI bazy/importów automatycznie czytają rootowy `.env`.
Zmienne ustawione w systemie lub terminalu mają pierwszeństwo. Produkcja i CI
nie wymagają `.env`. Nie commituj pliku z hasłami.
Polecenia uruchamiaj w osobnych liniach (również w PowerShell 5).
`pnpm db:doctor` sprawdza połączenie, wersję serwera, migracje, liczby produktów według rodzaju i ceny bez ujawniania danych logowania.

**Wariant A — kontener Docker (MariaDB, port 3307, nie koliduje z XAMPP):**

```bash
pnpm db:up
pnpm db:bootstrap
pnpm dev
```

`pnpm dev:full` łączy oba ostatnie kroki. `pnpm db:down` zatrzymuje kontener
(dane zostają w nazwanym wolumenie).

`pnpm dev` wykrywa już działające CieślaCalc API i Vite, wykorzystuje je
ponownie i uruchamia tylko brakujący serwer. Ponowne `pnpm dev:full` nie
uruchamia drugiej kopii Vite na porcie 5173. Otwórz
http://127.0.0.1:5173/#/calculators/common-rafter i odśwież kartę po starcie.

**Wariant B — istniejąca lokalna baza (np. XAMPP MariaDB na porcie 3306):**

Utwórz bazę `cieslacalc`, ustaw `DATABASE_URL` w `.env`, po czym:

```bash
pnpm db:bootstrap
pnpm dev
```

`db:bootstrap` czeka na gotowość bazy, nakłada zatwierdzone migracje,
zasila katalog i cennik realnymi, cytowanymi danymi (dachówki, membrana,
tarcica konstrukcyjna z realnych obserwacji rynkowych) i na końcu
weryfikuje wynik (`apps/api/src/cli/smoke-check.ts`). Działa identycznie w
obu wariantach — różni je tylko `DATABASE_URL`.

**Wariant C — wspólna baza DEV na SEOHost:** prywatny root `.env` może wskazywać
`srv118516_roofcalc_dev` na `h86.seohost.pl:3306`. W panelu SEOHost trzeba
dopuścić aktualny publiczny adres IP komputera. Uruchom `pnpm db:doctor`,
sprawdź stan, a następnie świadomie `pnpm db:bootstrap`. Drugi bootstrap
sprawdza powtarzalność seedów. Do zwykłej pracy używaj `pnpm dev:remote`:
diagnostyka i start bez migracji ani seedowania przy każdym uruchomieniu.
Lokalne `.env` nigdy nie trafia do Git. Przykładowy URL bez hasła jest w
`.env.example`.

## Publiczne DEV na Cloudflare

Repo zawiera adapter Worker + Static Assets, ponieważ istniejący publiczny
adres jest w domenie `workers.dev`. `/api` pozostaje na tym samym originie co
frontend. Worker korzysta z bindingu `HYPERDRIVE`, `mysql2` i tych samych
repozytoriów Drizzle oraz usług co Node. `pnpm build:edge` wykonuje lokalny
dry-run pakowania. Konfiguracja bez sekretów jest w `wrangler.example.jsonc`.
Przed wdrożeniem skopiuj ją do ignorowanego `wrangler.jsonc`, wpisz prawdziwe
ID Hyperdrive i wykonaj bramkę TLS/ACL opisaną w
[`docs/CLOUDFLARE_SEOHOST_V42.md`](docs/CLOUDFLARE_SEOHOST_V42.md).
Nie publikuj Workera z przykładowym ID. Hasło bazy zapisuje się tylko w
konfiguracji Hyperdrive po stronie Cloudflare, nigdy jako `VITE_*`.
Dodany cennik Ruukki z 28.04.2026 jest archiwalny: producent ogłosił
cennik od 28.08.2026, więc domyślny lookup nie podaje dawnej ceny jako
aktualnej. Dla kontroli zapisu historycznego API przyjmuje `&at=2026-07-01`.

## Szybkie i Kreator — model 8.0.0

**Szybkie:** wybierz krokiew zwykłą K1 albo narożną H1, wpisz rzut do osi kalenicy, kąt połaci i okap. Wyniki, rysunek i mini-podglądy najważniejszych cięć aktualizują się z tego samego wyniku obliczeń. „Więcej ustawień” otwiera odpowiedni przekrój i kalenicę. Przejście do Kreatora zachowuje dokładnie ten sam szablon i wynik.

**Kreator:** pokazuje interaktywny, aksonometryczny szkielet dachu dwuspadowego albo regularnego kopertowego. Każda krokiew ma fizyczny identyfikator i wskazuje wspólny prototyp produkcyjny K1, H1 lub J1. Zaznaczenie przełącza kontekst dachu, prototypu, sztuki, podpory albo cięcia; dolne wyniki i panel „Co przygotować” odpowiadają temu samemu obiektowi. Zaznaczenie zaciosu lub cięcia otwiera zsynchronizowany panel szczegółu z lokalnym rysunkiem, wymiarami, punktami odniesienia i kolejnością trasowania. Uchwyty na szkielecie zmieniają kąt/wysokość kalenicy, rozpiętość i długość budynku; płatwie przesuwają się po połaci. Geometria, zaciosy, podglądy i wyniki produkcyjne aktualizują się z tego samego modelu. Undo/Redo, pan, zoom i Fit nie zmieniają geometrii poza świadomą edycją.

**Rozstaw krokwi:** jedna wspólna funkcja steruje parami K1 dachu dwuspadowego, wspólnymi krokwiami dachu kopertowego i stacjami kulawek J1. „Maksymalny rozstaw” traktuje wartość jako nieprzekraczalny limit i rozkłada osie równo; dlatego 940/800 daje 2 pola, 3 pary oraz rzeczywiste 470 mm. „Docelowy rozstaw” wybiera najbliższą równą liczbę pól i pokazuje odchylenie. „Stały moduł” utrzymuje moduł oraz wymaga jawnej decyzji, czy dodać oś końcową, czy pozostawić końcówkę otwartą.

**Dach kopertowy i H1:** V6 obsługuje prostokątny dach o równych kątach połaci, w tym kwadratowy wariant namiotowy z kalenicą długości zero. Cztery fizyczne narożne korzystają z jednego prototypu H1. Karta H1 koordynuje rzut z góry, widok wzdłuż krokwi i detal cięcia/fazowania; osobno pokazuje długość teoretyczną, odjęcie od grubości kalenicy i długość do jej fizycznego lica.

**Kulawki J1:** V7 generuje na obu połaciach przy każdym narożu deterministyczne fizyczne sztuki z jednego prototypu J1. Każda ma własną pozycję, oś, długość do teoretycznej pionowej płaszczyzny H1, wspólny z K1 zacios murłaty i jawne linie spotkania z H1. Zestaw J1 ma zmienne długości; odjęcie do fizycznego lica H1 i połączenia z płatwiami są uczciwie oznaczone jako jeszcze nierozwiązane. Dokładny kontrakt opisuje `docs/JACK_RAFTER_GEOMETRY.md`.

**Płatwie:** dodaj kolejne podpory P1, P2, P3… tak długo, jak istnieje legalny odstęp. Każdą wybierzesz, przesuniesz uchwytem na szkielecie lub wpiszesz dokładną pozycję od lica murłaty. Drag przyciąga do 10 mm, nie pozwala nakładać podpór i można go anulować przez Esc. Można zmienić szerokość, wysokość oraz sterować zaciosem przez siedzisko albo głębokość.

Płatew jest elementem domeny: zmiana położenia aktualizuje przecięcia, rzeczywisty wycięty profil, punkty trasowania i rysunek. Jej ruch nie zmienia długości całej krokwi przy stałych końcach. Datums mają semantyczne identyfikatory; A/B/C… są tylko generowanymi etykietami. Plan produkcyjny jest strukturą danych tłumaczoną przez UI na PL/EN. Jednostki mm/cm/m nie zmieniają geometrii.

Wersje `common-rafter@1.0.0` i `@2.0.0` pozostają w rejestrze historycznym z testami regresji. Aktualna ścieżka K1 używa `common-rafter@3.0.0`, a H1 ma wersję `hip-rafter@1.0.0`.

## XAMPP / hosting

```powershell
npx pnpm@10.15.1 build
```

Po buildzie w tym układzie XAMPP otwórz http://localhost/RoofCalc/apps/web/dist/#/calculators/common-rafter i odśwież stronę przez Ctrl+F5, aby pominąć cache. `index.php` przekierowuje do `apps/web/dist/`. Po zmianie kodu wykonaj build lub użyj serwera Vite. Apache wystarcza do lokalnych obliczeń; API działa osobno na porcie 3001 (uruchom `pnpm dev` lub `pnpm start`). Lokalny build otwarty pod `localhost/.../apps/web/dist/` pobiera katalog i ceny z `http://127.0.0.1:3001/api`. API zezwala na odczyt z lokalnych adresów przeglądarki; projekty pozostają w pamięci lokalnej dotychczasowego adresu XAMPP. Vite i hosting Node nadal korzystają z `/api` na swoim adresie. Przy innym adresie API ustaw `VITE_API_BASE_URL` w `apps/web/.env.local` i wykonaj ponownie build.

Na hostingu Node uruchom `npx pnpm@10.15.1 start`. Express serwuje frontend i `/api/health`. Dostępne zmienne: `PORT` (domyślnie 3001), `HOST` (127.0.0.1). Publicznym katalogiem jest `apps/web/dist`, nie całe repozytorium. `VITE_BRAND_NAME` w `apps/web/.env.local` ustawia nazwę przed buildem. HashRouter obsługuje podkatalogi.

## Weryfikacja

```powershell
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
```

Testy obejmują geometrię, walidację, jednostki, profil po cięciach, dynamiczne podpory/datums, trasowanie, lane layout i transformacje, interakcje w jsdom oraz API. Testy jsdom i granic etykiet nie zastępują kontroli wizualnej i dotykowej w przeglądarce. Jej aktualny status podaje checkpoint.

## Organizacja i granice

- `timber-model`: RoofTemplateSpec, AssemblySpec, jawne typy K1/H1/J1, prototypy/instancje, operacje złożone i typy szkieletu.
- `roof-math`: czysta geometria, wspólny resolver zaciosów, walidacja, szablony gable/hip oraz dokładna geometria H1 i J1.
- `calculator-core`: wersjonowany rejestr i adapter rysunku.
- `drawing-engine`: prymitywy, projekcja, przycinanie, semantic dimension lanes i snapping.
- `apps/web/src/assembly`: dwa tryby, edytor sesji, SVG, inspector, tłumaczenia i plan trasowania.
- `apps/api`: Express; `ui`: tokeny/komponenty; `shared`: kontrakty.

Zakres V8 nie obejmuje odjęcia J1 do fizycznego lica H1, zaciosów J1 na płatwiach, krokwi koszowych, nieregularnych/nierównych połaci ani dowolnych wielokątów dachu. Lokalne podglądy są rysunkami traserskimi wyprowadzonymi z aktualnego wyniku, a nie pełną dokumentacją warsztatową wszystkich lic i rzazów. Brak zapisu po odświeżeniu, naddatków/rzazu, statyki, pełnego 3D/CAD, bazy, logowania, płatności i PDF. Geometryczny wynik nie potwierdza nośności konstrukcji. Kolejna iteracja nie rozpoczyna się automatycznie.
