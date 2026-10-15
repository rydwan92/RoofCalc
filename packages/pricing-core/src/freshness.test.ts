import { describe, expect, it } from 'vitest';
import { calendarDaysBetween, classifyPriceFreshness } from './freshness';

describe('price freshness', () => {
  it('counts whole calendar days', () => {
    expect(calendarDaysBetween('2026-04-28', '2026-10-15')).toBe(170);
    expect(calendarDaysBetween('2026-10-15', '2026-10-15')).toBe(0);
    expect(calendarDaysBetween('2026-10-16', '2026-10-15')).toBe(0);
  });

  it('never presents an old open-ended observation as current', () => {
    // A retail observation from April, still "valid" because it never ends.
    expect(
      classifyPriceFreshness({ validFrom: '2026-04-28' }, '2026-10-15'),
    ).toEqual({
      freshness: 'stale',
      ageDays: 170,
      withinStatedValidity: false,
    });
    expect(
      classifyPriceFreshness({ validFrom: '2026-08-15' }, '2026-10-15')
        .freshness,
    ).toBe('aging');
    expect(
      classifyPriceFreshness({ validFrom: '2026-09-15' }, '2026-10-15')
        .freshness,
    ).toBe('current');
  });

  it('trusts an explicit, still-open validity window', () => {
    expect(
      classifyPriceFreshness(
        { validFrom: '2026-01-01', validTo: '2026-12-31' },
        '2026-10-15',
      ),
    ).toEqual({
      freshness: 'current',
      ageDays: 287,
      withinStatedValidity: true,
    });
  });

  it('is deterministic for a given reference date and policy', () => {
    const policy = { agingAfterDays: 1, staleAfterDays: 2 };
    expect(
      classifyPriceFreshness({ validFrom: '2026-10-13' }, '2026-10-15', policy)
        .freshness,
    ).toBe('aging');
  });
});
