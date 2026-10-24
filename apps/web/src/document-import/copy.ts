import type {
  Confidence,
  DocumentPageRole,
  DraftWarning,
  ImportBlocker,
  IngestionRejection,
  IntakeItemState,
  IntakeNextStep,
  NumericRoofField,
  RecognitionMode,
  UnitBasis,
} from '@cieslacalc/document-import-core';

/** Polish plural: 1 odczyt, 2–4 odczyty, 5+ odczytów (12–14 too). */
function plPlural(count: number, one: string, few: string, many: string) {
  if (count === 1) return one;
  const tens = count % 100;
  const units = count % 10;
  return units >= 2 && units <= 4 && (tens < 12 || tens > 14) ? few : many;
}

/**
 * Copy for the lazily loaded document importer (PL/EN), kept beside the
 * module like the IFC importer's, so the main bundle does not carry it.
 */

/** A chain sum in the numbers' own written unit, at most three decimals. */
function formatChainNumber(value: number, decimalComma = true): string {
  const text = String(Number(value.toFixed(3)));
  return decimalComma ? text.replace('.', ',') : text;
}

const pl = {
  title: 'Import projektu z dokumentu',
  subtitle: 'PDF z opisanymi wymiarami albo zdjęcie lub skan rzutu',
  close: 'Zamknij import',
  steps: ['Plik', 'Rozpoznanie', 'Weryfikacja', 'Projekt'],
  dropTitle: 'Przeciągnij tutaj rzut dachu lub dokumentację',
  dropHint:
    'PDF z warstwą tekstową (eksport z programu CAD lub edytora) — wymiary odczytamy automatycznie. Zdjęcie lub skan JPG, PNG, WebP — zaznaczysz zapisane na nim wymiary i przepiszesz je.',
  dimensionFirst:
    'Liczymy na wymiarach zapisanych na rysunku, nie na mierzeniu ze skali — wydruki, skany i zdjęcia często mają inną skalę niż podana.',
  choose: 'Wybierz plik',
  privacy:
    'Plik jest analizowany wyłącznie w tej przeglądarce. Nie jest wysyłany na serwer ani do usług AI i nie jest zapisywany w projekcie.',
  limits: 'Do 25 MB · PDF do 30 stron',
  // VNext-7C: sample drawings through the same import.
  samplesTitle: 'Nie masz rysunku pod ręką? Wypróbuj na przykładzie:',
  sample: {
    gable: 'Dom — dach dwuspadowy',
    hip: 'Dom — dach kopertowy',
    'mono-pitch': 'Wiata — dach jednospadowy',
    house: 'Projekt domu — 4 strony',
  },
  samplesHint:
    'Syntetyczne rysunki RoofCalc. Przechodzą przez ten sam odczyt, weryfikację i obliczenie co Twój plik.',
  sampleFailed:
    'Nie udało się wczytać przykładu. Sprawdź połączenie i spróbuj ponownie.',
  loading: 'Wczytywanie dokumentu…',
  reading: 'Odczyt warstwy tekstowej…',
  other: 'Inny plik',
  rejected: {
    empty: 'Plik jest pusty.',
    'too-large': 'Plik przekracza limit 25 MB.',
    'unsupported-format':
      'To nie jest obsługiwany dokument. Wybierz PDF, JPG, PNG lub WebP. O formacie decyduje zawartość pliku, nie jego nazwa.',
    'heic-photo':
      'Zdjęcie HEIC/HEIF nie jest obsługiwane. Zapisz je jako JPG (np. udostępnij jako „Najbardziej zgodny”).',
    'dwg-drawing':
      'Rysunek DWG nie jest obsługiwany. Wyeksportuj go z programu CAD do PDF.',
  } satisfies Record<IngestionRejection, string>,
  password:
    'Dokument jest zabezpieczony hasłem. Zapisz go bez hasła i spróbuj ponownie.',
  imageTooLarge:
    'Obraz ma zbyt dużą rozdzielczość (maks. 12 000 px na bok, 40 Mpx).',
  failed: 'Nie udało się odczytać dokumentu. Plik może być uszkodzony.',
  document: 'Dokument źródłowy',
  page: (page: number, total: number) => `Strona ${page} z ${total}`,
  previousPage: 'Poprzednia strona',
  nextPage: 'Następna strona',
  zoomIn: 'Powiększ',
  zoomOut: 'Pomniejsz',
  fit: 'Dopasuj',
  toolSelect: 'Wskaż',
  toolTranscribe: 'Odczytaj wymiar',
  toolCalibrate: 'Kalibruj skalę',
  readingGroup: 'Odczyt wymiarów',
  scaleGroup: 'Skala — tylko kontrolnie',
  toolHintSelect:
    'Kliknij wartość w panelu, aby zobaczyć ją w dokumencie. Kliknij zaznaczony odczyt na rysunku, aby przypisać go do aktywnego pola.',
  toolHintTranscribe:
    'Obrysuj na rysunku liczbę wymiaru (przeciągnij lub kliknij), a potem wpisz ją dokładnie tak, jak jest zapisana.',
  toolHintCalibrate:
    'Kliknij dwa końce odcinka o znanej długości (np. wymiarowany bok budynku). Pomiar ze skali służy tylko do kontroli.',
  toolHintMeasure: (field: string) =>
    `Zmierz „${field}” ze skali: kliknij dwa końce odcinka na rysunku. Wynik będzie orientacyjny.`,
  transcribeTitle: 'Odczytaj wymiar z rysunku',
  transcribeValue: 'Wymiar tak, jak jest zapisany',
  transcribeValueHint: 'np. 12,40 · 1240 · 38⁵ · 35° · 8×18',
  transcribeMeaning: 'Co oznacza ten wymiar?',
  transcribeUnassigned: 'Wymiar bez przypisania (np. część łańcucha)',
  rafterSection: 'Przekrój krokwi (szer. × wys.)',
  transcribeSave: 'Dodaj odczyt',
  transcribeCancel: 'Anuluj',
  transcribeZoom: 'Powiększenie zaznaczonego miejsca',
  transcribeError: {
    empty: 'Wpisz wymiar.',
    'not-a-dimension': 'To nie wygląda na wymiar — wpisz liczbę, np. 12,40.',
    'several-values': 'Wpisz jedną wartość — każdy wymiar odczytaj osobno.',
    'angle-expected': 'Dla kąta wpisz stopnie (35°) lub spadek w procentach.',
    'length-expected': 'Dla długości wpisz liczbę, np. 12,40 lub 1240.',
    'pair-expected': 'Dla przekroju wpisz dwie liczby, np. 8×18.',
    'out-of-range': 'Kąt nachylenia musi być między 0° a 90°.',
  },
  transcriptions: (count: number) => `Przepisane wymiary (${count})`,
  removeTranscription: 'Usuń odczyt',
  unassigned: 'bez przypisania',
  rasterNotice:
    'Ten dokument nie ma warstwy tekstowej (skan lub zdjęcie). Zaznacz na rysunku zapisane wymiary narzędziem „Odczytaj wymiar” i przepisz je — nie trzeba ustawiać skali.',
  transcribedSource: 'Twój odczyt z rysunku',
  scaledSource: 'zmierzone ze skali — orientacyjnie',
  chainEvidence: (parts: string, total: string) =>
    `łańcuch wymiarowy: ${parts} = ${total}`,
  knownLength: 'Rzeczywista długość odcinka',
  applyCalibration: 'Ustaw skalę',
  useDrawingScale: (denominator: number) =>
    `Użyj skali rysunku 1:${denominator}`,
  calibrated: (text: string) => `Skala ustawiona: ${text}`,
  calibratedBySegment: (length: string) => `odcinek wzorcowy ${length}`,
  calibratedByDrawing: (denominator: number) =>
    `1:${denominator} z opisu rysunku`,
  calibrationRejected: {
    'points-too-close':
      'Punkty są zbyt blisko siebie — wybierz dłuższy odcinek.',
    'different-pages': 'Oba punkty muszą leżeć na tej samej stronie.',
    'invalid-length': 'Podaj dodatnią długość odcinka.',
  },
  needCalibration:
    'Najpierw ustaw skalę: kalibracja dwoma punktami albo skala zapisana na rysunku.',
  review: 'Rozpoznane parametry',
  engines: 'Metody rozpoznawania',
  engineText: (count: number) =>
    `Warstwa tekstowa PDF — na tym urządzeniu (${count} ${count === 1 ? 'odczyt' : 'odczytów'})`,
  engineNoText:
    'Warstwa tekstowa PDF — brak tekstu w dokumencie (skan lub zdjęcie)',
  engineManual:
    'Pomiar ze skali na podkładzie — tylko kontrolnie, na tym urządzeniu',
  engineTranscription:
    'Odczyt zapisanych wymiarów (zaznacz i przepisz) — na tym urządzeniu',
  engineOcr:
    'OCR skanów — niedostępne w tej wersji (gotowe miejsce na lokalny silnik)',
  engineAi:
    'AI Vision — niedostępne (brak skonfigurowanego dostawcy; nic nie jest wysyłane)',
  roofType: 'Typ dachu',
  gable: 'Dwuspadowy',
  hip: 'Kopertowy',
  'mono-pitch': 'Jednospadowy',
  detectedRoof: (text: string) => `W dokumencie: „${text}”`,
  unsupportedRoof: (text: string) =>
    `Dokument opisuje dach „${text}”. RoofCalc liczy obecnie dachy dwuspadowe, kopertowe (także namiotowe) i jednospadowe — wybierz typ ręcznie tylko, jeśli to uproszczenie jest prawidłowe.`,
  confirmRoof: 'Potwierdź typ',
  documentUnit: 'Jednostka liczb bez jednostki',
  unitFromDocument: (text: string) => `z dokumentu: „${text}”`,
  unitNone: 'nie podano — wybierz',
  scale: 'Skala rysunku',
  confirm: 'Potwierdź',
  confirmed: 'Potwierdzone',
  measure: 'Zmierz ze skali',
  showInDocument: 'Pokaż w dokumencie',
  alternatives: (count: number) => `Inne odczyty (${count})`,
  conflictPick: 'Dokument podaje różne wartości — wybierz właściwą:',
  chooseAlternative: 'Wybierz inny odczyt…',
  pageShort: (page: number) => `str. ${page}`,
  confidence: {
    high: 'Odczyt pewny',
    medium: 'Sprawdź',
    low: 'Niepewny — potwierdź',
  } satisfies Record<Confidence, string>,
  status: {
    conflict: 'Sprzeczne odczyty — wybierz jeden',
    missing: 'Brak w dokumencie',
    userEntered: 'Twoja wartość',
    defaulted: (value: string) => `Wartość domyślna RoofCalc: ${value}`,
  },
  basis: {
    explicit: 'jednostka podana przy wartości',
    'document-declared': 'jednostka z opisu dokumentu',
    'user-declared': 'jednostka wybrana przez Ciebie',
    'plausible-range': 'jednostkę przyjęto z typowego zakresu — sprawdź',
    calibrated: 'zmierzone ze skali na podkładzie — orientacyjnie',
    'drawing-scale': 'jednostkę potwierdza linia na rysunku w skali',
  } satisfies Record<UnitBasis, string>,
  engineVector: (found: boolean): string =>
    found
      ? 'Geometria wektorowa PDF — obrys budynku znaleziony na rysunku'
      : 'Geometria wektorowa PDF — nie znaleziono zamkniętego obrysu',
  crossCheckMatch: (denominator: number, percent: string) =>
    `zgodne z linią na rysunku (1:${denominator}, odchyłka ${percent})`,
  crossCheckMismatch: (denominator: number, percent: string) =>
    `różni się od linii na rysunku (1:${denominator}) o ${percent}`,
  drawnSource: 'długość linii obrysu w skali rysunku',
  required: 'wymagane',
  warnings: 'Uwagi',
  warning: (
    warning: DraftWarning,
    field: (name: NumericRoofField) => string,
  ) => {
    switch (warning.code) {
      case 'no-text-layer':
        return 'Dokument nie ma warstwy tekstowej (skan lub zdjęcie). Zaznacz i przepisz zapisane wymiary narzędziem „Odczytaj wymiar”.';
      case 'page-limit-reached':
        return `Przeanalizowano ${warning.processed} z ${warning.total} stron (limit).`;
      case 'text-limit-reached':
        return `Strona ${warning.page} ma bardzo dużo tekstu — przeanalizowano jego część.`;
      case 'unsupported-roof-type':
        return `Wykryto nieobsługiwany typ dachu: „${warning.text}”.`;
      case 'value-outside-plausible-range':
        return `${field(warning.field)}: wartość poza typowym zakresem — sprawdź jednostkę.`;
      case 'unit-inferred':
        return `${field(warning.field)}: liczba bez jednostki — jednostkę przyjęto z typowego zakresu.`;
      case 'unit-ambiguous':
        return `${field(warning.field)}: „${warning.rawText}” bez jednostki może oznaczać mm lub cm — wybierz jednostkę dokumentu.`;
      case 'conflicting-values':
        return `${field(warning.field)}: dokument podaje różne wartości.`;
      case 'width-exceeds-length':
        return 'Szerokość jest większa od długości. Długość w RoofCalc to bok wzdłuż kalenicy — sprawdź, czy wymiary nie są zamienione.';
      case 'hip-length-below-width':
        return 'Dach kopertowy wymaga długości nie mniejszej niż szerokość.';
      case 'scale-mismatch':
        return `${field(warning.field)}: wymiar opisany różni się od długości linii w skali rysunku. Obowiązuje wymiar zapisany — sprawdź, czy wydruk nie był skalowany.`;
      case 'scaled-value-only':
        return `${field(warning.field)}: na rysunku nie znaleziono zapisanego wymiaru — użyto pomiaru ze skali. Sprawdź go albo odczytaj wymiar z rysunku.`;
      case 'dimension-chain-mismatch':
        return `Suma wymiarów cząstkowych (${formatChainNumber(warning.sum)}) nie zgadza się z wymiarem całkowitym (${formatChainNumber(warning.total)}). Któraś liczba mogła zostać źle odczytana.`;
    }
  },
  blockers: 'Przed utworzeniem projektu',
  monoPitchBlockers: 'Przed otwarciem obliczenia',
  blocker: (
    blocker: ImportBlocker,
    field: (name: NumericRoofField) => string,
  ) => {
    switch (blocker.code) {
      case 'roof-type-missing':
        return 'Wybierz typ dachu.';
      case 'roof-type-unsupported':
        return `Typ „${blocker.text}” nie jest obsługiwany — wybierz dwuspadowy, kopertowy lub jednospadowy, jeśli to uprawnione uproszczenie.`;
      case 'roof-type-unconfirmed':
        return 'Potwierdź typ dachu odczytany z dokumentu.';
      case 'value-missing':
        return `Uzupełnij: ${field(blocker.field)}.`;
      case 'value-unconfirmed':
        return `Potwierdź: ${field(blocker.field)}.`;
      case 'value-conflict':
        return `Wybierz jedną wartość: ${field(blocker.field)}.`;
      case 'value-not-positive':
        return `${field(blocker.field)} musi być większe od zera.`;
    }
  },
  preview: 'Podgląd modelu RoofCalc',
  previewEmpty: 'Podgląd pojawi się po uzupełnieniu wymaganych wartości.',
  construction:
    'Układ konstrukcji i połączenie w kalenicy ustawisz w warsztacie (domyślnie: więźba krokwiowa, deska kalenicowa).',
  limitation:
    'Import opiera się na wymiarach zapisanych na rysunku: z warstwy tekstowej PDF automatycznie, ze zdjęć i skanów po przepisaniu. Sprawdza sumy łańcuchów wymiarowych. Linie rysunku i skala służą tylko do kontroli. Tekstu ze zdjęć nie rozpoznaje jeszcze samodzielnie (OCR).',
  reviewCheck: 'Sprawdziłem odczytane wartości i ich źródła w dokumencie.',
  create: 'Utwórz projekt RoofCalc',
  creating: 'Tworzenie projektu…',
  // VNext-7C: a mono-pitch roof goes to its calculation, not a project.
  monoPitchConstruction:
    'Dach jednospadowy otworzy się w kalkulatorze dachu jednospadowego — tam ustawisz murłaty, płatwie, oparcie przy ścianie i łaty. To obliczenie, jeszcze nie zapisany projekt.',
  openMonoPitch: 'Otwórz w kalkulatorze dachu jednospadowego',
  monoPitchPreview: 'Przekrój krokwi z obliczenia RoofCalc',
  createFailed:
    'Nie udało się zapisać projektu. Sprawdź dostępność lokalnego zapisu i spróbuj ponownie.',
  invalidTemplate:
    'Wartości nie tworzą poprawnego dachu RoofCalc — sprawdź zakresy.',
  projectName: (file: string) => `Projekt z dokumentu ${file}`,
  // VNext-6: pages, intake summary, provenance.
  pages: 'Strony dokumentu',
  pageRole: {
    'roof-plan': 'Rzut dachu',
    'framing-plan': 'Rzut więźby',
    section: 'Przekrój',
    'floor-plan': 'Rzut kondygnacji',
    elevation: 'Elewacja',
    schedule: 'Zestawienie',
    unknown: 'Inna strona',
  } satisfies Record<DocumentPageRole, string>,
  pageRoleLabel: 'Rola strony',
  pageRoleFrom: (text: string) => `z tytułu na stronie: „${text}”`,
  pageReadings: (count: number) =>
    `${count} ${plPlural(count, 'odczyt', 'odczyty', 'odczytów')}`,
  pageSkip: 'Pomiń tę stronę',
  pageInclude: 'Uwzględnij stronę',
  pageSkippedHint: 'Odczyty z tej strony nie są używane.',
  pageButton: (
    page: number,
    role: string,
    readings: number,
    skipped: boolean,
  ) =>
    `Strona ${page}: ${role}, ${readings} ${plPlural(readings, 'odczyt', 'odczyty', 'odczytów')}${skipped ? ', pominięta' : ''}`,
  intakeTitle: 'Stan odczytu',
  intakeSettled: (count: number, total: number) =>
    `Rozpoznano ${count} z ${total}`,
  intakeToConfirm: (count: number) => `${count} do potwierdzenia`,
  intakeMissing: (count: number) => `${count} brak`,
  intakeDefaulted: (count: number) =>
    `${count} ${plPlural(count, 'wartość domyślna', 'wartości domyślne', 'wartości domyślnych')}`,
  intakeUnsupported: 'nieobsługiwany typ dachu',
  intakeNext: 'Następny krok',
  intakeItem: {
    recognized: 'rozpoznane',
    confirmed: 'potwierdzone',
    entered: 'wpisane',
    'to-confirm': 'do potwierdzenia',
    conflict: 'sprzeczne odczyty',
    missing: 'brak',
    defaulted: 'wartość domyślna RoofCalc',
    unsupported: 'nieobsługiwane',
  } satisfies Record<IntakeItemState, string>,
  intakeStep: (
    step: IntakeNextStep,
    field: (name: NumericRoofField) => string,
  ): string => {
    switch (step.kind) {
      case 'unsupported-roof':
        return `Dach „${step.text}” — wybierz typ ręcznie tylko, jeśli to uprawnione`;
      case 'choose-roof-type':
        return 'Wybierz typ dachu';
      case 'confirm-roof-type':
        return 'Potwierdź typ dachu';
      case 'resolve-conflict':
        return `Rozstrzygnij: ${field(step.field)} — dokument podaje różne wartości`;
      case 'enter-value':
        return `Uzupełnij: ${field(step.field)}`;
      case 'confirm-value':
        return `Potwierdź: ${field(step.field)}`;
      case 'final-review':
        return 'Sprawdź całość i zaznacz potwierdzenie';
      case 'create':
        return 'Utwórz projekt';
    }
  },
  readTime: (ms: string) => `odczyt na tym urządzeniu: ${ms} ms`,
  provenance: 'Szczegóły źródła',
  provenanceEngine: {
    'text-layer': 'warstwa tekstowa PDF',
    'vector-geometry': 'geometria wektorowa PDF',
    ocr: 'OCR',
    'ai-vision': 'AI Vision',
    transcription: 'Twój odczyt z rysunku',
    manual: 'pomiar ze skali',
  } satisfies Record<RecognitionMode, string>,
  provenanceDocument: (fingerprint: string) =>
    `dokument (odcisk ${fingerprint.slice(0, 10)})`,
  provenanceWarnings: (count: number) =>
    `${count} ${plPlural(count, 'uwaga', 'uwagi', 'uwag')}`,
};

type Copy = typeof pl;

const en: Copy = {
  ...pl,
  title: 'Import project from a document',
  subtitle: 'A PDF with written dimensions, or a photo or scan of a plan',
  close: 'Close import',
  steps: ['File', 'Recognition', 'Review', 'Project'],
  dropTitle: 'Drop a roof plan or documentation here',
  dropHint:
    'A PDF with a text layer (CAD or editor export) — dimensions are read automatically. A JPG, PNG or WebP photo or scan — you mark the dimensions written on it and type them in.',
  dimensionFirst:
    'We rely on the dimensions written on the drawing, not on measuring at scale — prints, scans and photos are often at a different scale than stated.',
  choose: 'Choose file',
  privacy:
    'The file is analysed only in this browser. It is not sent to a server or an AI service and is not stored in the project.',
  limits: 'Up to 25 MB · PDF up to 30 pages',
  samplesTitle: 'No drawing at hand? Try a sample:',
  sample: {
    gable: 'House — gable roof',
    hip: 'House — hip roof',
    'mono-pitch': 'Carport — mono-pitch roof',
    house: 'House design — 4 pages',
  },
  samplesHint:
    'Synthetic RoofCalc drawings. They go through the same reading, review and calculation as your file.',
  sampleFailed:
    'The sample could not be loaded. Check the connection and try again.',
  loading: 'Loading document…',
  reading: 'Reading text layer…',
  other: 'Other file',
  rejected: {
    empty: 'The file is empty.',
    'too-large': 'The file exceeds the 25 MB limit.',
    'unsupported-format':
      'This is not a supported document. Choose a PDF, JPG, PNG or WebP. The content decides the format, not the file name.',
    'heic-photo': 'HEIC/HEIF photos are not supported. Save the photo as JPG.',
    'dwg-drawing': 'DWG drawings are not supported. Export the drawing to PDF.',
  },
  password: 'The document is password protected. Save it without a password.',
  imageTooLarge:
    'The image resolution is too high (max 12,000 px per side, 40 MP).',
  failed: 'The document could not be read. The file may be damaged.',
  document: 'Source document',
  page: (page, total) => `Page ${page} of ${total}`,
  previousPage: 'Previous page',
  nextPage: 'Next page',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit',
  toolSelect: 'Point',
  toolTranscribe: 'Read a dimension',
  toolCalibrate: 'Calibrate scale',
  readingGroup: 'Reading dimensions',
  scaleGroup: 'Scale — for checking only',
  toolHintSelect:
    'Click a value in the panel to see it in the document. Click a highlighted reading on the drawing to assign it to the active field.',
  toolHintTranscribe:
    'Frame the dimension number on the drawing (drag or click), then type it exactly as written.',
  toolHintCalibrate:
    'Click both ends of a segment of known length (e.g. a dimensioned building side). Measuring at scale is for checking only.',
  toolHintMeasure: (field) =>
    `Measure “${field}” at scale: click both ends of the segment. The result is approximate.`,
  transcribeTitle: 'Read a dimension from the drawing',
  transcribeValue: 'Dimension exactly as written',
  transcribeValueHint: 'e.g. 12.40 · 1240 · 38⁵ · 35° · 8×18',
  transcribeMeaning: 'What does this dimension mean?',
  transcribeUnassigned: 'Unassigned dimension (e.g. part of a chain)',
  rafterSection: 'Rafter section (width × depth)',
  transcribeSave: 'Add reading',
  transcribeCancel: 'Cancel',
  transcribeZoom: 'Magnified selection',
  transcribeError: {
    empty: 'Type the dimension.',
    'not-a-dimension':
      'That does not look like a dimension — type a number, e.g. 12.40.',
    'several-values': 'Type one value — read each dimension separately.',
    'angle-expected': 'For an angle type degrees (35°) or a slope in percent.',
    'length-expected': 'For a length type a number, e.g. 12.40 or 1240.',
    'pair-expected': 'For a section type two numbers, e.g. 8×18.',
    'out-of-range': 'The pitch must be between 0° and 90°.',
  },
  transcriptions: (count) => `Transcribed dimensions (${count})`,
  removeTranscription: 'Remove reading',
  unassigned: 'unassigned',
  rasterNotice:
    'This document has no text layer (scan or photo). Mark the dimensions written on the drawing with “Read a dimension” and type them in — no scale needed.',
  transcribedSource: 'Your reading from the drawing',
  scaledSource: 'measured at scale — approximate',
  chainEvidence: (parts, total) => `dimension chain: ${parts} = ${total}`,
  knownLength: 'Real length of the segment',
  applyCalibration: 'Set scale',
  useDrawingScale: (denominator) => `Use drawing scale 1:${denominator}`,
  calibrated: (text) => `Scale set: ${text}`,
  calibratedBySegment: (length) => `reference segment ${length}`,
  calibratedByDrawing: (denominator) => `1:${denominator} from the drawing`,
  calibrationRejected: {
    'points-too-close': 'The points are too close — choose a longer segment.',
    'different-pages': 'Both points must be on the same page.',
    'invalid-length': 'Enter a positive segment length.',
  },
  needCalibration:
    'Set a scale first: two-point calibration or the scale stated on the drawing.',
  review: 'Recognised parameters',
  engines: 'Recognition methods',
  engineText: (count) =>
    `PDF text layer — on this device (${count} ${count === 1 ? 'reading' : 'readings'})`,
  engineNoText: 'PDF text layer — the document has no text (scan or photo)',
  engineManual:
    'Measuring at scale on the underlay — for checking only, on this device',
  engineTranscription:
    'Reading written dimensions (mark and type) — on this device',
  engineOcr:
    'Scan OCR — not available in this version (a slot for a local engine)',
  engineAi:
    'AI Vision — not available (no provider configured; nothing is uploaded)',
  roofType: 'Roof type',
  gable: 'Gable',
  hip: 'Hip',
  'mono-pitch': 'Mono-pitch',
  detectedRoof: (text) => `In the document: “${text}”`,
  unsupportedRoof: (text) =>
    `The document describes a “${text}” roof. RoofCalc currently computes gable, hip (including pyramid) and mono-pitch roofs — choose a type manually only if that simplification is valid.`,
  confirmRoof: 'Confirm type',
  documentUnit: 'Unit of numbers without a unit',
  unitFromDocument: (text) => `from the document: “${text}”`,
  unitNone: 'not stated — choose',
  scale: 'Drawing scale',
  confirm: 'Confirm',
  confirmed: 'Confirmed',
  measure: 'Measure at scale',
  showInDocument: 'Show in document',
  alternatives: (count) => `Other readings (${count})`,
  conflictPick: 'The document states different values — choose the right one:',
  chooseAlternative: 'Choose another reading…',
  pageShort: (page) => `p. ${page}`,
  confidence: {
    high: 'Certain reading',
    medium: 'Check',
    low: 'Uncertain — confirm',
  },
  status: {
    conflict: 'Conflicting readings — choose one',
    missing: 'Not in the document',
    userEntered: 'Your value',
    defaulted: (value) => `RoofCalc default: ${value}`,
  },
  basis: {
    explicit: 'unit written with the value',
    'document-declared': 'unit stated by the document',
    'user-declared': 'unit you chose',
    'plausible-range': 'unit assumed from the typical range — check',
    calibrated: 'measured at scale on the underlay — approximate',
    'drawing-scale': 'unit confirmed by the line drawn at scale',
  },
  engineVector: (found) =>
    found
      ? 'PDF vector geometry — building outline found in the drawing'
      : 'PDF vector geometry — no closed outline found',
  crossCheckMatch: (denominator, percent) =>
    `matches the drawn line (1:${denominator}, deviation ${percent})`,
  crossCheckMismatch: (denominator, percent) =>
    `differs from the drawn line (1:${denominator}) by ${percent}`,
  drawnSource: 'outline line length at the drawing scale',
  required: 'required',
  warnings: 'Notes',
  warning: (warning, field) => {
    switch (warning.code) {
      case 'no-text-layer':
        return 'The document has no text layer (scan or photo). Mark and type the written dimensions with “Read a dimension”.';
      case 'page-limit-reached':
        return `Analysed ${warning.processed} of ${warning.total} pages (limit).`;
      case 'text-limit-reached':
        return `Page ${warning.page} has a lot of text — part of it was analysed.`;
      case 'unsupported-roof-type':
        return `Unsupported roof type detected: “${warning.text}”.`;
      case 'value-outside-plausible-range':
        return `${field(warning.field)}: value outside the typical range — check the unit.`;
      case 'unit-inferred':
        return `${field(warning.field)}: number without a unit — unit assumed from the typical range.`;
      case 'unit-ambiguous':
        return `${field(warning.field)}: “${warning.rawText}” without a unit may be mm or cm — choose the document unit.`;
      case 'conflicting-values':
        return `${field(warning.field)}: the document states different values.`;
      case 'width-exceeds-length':
        return 'The width exceeds the length. RoofCalc length is the side along the ridge — check the dimensions are not swapped.';
      case 'hip-length-below-width':
        return 'A hip roof needs a length not smaller than its width.';
      case 'scale-mismatch':
        return `${field(warning.field)}: the written dimension differs from the drawn length at the drawing scale. The written dimension applies — check whether the print was rescaled.`;
      case 'scaled-value-only':
        return `${field(warning.field)}: no written dimension was found — a measurement at scale is used. Check it or read the dimension from the drawing.`;
      case 'dimension-chain-mismatch':
        return `The part dimensions add up to ${formatChainNumber(warning.sum, false)}, not to the overall ${formatChainNumber(warning.total, false)}. One of the numbers may have been misread.`;
    }
  },
  blockers: 'Before creating the project',
  monoPitchBlockers: 'Before opening the calculation',
  blocker: (blocker, field) => {
    switch (blocker.code) {
      case 'roof-type-missing':
        return 'Choose the roof type.';
      case 'roof-type-unsupported':
        return `“${blocker.text}” is not supported — choose gable, hip or mono-pitch only if that is a valid simplification.`;
      case 'roof-type-unconfirmed':
        return 'Confirm the roof type read from the document.';
      case 'value-missing':
        return `Complete: ${field(blocker.field)}.`;
      case 'value-unconfirmed':
        return `Confirm: ${field(blocker.field)}.`;
      case 'value-conflict':
        return `Choose one value: ${field(blocker.field)}.`;
      case 'value-not-positive':
        return `${field(blocker.field)} must be greater than zero.`;
    }
  },
  preview: 'RoofCalc model preview',
  previewEmpty: 'The preview appears once the required values are complete.',
  construction:
    'Structure system and ridge connection are set in the workshop (default: rafter roof, ridge board).',
  limitation:
    'Import relies on the dimensions written on the drawing: automatically from a PDF text layer, after typing from photos and scans. It checks dimension-chain sums. Drawing lines and the scale are for checking only. It does not yet read text in photos on its own (OCR).',
  reviewCheck: 'I checked the read values and their sources in the document.',
  create: 'Create RoofCalc project',
  creating: 'Creating project…',
  monoPitchConstruction:
    'A mono-pitch roof opens in the mono-pitch calculator — set the wall plates, purlins, the wall abutment and battens there. It is a calculation, not yet a saved project.',
  openMonoPitch: 'Open in the mono-pitch calculator',
  monoPitchPreview: 'Rafter section from the RoofCalc calculation',
  createFailed:
    'The project could not be saved. Check local storage availability and try again.',
  invalidTemplate:
    'The values do not form a valid RoofCalc roof — check the ranges.',
  projectName: (file) => `Project from document ${file}`,
  pages: 'Document pages',
  pageRole: {
    'roof-plan': 'Roof plan',
    'framing-plan': 'Framing plan',
    section: 'Section',
    'floor-plan': 'Floor plan',
    elevation: 'Elevation',
    schedule: 'Schedule',
    unknown: 'Other page',
  },
  pageRoleLabel: 'Page role',
  pageRoleFrom: (text) => `from the page title: “${text}”`,
  pageReadings: (count) => `${count} ${count === 1 ? 'reading' : 'readings'}`,
  pageSkip: 'Skip this page',
  pageInclude: 'Use this page',
  pageSkippedHint: 'Readings on this page are not used.',
  pageButton: (page, role, readings, skipped) =>
    `Page ${page}: ${role}, ${readings} ${readings === 1 ? 'reading' : 'readings'}${skipped ? ', skipped' : ''}`,
  intakeTitle: 'Reading status',
  intakeSettled: (count, total) => `Recognised ${count} of ${total}`,
  intakeToConfirm: (count) => `${count} to confirm`,
  intakeMissing: (count) => `${count} missing`,
  intakeDefaulted: (count) =>
    `${count} ${count === 1 ? 'default value' : 'default values'}`,
  intakeUnsupported: 'unsupported roof type',
  intakeNext: 'Next step',
  intakeItem: {
    recognized: 'recognised',
    confirmed: 'confirmed',
    entered: 'typed',
    'to-confirm': 'to confirm',
    conflict: 'conflicting readings',
    missing: 'missing',
    defaulted: 'RoofCalc default',
    unsupported: 'unsupported',
  },
  intakeStep: (step, field) => {
    switch (step.kind) {
      case 'unsupported-roof':
        return `A “${step.text}” roof — choose a type manually only if valid`;
      case 'choose-roof-type':
        return 'Choose the roof type';
      case 'confirm-roof-type':
        return 'Confirm the roof type';
      case 'resolve-conflict':
        return `Decide: ${field(step.field)} — the document states different values`;
      case 'enter-value':
        return `Complete: ${field(step.field)}`;
      case 'confirm-value':
        return `Confirm: ${field(step.field)}`;
      case 'final-review':
        return 'Check everything and tick the confirmation';
      case 'create':
        return 'Create the project';
    }
  },
  readTime: (ms) => `read on this device: ${ms} ms`,
  provenance: 'Source details',
  provenanceEngine: {
    'text-layer': 'PDF text layer',
    'vector-geometry': 'PDF vector geometry',
    ocr: 'OCR',
    'ai-vision': 'AI Vision',
    transcription: 'your reading from the drawing',
    manual: 'measured at scale',
  },
  provenanceDocument: (fingerprint) =>
    `document (fingerprint ${fingerprint.slice(0, 10)})`,
  provenanceWarnings: (count) => `${count} ${count === 1 ? 'note' : 'notes'}`,
};

export function importCopy(language: string): Copy {
  return language.startsWith('pl') ? pl : en;
}

export type ImportCopy = Copy;
