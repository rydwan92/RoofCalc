const pl = {
  title: 'Plan materiałów',
  timber: 'Konstrukcja',
  layers: 'Warstwy',
  covering: 'Pokrycie',
  other: 'Konstrukcja — pozostałe elementy (geometria)',
  // V51 whole-roof groups and roof-system rows.
  eave: 'Okap / krawędzie',
  filterLabel: 'Filtr pozycji',
  filterReady: 'gotowych',
  filterAttentionCount: 'wymaga uwagi',
  filterAll: 'Wszystko',
  filterAttention: 'Wymaga uwagi',
  technicalProblems: 'Techniczne',
  commercialProblems: 'Handlowe',
  fillMissing: 'Uzupełnij brakujące',
  openings: 'Otwory dachowe',
  drainage: 'Odwodnienie',
  subgroupTile: 'Dachówka podstawowa',
  subgroupRidge: 'Gąsiory / grzbiet',
  subgroupVerge: 'Skrajne',
  subgroupAccessory: 'Inne systemowe',
  'roofSystem.ridge-tape': 'Taśma kalenicowa / grzbietowa',
  'roofSystem.ridge-end': 'Zakończenie kalenicy / grzbietu',
  'roofSystem.ridge-clip': 'Klamra gąsiora',
  'roofSystem.eave-comb': 'Grzebień okapowy',
  'roofSystem.ventilation-comb': 'Grzebień wentylacyjny',
  'roofSystem.eave-ventilation-strip': 'Taśma wentylacyjna okapu',
  'roofSystem.eave-strip': 'Pas okapowy',
  'roofSystem.drip-edge': 'Okapnik',
  'roofSystem.eave-flashing': 'Obróbka okapu (pas nadrynnowy)',
  'roofSystem.gutter-apron': 'Pas podrynnowy',
  'roofSystem.verge-flashing': 'Obróbka skrajna (wiatrownica)',
  'roofSystem.wind-board': 'Deska wiatrowa',
  'opening.flashing-kit': 'Kołnierz okna dachowego',
  'opening-flashing-resolved': 'Kołnierz przypisany do tego okna.',
  'opening-flashing-requires-product':
    'Otwór bez produktu okna — kołnierz wymaga wyboru okna albo wpisu ręcznego.',
  'opening-flashing-requires-decision': 'Kołnierz wymaga wyboru.',
  'opening-flashing-incompatible':
    'NIEZGODNE: wybrany kołnierz nie pasuje do tego okna.',
  'opening-window-generic': 'Okno nie ma przypisanego produktu.',
  'opening-window-system-mismatch': 'Inny system okien niż kołnierz.',
  'opening-size-code-mismatch': 'Inny rozmiar okna niż kołnierz.',
  'opening-covering-class-unconfirmed':
    'Potwierdź rodzaj pokrycia przy oknie (profilowane / płaskie).',
  'opening-covering-class-mismatch':
    'Kołnierz jest do innego rodzaju pokrycia.',
  'opening-pitch-out-of-range': 'Kąt połaci poza zakresem kołnierza.',
  'opening-opening-not-rectangular':
    'Otwór jest przycięty krawędzią połaci — kołnierz systemowy nie pasuje.',
  'opening-not-a-flashing-kit': 'To nie jest kołnierz.',
  'opening-window-size-differs':
    'Rozmiar okna z katalogu różni się od narysowanego otworu.',
  requirementLength: 'Wymaganie',
  explicitAllowance: 'Naddatek (wpisany)',
  openEnds: 'Otwarte końce',
  'line-component-rolls':
    'Wymaganie z długości linii; zakup w całych rolkach (rolka przechodzi między liniami).',
  'line-component-open-ends':
    'Jedna sztuka na każdy otwarty koniec kalenicy / grzbietu (z topologii dachu).',
  'line-component-per-ridge-tile': 'Jedna sztuka na każdy gąsior.',
  'line-component-ridge-tiles-unresolved':
    'Najpierw policz gąsiory w planie zakupu dachówki.',
  'line-component-no-features-selected': 'Nie wybrano żadnej linii dachu.',
  'line-component-rule-not-allowed':
    'Ta reguła ilości nie pasuje do tego elementu.',
  'drainage-reuse-remainders':
    'Końcówki proste mogą trafić do innej rynny (wybór użytkownika).',
  'drainage.gutter-section': 'Rynna',
  'drainage.gutter-connector': 'Łącznik rynny',
  'drainage.gutter-corner-external': 'Narożnik zewnętrzny',
  'drainage.gutter-corner-internal': 'Narożnik wewnętrzny',
  'drainage.gutter-end-cap': 'Zaślepka rynny',
  'drainage.gutter-end-cap.left': 'Zaślepka rynny lewa',
  'drainage.gutter-end-cap.right': 'Zaślepka rynny prawa',
  'drainage.gutter-outlet': 'Odpływ (lej spustowy)',
  'drainage.gutter-hook': 'Hak rynnowy',
  'drainage.downpipe': 'Rura spustowa',
  'drainage.downpipe-connector': 'Łącznik rury (mufa)',
  'drainage.downpipe-elbow': 'Kolano',
  'drainage.downpipe-clamp': 'Obejma rury',
  drainageGutterLength: 'Długość rynien (okapy)',
  commercialOverageLength: 'Nadwyżka handlowa',
  hookMaxSpacing: 'Rozstaw maksymalny producenta',
  hookActualSpacing: 'Rozstaw RoofCalc',
  'drainage-sections-no-reuse':
    'KONSERWATYWNY: każda rynna/rura z całych odcinków; końcówek nie przenosimy między odcinkami.',
  'drainage-component-missing':
    'Wybrany system nie zawiera tego elementu — wybierz go lub wpisz ręcznie.',
  'drainage-gutter-length-missing': 'Podaj długość handlową rynny.',
  'drainage-downpipe-length-missing': 'Podaj długość handlową rury.',
  'drainage-downpipe-height-missing':
    'Podaj wysokość pionu przy każdym odpływie.',
  'drainage-elbows-unconfirmed': 'Potwierdź liczbę kolan przy każdym pionie.',
  'drainage-clamps-unresolved':
    'Producent nie podaje rozstawu obejm — wpisz liczbę obejm.',
  'drainage-hook-spacing-missing':
    'Brak rozstawu haków producenta — wpisz rozstaw ręcznie.',
  'drainage-hook-spacing-exceeds-maximum':
    'NIEZGODNE: rozstaw haków większy niż maksymalny rozstaw producenta.',
  'line-component-per-feature':
    'Liczone osobno dla każdej linii dachu (odcinki nie przechodzą między liniami).',
  'line-component-manual': 'Ilość wpisana ręcznie.',
  k1: 'K1 · krokwie',
  battens: 'Łaty',
  counterBattens: 'Kontrłaty',
  membrane: 'Membrana',
  tile: 'Dachówka',
  timberEvidence: 'Drewno · zestawienie geometryczne',
  blankLength: 'Długość blanku',
  consumption: 'Deklarowane zużycie producenta',
  netArea: 'Powierzchnia netto',
  // V50 roof-tile purchase rows.
  tileBase: 'Dachówka podstawowa',
  tileFull: 'Pełne',
  tileCut: 'Docinane',
  tilePhysical: 'Wymaganie fizyczne',
  tileReserve: 'Zapas użytkownika',
  tileRequired: 'Razem wymagane',
  tilePacks: 'Opakowania',
  tilePallets: 'Palety',
  tilePiecesPerUnit: 'Sztuk w opakowaniu',
  tileCommercialOverage: 'Nadwyżka handlowa',
  lineLength: 'Długość linii',
  courseCountTiles: 'Rzędy przy krawędzi',
  'tileAccessory.ridge': 'Gąsior kalenicowy',
  'tileAccessory.hip-ridge': 'Gąsior narożny',
  'tileAccessory.verge-left': 'Dachówka boczna lewa',
  'tileAccessory.verge-right': 'Dachówka boczna prawa',
  'tileAccessory.half': 'Dachówka połówkowa',
  'tileAccessory.ventilation': 'Dachówka wentylacyjna',
  'tile-plan-exact':
    'DOKŁADNY: wszystkie pozycje są pełne — jedna pozycja, jedna dachówka.',
  'tile-plan-conservative-no-offcut-reuse':
    'KONSERWATYWNY: osobna dachówka dla każdej pozycji docinanej, bez ponownego wykorzystania docinek.',
  'tile-plan-split-fragments':
    'Pozycje podzielone przez otwór: po jednej dachówce na każdy widoczny fragment.',
  'tile-plan-packaging-stale':
    'Opakowanie z katalogu nie pasuje już do produktu — wybierz jednostkę sprzedaży ponownie.',
  'tile-plan-layout-unresolved':
    'Układ dachówek nie jest rozwiązany — brak ilości do zakupu.',
  'accessory-no-accessory-selected': 'Wybierz element systemowy.',
  'accessory-accessory-not-compatible':
    'Element nie jest deklarowany jako zgodny z tą dachówką.',
  'accessory-no-quantity-semantics':
    'Źródło nie podaje długości krycia ani zużycia — WYMAGA USTALENIA.',
  'accessory-verge-rule-not-declared':
    'Producent nie podaje zasady ilości dla dachówki bocznej — WYMAGA USTALENIA.',
  'accessory-verge-sides-unresolved':
    'Liczba rzędów przy lewym i prawym szczycie różni się — WYMAGA USTALENIA.',
  'accessory-line-shared-with-another-covering':
    'Linia jest wspólna z innym pokryciem — ilość wymaga ustalenia.',
  'accessory-declared-approximate':
    'Zużycie deklarowane przez producenta jako przybliżone („ok.”).',
  // V49 linear purchase rows.
  piecePricingInCost: 'Cenę za sztukę każdej długości ustalisz w kosztorysie.',
  sourceCatalogueBadge: 'KATALOG',
  sourceManualBadge: 'RĘCZNIE',
  // V48 purchase-plan metrics.
  installationRequirement: 'Wymaganie montażowe',
  purchasedLength: 'Kupiona długość',
  wasteLength: 'Odpad',
  reusableLength: 'Resztki użytkowe',
  grossArea: 'Z uwzględnieniem zakładów',
  rollCount: 'Plan rolek (wg obecnego układu)',
  overlapArea: 'Zakłady między pasami',
  endOverlapArea: 'Zakłady na łączeniach rolek',
  ridgeOverrunArea: 'Nadmiar ostatniego pasa przy kalenicy',
  simplificationArea: 'Uproszczenia układu (szerokość okapu, otwory)',
  courseCount: 'Pasy membrany',
  course: 'pas.',
  roll: 'rol.',
  membraneRollPlan: 'PLAN KONSERWATYWNY',
  membraneNetOnly: 'TYLKO NETTO',
  membraneRollPlanHelp:
    'Pełne pasy od okapu do kalenicy z zakładem produktu. Rolki liczone bez ponownego układania pozostałych odcinków — to górne oszacowanie, nie dokładny plan zakupu.',
  membraneNetOnlyHelp:
    'Tylko geometria dachu. Wybierz produkt rolkowy, aby policzyć zakłady, pasy i rolki.',
  netHero: 'Powierzchnia netto',
  grossHero: 'Z uwzględnieniem zakładów',
  rollsHero: 'Plan wg obecnego układu',
  rollSize: 'Rolka',
  rollWidth: 'Szerokość rolki',
  rollLength: 'Długość rolki',
  overlapUsed: 'Zakład (użyty)',
  manualData: 'RĘCZNIE',
  manualDataHelp:
    'Dane techniczne wpisane przez użytkownika — nie pochodzą z rewizji katalogu.',
  catalogRevision: 'rewizja',
  noProduct: 'Nie wybrano produktu',
  limitations: 'Czego RoofCalc jeszcze nie modeluje',
  whyMore: 'Dlaczego więcej niż netto?',
  retry: 'Spróbuj ponownie',
  geometryCount: 'Geometria',
  procurement: 'PLAN ZAKUPU',
  fabrication: 'WYMAGANIE WYKONAWCZE',
  geometry: 'GEOMETRIA',
  manufacturer: 'SZACUNEK PRODUCENTA',
  partial: 'CZĘŚCIOWE',
  catalogue: 'KATALOG',
  manual: 'CENA RĘCZNA',
  noPrice: 'Brak ceny w cenniku',
  selectPrice: 'Wybierz źródło ceny',
  manualPrice: 'Cena ręczna netto',
  price: 'Cena netto',
  value: 'Wartość netto',
  net: 'netto',
  gross: 'źródło brutto',
  verify: 'Zweryfikuj cenę przed zakupem',
  commercial: 'Wybrany materiał handlowy',
  online: 'Katalog dostępny',
  offline: 'Katalog niedostępny — możesz pracować ręcznie',
  loading: 'Sprawdzanie katalogu…',
  cutting: 'Rozkrój K1',
  technical: 'Zestawienie techniczne',
  chooseTimber: 'Dobierz tarcicę w rozkroju K1',
  chooseMembrane: 'Zmień produkt',
  parameters: 'Parametry / wpisz ręcznie',
  chooseCovering: 'Wybierz wariant w Pokryciu',
  details: 'Szczegóły i podstawa ilości',
  add: 'Dodaj do kosztorysu',
  update: 'Aktualizuj kosztorys',
  keep: 'Zachowaj obecną',
  review: 'Proponowana aktualizacja',
  manualOwned:
    'Ilość ręczna pozostaje bez zmian. Aktualizacja ceny wymaga akceptacji.',
  rangeNote: 'Szacunek — nie ilość zakupowa. Bez automatycznego zapasu.',
  rangeCost: 'Zakres kosztu',
  rangeAction: 'Ustal ilość w kosztorysie',
  count: 'Pozycje',
  purchaseCount: 'Plan zakupowy',
  estimates: 'Szacunki',
  needsData: 'Wymagają danych',
  known: 'Wartość znanych cen (netto)',
  incomplete: 'Wartość częściowa — pomija niepełne pozycje i brakujące ceny.',
  csv: 'Pobierz listę CSV',
  export: 'Lista materiałów / druk',
  empty:
    'Brak materiałów do pokazania. Uzupełnij konstrukcję, warstwy lub pokrycie.',
  'k1-needs-cutting':
    'Uruchom pełny rozkrój, aby dobrać długości handlowe. To wymaganie wykonawcze, nie plan zakupu.',
  'layer-not-resolved':
    'Nie określono ilości. Sprawdź parametry i ograniczenia w Warstwach.',
  'k1-execution-unresolved':
    'Geometria osi nie określa blanków. Przygotowanie K1 jest nierozwiązane w tej konfiguracji.',
  'no-allowance-no-stock-length': 'Bez zapasu i rozkroju handlowego.',
  // V48: the pieces are exact, but the plan does not yet cover every run.
  'linear-plan-partial':
    'Plan zakupu jest częściowy — część odcinków nie została rozplanowana.',
  'catalogue-price-verify-before-purchase':
    'Cena z katalogu z dnia obserwacji — zweryfikuj przed zakupem.',
  'partial-counter-battens':
    'Częściowo policzone: osie K1/J1 i przerwy przy otworach; detal przy narożnych H1 pozostaje nierozwiązany.',
  'batten-gauge-unverified':
    'Rozstaw ręczny, niezweryfikowany z pokryciem — długość geometryczna wstępna.',
  'batten-gauge-incompatible':
    'Rozstaw łat jest niezgodny z pokryciem — długość geometryczna do poprawy.',
  'gross-area-no-roll-reuse':
    'Pozostałe odcinki rolki nie są ponownie układane między pasami.',
  'hip-course-width-approximated':
    'Połać kopertowa jest obecnie liczona konserwatywnie: każdy pas ma szerokość okapu.',
  'openings-not-subtracted':
    'Otwory dachowe nie pomniejszają jeszcze zapotrzebowania na membranę.',
  'membrane-sold-per-roll':
    'Produkt sprzedawany na rolki, ale kosztorys nie obsługuje jeszcze ceny za rolkę — koszt liczony za m² z zakładami.',
  'net-area-no-overlap-no-rolls':
    'Powierzchnia geometryczna netto, bez zakładów i liczby rolek. Wybierz produkt rolkowy.',
  'declared-consumption-not-a-resolved-purchase-count':
    'Szacunek według zużycia deklarowanego przez producenta; nie jest ilością zakupową.',
  'covering-not-a-purchase-count':
    'Pozycje krycia i przebiegi geometryczne nie określają ilości do zakupu.',
};
const en: typeof pl = {
  title: 'Material plan',
  timber: 'Structure',
  layers: 'Layers',
  covering: 'Covering',
  other: 'Structure — other members (geometry)',
  // V51 whole-roof groups and roof-system rows.
  eave: 'Eave / edges',
  filterLabel: 'Item filter',
  filterReady: 'ready',
  filterAttentionCount: 'need attention',
  filterAll: 'All',
  filterAttention: 'Needs attention',
  technicalProblems: 'Technical',
  commercialProblems: 'Commercial',
  fillMissing: 'Complete missing',
  openings: 'Roof openings',
  drainage: 'Drainage',
  subgroupTile: 'Base tile',
  subgroupRidge: 'Ridge / hip',
  subgroupVerge: 'Verge',
  subgroupAccessory: 'Other system items',
  'roofSystem.ridge-tape': 'Ridge / hip tape',
  'roofSystem.ridge-end': 'Ridge / hip end',
  'roofSystem.ridge-clip': 'Ridge tile clip',
  'roofSystem.eave-comb': 'Eave comb',
  'roofSystem.ventilation-comb': 'Ventilation comb',
  'roofSystem.eave-ventilation-strip': 'Eave ventilation strip',
  'roofSystem.eave-strip': 'Eave strip',
  'roofSystem.drip-edge': 'Drip edge',
  'roofSystem.eave-flashing': 'Eave flashing (drip edge)',
  'roofSystem.gutter-apron': 'Gutter apron',
  'roofSystem.verge-flashing': 'Verge flashing',
  'roofSystem.wind-board': 'Barge board',
  'opening.flashing-kit': 'Roof window flashing',
  'opening-flashing-resolved': 'Flashing assigned to this window.',
  'opening-flashing-requires-product':
    'Opening without a window product — the flashing needs a window or a manual entry.',
  'opening-flashing-requires-decision': 'Choose a flashing.',
  'opening-flashing-incompatible':
    'INCOMPATIBLE: the chosen flashing does not fit this window.',
  'opening-window-generic': 'The window has no product assigned.',
  'opening-window-system-mismatch':
    'Different window system than the flashing.',
  'opening-size-code-mismatch': 'Different window size than the flashing.',
  'opening-covering-class-unconfirmed':
    'Confirm the covering type at the window (profiled / flat).',
  'opening-covering-class-mismatch':
    'The flashing is for a different covering type.',
  'opening-pitch-out-of-range': 'Roof pitch outside the flashing range.',
  'opening-opening-not-rectangular':
    'The opening is clipped by the plane edge — a system flashing does not fit.',
  'opening-not-a-flashing-kit': 'This is not a flashing.',
  'opening-window-size-differs':
    'The catalogue window size differs from the drawn opening.',
  requirementLength: 'Requirement',
  explicitAllowance: 'Allowance (entered)',
  openEnds: 'Open ends',
  'line-component-rolls':
    'Requirement from the line length; bought in whole rolls (a roll continues between lines).',
  'line-component-open-ends':
    'One piece per open ridge / hip end (from the roof topology).',
  'line-component-per-ridge-tile': 'One piece per ridge tile.',
  'line-component-ridge-tiles-unresolved':
    'Count the ridge tiles in the tile purchase plan first.',
  'line-component-no-features-selected': 'No roof line selected.',
  'line-component-rule-not-allowed':
    'This quantity rule does not fit this element.',
  'drainage-reuse-remainders':
    'Straight remainders may go to another gutter (user choice).',
  'drainage.gutter-section': 'Gutter',
  'drainage.gutter-connector': 'Gutter connector',
  'drainage.gutter-corner-external': 'External corner',
  'drainage.gutter-corner-internal': 'Internal corner',
  'drainage.gutter-end-cap': 'Gutter end cap',
  'drainage.gutter-end-cap.left': 'Gutter end cap, left',
  'drainage.gutter-end-cap.right': 'Gutter end cap, right',
  'drainage.gutter-outlet': 'Outlet',
  'drainage.gutter-hook': 'Gutter hook',
  'drainage.downpipe': 'Downpipe',
  'drainage.downpipe-connector': 'Downpipe socket',
  'drainage.downpipe-elbow': 'Elbow',
  'drainage.downpipe-clamp': 'Downpipe clamp',
  drainageGutterLength: 'Gutter length (eaves)',
  commercialOverageLength: 'Commercial overage',
  hookMaxSpacing: 'Manufacturer maximum spacing',
  hookActualSpacing: 'RoofCalc spacing',
  'drainage-sections-no-reuse':
    'CONSERVATIVE: each gutter/pipe from whole sections; offcuts are not moved between runs.',
  'drainage-component-missing':
    'The selected system has no such element — choose one or enter it manually.',
  'drainage-gutter-length-missing': 'Enter the commercial gutter length.',
  'drainage-downpipe-length-missing': 'Enter the commercial pipe length.',
  'drainage-downpipe-height-missing':
    'Enter the downpipe height at every outlet.',
  'drainage-elbows-unconfirmed': 'Confirm the elbow count for every downpipe.',
  'drainage-clamps-unresolved':
    'The manufacturer states no clamp spacing — enter the clamp count.',
  'drainage-hook-spacing-missing':
    'No manufacturer hook spacing — enter a spacing manually.',
  'drainage-hook-spacing-exceeds-maximum':
    'INCOMPATIBLE: hook spacing larger than the manufacturer maximum.',
  'line-component-per-feature':
    'Counted per roof line (pieces never continue from one line to another).',
  'line-component-manual': 'Quantity entered manually.',
  k1: 'K1 · rafters',
  battens: 'Battens',
  counterBattens: 'Counter battens',
  membrane: 'Membrane',
  tile: 'Roof tile',
  timberEvidence: 'Timber · geometric schedule',
  blankLength: 'Blank length',
  consumption: 'Declared manufacturer consumption',
  netArea: 'Net area',
  // V50 roof-tile purchase rows.
  tileBase: 'Base roof tile',
  tileFull: 'Full',
  tileCut: 'Cut',
  tilePhysical: 'Physical requirement',
  tileReserve: 'User reserve',
  tileRequired: 'Total required',
  tilePacks: 'Packs',
  tilePallets: 'Pallets',
  tilePiecesPerUnit: 'Pieces per unit',
  tileCommercialOverage: 'Commercial overage',
  lineLength: 'Line length',
  courseCountTiles: 'Courses at the edge',
  'tileAccessory.ridge': 'Ridge tile',
  'tileAccessory.hip-ridge': 'Hip ridge tile',
  'tileAccessory.verge-left': 'Left verge tile',
  'tileAccessory.verge-right': 'Right verge tile',
  'tileAccessory.half': 'Half tile',
  'tileAccessory.ventilation': 'Ventilation tile',
  'tile-plan-exact':
    'EXACT: every position is a full tile — one position, one tile.',
  'tile-plan-conservative-no-offcut-reuse':
    'CONSERVATIVE: a separate tile for every cut position, offcuts are not reused.',
  'tile-plan-split-fragments':
    'Positions split by an opening: one tile for each visible fragment.',
  'tile-plan-packaging-stale':
    'The catalogue packaging no longer matches the product — choose the sale unit again.',
  'tile-plan-layout-unresolved':
    'The tile layout is not resolved — no purchase quantity.',
  'accessory-no-accessory-selected': 'Choose a system accessory.',
  'accessory-accessory-not-compatible':
    'This accessory is not declared compatible with this tile.',
  'accessory-no-quantity-semantics':
    'The source states no cover length or consumption — NEEDS A DECISION.',
  'accessory-verge-rule-not-declared':
    'The manufacturer states no quantity rule for the verge tile — NEEDS A DECISION.',
  'accessory-verge-sides-unresolved':
    'Left and right verges end a different number of courses — NEEDS A DECISION.',
  'accessory-line-shared-with-another-covering':
    'This line is shared with another covering — its quantity needs a decision.',
  'accessory-declared-approximate':
    'Consumption declared by the manufacturer as approximate.',
  // V49 linear purchase rows.
  piecePricingInCost: 'Price each commercial length per piece in the estimate.',
  sourceCatalogueBadge: 'CATALOGUE',
  sourceManualBadge: 'MANUAL',
  // V48 purchase-plan metrics.
  installationRequirement: 'Installation requirement',
  purchasedLength: 'Purchased length',
  wasteLength: 'Waste',
  reusableLength: 'Reusable offcuts',
  grossArea: 'Including overlaps',
  rollCount: 'Roll plan (current layout)',
  overlapArea: 'Laps between courses',
  endOverlapArea: 'Laps at roll joins',
  ridgeOverrunArea: 'Last course overrun at ridge',
  simplificationArea: 'Layout simplifications (eave width, openings)',
  courseCount: 'Membrane courses',
  course: 'courses',
  roll: 'rolls',
  membraneRollPlan: 'CONSERVATIVE PLAN',
  membraneNetOnly: 'NET ONLY',
  membraneRollPlanHelp:
    'Full courses from eave to ridge with the product overlap. Rolls are counted without re-laying leftover pieces — an upper estimate, not an exact purchase plan.',
  membraneNetOnlyHelp:
    'Roof geometry only. Choose a roll product to calculate overlaps, courses and rolls.',
  netHero: 'Net area',
  grossHero: 'Including overlaps',
  rollsHero: 'Plan for current layout',
  rollSize: 'Roll',
  rollWidth: 'Roll width',
  rollLength: 'Roll length',
  overlapUsed: 'Overlap (used)',
  manualData: 'MANUAL',
  manualDataHelp:
    'Technical data entered by the user — not from a catalogue revision.',
  catalogRevision: 'revision',
  noProduct: 'No product selected',
  limitations: 'What RoofCalc does not model yet',
  whyMore: 'Why more than net?',
  retry: 'Retry',
  geometryCount: 'Geometry',
  procurement: 'PURCHASE PLAN',
  fabrication: 'FABRICATION REQUIREMENT',
  geometry: 'GEOMETRY',
  manufacturer: 'MANUFACTURER ESTIMATE',
  partial: 'PARTIAL',
  catalogue: 'CATALOGUE',
  manual: 'MANUAL PRICE',
  noPrice: 'No price in list',
  selectPrice: 'Select price source',
  manualPrice: 'Manual net unit price',
  price: 'Net unit price',
  value: 'Net value',
  net: 'net',
  gross: 'source gross',
  verify: 'Verify price before purchase',
  commercial: 'Selected commercial material',
  online: 'Catalogue available',
  offline: 'Catalogue unavailable — you can work manually',
  loading: 'Checking catalogue…',
  cutting: 'K1 cutting plan',
  technical: 'Technical schedule',
  chooseTimber: 'Choose timber in K1 cutting plan',
  chooseMembrane: 'Change product',
  parameters: 'Parameters / manual entry',
  chooseCovering: 'Choose variant in Covering',
  details: 'Details and quantity basis',
  add: 'Add to estimate',
  update: 'Update estimate',
  keep: 'Keep current',
  review: 'Proposed update',
  manualOwned:
    'Manual quantity remains unchanged. Accept price updates explicitly.',
  rangeNote: 'Estimate — not a purchase quantity. No automatic allowance.',
  rangeCost: 'Cost range',
  rangeAction: 'Set quantity in estimate',
  count: 'Rows',
  purchaseCount: 'Purchase plan',
  estimates: 'Estimates',
  needsData: 'Need data',
  known: 'Known prices value (net)',
  incomplete: 'Partial value — excludes incomplete rows and missing prices.',
  csv: 'Download material CSV',
  export: 'Material list / print',
  empty: 'No materials yet. Complete structure, layers or covering.',
  'k1-needs-cutting':
    'Run a complete cutting plan to choose commercial lengths. This is a fabrication requirement.',
  'layer-not-resolved':
    'Quantity is unresolved. Review parameters and limitations in Layers.',
  'k1-execution-unresolved':
    'Axis geometry does not define blanks. K1 fabrication is unresolved for this configuration.',
  'no-allowance-no-stock-length': 'Without allowances or commercial cutting.',
  // V48: the pieces are exact, but the plan does not yet cover every run.
  'linear-plan-partial':
    'The purchase plan is partial — some runs are not planned yet.',
  'catalogue-price-verify-before-purchase':
    'Catalogue price as observed on its date — verify before buying.',
  'partial-counter-battens':
    'Partial: K1/J1 axes and opening interruptions; H1 boundary detail remains unresolved.',
  'batten-gauge-unverified':
    'Manual gauge not verified against a covering — preliminary geometric length.',
  'batten-gauge-incompatible':
    'The batten gauge does not match the covering — geometric length needs correction.',
  'gross-area-no-roll-reuse':
    'Leftover roll pieces are not re-laid between courses.',
  'hip-course-width-approximated':
    'Hip planes are currently counted conservatively: every course uses the eave width.',
  'openings-not-subtracted':
    'Roof openings do not reduce the membrane requirement yet.',
  'membrane-sold-per-roll':
    'Sold per roll, but the estimate does not support a per-roll price yet — cost uses m² including overlaps.',
  'net-area-no-overlap-no-rolls':
    'Net geometric area without overlaps or rolls. Select a roll product.',
  'declared-consumption-not-a-resolved-purchase-count':
    'Manufacturer consumption estimate; not a purchase quantity.',
  'covering-not-a-purchase-count':
    'Coverage positions and geometric runs do not define purchase quantities.',
};
export function materialCopy(locale: string) {
  return locale.startsWith('pl') ? pl : en;
}
export function materialText(locale: string, key: string) {
  const copy = materialCopy(locale);
  return copy[key as keyof typeof copy] ?? key;
}
