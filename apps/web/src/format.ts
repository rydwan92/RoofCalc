import { fromMillimetres, type LengthUnit } from '@cieslacalc/roof-math';

export const DISPLAY_LENGTH_PRECISION: Readonly<Record<LengthUnit, number>> = {
  mm: 1,
  cm: 2,
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
export function editableLength(mm: number, unit: LengthUnit): string {
  return String(fromMillimetres(mm, unit));
}
