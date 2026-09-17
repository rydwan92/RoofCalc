import { fromMillimetres, type LengthUnit } from '@cieslacalc/roof-math';

/**
 * V44 display precision. Canonical geometry stays in unrounded millimetres;
 * these digits apply only when a value is printed. 0.1 cm (1 mm) is the
 * working precision of a carpenter's tape; small cut dimensions shown in mm
 * keep 0.1 mm. Diagnostic detail belongs in "Jak policzono?", not in labels.
 */
export const DISPLAY_LENGTH_PRECISION: Readonly<Record<LengthUnit, number>> = {
  mm: 1,
  cm: 1,
  m: 3,
};

export function parseDecimal(raw: string): number | null {
  const value = raw.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value)) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}
export function formatNumber(value: number, locale: string, digits = 1) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
  }).format(value);
}
export function formatLength(mm: number, unit: LengthUnit, locale: string) {
  return formatNumber(
    fromMillimetres(mm, unit),
    locale,
    DISPLAY_LENGTH_PRECISION[unit],
  );
}
/** Inputs show the exact canonical value (UX contract §5). */
export function editableLength(mm: number, unit: LengthUnit): string {
  return String(fromMillimetres(mm, unit));
}

/** Angles: 0.1°. */
export function formatAngle(deg: number, locale: string) {
  return `${formatNumber(deg, locale, 1)}°`;
}
/** Linear material totals: 0.1 m. */
export function formatMetres(mm: number, locale: string) {
  return `${formatNumber(mm / 1000, locale, 1)} m`;
}
/** Areas: 0.1 m². */
export function formatSquareMetres(mm2: number, locale: string) {
  return `${formatNumber(mm2 / 1_000_000, locale, 1)} m²`;
}
