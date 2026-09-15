import { describe, expect, it } from 'vitest';
import { resolveAutoBattenSpacing } from './batten-spacing';

describe('automatic batten spacing', () => {
  it.each([
    {
      name: 'exact fit',
      span: 4000,
      min: 320,
      max: 400,
      preferred: 400,
      intervals: 10,
      gauge: 400,
    },
    {
      name: 'nearest preferred gauge',
      span: 3700,
      min: 330,
      max: 370,
      preferred: 350,
      intervals: 11,
      gauge: 3700 / 11,
    },
    {
      name: 'range midpoint when preference is absent',
      span: 3600,
      min: 320,
      max: 400,
      preferred: undefined,
      intervals: 10,
      gauge: 360,
    },
  ])('resolves $name without drift', (fixture) => {
    const result = resolveAutoBattenSpacing({
      firstStationMm: 250,
      lastStationMm: 250 + fixture.span,
      minimumGaugeMm: fixture.min,
      maximumGaugeMm: fixture.max,
      preferredGaugeMm: fixture.preferred,
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolution');
    expect(result.intervalCount).toBe(fixture.intervals);
    expect(result.actualGaugeMm).toBeCloseTo(fixture.gauge, 10);
    expect(result.stations[0]).toBe(250);
    expect(result.stations.at(-1)).toBe(250 + fixture.span);
    expect(result.courseCount).toBe(result.intervalCount + 1);
  });

  it('uses the documented larger-gauge tie break', () => {
    const result = resolveAutoBattenSpacing({
      firstStationMm: 0,
      lastStationMm: 1200,
      minimumGaugeMm: 300,
      maximumGaugeMm: 400,
      preferredGaugeMm: 350,
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') throw new Error('expected resolution');
    expect(result.intervalCount).toBe(3);
    expect(result.actualGaugeMm).toBe(400);
  });

  it.each([
    {
      input: {
        firstStationMm: 100,
        lastStationMm: 100,
        minimumGaugeMm: 300,
        maximumGaugeMm: 400,
      },
      issue: 'invalid-regular-span',
    },
    {
      input: {
        firstStationMm: 0,
        lastStationMm: 1000,
        minimumGaugeMm: 400,
        maximumGaugeMm: 300,
      },
      issue: 'invalid-gauge-range',
    },
    {
      input: {
        firstStationMm: 0,
        lastStationMm: 100,
        minimumGaugeMm: 80,
        maximumGaugeMm: 90,
      },
      issue: 'no-valid-interval-count',
    },
  ] as const)('returns a structured unresolved result', ({ input, issue }) => {
    expect(resolveAutoBattenSpacing(input)).toMatchObject({
      status: 'unresolved',
      issues: [issue],
    });
  });

  it('keeps every generated gauge in range and the final station exact', () => {
    for (let span = 1000; span <= 20_000; span += 137) {
      const result = resolveAutoBattenSpacing({
        firstStationMm: 173,
        lastStationMm: 173 + span,
        minimumGaugeMm: 320,
        maximumGaugeMm: 390,
        preferredGaugeMm: 350,
      });
      if (result.status === 'unresolved') continue;
      expect(result.actualGaugeMm).toBeGreaterThanOrEqual(320 - 1e-7);
      expect(result.actualGaugeMm).toBeLessThanOrEqual(390 + 1e-7);
      expect(result.stations.at(-1)).toBe(173 + span);
      expect(result.stations).toHaveLength(result.intervalCount + 1);
    }
  });
});
