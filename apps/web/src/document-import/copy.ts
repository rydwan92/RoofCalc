import type {
  Confidence,
  DraftWarning,
  ImportBlocker,
  IngestionRejection,
  NumericRoofField,
  UnitBasis,
} from '@cieslacalc/document-import-core';

/**
 * Copy for the lazily loaded document importer (PL/EN), kept beside the
 * module like the IFC importer's, so the main bundle does not carry it.
 */
const pl = {
  title: 'Import projektu z dokumentu',
  subtitle: 'PDF z opisanymi wymiarami albo zdjęcie lub skan rzutu',
  close: 'Zamknij import',
  steps: ['Plik', 'Rozpoznanie', 'Weryfikacja', 'Projekt'],
  dropTitle: 'Przeciągnij tutaj rzut dachu lub dokumentację',
  dropHint:
    'PDF z warstwą tekstową (eksport z programu CAD lub edytora), a także zdjęcie lub skan JPG, PNG, WebP do ręcznego odmierzenia.',
  choose: 'Wybierz plik',
  privacy:
    'Plik jest analizowany wyłącznie w tej przeglądarce. Nie jest wysyłany na serwer ani do usług AI i nie jest zapisywany w projekcie.',
  limits: 'Do 25 MB · PDF do 30 stron',
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
  toolCalibrate: 'Kalibruj skalę',
  toolHintSelect:
    'Kliknij wartość w panelu, aby zobaczyć ją w dokumencie. Kliknij zaznaczony odczyt na rysunku, aby przypisać go do aktywnego pola.',
  toolHintCalibrate:
    'Kliknij dwa końce odcinka o znanej długości (np. wymiarowany bok budynku).',
  toolHintMeasure: (field: string) =>
    `Zmierz „${field}”: kliknij dwa końce odcinka na rysunku.`,
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
  engineManual: 'Pomiar ręczny na podkładzie — na tym urządzeniu',
  engineOcr: 'OCR skanów — niedostępne w tej wersji',
  engineAi:
    'AI Vision — niedostępne (brak skonfigurowanego dostawcy; nic nie jest wysyłane)',
  roofType: 'Typ dachu',
  gable: 'Dwuspadowy',
  hip: 'Kopertowy',
  detectedRoof: (text: string) => `W dokumencie: „${text}”`,
  unsupportedRoof: (text: string) =>
    `Dokument opisuje dach „${text}”. RoofCalc liczy obecnie dachy dwuspadowe i kopertowe — wybierz typ ręcznie tylko, jeśli to uproszczenie jest prawidłowe.`,
  confirmRoof: 'Potwierdź typ',
  documentUnit: 'Jednostka liczb bez jednostki',
  unitFromDocument: (text: string) => `z dokumentu: „${text}”`,
  unitNone: 'nie podano — wybierz',
  scale: 'Skala rysunku',
  confirm: 'Potwierdź',
  confirmed: 'Potwierdzone',
  measure: 'Zmierz na rysunku',
  showInDocument: 'Pokaż w dokumencie',
  alternatives: (count: number) => `Inne odczyty (${count})`,
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
    calibrated: 'zmierzone na podkładzie po kalibracji',
  } satisfies Record<UnitBasis, string>,
  required: 'wymagane',
  warnings: 'Uwagi',
  warning: (
    warning: DraftWarning,
    field: (name: NumericRoofField) => string,
  ) => {
    switch (warning.code) {
      case 'no-text-layer':
        return 'Dokument nie ma warstwy tekstowej (skan lub zdjęcie). Ustaw skalę i odmierz wymiary ręcznie albo wpisz je.';
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
        return `${field(warning.field)}: wymiar opisany różni się od długości linii w skali rysunku.`;
    }
  },
  blockers: 'Przed utworzeniem projektu',
  blocker: (
    blocker: ImportBlocker,
    field: (name: NumericRoofField) => string,
  ) => {
    switch (blocker.code) {
      case 'roof-type-missing':
        return 'Wybierz typ dachu.';
      case 'roof-type-unsupported':
        return `Typ „${blocker.text}” nie jest obsługiwany — wybierz dwuspadowy lub kopertowy, jeśli to uprawnione uproszczenie.`;
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
    'Import odczytuje opisane wymiary z warstwy tekstowej PDF oraz pomiary wskazane ręcznie. Nie rozpoznaje jeszcze samodzielnie geometrii z linii rysunku ani tekstu ze zdjęć i skanów.',
  reviewCheck: 'Sprawdziłem odczytane wartości i ich źródła w dokumencie.',
  create: 'Utwórz projekt RoofCalc',
  creating: 'Tworzenie projektu…',
  createFailed:
    'Nie udało się zapisać projektu. Sprawdź dostępność lokalnego zapisu i spróbuj ponownie.',
  invalidTemplate:
    'Wartości nie tworzą poprawnego dachu RoofCalc — sprawdź zakresy.',
  projectName: (file: string) => `Projekt z dokumentu ${file}`,
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
    'A PDF with a text layer (CAD or editor export), or a JPG, PNG or WebP photo or scan for manual measurement.',
  choose: 'Choose file',
  privacy:
    'The file is analysed only in this browser. It is not sent to a server or an AI service and is not stored in the project.',
  limits: 'Up to 25 MB · PDF up to 30 pages',
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
  toolCalibrate: 'Calibrate scale',
  toolHintSelect:
    'Click a value in the panel to see it in the document. Click a highlighted reading on the drawing to assign it to the active field.',
  toolHintCalibrate:
    'Click both ends of a segment of known length (e.g. a dimensioned building side).',
  toolHintMeasure: (field) =>
    `Measure “${field}”: click both ends of the segment on the drawing.`,
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
  engineManual: 'Manual measurement on the underlay — on this device',
  engineOcr: 'Scan OCR — not available in this version',
  engineAi:
    'AI Vision — not available (no provider configured; nothing is uploaded)',
  roofType: 'Roof type',
  gable: 'Gable',
  hip: 'Hip',
  detectedRoof: (text) => `In the document: “${text}”`,
  unsupportedRoof: (text) =>
    `The document describes a “${text}” roof. RoofCalc currently computes gable and hip roofs — choose a type manually only if that simplification is valid.`,
  confirmRoof: 'Confirm type',
  documentUnit: 'Unit of numbers without a unit',
  unitFromDocument: (text) => `from the document: “${text}”`,
  unitNone: 'not stated — choose',
  scale: 'Drawing scale',
  confirm: 'Confirm',
  confirmed: 'Confirmed',
  measure: 'Measure on drawing',
  showInDocument: 'Show in document',
  alternatives: (count) => `Other readings (${count})`,
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
    calibrated: 'measured on the calibrated underlay',
  },
  required: 'required',
  warnings: 'Notes',
  warning: (warning, field) => {
    switch (warning.code) {
      case 'no-text-layer':
        return 'The document has no text layer (scan or photo). Set a scale and measure, or type the values.';
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
        return `${field(warning.field)}: the written dimension differs from the drawn length at the drawing scale.`;
    }
  },
  blockers: 'Before creating the project',
  blocker: (blocker, field) => {
    switch (blocker.code) {
      case 'roof-type-missing':
        return 'Choose the roof type.';
      case 'roof-type-unsupported':
        return `“${blocker.text}” is not supported — choose gable or hip only if that is a valid simplification.`;
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
    'Import reads written dimensions from a PDF text layer and measurements you mark. It does not yet recognise geometry from drawing lines or text in photos and scans on its own.',
  reviewCheck: 'I checked the read values and their sources in the document.',
  create: 'Create RoofCalc project',
  creating: 'Creating project…',
  createFailed:
    'The project could not be saved. Check local storage availability and try again.',
  invalidTemplate:
    'The values do not form a valid RoofCalc roof — check the ranges.',
  projectName: (file) => `Project from document ${file}`,
};

export function importCopy(language: string): Copy {
  return language.startsWith('pl') ? pl : en;
}

export type ImportCopy = Copy;
