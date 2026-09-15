const EPSILON = 1e-7;

export type MembraneCourseFitIssueCode =
  | 'invalid-span'
  | 'invalid-roll-width'
  | 'invalid-overlap'
  | 'layout-capacity-exceeded';

export interface MembraneCourseFitInput {
  spanMm: number;
  rollWidthMm: number;
  minimumOverlapMm: number;
}

export type MembraneCourseFitResult =
  | {
      status: 'resolved';
      spanMm: number;
      rollWidthMm: number;
      minimumOverlapMm: number;
      courseCount: number;
      advancePerCourseMm: number;
      effectiveSpanMm: number;
      issues: [];
    }
  | {
      status: 'unresolved';
      spanMm: number;
      issues: MembraneCourseFitIssueCode[];
    };

/**
 * Fits the minimum whole number of full-width membrane courses covering an
 * eave-to-ridge span. The first course contributes its full `rollWidthMm`;
 * every course after it contributes only `rollWidthMm - minimumOverlapMm` of
 * new up-slope coverage, the rest being consumed by the lap onto the course
 * below. Mirrors `resolveAutoBattenSpacing`'s whole-interval-fit shape, but
 * simpler: there is no gauge range to optimise, only a minimum count to
 * cover the span at all.
 */
export function resolveMembraneCourseFit(
  input: MembraneCourseFitInput,
): MembraneCourseFitResult {
  if (!Number.isFinite(input.spanMm) || input.spanMm <= EPSILON)
    return {
      status: 'unresolved',
      spanMm: input.spanMm,
      issues: ['invalid-span'],
    };
  if (!Number.isFinite(input.rollWidthMm) || input.rollWidthMm <= EPSILON)
    return {
      status: 'unresolved',
      spanMm: input.spanMm,
      issues: ['invalid-roll-width'],
    };
  if (
    !Number.isFinite(input.minimumOverlapMm) ||
    input.minimumOverlapMm < 0 ||
    input.minimumOverlapMm >= input.rollWidthMm
  )
    return {
      status: 'unresolved',
      spanMm: input.spanMm,
      issues: ['invalid-overlap'],
    };

  const advancePerCourseMm = input.rollWidthMm - input.minimumOverlapMm;
  const courseCount =
    input.spanMm <= input.rollWidthMm + EPSILON
      ? 1
      : 1 +
        Math.ceil(
          (input.spanMm - input.rollWidthMm) / advancePerCourseMm - EPSILON,
        );
  if (!Number.isSafeInteger(courseCount) || courseCount > 100_000)
    return {
      status: 'unresolved',
      spanMm: input.spanMm,
      issues: ['layout-capacity-exceeded'],
    };

  const effectiveSpanMm =
    input.rollWidthMm + (courseCount - 1) * advancePerCourseMm;
  return {
    status: 'resolved',
    spanMm: input.spanMm,
    rollWidthMm: input.rollWidthMm,
    minimumOverlapMm: input.minimumOverlapMm,
    courseCount,
    advancePerCourseMm,
    effectiveSpanMm,
    issues: [],
  };
}
