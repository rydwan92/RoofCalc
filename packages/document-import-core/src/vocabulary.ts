import type { DetectedRoofType, LengthUnit, NumericRoofField } from './model';

/**
 * Semantic interpretation vocabulary (Polish and English). Patterns run on
 * `normalizeForMatching` text: lower case, Polish diacritics folded, one
 * output character per input character so match indices stay valid in the
 * original line.
 */

const FOLD: Record<string, string> = {
  ą: 'a',
  ć: 'c',
  ę: 'e',
  ł: 'l',
  ń: 'n',
  ó: 'o',
  ś: 's',
  ź: 'z',
  ż: 'z',
};

export function normalizeForMatching(text: string): string {
  let result = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const folded = FOLD[lower] ?? lower;
    // Keep a 1:1 UTF-16 mapping so indices remain valid in the original.
    result += folded.length === char.length ? folded : char;
  }
  return result;
}

export type LabelTarget =
  | { kind: 'field'; field: NumericRoofField }
  | { kind: 'dimensions' }
  | { kind: 'section' };

export interface LabelPattern {
  target: LabelTarget;
  pattern: RegExp;
  /** `generic` labels ("długość") are weaker evidence than explicit ones. */
  strength: 'explicit' | 'generic';
  /** Value must follow almost immediately ("co 90 cm"). */
  tight?: boolean;
}

const field = (name: NumericRoofField): LabelTarget => ({
  kind: 'field',
  field: name,
});

const NOT_OPENING = String.raw`(?!\s+(?:okna|okien|drzwi|otworu|krokwi|deski|laty|kontrlaty|murlaty|platwi|kalenicy|okapu|blachy|dachowki|wyłazu|wylazu|komina))`;

export const LABEL_PATTERNS: readonly LabelPattern[] = [
  {
    target: { kind: 'dimensions' },
    strength: 'explicit',
    pattern:
      /\b(?:wymiary|gabaryty)(?:\s+zewnetrzne)?\s+(?:budynku|domu|obrysu|rzutu|w\s+rzucie)\b|\b(?:building|outline|footprint)\s+dimensions\b/g,
  },
  {
    target: field('buildingLength'),
    strength: 'explicit',
    pattern:
      /\bdlugosc\s+(?:budynku|domu|obrysu|rzutu|scian(?:y)?(?:\s+zewnetrznych)?)\b|\bbuilding\s+length\b|\blength\s+of\s+(?:the\s+)?building\b/g,
  },
  {
    target: field('buildingWidth'),
    strength: 'explicit',
    pattern:
      /\bszerokosc\s+(?:budynku|domu|obrysu|rzutu|scian(?:y)?(?:\s+zewnetrznych)?)\b|\brozpietosc(?:\s+(?:dachu|budynku|wiezby))?\b|\bbuilding\s+width\b|\bspan\b/g,
  },
  {
    target: field('pitch'),
    strength: 'explicit',
    pattern:
      /\bkat\s+nachylenia(?:\s+(?:dachu|polaci(?:\s+dachowych)?))?\b|\b(?:nachylenie|spadek)\s+(?:dachu|polaci(?:\s+dachowych)?)\b|\broof\s+pitch\b|\bpitch\b|\broof\s+slope\b/g,
  },
  {
    target: field('eave'),
    strength: 'explicit',
    pattern:
      /\b(?:wysieg|wysuniecie|wystep|nadwieszenie)\s+(?:okapu|dachu)\b|\bokap(?:\s+(?:dachu|w\s+poziomie))?\b|\beaves?(?:\s+overhang)?\b|\boverhang\b/g,
  },
  {
    target: field('spacing'),
    strength: 'explicit',
    pattern:
      /\brozstaw(?:\s+osiowy)?\s+krokwi\b|\brozstaw\s+osiowy\b|\brafter\s+spacing\b|\bspacing\b/g,
  },
  {
    target: field('spacing'),
    strength: 'explicit',
    tight: true,
    // "krokwie 8×18 co 90 cm" — only directly before a number, so the word
    // "co" in ordinary prose never splits another label's value search.
    pattern: /\bco\b(?=\s*\d)/g,
  },
  {
    target: { kind: 'section' },
    strength: 'explicit',
    pattern:
      /\bprzekroj\s+krokwi\b|\bkrokw(?:ie|ia|i|iami)\b|\brafters?\b(?!\s+spacing)/g,
  },
  {
    target: field('buildingLength'),
    strength: 'generic',
    pattern: new RegExp(String.raw`\bdlugosc\b${NOT_OPENING}|\blength\b`, 'g'),
  },
  {
    target: field('buildingWidth'),
    strength: 'generic',
    pattern: new RegExp(String.raw`\bszerokosc\b${NOT_OPENING}|\bwidth\b`, 'g'),
  },
  {
    target: field('pitch'),
    strength: 'generic',
    pattern: /\bnachylenie\b|\bspadek\b|\bslope\b/g,
  },
  {
    target: field('spacing'),
    strength: 'generic',
    pattern: /\brozstaw\b/g,
  },
];

export const ROOF_TYPE_PATTERNS: readonly {
  value: DetectedRoofType;
  pattern: RegExp;
}[] = [
  {
    value: 'unsupported',
    pattern:
      /\b(?:jednospadow\w*|pulpitow\w*|mansardow\w*|naczolkow\w*|wielospadow\w*|namiotow\w*|kopulow\w*|lukow\w*|beczkow\w*|shed\s+roof|mono-?pitch\w*|mansard|gambrel|pyramid\w*|piramid\w*)\b/,
  },
  {
    value: 'hip',
    pattern: /\b(?:kopertow\w*|czterospadow\w*|hip(?:ped)?\s+roof|hip-roof)\b/,
  },
  {
    value: 'gable',
    pattern:
      /\b(?:dwuspadow\w*|siodlow\w*|gable(?:d)?\s+roof|gable-roof|gable)\b/,
  },
];

const UNIT_WORDS: Record<string, LengthUnit> = {
  mm: 'mm',
  cm: 'cm',
  m: 'm',
  milimetrach: 'mm',
  centymetrach: 'cm',
  metrach: 'm',
  millimetres: 'mm',
  millimeters: 'mm',
  centimetres: 'cm',
  centimeters: 'cm',
  metres: 'm',
  meters: 'm',
};

const DOCUMENT_UNIT =
  /\b(?:(?:wszystkie\s+)?wymiary(?:\s+(?:podano|podane|sa))?\s+w|(?:all\s+)?dimensions(?:\s+are)?\s+in|jednostk[ai](?:\s+wymiarow)?\s*:?|jedn\.\s*:?)\s*\[?(mm|cm|m|milimetrach|centymetrach|metrach|millimet(?:re|er)s|centimet(?:re|er)s|met(?:re|er)s)\b\]?/;

export function matchDocumentUnit(
  normalized: string,
): { unit: LengthUnit; start: number; end: number } | undefined {
  const match = DOCUMENT_UNIT.exec(normalized);
  const word = match?.[1];
  if (!match || !word) return undefined;
  const unit = UNIT_WORDS[word];
  return unit
    ? { unit, start: match.index, end: match.index + match[0].length }
    : undefined;
}
