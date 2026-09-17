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

export type MembraneRollPlanIssueCode = 'invalid-roll-length';

export type MembraneRollPlanResult =
  | {
      status: 'resolved';
      rollCount: number;
      /** Joins where one roll ends inside a course and the next roll laps it. */
      endLapCount: number;
      /** Roll length consumed, including every end lap. */
      materialLengthMm: number;
      /** Roll remnants too short to start a lap, left unused. */
      unusedRemnantMm: number;
      issues: [];
    }
  | { status: 'unresolved'; issues: MembraneRollPlanIssueCode[] };

/**
 * V47 second lap axis. Courses are laid one after another from the current
 * roll. When a roll runs out inside a course the next roll continues the same
 * course with an end lap of `endOverlapMm`; a remnant no longer than one lap
 * cannot form a join and is left unused. Courses are never cut to reuse
 * offcuts in another order (disclosed as `gross-area-no-roll-reuse`).
 * Deterministic and conservative — a physical laying plan, not an optimiser.
 */
export function planMembraneRolls(input: {
  courseLengthsMm: readonly number[];
  rollLengthMm: number;
  endOverlapMm: number;
}): MembraneRollPlanResult {
  const { rollLengthMm, endOverlapMm } = input;
  if (
    !Number.isFinite(rollLengthMm) ||
    !Number.isFinite(endOverlapMm) ||
    endOverlapMm < 0 ||
    rollLengthMm <= 2 * endOverlapMm + EPSILON ||
    input.courseLengthsMm.some(
      (length) => !Number.isFinite(length) || length < 0,
    )
  )
    return { status: 'unresolved', issues: ['invalid-roll-length'] };
  let rollCount = 0;
  let endLapCount = 0;
  let remaining = 0;
  let unusedRemnantMm = 0;
  let materialLengthMm = 0;
  for (const courseLength of input.courseLengthsMm) {
    if (courseLength <= EPSILON) continue;
    if (remaining <= endOverlapMm + EPSILON) {
      unusedRemnantMm += remaining;
      remaining = rollLengthMm;
      rollCount += 1;
    }
    let need = courseLength;
    while (need > remaining + EPSILON) {
      materialLengthMm += remaining;
      need = need - remaining + endOverlapMm;
      remaining = rollLengthMm;
      rollCount += 1;
      endLapCount += 1;
    }
    materialLengthMm += need;
    remaining -= need;
  }
  return {
    status: 'resolved',
    rollCount,
    endLapCount,
    materialLengthMm,
    unusedRemnantMm,
    issues: [],
  };
}
