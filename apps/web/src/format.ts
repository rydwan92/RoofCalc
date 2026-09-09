import { fromMillimetres, type LengthUnit } from '@cieslacalc/roof-math';

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
    unit === 'm' ? 3 : unit === 'cm' ? 2 : 1,
  );
}
export function editableLength(mm: number, unit: LengthUnit): string {
  return String(fromMillimetres(mm, unit));
}
