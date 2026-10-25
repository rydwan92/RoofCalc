import { describe, expect, it } from 'vitest';
import { fitBattenEndOffset, resolveAutoBattenSpacing } from './batten-spacing';

describe('automatic batten spacing', () => {
  it.each([
    { minimumGaugeMm: Number.NaN },
    { maximumGaugeMm: Number.POSITIVE_INFINITY },
    { minimumGaugeMm: -1 },
    { minimumGaugeMm: 0 },
    { firstStationMm: Number.NaN },
    { lastStationMm: Number.POSITIVE_INFINITY },
    { preferredGaugeMm: 329 },
    { preferredGaugeMm: 361 },
    { minimumGaugeMm: 1e-20, maximumGaugeMm: 2e-20 },
  ])('fails safe for invalid or unbounded input %o', (change) => {
    expect(
      resolveAutoBattenSpacing({
        firstStationMm: 250,
        lastStationMm: 7380,
        minimumGaugeMm: 330,
        maximumGaugeMm: 360,
        ...change,
      }).status,
    ).toBe('unresolved');
  });

  it('exposes the hand-checked 713 cm explanation without UI recomputation', () => {
    const result = resolveAutoBattenSpacing({
      firstStationMm: 250,
      lastStationMm: 7380,
      minimumGaugeMm: 330,
      maximumGaugeMm: 360,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      regularSpanMm: 7130,
      minimumGaugeMm: 330,
      maximumGaugeMm: 360,
      targetGaugeMm: 345,
      minimumIntervalCount: 20,
      maximumIntervalCount: 21,
      intervalCount: 21,
      courseCount: 22,
    });
    if (result.status !== 'resolved') throw new Error('resolved');
    expect(result.actualGaugeMm).toBeCloseTo(339.5238095, 7);
    expect(
      result.stations
        .slice(1)
        .every((station, index) => station > result.stations[index]!),
    ).toBe(true);
  });
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

describe('fitting the top batten (VNext-14)', () => {
  const range = { minimumGaugeMm: 402, maximumGaugeMm: 418 };

  it('finds the nearest top gaps when no equal rows fit (hand-checked)', () => {
    // 4300 mm: 11 intervals need >= 4422, 10 allow <= 4180 — nothing fits.
    expect(
      resolveAutoBattenSpacing({
        firstStationMm: 0,
        lastStationMm: 4300,
        ...range,
      }).status,
    ).toBe('unresolved');
    const fit = fitBattenEndOffset({
      regularSpansMm: [4300],
      offsetMm: 200,
      ...range,
    });
    // Gap +120 -> span 4180 = 10 x 418; gap -122 -> span 4422 = 11 x 402.
    expect(fit?.larger).toEqual({ offsetMm: 320, changeMm: 120 });
    expect(fit?.smaller).toEqual({ offsetMm: 78, changeMm: -122 });
    expect(fit?.nearest).toBe(fit?.larger);
    expect(
      resolveAutoBattenSpacing({
        firstStationMm: 0,
        lastStationMm: 4300 - 120,
        ...range,
      }),
    ).toMatchObject({ status: 'resolved', intervalCount: 10 });
  });

  it('never proposes a negative top gap', () => {
    const fit = fitBattenEndOffset({
      regularSpansMm: [4300],
      offsetMm: 40,
      ...range,
    });
    expect(fit?.smaller).toBeUndefined();
    expect(fit?.nearest).toEqual({ offsetMm: 160, changeMm: 120 });
  });

  it('fits every plane with one shared top gap', () => {
    // 4250: fits for d in [70, 230] or [-348, -172]; 4300: [120, 280] or
    // [-298, -122]. Both: [120, 230] and [-298, -172].
    const fit = fitBattenEndOffset({
      regularSpansMm: [4300, 4250],
      offsetMm: 200,
      ...range,
    });
    expect(fit?.larger?.changeMm).toBe(120);
    expect(fit?.smaller?.changeMm).toBe(-172);
  });

  it('rounds the gap to whole millimetres toward the inside', () => {
    const fit = fitBattenEndOffset({
      regularSpansMm: [4300.3],
      offsetMm: 40,
      ...range,
    });
    expect(fit?.nearest.offsetMm).toBe(161);
    const gauge = (4300.3 - (161 - 40)) / 10;
    expect(gauge).toBeLessThanOrEqual(418);
    expect(gauge).toBeGreaterThanOrEqual(402);
  });

  it('returns nothing when the current gap already fits or the input is invalid', () => {
    expect(
      fitBattenEndOffset({
        regularSpansMm: [4100],
        offsetMm: 40,
        ...range,
      }),
    ).toBeUndefined();
    expect(
      fitBattenEndOffset({
        regularSpansMm: [4300],
        offsetMm: 40,
        minimumGaugeMm: 420,
        maximumGaugeMm: 410,
      }),
    ).toBeUndefined();
    expect(
      fitBattenEndOffset({ regularSpansMm: [], offsetMm: 40, ...range }),
    ).toBeUndefined();
  });
});
