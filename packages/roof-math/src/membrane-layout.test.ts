import { describe, expect, it } from 'vitest';
import { resolveMembraneCourseFit } from './membrane-layout';

describe('membrane course fit', () => {
  it.each([
    { spanMm: Number.NaN },
    { spanMm: 0 },
    { spanMm: -1 },
    { rollWidthMm: 0 },
    { rollWidthMm: Number.NaN },
    { minimumOverlapMm: -1 },
    { minimumOverlapMm: Number.NaN },
  ])('fails safe for invalid input %o', (change) => {
    expect(
      resolveMembraneCourseFit({
        spanMm: 10_000,
        rollWidthMm: 1500,
        minimumOverlapMm: 100,
        ...change,
      }).status,
    ).toBe('unresolved');
  });

  it('rejects an overlap that never advances up-slope', () => {
    expect(
      resolveMembraneCourseFit({
        spanMm: 10_000,
        rollWidthMm: 1500,
        minimumOverlapMm: 1500,
      }),
    ).toMatchObject({ status: 'unresolved', issues: ['invalid-overlap'] });
    expect(
      resolveMembraneCourseFit({
        spanMm: 10_000,
        rollWidthMm: 1500,
        minimumOverlapMm: 1600,
      }),
    ).toMatchObject({ status: 'unresolved', issues: ['invalid-overlap'] });
  });

  it('exposes the hand-checked 8-course explanation', () => {
    const result = resolveMembraneCourseFit({
      spanMm: 10_000,
      rollWidthMm: 1500,
      minimumOverlapMm: 100,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      courseCount: 8,
      advancePerCourseMm: 1400,
      effectiveSpanMm: 11_300,
    });
  });

  it('uses exactly one course when the span fits within one roll width', () => {
    for (const spanMm of [1, 1499, 1500]) {
      const result = resolveMembraneCourseFit({
        spanMm,
        rollWidthMm: 1500,
        minimumOverlapMm: 100,
      });
      expect(result).toMatchObject({ status: 'resolved', courseCount: 1 });
      if (result.status === 'resolved')
        expect(result.effectiveSpanMm).toBe(1500);
    }
  });

  it('adds one course as soon as the span exceeds a single roll width', () => {
    const result = resolveMembraneCourseFit({
      spanMm: 1501,
      rollWidthMm: 1500,
      minimumOverlapMm: 100,
    });
    expect(result).toMatchObject({
      status: 'resolved',
      courseCount: 2,
      effectiveSpanMm: 2900,
    });
  });

  it('never under-covers the span across a sweep of values', () => {
    for (let spanMm = 100; spanMm <= 50_000; spanMm += 137) {
      const result = resolveMembraneCourseFit({
        spanMm,
        rollWidthMm: 1500,
        minimumOverlapMm: 150,
      });
      if (result.status !== 'resolved') continue;
      expect(result.effectiveSpanMm).toBeGreaterThanOrEqual(spanMm - 1e-7);
      // Never one course more than strictly necessary.
      const oneFewer =
        result.rollWidthMm +
        (result.courseCount - 2) * result.advancePerCourseMm;
      if (result.courseCount > 1) expect(oneFewer).toBeLessThan(spanMm);
    }
  });

  it('fails safe rather than allocating an unbounded course count', () => {
    expect(
      resolveMembraneCourseFit({
        spanMm: 200_000,
        rollWidthMm: 1,
        minimumOverlapMm: 0,
      }),
    ).toMatchObject({
      status: 'unresolved',
      issues: ['layout-capacity-exceeded'],
    });
  });
});
