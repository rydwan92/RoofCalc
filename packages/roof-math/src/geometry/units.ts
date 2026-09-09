export const lengthUnits = ['mm', 'cm', 'm'] as const;
export type LengthUnit = (typeof lengthUnits)[number];
const scale: Record<LengthUnit, number> = { mm: 1, cm: 10, m: 1000 };

function assertUnit(unit: LengthUnit) {
  if (!lengthUnits.includes(unit)) throw new RangeError('unsupported_unit');
}
export function toMillimetres(value: number, unit: LengthUnit): number {
  assertUnit(unit);
  const result = value * scale[unit];
  if (!Number.isFinite(result)) throw new RangeError('non_finite_length');
  return result;
}
export function fromMillimetres(value: number, unit: LengthUnit): number {
  assertUnit(unit);
  if (!Number.isFinite(value)) throw new RangeError('non_finite_length');
  return value / scale[unit];
}
