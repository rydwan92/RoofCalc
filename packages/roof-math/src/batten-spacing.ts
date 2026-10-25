const EPSILON = 1e-7;

export type AutoBattenSpacingIssueCode =
  | 'invalid-regular-span'
  | 'invalid-gauge-range'
  | 'invalid-preferred-gauge'
  | 'no-valid-interval-count'
  | 'layout-capacity-exceeded';

export interface AutoBattenSpacingInput {
  firstStationMm: number;
  lastStationMm: number;
  minimumGaugeMm: number;
  maximumGaugeMm: number;
  preferredGaugeMm?: number;
}

export type AutoBattenSpacingResult =
  | {
      status: 'resolved';
      firstStationMm: number;
      lastStationMm: number;
      regularSpanMm: number;
      intervalCount: number;
      courseCount: number;
      actualGaugeMm: number;
      minimumGaugeMm: number;
      maximumGaugeMm: number;
      targetGaugeMm: number;
      targetSource: 'range-midpoint' | 'provided-preference';
      selectionRule: 'nearest-target-gauge';
      minimumIntervalCount: number;
      maximumIntervalCount: number;
      stations: number[];
      issues: [];
    }
  | {
      status: 'unresolved';
      firstStationMm: number;
      lastStationMm: number;
      regularSpanMm: number;
      issues: AutoBattenSpacingIssueCode[];
    };

/**
 * Fits an integer number of equal regular-course intervals into an exact span.
 * Candidates nearest the preferred gauge (or range midpoint) win. An exact
 * distance tie selects the smaller interval count, hence the larger gauge.
 */
export function resolveAutoBattenSpacing(
  input: AutoBattenSpacingInput,
): AutoBattenSpacingResult {
  const regularSpanMm = input.lastStationMm - input.firstStationMm;
  const base = {
    firstStationMm: input.firstStationMm,
    lastStationMm: input.lastStationMm,
    regularSpanMm,
  };
  if (
    !Number.isFinite(input.firstStationMm) ||
    !Number.isFinite(input.lastStationMm) ||
    !Number.isFinite(regularSpanMm) ||
    regularSpanMm <= EPSILON
  )
    return { status: 'unresolved', ...base, issues: ['invalid-regular-span'] };
  if (
    !Number.isFinite(input.minimumGaugeMm) ||
    !Number.isFinite(input.maximumGaugeMm) ||
    input.minimumGaugeMm <= 0 ||
    input.maximumGaugeMm <= 0 ||
    input.minimumGaugeMm > input.maximumGaugeMm
  )
    return { status: 'unresolved', ...base, issues: ['invalid-gauge-range'] };
  if (
    input.preferredGaugeMm !== undefined &&
    (!Number.isFinite(input.preferredGaugeMm) ||
      input.preferredGaugeMm < input.minimumGaugeMm ||
      input.preferredGaugeMm > input.maximumGaugeMm)
  )
    return {
      status: 'unresolved',
      ...base,
      issues: ['invalid-preferred-gauge'],
    };

  const minimumIntervals = Math.ceil(
    regularSpanMm / input.maximumGaugeMm - EPSILON,
  );
  const maximumIntervals = Math.floor(
    regularSpanMm / input.minimumGaugeMm + EPSILON,
  );
  // Resource bound, not a physical roofing rule. Never allocate unbounded rows.
  if (!Number.isSafeInteger(maximumIntervals) || maximumIntervals > 100_000)
    return {
      status: 'unresolved',
      ...base,
      issues: ['layout-capacity-exceeded'],
    };
  if (minimumIntervals > maximumIntervals || maximumIntervals < 1)
    return {
      status: 'unresolved',
      ...base,
      issues: ['no-valid-interval-count'],
    };

  const target =
    input.preferredGaugeMm ?? (input.minimumGaugeMm + input.maximumGaugeMm) / 2;
  let intervalCount = Math.max(1, minimumIntervals);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (
    let candidate = Math.max(1, minimumIntervals);
    candidate <= maximumIntervals;
    candidate += 1
  ) {
    const distance = Math.abs(regularSpanMm / candidate - target);
    if (distance < bestDistance - EPSILON) {
      intervalCount = candidate;
      bestDistance = distance;
    }
  }
  const actualGaugeMm = regularSpanMm / intervalCount;
  const stations = Array.from({ length: intervalCount + 1 }, (_, index) =>
    index === intervalCount
      ? input.lastStationMm
      : input.firstStationMm + (regularSpanMm * index) / intervalCount,
  );
  return {
    status: 'resolved',
    ...base,
    intervalCount,
    courseCount: stations.length,
    actualGaugeMm,
    minimumGaugeMm: input.minimumGaugeMm,
    maximumGaugeMm: input.maximumGaugeMm,
    targetGaugeMm: target,
    targetSource:
      input.preferredGaugeMm === undefined
        ? 'range-midpoint'
        : 'provided-preference',
    selectionRule: 'nearest-target-gauge',
    minimumIntervalCount: Math.max(1, minimumIntervals),
    maximumIntervalCount: maximumIntervals,
    stations,
    issues: [],
  };
}

export interface BattenEndFitInput {
  /** Every plane's first-to-last batten span at the current offsets. */
  regularSpansMm: readonly number[];
  /**
   * The offset being moved: the eave offset of the first batten or the
   * ridge offset of the last. Either one shortens every span by its change.
   */
  offsetMm: number;
  minimumGaugeMm: number;
  maximumGaugeMm: number;
}

export interface BattenEndFit {
  /** The offset, in whole millimetres, at which every plane fits. */
  offsetMm: number;
  /** Signed change of the offset: positive moves that batten inwards. */
  changeMm: number;
}

export interface BattenEndFitOptions {
  larger?: BattenEndFit;
  smaller?: BattenEndFit;
  /** The smaller of the two changes; the larger offset on an exact tie. */
  nearest: BattenEndFit;
}

function admitsEqualIntervals(spanMm: number, min: number, max: number) {
  if (spanMm <= EPSILON) return false;
  const fewest = Math.ceil(spanMm / max - EPSILON);
  const most = Math.floor(spanMm / min + EPSILON);
  return most >= 1 && fewest <= most;
}

/**
 * VNext-14: when no whole number of equal intervals fits, one end batten
 * has to move. This finds the nearest offsets of that end, one larger and
 * one smaller, at which every plane's span admits equal courses within the
 * gauge range; it returns nothing when the current offset already fits.
 * The same rule serves both ends — usually the last batten moves, because
 * the eave detail fixes the first one.
 *
 * A span s admits n intervals exactly when n·min <= s <= n·max. Changing
 * the offset by d leaves the span s - d, so a plane fits for d in
 * [s - n·max, s - n·min]; the feasible d nearest zero on either side is an
 * endpoint of one of those intervals, so only endpoints are tested. The
 * search stays within one maximum gauge of the current offset, and the
 * offset is rounded to whole millimetres toward the inside of the feasible
 * interval (kept exact if rounding would leave it).
 */
export function fitBattenEndOffset(
  input: BattenEndFitInput,
): BattenEndFitOptions | undefined {
  const { minimumGaugeMm: min, maximumGaugeMm: max } = input;
  const spans = input.regularSpansMm;
  if (
    spans.length === 0 ||
    !spans.every((span) => Number.isFinite(span) && span > 0) ||
    !Number.isFinite(input.offsetMm) ||
    input.offsetMm < 0 ||
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    min > max
  )
    return undefined;
  const fits = (changeMm: number) =>
    spans.every((span) => admitsEqualIntervals(span - changeMm, min, max));
  if (fits(0)) return undefined;
  const candidates = new Set<number>();
  for (const span of spans) {
    const fewest = Math.max(1, Math.floor((span - max) / max));
    const most = Math.ceil((span + max) / min);
    // Resource bound, not a roofing rule.
    if (most - fewest > 10_000) return undefined;
    for (let count = fewest; count <= most; count += 1) {
      candidates.add(span - count * max);
      candidates.add(span - count * min);
    }
  }
  let larger: BattenEndFit | undefined;
  let smaller: BattenEndFit | undefined;
  for (const changeMm of candidates) {
    if (Math.abs(changeMm) > max + EPSILON || Math.abs(changeMm) <= EPSILON)
      continue;
    const exact = input.offsetMm + changeMm;
    if (exact < -EPSILON || !fits(changeMm)) continue;
    const rounded =
      changeMm > 0 ? Math.ceil(exact - EPSILON) : Math.floor(exact + EPSILON);
    const offsetMm =
      rounded >= 0 && fits(rounded - input.offsetMm)
        ? rounded
        : Math.max(0, exact);
    const fit = {
      offsetMm,
      changeMm: offsetMm - input.offsetMm,
    };
    if (changeMm > 0 && (!larger || changeMm < larger.changeMm)) larger = fit;
    if (changeMm < 0 && (!smaller || changeMm > smaller.changeMm))
      smaller = fit;
  }
  const nearest =
    larger && smaller
      ? Math.abs(smaller.changeMm) < larger.changeMm
        ? smaller
        : larger
      : (larger ?? smaller);
  return nearest
    ? {
        ...(larger ? { larger } : {}),
        ...(smaller ? { smaller } : {}),
        nearest,
      }
    : undefined;
}
