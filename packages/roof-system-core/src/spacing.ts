/**
 * Evenly distributed positions along a length — the batten philosophy applied
 * to hooks and clamps. The number of intervals is the smallest that keeps
 * every interval ≤ the maximum, and each position is computed directly from
 * its index, so rounding never accumulates.
 */
export interface SpacingPlan {
  positionsMm: number[];
  /** The actual (equal) interval between positions, mm. */
  intervalMm: number;
  count: number;
}

export function distributeAlongLength(args: {
  lengthMm: number;
  maxSpacingMm: number;
  /** Distance of the first and last position from the ends (≥ 0). */
  endOffsetMm?: number;
}): SpacingPlan {
  const { lengthMm, maxSpacingMm } = args;
  if (!(lengthMm > 0) || !(maxSpacingMm > 0))
    throw new RangeError('invalid_spacing_input');
  const offset = Math.min(Math.max(0, args.endOffsetMm ?? 0), lengthMm / 2);
  const span = lengthMm - 2 * offset;
  if (span <= 1e-9)
    return { positionsMm: [lengthMm / 2], intervalMm: 0, count: 1 };
  const intervals = Math.max(1, Math.ceil(span / maxSpacingMm - 1e-9));
  const positionsMm = Array.from(
    { length: intervals + 1 },
    (_, index) => offset + (span * index) / intervals,
  );
  return { positionsMm, intervalMm: span / intervals, count: intervals + 1 };
}

/**
 * V52 hooks that avoid gutter joints.
 *
 * SOURCE REQUIREMENT (Galeco STAL² installation guide): hooks at most every
 * `maxSpacingMm` and never where two gutter elements are joined.
 *
 * ROOFCALC DISTRIBUTION STRATEGY (not a manufacturer rule): a hook must keep
 * `clearanceMm` from every joint station. Starting from the fewest hooks, the
 * even positions (each computed from its index — no accumulated rounding) are
 * tried; a position inside a joint zone moves to the nearer zone edge. If a
 * gap would then exceed the maximum, one more hook is added and the even
 * distribution is tried again. As a last resort every free span between joint
 * zones is distributed on its own, which is always valid.
 */
export interface JointAwareSpacingPlan extends SpacingPlan {
  /** Joint stations the hooks were kept away from, mm from the start. */
  jointStationsMm: number[];
  clearanceMm: number;
  /** Largest gap between consecutive hooks, including across joints. */
  maxGapMm: number;
}

export function distributeAvoidingJoints(args: {
  lengthMm: number;
  maxSpacingMm: number;
  jointStationsMm: readonly number[];
  clearanceMm: number;
  endOffsetMm?: number;
}): JointAwareSpacingPlan {
  const { lengthMm, maxSpacingMm } = args;
  if (!(lengthMm > 0) || !(maxSpacingMm > 0))
    throw new RangeError('invalid_spacing_input');
  // The gap across a joint is 2 × clearance; it must itself respect the max.
  const clearanceMm = Math.min(Math.max(0, args.clearanceMm), maxSpacingMm / 2);
  const offset = Math.min(Math.max(0, args.endOffsetMm ?? 0), lengthMm / 2);
  const joints = [...new Set(args.jointStationsMm)]
    .filter((station) => station > 1e-6 && station < lengthMm - 1e-6)
    .sort((a, b) => a - b);
  // Free spans between the ends and the joint clearance zones.
  const spans: [number, number][] = [];
  let from = offset;
  for (const joint of joints) {
    const to = joint - clearanceMm;
    if (to > from + 1e-6) spans.push([from, to]);
    from = Math.max(from, joint + clearanceMm);
  }
  if (lengthMm - offset > from + 1e-6) spans.push([from, lengthMm - offset]);
  if (!spans.length) {
    const fallback = distributeAlongLength(args);
    return {
      ...fallback,
      jointStationsMm: joints,
      clearanceMm,
      maxGapMm: fallback.intervalMm,
    };
  }
  const zones = joints.map(
    (joint) => [joint - clearanceMm, joint + clearanceMm] as const,
  );
  const snap = (position: number) => {
    for (const [low, high] of zones)
      if (position > low + 1e-6 && position < high - 1e-6)
        return position - low <= high - position ? low : high;
    return position;
  };
  const span = lengthMm - 2 * offset;
  const minimum = Math.max(1, Math.ceil(span / maxSpacingMm - 1e-9));
  let positions: number[] | undefined;
  for (
    let intervals = minimum;
    !positions && intervals <= minimum + joints.length + 1;
    intervals += 1
  ) {
    const candidate = Array.from({ length: intervals + 1 }, (_, index) =>
      snap(offset + (span * index) / intervals),
    );
    const valid = candidate.every((position, index) => {
      if (index === 0) return true;
      const gap = position - candidate[index - 1]!;
      return gap > 1e-6 && gap <= maxSpacingMm + 1e-6;
    });
    if (valid) positions = candidate;
  }
  if (!positions) {
    positions = [];
    for (const [start, end] of spans) {
      const width = end - start;
      const intervals = Math.max(1, Math.ceil(width / maxSpacingMm - 1e-9));
      for (let index = 0; index <= intervals; index += 1) {
        const position = start + (width * index) / intervals;
        if (!positions.length || position - positions.at(-1)! > 1e-6)
          positions.push(position);
      }
    }
  }
  let maxGapMm = 0;
  for (let index = 1; index < positions.length; index += 1)
    maxGapMm = Math.max(maxGapMm, positions[index]! - positions[index - 1]!);
  return {
    positionsMm: positions,
    intervalMm: maxGapMm,
    count: positions.length,
    jointStationsMm: joints,
    clearanceMm,
    maxGapMm,
  };
}
