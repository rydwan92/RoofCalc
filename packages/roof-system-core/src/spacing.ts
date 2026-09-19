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
