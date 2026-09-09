import { describe, expect, it } from 'vitest';
import { fromMillimetres, toMillimetres, type LengthUnit } from './units';

describe('canonical units', () => {
  it.each([
    ['mm', 4300],
    ['cm', 430],
    ['m', 4.3],
  ] as const)('converts %s in both directions', (unit, value) => {
    expect(fromMillimetres(4300, unit)).toBe(value);
    expect(toMillimetres(value, unit)).toBe(4300);
  });
  it('retains fractional precision', () => {
    const value = 5249.374921;
    expect(toMillimetres(fromMillimetres(value, 'm'), 'm')).toBeCloseTo(
      value,
      10,
    );
  });
  it('rejects unsupported units and non-finite lengths', () => {
    expect(() => toMillimetres(1, 'ft' as LengthUnit)).toThrow();
    expect(() => fromMillimetres(1, 'ft' as LengthUnit)).toThrow();
    expect(() => toMillimetres(Infinity, 'm')).toThrow();
    expect(() => fromMillimetres(NaN, 'm')).toThrow();
    expect(() => toMillimetres(Number.MAX_VALUE, 'm')).toThrow();
  });
});
