# CieślaCalc / RoofCalc

Parametryczny warsztat ciesielski z dwoma interfejsami: **Szybkie** i **Kreator**. Oba edytują jeden `AssemblySpec` i korzystają z tego samego silnika geometrii, zaciosów i trasowania.

Wymagania i stan pracy: [PROJECT_BLUEPRINT.md](PROJECT_BLUEPRINT.md). Kierunek architektury: [Architecture V3](docs/ARCHITECTURE_V3_WORKBENCH.md). Dokładny kontrakt matematyczny: [Assembly V3 geometry](docs/ASSEMBLY_V3_GEOMETRY.md).

## Uruchomienie

Node.js >= 20.16, pnpm 10.15.1. W katalogu repozytorium:

```powershell
npx pnpm@10.15.1 install --frozen-lockfile
npx pnpm@10.15.1 dev
```

Frontend: http://127.0.0.1:5173. API: http://127.0.0.1:3001/api/health. Przy globalnym pnpm można używać bezpośrednio `pnpm`.

## Szybkie i Kreator — model 4.0.0

**Szybkie:** wpisz rzut do osi kalenicy, kąt połaci i okap. Wyniki oraz mały rysunek aktualizują się lokalnie. „Więcej ustawień” otwiera przekrój krokwi, murłatę, siedzisko i kalenicę. Dostępne są plan trasowania i przejście do Kreatora bez utraty dokładności lub podpór.

**Kreator:** domyślnie pokazuje reaktywny, aksonometryczny szkielet dachu dwuspadowego: murłaty, kalenicę, powtarzalne pary krokwi i opcjonalną płatew. Długość budynku, rozstaw, tryb rozstawu, rzut, kąt i okap aktualizują od razu szkielet oraz wspólny wynik fabrication. Widok „Krokiew” zachowuje dokładny profil, inspector i detal zaciosu. Na telefonie narzędzia tworzą pasek, a właściwości otwierają dolny panel.

**Płatew:** dodaj jedną podporę, wpisz pozycję od lewego lica murłaty albo przeciągnij ją myszą/palcem. Drag przyciąga do siatki i punktów odniesienia, ogranicza zakres i pokazuje aktualny wymiar. Strzałki przesuwają o 1 mm, Shift+strzałka o 10 mm. Esc anuluje gest. Inspector przyjmuje dokładne wartości bez przyciągania. Można zmienić szerokość, wysokość oraz sterować zaciosem przez siedzisko albo głębokość. Podpora automatycznie dopasowuje wysokość osadzenia do krokwi.

Płatew jest elementem domeny: zmiana położenia aktualizuje przecięcia, rzeczywisty wycięty profil, punkty trasowania i rysunek. Jej ruch nie zmienia długości całej krokwi przy stałych końcach. Datums mają semantyczne identyfikatory; A/B/C… są tylko generowanymi etykietami. Plan produkcyjny jest strukturą danych tłumaczoną przez UI na PL/EN. Jednostki mm/cm/m nie zmieniają geometrii.

Wersje `common-rafter@1.0.0` i `@2.0.0` pozostają w rejestrze historycznym z testami regresji. Aktualny ekran używa `@3.0.0`.

## XAMPP / hosting

```powershell
npx pnpm@10.15.1 build
```

Po buildzie otwórz http://localhost/RoofCalc/apps/web/dist/#/calculators/common-rafter i odśwież stronę przez Ctrl+F5, aby pominąć cache. `index.php` przekierowuje do `apps/web/dist/`. Po zmianie kodu wykonaj build lub użyj serwera Vite. Apache wystarcza do lokalnych obliczeń; API działa osobno na porcie 3001.

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

- `timber-model`: AssemblySpec, ResolvedAssembly, FabricationPlan i typy elementów.
- `roof-math`: czysta geometria, wspólny resolver zaciosów, walidacja i szablon.
- `calculator-core`: wersjonowany rejestr i adapter rysunku.
- `drawing-engine`: prymitywy, projekcja, przycinanie, semantic dimension lanes i snapping.
- `apps/web/src/assembly`: dwa tryby, edytor sesji, SVG, inspector, tłumaczenia i plan trasowania.
- `apps/api`: Express; `ui`: tokeny/komponenty; `shared`: kontrakty.

Zakres UI: jedna krokiew, jedna murłata, jedna opcjonalna płatew, kalenica. Solver testowo obsługuje więcej podpór bez osobnego kalkulatora. Brak zapisu po odświeżeniu, naddatków/rzazu, statyki, krokwi narożnych/koszowych, 3D, CAD, bazy, logowania, płatności i PDF. Geometryczny wynik nie potwierdza nośności konstrukcji. Kolejna iteracja nie rozpoczyna się automatycznie.
