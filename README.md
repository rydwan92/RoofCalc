# CieślaCalc / RoofCalc

Aplikacja rozwijana według [`PROJECT_BLUEPRINT.md`](PROJECT_BLUEPRINT.md). Ten dokument w katalogu głównym jest źródłem wymagań i checkpointu oraz jest śledzony przez Git.

## Uruchomienie

W katalogu projektu, Node.js >= 20.16:

```powershell
npx pnpm@10.15.1 install
npx pnpm@10.15.1 dev
```

Frontend: http://127.0.0.1:5173, API: http://127.0.0.1:3001/api/health. Zainstalowany globalnie pnpm pozwala pominąć `npx pnpm@10.15.1` i używać `pnpm`.

## XAMPP

```powershell
npx pnpm@10.15.1 build
```

Otwórz http://localhost/projects/RoofCalc/. `index.php` przekieruje do zbudowanej aplikacji w `apps/web/dist/`. Apache obsługuje statyczny frontend; Node nie jest potrzebny do obliczeń. Po zmianie kodu trzeba wykonać build albo korzystać z serwera deweloperskiego. API w tym trybie nadal ma osobny port 3001. Baza danych nie jest jeszcze używana.

## Zwykły hosting Node.js

Po instalacji i buildzie: `npx pnpm@10.15.1 start`. Express serwuje frontend i `/api/health` z jednego adresu. Zmienne `PORT` (domyślnie 3001) oraz `HOST` (domyślnie 127.0.0.1) są konfigurowalne. Host wymagający publicznego nasłuchu może ustawić `HOST=0.0.0.0`. Publicznym katalogiem statycznym jest tylko `apps/web/dist`, a nie całe repozytorium.

`VITE_BRAND_NAME` w `apps/web/.env.local` pozwala zmienić nazwę widoczną w interfejsie przed buildem. HashRouter zapewnia działanie tras pod podkatalogiem XAMPP bez zależności od reguł routingu serwera.

## Sprawdzanie

```powershell
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 format:check
npx pnpm@10.15.1 build
```

Testy obejmują geometrię, jednostki, walidację, model rysunku, reaktywny interfejs w jsdom i API. Testy jsdom nie zastępują kontroli wizualnej w przeglądarce.

## Warsztat — model 2.0.0

Ekran ma trzy widoki: **Konstrukcja**, **Element** i **Detal**. Wybierz krokiew, murłatę lub cięcie na rysunku albo w narzędziach; panel właściwości pozwala edytować wymiary. Na telefonie narzędzia przewijają się w swoim pasku, a właściwości są rozwijane pod płótnem. Dolna sekcja pokazuje łańcuch A→B→C→D oraz instrukcje trasowania po górnej krawędzi.

Nowe parametry: szerokość/wysokość przekroju krokwi, szerokość murłaty, długość siedziska i grubość deski kalenicowej. Zmiana jednostek mm/cm/m zachowuje kanoniczne wartości wszystkich parametrów. Obliczenia i kształt zmieniają się od razu, bez API.

Uzgodniony model: dolna krawędź `y=(x−s)·tan(α)`, siedzisko `[0,s]` na `y=0`. Zacios usuwa `s·sin(α)` głębokości prostopadłej; pionowa wysokość wynosi `s·tan(α)`. Lico kalenicy leży w `x=rzut−grubość/2`. A–D to punkty na górnej krawędzi, przy czym B wyznacza ścianę pionową zaciosu, a C rzut końca siedziska.

Pełny kontrakt i wzory: [`docs/RAFTER_WORKBENCH_GEOMETRY.md`](docs/RAFTER_WORKBENCH_GEOMETRY.md). Dokument opisuje także różnicę między A→D i minimalną długością prostokątnego materiału, pomijane naddatki oraz schematyczne wysokości bloków podpór.

## Zachowany model 1.0.0

- Rzut poziomy: od punktu podparcia do osi kalenicy, > 0 i <= 100 000 mm.
- Kąt połaci: od 1° do 80° włącznie (jawny zakres prototypu).
- Wysięg okapu: wymiar poziomy od 0 do 10 000 mm.
- Wysokość = rzut × tan(kąta). Długość podparcie–kalenica = rzut / cos(kąta).
- Całkowita długość referencyjna = (rzut + wysięg okapu) / cos(kąta).
- Brak odjęcia grubości kalenicy, zaciosu, przekroju drewna i zapasu na cięcie. Wynik nie jest gotową długością produkcyjną ani sprawdzeniem nośności.
- Jednostki kanoniczne: mm / stopnie. Zaokrąglanie wyłącznie na ekranie.

Model 1.0.0 jest zachowany w wersjonowanym rejestrze wraz z testami regresji. Aktualny ekran korzysta z wersji 2.0.0. Stan nadal nie jest zapisywany po odświeżeniu. Krokwie narożne, dodatkowe podpory, konta, projekty, baza, PWA, PDF oraz weryfikacja nośności pozostają poza tą iteracją.

## Organizacja

`apps/web`: komponenty warsztatu, zagnieżdżony stan sesji i renderer SVG. `apps/api`: Express. `packages/timber-model`: niezależne typy drewna, podpór, operacji i punktów odniesienia. `roof-math`: czysta matematyka, profil po cięciach i walidacja. `calculator-core`: wersjonowany rejestr i adapter widoków. `drawing-engine`: ogólne prymitywy, przycinanie detalu i układ wymiarów. `ui`: tokeny i komponenty. `shared`: kontrakty.

Nie dodajemy jeszcze bibliotek dla nieistniejących funkcji serwerowych (TanStack Query, Drizzle), PWA ani rozbudowanych formularzy. CSS korzysta z tokenów; Tailwind nie jest wymagany do tej iteracji. Vite 6 dobrano do lokalnego Node 20.16 zgodnie z [wymaganiami Vite 6](https://v6.vite.dev/blog/announcing-vite6).
