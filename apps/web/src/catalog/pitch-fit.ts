/**
 * Whether a covering's published minimum pitch allows the roof's pitch.
 * Technical catalogue data only; it neither hides nor changes a product.
 */
export type PitchFit = 'fits' | 'too-flat' | 'unknown';

export function pitchFit(
  minPitchDeg: number | undefined,
  roofPitchDeg: number | undefined,
): PitchFit {
  if (
    minPitchDeg === undefined ||
    roofPitchDeg === undefined ||
    !Number.isFinite(minPitchDeg) ||
    !Number.isFinite(roofPitchDeg)
  )
    return 'unknown';
  // 0.05° tolerance: stored pitches carry decimal rounding.
  return roofPitchDeg + 0.05 >= minPitchDeg ? 'fits' : 'too-flat';
}

const ORDER: Record<PitchFit, number> = { fits: 0, unknown: 1, 'too-flat': 2 };

/** Suitable products first; the catalogue's own order is kept within groups. */
export function orderByPitchFit<T>(
  items: readonly T[],
  minPitch: (item: T) => number | undefined,
  roofPitchDeg: number | undefined,
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      rank: ORDER[pitchFit(minPitch(item), roofPitchDeg)],
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}
