import type {
  CadEvidence,
  CadWarning,
  DxfWarning,
} from '@cieslacalc/bim-import-core';

/** Copy for the VNext-4 CAD (DXF) plan import (PL/EN). */
const pl = {
  title: 'Import z rysunku CAD (DXF)',
  subtitle:
    'Rzut dachu lub budynku z AutoCAD, BricsCAD, ArchiCAD lub Revit. Plik jest analizowany na tym urządzeniu — nie jest nigdzie wysyłany.',
  close: 'Zamknij',
  drop: 'Upuść tu plik DXF',
  dropHint:
    'RoofCalc rozpozna prostokątny obrys, okap (z dwóch obrysów), kalenicę i naroża oraz kąt z opisów. Model IFC też możesz tu upuścić.',
  choose: 'Wybierz plik',
  reading: 'Czytanie rysunku…',
  errors: {
    'binary-dxf':
      'To binarny DXF. Zapisz rysunek jako DXF tekstowy (ASCII) i wczytaj ponownie.',
    'dwg-drawing':
      'To plik DWG. Zapisz rysunek jako DXF (Plik → Zapisz jako → DXF) i wczytaj ponownie.',
    'not-dxf': 'To nie jest rysunek DXF.',
    'unsupported-format': 'Tego pliku nie da się wczytać jako rysunku DXF.',
    'too-large': 'Plik jest za duży (limit 25 MB).',
    empty: 'Plik jest pusty.',
    'heic-photo': 'To zdjęcie HEIC — użyj importu z PDF lub zdjęcia (JPG/PNG).',
    'no-geometry': 'W obszarze modelu nie ma linii ani polilinii.',
    'no-rectangular-outline':
      'Nie znaleziono prostokątnego obrysu. RoofCalc rozpoznaje dachy na planie prostokąta — utwórz projekt ręcznie lub z PDF.',
    read: 'Nie udało się odczytać pliku.',
  } as Record<string, string>,
  unitQuestion: 'W jakich jednostkach narysowano plan?',
  unitHelp: (side: string) =>
    `Plik nie podaje jednostek. Najdłuższy bok obrysu ma ${side} jednostek rysunku.`,
  units: { mm: 'milimetry', cm: 'centymetry', m: 'metry' },
  preview: 'Podgląd rysunku',
  legend: {
    walls: 'obrys ścian',
    eaves: 'linia okapu',
    outline: 'obrys',
    ridge: 'kalenica',
    hip: 'naroże',
    other: 'pozostałe linie',
  },
  otherOutline: (index: number, count: number) =>
    `Inny obrys (${index} z ${count})`,
  fileUnit: (unit: string, basis: string) => `Jednostka: ${unit} (${basis})`,
  unitBasis: {
    declared: 'z pliku',
    inferred: 'przyjęta — sprawdź',
    user: 'Twój wybór',
  },
  changeUnit: 'Zmień jednostkę',
  title2: 'Parametry projektu RoofCalc',
  roofType: 'Rodzaj dachu',
  gable: 'Dwuspadowy',
  hip: 'Kopertowy',
  meaningQuestion: 'Ten obrys to:',
  meaning: {
    walls: 'obrys ścian budynku',
    eaves: 'krawędź okapu (dachu)',
  },
  derived: 'obrys okapu − 2 × okap',
  pitchFromText: (text: string) => `Z opisu na rysunku: „${text}”`,
  pitchMissing: 'Rzut nie podaje kąta — wpisz go z przekroju.',
  source: {
    walls: 'Z obrysu ścian (rysunek)',
    outline: 'Z obrysu (rysunek)',
    nested: 'Z dwóch obrysów (rysunek)',
    lines: 'Z linii dachu (kalenica / naroża)',
    text: 'Z opisu na rysunku',
    dimension: 'potwierdzone wymiarem',
    defaults: 'Wartość RoofCalc — sprawdź',
    user: 'Twoja wartość',
    choose: 'Wybierz',
  },
  evidence: 'Co rozpoznano',
  evidenceItem: {
    'nested-outlines':
      'Dwa równoległe obrysy z równym odstępem — ściany i okap.',
    'ridge-full-length': 'Kalenica na całej długości — dach dwuspadowy.',
    'ridge-shortened':
      'Kalenica krótsza o szerokość — typowe dla dachu kopertowego.',
    'hip-diagonals': 'Linie naroży z narożników pod 45°.',
    'hip-geometry-consistent':
      'Długość kalenicy zgadza się z geometrią koperty (L − B).',
    'dimension-matches-length': 'Wymiar na rysunku potwierdza długość.',
    'dimension-matches-width': 'Wymiar na rysunku potwierdza szerokość.',
    'roof-type-text': 'Rodzaj dachu odczytany z opisu.',
    'pitch-text': 'Kąt odczytany z opisu.',
    'pitch-percent-converted': 'Spadek w % przeliczony na stopnie.',
  } satisfies Record<CadEvidence, string>,
  warning: {
    'unit-inferred':
      'Plik nie podaje jednostek — przyjęto taką, która daje rozsądny wymiar budynku. Sprawdź.',
    'unit-assumed': 'Jednostka przyjęta.',
    'several-outlines':
      'Na rysunku jest kilka prostokątnych obrysów. Wybrano ten z liniami dachu — możesz wskazać inny.',
    'single-outline-meaning':
      'Jeden obrys: wskaż, czy to ściany, czy krawędź okapu.',
    'roof-type-not-recognized':
      'Nie rozpoznano rodzaju dachu z rysunku — wybierz go.',
    'pitch-not-found': 'Rzut nie podaje kąta — wpisz go z przekroju.',
    'ridge-across-short-side':
      'Kalenica biegnie wzdłuż krótszego boku — sprawdź, która strona jest długością budynku (wzdłuż kalenicy).',
  } satisfies Record<CadWarning, string>,
  dxfWarning: {
    'arcs-ignored': 'Łuki i okręgi pominięto — rozpoznawane są odcinki proste.',
    'bulges-ignored': 'Zaokrąglone odcinki polilinii potraktowano jako proste.',
    'entity-limit': 'Rysunek jest bardzo duży — przeanalizowano jego część.',
    'vertex-limit': 'Rysunek jest bardzo duży — przeanalizowano jego część.',
    'nested-blocks-ignored': 'Głęboko zagnieżdżone bloki pominięto.',
    'non-2d-polylines-ignored': 'Polilinie 3D i siatki pominięto.',
  } satisfies Record<DxfWarning, string>,
  confirm: 'Sprawdziłem rodzaj dachu, wymiary, kąt i okap.',
  create: 'Utwórz projekt RoofCalc',
  busy: 'Tworzenie projektu…',
  summary:
    'Rysunek jest tylko źródłem parametrów. Po utworzeniu projektu wszystko liczy RoofCalc — konstrukcję, pokrycie i materiały.',
  invalid: 'Uzupełnij wymagane pola.',
  failure: 'Nie udało się zapisać projektu. Spróbuj ponownie.',
  name: (file: string) => `Projekt z ${file}`,
  another: 'Wczytaj inny plik',
};

type CadCopy = typeof pl;

const en: CadCopy = {
  title: 'Import from a CAD drawing (DXF)',
  subtitle:
    'A roof or building plan from AutoCAD, BricsCAD, ArchiCAD or Revit. The file is analysed on this device and is not sent anywhere.',
  close: 'Close',
  drop: 'Drop a DXF file here',
  dropHint:
    'RoofCalc recognises a rectangular outline, the eave (from two outlines), ridge and hips, and the pitch from texts. You can drop an IFC model here too.',
  choose: 'Choose a file',
  reading: 'Reading the drawing…',
  errors: {
    'binary-dxf':
      'This is a binary DXF. Save the drawing as a text (ASCII) DXF and load it again.',
    'dwg-drawing':
      'This is a DWG file. Save the drawing as DXF (File → Save as → DXF) and load it again.',
    'not-dxf': 'This is not a DXF drawing.',
    'unsupported-format': 'This file cannot be loaded as a DXF drawing.',
    'too-large': 'The file is too large (25 MB limit).',
    empty: 'The file is empty.',
    'heic-photo':
      'This is a HEIC photo — use the PDF or photo import (JPG/PNG).',
    'no-geometry': 'Model space has no lines or polylines.',
    'no-rectangular-outline':
      'No rectangular outline was found. RoofCalc recognises roofs on a rectangular plan — create the project manually or from a PDF.',
    read: 'The file could not be read.',
  },
  unitQuestion: 'Which unit is the plan drawn in?',
  unitHelp: (side: string) =>
    `The file states no unit. The longest outline side is ${side} drawing units.`,
  units: { mm: 'millimetres', cm: 'centimetres', m: 'metres' },
  preview: 'Drawing preview',
  legend: {
    walls: 'wall outline',
    eaves: 'eave line',
    outline: 'outline',
    ridge: 'ridge',
    hip: 'hip',
    other: 'other lines',
  },
  otherOutline: (index: number, count: number) =>
    `Another outline (${index} of ${count})`,
  fileUnit: (unit: string, basis: string) => `Unit: ${unit} (${basis})`,
  unitBasis: {
    declared: 'from the file',
    inferred: 'assumed — check',
    user: 'your choice',
  },
  changeUnit: 'Change unit',
  title2: 'RoofCalc project parameters',
  roofType: 'Roof type',
  gable: 'Gable',
  hip: 'Hip',
  meaningQuestion: 'This outline is:',
  meaning: {
    walls: 'the building walls',
    eaves: 'the eave (roof edge)',
  },
  derived: 'eave outline − 2 × overhang',
  pitchFromText: (text: string) => `From a drawing text: “${text}”`,
  pitchMissing: 'The plan states no pitch — enter it from a section.',
  source: {
    walls: 'From the wall outline (drawing)',
    outline: 'From the outline (drawing)',
    nested: 'From two outlines (drawing)',
    lines: 'From roof lines (ridge / hips)',
    text: 'From a drawing text',
    dimension: 'confirmed by a dimension',
    defaults: 'RoofCalc value — check',
    user: 'Your value',
    choose: 'Choose',
  },
  evidence: 'What was recognised',
  evidenceItem: {
    'nested-outlines':
      'Two parallel outlines with an even offset — walls and eave.',
    'ridge-full-length': 'A ridge along the full length — a gable roof.',
    'ridge-shortened': 'A ridge shorter by the width — typical of a hip roof.',
    'hip-diagonals': 'Hip lines from the corners at 45°.',
    'hip-geometry-consistent': 'The ridge length matches hip geometry (L − W).',
    'dimension-matches-length': 'A drawing dimension confirms the length.',
    'dimension-matches-width': 'A drawing dimension confirms the width.',
    'roof-type-text': 'Roof type read from a text.',
    'pitch-text': 'Pitch read from a text.',
    'pitch-percent-converted': 'A slope in % converted to degrees.',
  },
  warning: {
    'unit-inferred':
      'The file states no unit — the one giving a plausible building size was assumed. Check it.',
    'unit-assumed': 'Unit assumed.',
    'several-outlines':
      'The drawing has several rectangular outlines. The one holding roof lines was chosen — you can pick another.',
    'single-outline-meaning':
      'One outline: say whether it is the walls or the eave edge.',
    'roof-type-not-recognized':
      'The roof type was not recognised from the drawing — choose it.',
    'pitch-not-found': 'The plan states no pitch — enter it from a section.',
    'ridge-across-short-side':
      'The ridge runs along the shorter side — check which side is the building length (along the ridge).',
  },
  dxfWarning: {
    'arcs-ignored': 'Arcs and circles were skipped — straight pieces are read.',
    'bulges-ignored': 'Rounded polyline pieces were read as straight.',
    'entity-limit': 'The drawing is very large — part of it was analysed.',
    'vertex-limit': 'The drawing is very large — part of it was analysed.',
    'nested-blocks-ignored': 'Deeply nested blocks were skipped.',
    'non-2d-polylines-ignored': '3D polylines and meshes were skipped.',
  },
  confirm: 'I checked the roof type, dimensions, pitch and overhang.',
  create: 'Create RoofCalc project',
  busy: 'Creating project…',
  summary:
    'The drawing is only a parameter source. After the project is created, RoofCalc calculates everything — structure, covering and materials.',
  invalid: 'Complete the required fields.',
  failure: 'The project could not be saved. Try again.',
  name: (file: string) => `Project from ${file}`,
  another: 'Load another file',
};

export function cadCopy(language: string): CadCopy {
  return language.startsWith('pl') ? pl : en;
}
export type { CadCopy };
