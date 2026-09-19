/**
 * Commercial sections for ONE continuous straight run (a gutter along one eave
 * or one downpipe). A run legitimately consists of several stock pieces, so it
 * is never handed to `procurement-core` as one indivisible blank.
 *
 * Policy `no-reuse-between-runs`: each run is assembled from whole commercial
 * sections; the last one may be cut and its remainder is NOT assumed to be
 * reused elsewhere. That is conservative, and the result says so.
 *
 * Choice: fewest sections (fewest joints), then least commercial overage, then
 * longer sections first. Bounded: only multisets of the minimal count are
 * enumerated, and that count is always feasible (all longest sections).
 */
export type SectionPolicy = 'no-reuse-between-runs';

/**
 * V52 purchase policy for straight gutter sections. `no-reuse-between-runs`
 * (default, KONSERWATYWNY) buys every run from whole sections; with
 * `reuse-straight-remainders` the user states that a straight remainder cut
 * from one run may be installed as a straight piece of another run. The
 * installed assembly (pieces, joints, connectors) is identical in both; only
 * the purchase changes. No source forbids or requires it, so it is never the
 * default.
 */
export type GutterPurchasePolicy =
  'no-reuse-between-runs' | 'reuse-straight-remainders';

export interface SectionAssembly {
  policy: SectionPolicy;
  requiredLengthMm: number;
  /** Stock lengths used, longest first. */
  sectionsMm: number[];
  purchasedLengthMm: number;
  /** Bought beyond the requirement because stock comes in fixed lengths. */
  commercialOverageMm: number;
  /** Joints inside the run: sections − 1. */
  joints: number;
  /** A section is cut to finish the run. */
  finalCut: boolean;
  /**
   * V52: installed piece lengths in laying order — whole sections, longest
   * first, then the cut piece. Joint stations follow from them.
   */
  piecesMm: number[];
  /** Distance of every joint from the run start, mm. */
  jointStationsMm: number[];
}

const MAX_COMBINATIONS = 20_000;
const EPS = 1e-6;

export function planCommercialSections(
  requiredLengthMm: number,
  stockLengthsMm: readonly number[],
): SectionAssembly {
  const lengths = [
    ...new Set(stockLengthsMm.filter((value) => value > 0)),
  ].sort((a, b) => b - a);
  if (!(requiredLengthMm > 0) || !lengths.length)
    throw new RangeError('invalid_section_input');
  const longest = lengths[0]!;
  const count = Math.max(1, Math.ceil(requiredLengthMm / longest - 1e-9));
  let best: number[] = Array<number>(count).fill(longest);
  let bestTotal = longest * count;
  let explored = 0;
  const pick: number[] = [];
  const search = (from: number, remaining: number, total: number) => {
    if (explored > MAX_COMBINATIONS) return;
    if (remaining === 0) {
      explored += 1;
      if (total >= requiredLengthMm - EPS && total < bestTotal - EPS) {
        best = [...pick];
        bestTotal = total;
      }
      return;
    }
    for (let index = from; index < lengths.length; index += 1) {
      const length = lengths[index]!;
      // Lengths are descending: once the rest cannot reach the requirement
      // even at this length, no shorter length can either.
      if (total + length * remaining < requiredLengthMm - EPS) break;
      pick.push(length);
      search(index, remaining - 1, total + length);
      pick.pop();
    }
  };
  search(0, count, 0);
  const overage = Math.max(0, bestTotal - requiredLengthMm);
  const piecesMm = best.map((length, index) =>
    index === best.length - 1 ? length - overage : length,
  );
  const jointStationsMm: number[] = [];
  let station = 0;
  for (const piece of piecesMm.slice(0, -1)) {
    station += piece;
    jointStationsMm.push(station);
  }
  return {
    piecesMm,
    jointStationsMm,
    policy: 'no-reuse-between-runs',
    requiredLengthMm,
    sectionsMm: best,
    purchasedLengthMm: bestTotal,
    commercialOverageMm: overage,
    joints: best.length - 1,
    finalCut: overage > EPS,
  };
}
