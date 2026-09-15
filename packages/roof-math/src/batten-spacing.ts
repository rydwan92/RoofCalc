const EPSILON = 1e-7;

export type AutoBattenSpacingIssueCode =
  | 'invalid-regular-span'
  | 'invalid-gauge-range'
  | 'invalid-preferred-gauge'
  | 'no-valid-interval-count';

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
    (!Number.isFinite(input.preferredGaugeMm) || input.preferredGaugeMm <= 0)
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
    stations,
    issues: [],
  };
}
