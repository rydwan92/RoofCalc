import { describe, expect, it } from 'vitest';
import { planMembraneRolls, resolveMembraneCourseFit } from './membrane-layout';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveMembraneLayout,
} from './index';

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

describe('V47 membrane roll plan — end laps along the roll (second lap axis)', () => {
  it('needs no end lap when every course is cut from fresh roll length', () => {
    expect(
      planMembraneRolls({
        courseLengthsMm: [10000, 10000, 10000],
        rollLengthMm: 50000,
        endOverlapMm: 100,
      }),
    ).toEqual({
      status: 'resolved',
      rollCount: 1,
      endLapCount: 0,
      materialLengthMm: 30000,
      unusedRemnantMm: 0,
      issues: [],
    });
  });

  it('adds one lap where a roll runs out inside a course (hand check)', () => {
    // 8 × 8 m = 64 m: roll 1 covers courses 1–6 (48 m) + 2 m of course 7,
    // roll 2 laps 100 mm and supplies 6,1 m + course 8 (8 m).
    const plan = planMembraneRolls({
      courseLengthsMm: Array.from({ length: 8 }, () => 8000),
      rollLengthMm: 50000,
      endOverlapMm: 100,
    });
    expect(plan).toMatchObject({
      status: 'resolved',
      rollCount: 2,
      endLapCount: 1,
      materialLengthMm: 64100,
    });
  });

  it('splices a course longer than one roll as often as needed', () => {
    // 120 m course, 50 m rolls, 0,2 m laps: 50 + 49,8 + 20,6 → 3 rolls, 2 laps.
    expect(
      planMembraneRolls({
        courseLengthsMm: [120000],
        rollLengthMm: 50000,
        endOverlapMm: 200,
      }),
    ).toMatchObject({ rollCount: 3, endLapCount: 2, materialLengthMm: 120400 });
  });

  it('leaves a remnant too short to lap and starts a new roll', () => {
    const plan = planMembraneRolls({
      courseLengthsMm: [49950, 5000],
      rollLengthMm: 50000,
      endOverlapMm: 100,
    });
    expect(plan).toMatchObject({
      rollCount: 2,
      endLapCount: 0,
      unusedRemnantMm: 50,
    });
  });

  it('rejects a roll that cannot carry two laps', () => {
    expect(
      planMembraneRolls({
        courseLengthsMm: [1000],
        rollLengthMm: 150,
        endOverlapMm: 100,
      }).status,
    ).toBe('unresolved');
  });

  it('includes end-lap area in the gross membrane area of a plane', () => {
    const template = gableTemplateFromAssembly(assemblyDefaults, {
      id: 'template:gable-1',
      buildingLengthMm: 30000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    });
    const result = resolveMembraneLayout({
      template,
      layout: { enabled: true },
      product: {
        rollWidthMm: 1500,
        rollLengthMm: 50000,
        minimumOverlapMm: 100,
      },
    });
    const plane = result.planes[0]!;
    expect(plane.endLapCount).toBeGreaterThan(0);
    expect(plane.endOverlapAreaMm2).toBeCloseTo(plane.endLapCount * 100 * 1500);
    expect(plane.grossAreaMm2).toBeCloseTo(
      plane.courseCount * 1500 * plane.courseWidthMm + plane.endOverlapAreaMm2,
    );
  });
});
