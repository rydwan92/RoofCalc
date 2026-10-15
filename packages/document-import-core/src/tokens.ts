import type { LengthUnit } from './model';

/**
 * Text and dimension recognition: finds measurement-shaped substrings in
 * one line of document text. Purely lexical — it knows nothing about roofs;
 * the semantic layer decides what a token means.
 */

export const LENGTH_UNIT_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
};

interface TokenBase {
  start: number;
  end: number;
  text: string;
}

export type MeasurementToken =
  | (TokenBase & { kind: 'length'; value: number; unit?: LengthUnit })
  | (TokenBase & {
      kind: 'pair';
      first: number;
      second: number;
      unit?: LengthUnit;
      separator: 'x' | '/';
    })
  | (TokenBase & { kind: 'angle'; degrees: number })
  | (TokenBase & { kind: 'percent'; percent: number })
  | (TokenBase & { kind: 'scale'; denominator: number });

/**
 * A number as written in Polish or English technical documents: decimal
 * comma or point; thousands grouped by a non-breaking/thin space, or by a
 * plain space only when a length unit follows ("12 400 mm").
 */
const NUM = String.raw`(?:\d{1,3}(?:[\u00a0\u202f]\d{3})+|\d{1,3}(?: \d{3})+(?=\s*(?:mm|cm|m)(?![\p{L}\d²³]))|\d+)(?:[.,]\d+)?`;
/** Not part of a word, an identifier such as K1/A4, or another number. */
const LEFT = String.raw`(?<![\p{L}\d.,])`;
/** Not continued by a letter/digit or by a further decimal group (dates). */
const RIGHT = String.raw`(?![\p{L}\d]|[.,]\d)`;
const UNIT = String.raw`(?:mm|cm|mb|m)(?![\p{L}\d²³])`;
/** Areas, volumes, masses, money and counts are not lengths. */
const NOT_LENGTH = String.raw`(?!\s*(?:(?:mm|cm|m)[²³23]|kg|zł|zl|pln|eur|szt|kn|kpa|mpa|%|°))`;

const SCALE = String.raw`(?<![\d.,:])1\s?:\s?(?<scale>\d{1,4})(?![\d.,])`;
const PAIR = String.raw`${LEFT}(?<pa>${NUM})(?:\s*(?<pua>${UNIT}))?\s*(?<sep>[x×X*\/])\s*(?<pb>${NUM})(?:\s*(?<pu>${UNIT}))?(?![\p{L}\d\/]|[.,]\d)`;
const ANGLE = String.raw`${LEFT}(?<ang>${NUM})\s*(?:°|º|˚|deg(?!\p{L})|st(?:opni(?:e)?|opień|\.)?(?!\p{L}))`;
const PERCENT = String.raw`${LEFT}(?<pct>${NUM})\s*%`;
const LENGTH = String.raw`${LEFT}(?<len>${NUM})(?:\s*(?<lu>${UNIT})|${RIGHT}${NOT_LENGTH})`;

const TOKEN = new RegExp(
  `${SCALE}|${PAIR}|${ANGLE}|${PERCENT}|${LENGTH}`,
  'giu',
);

/** "12,40" → 12.4, "1 240" → 1240, "0.9" → 0.9. */
export function parseDocumentNumber(text: string): number | undefined {
  const compact = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return undefined;
  const value = Number(compact);
  return Number.isFinite(value) ? value : undefined;
}

function unitOf(text: string | undefined): LengthUnit | undefined {
  if (!text) return undefined;
  const unit = text.toLowerCase();
  if (unit === 'mb') return 'm';
  return unit === 'mm' || unit === 'cm' || unit === 'm' ? unit : undefined;
}

export function scanMeasurementTokens(line: string): MeasurementToken[] {
  const tokens: MeasurementToken[] = [];
  for (const match of line.matchAll(TOKEN)) {
    const groups = match.groups ?? {};
    const start = match.index ?? 0;
    const text = match[0].trim();
    const base = { start, end: start + match[0].length, text };
    if (groups.scale !== undefined) {
      const denominator = Number(groups.scale);
      if (denominator >= 1)
        tokens.push({ ...base, kind: 'scale', denominator });
      continue;
    }
    if (groups.pa !== undefined && groups.pb !== undefined) {
      const first = parseDocumentNumber(groups.pa);
      const second = parseDocumentNumber(groups.pb);
      if (
        first !== undefined &&
        second !== undefined &&
        first > 0 &&
        second > 0
      )
        tokens.push({
          ...base,
          kind: 'pair',
          first,
          second,
          unit: unitOf(groups.pu) ?? unitOf(groups.pua),
          separator: groups.sep === '/' ? '/' : 'x',
        });
      continue;
    }
    if (groups.ang !== undefined) {
      const degrees = parseDocumentNumber(groups.ang);
      if (degrees !== undefined)
        tokens.push({ ...base, kind: 'angle', degrees });
      continue;
    }
    if (groups.pct !== undefined) {
      const percent = parseDocumentNumber(groups.pct);
      if (percent !== undefined)
        tokens.push({ ...base, kind: 'percent', percent });
      continue;
    }
    if (groups.len !== undefined) {
      const value = parseDocumentNumber(groups.len);
      if (value !== undefined && value > 0)
        tokens.push({
          ...base,
          kind: 'length',
          value,
          unit: unitOf(groups.lu),
        });
    }
  }
  return tokens;
}

/** Roof slope written as a percentage (rise/run × 100) → degrees. */
export function percentSlopeToDegrees(percent: number): number {
  return (Math.atan(percent / 100) * 180) / Math.PI;
}
