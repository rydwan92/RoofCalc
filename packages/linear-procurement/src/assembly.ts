import type {
  InstallablePiece,
  LinearAssemblyResult,
  LinearAssemblySettings,
  LinearEndKind,
  LinearRun,
  LinearUnresolvedReason,
  LinearUnresolvedRun,
} from './model';

/**
 * Turns resolved installation runs into indivisible physical pieces
 * (V48 §2). The result is what `procurement-core` may buy stock for; nothing
 * downstream is allowed to split a piece again.
 *
 * Determinism: runs are processed in `(sequenceId, sequenceIndex, id)` order
 * and every choice below is total, so the same input always yields the same
 * pieces — a plan a roofer can re-derive on site.
 */

/**
 * Sequence indices at which a joint was already placed over a given support,
 * keyed by sequence + support. Only the recent window matters (research §2.3).
 */
type StaggerLedger = Map<string, number[]>;

const key = (sequenceId: string, supportId: string) =>
  JSON.stringify([sequenceId, supportId]);

function staggerLoad(
  ledger: StaggerLedger,
  sequenceId: string,
  supportId: string,
  sequenceIndex: number,
  window: number,
) {
  const placed = ledger.get(key(sequenceId, supportId));
  if (!placed) return 0;
  return placed.filter((index) => sequenceIndex - index < window).length;
}

function recordJoint(
  ledger: StaggerLedger,
  sequenceId: string,
  supportId: string,
  sequenceIndex: number,
) {
  const mapKey = key(sequenceId, supportId);
  const placed = ledger.get(mapKey);
  if (placed) placed.push(sequenceIndex);
  else ledger.set(mapKey, [sequenceIndex]);
}

function endAllowance(
  kind: LinearEndKind,
  settings: LinearAssemblySettings,
): number | 'unresolved-angled' | 'unresolved-unknown' {
  if (kind === 'square') return 0;
  if (kind === 'unknown') return 'unresolved-unknown';
  return settings.angledEndAllowanceMm === undefined
    ? 'unresolved-angled'
    : settings.angledEndAllowanceMm;
}

interface Station {
  atMm: number;
  supportId?: string;
}

/**
 * Splits `[0, length]` at legal stations, minimising the number of pieces.
 *
 * Backward dynamic programming over the candidate stations: `cost[i]` is the
 * fewest pieces that reach the run end from station `i`. It is exact (the
 * station count per run is small), so the planner never produces an avoidable
 * extra joint, and `Infinity` means the run genuinely cannot be assembled.
 */
function minimumPieceCounts(
  stations: Station[],
  lengthMm: number,
  startAllowanceMm: number,
  endAllowanceMm: number,
  settings: LinearAssemblySettings,
  supportsAt: number[],
): number[] {
  const last = stations.length - 1;
  const cost = new Array<number>(stations.length).fill(
    Number.POSITIVE_INFINITY,
  );
  cost[last] = 0;
  for (let i = last - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j <= last; j += 1) {
      if (!Number.isFinite(cost[j]!)) continue;
      if (
        !edgeIsLegal(
          i,
          j,
          stations,
          lengthMm,
          startAllowanceMm,
          endAllowanceMm,
          settings,
          supportsAt,
        )
      )
        continue;
      cost[i] = Math.min(cost[i]!, 1 + cost[j]!);
    }
  }
  return cost;
}

function edgeIsLegal(
  i: number,
  j: number,
  stations: Station[],
  lengthMm: number,
  startAllowanceMm: number,
  endAllowanceMm: number,
  settings: LinearAssemblySettings,
  supportsAt: number[],
) {
  const from = stations[i]!.atMm;
  const to = stations[j]!.atMm;
  const installed = to - from;
  if (installed <= 0) return false;
  const allowance =
    (from === 0 ? startAllowanceMm : 0) +
    (to === lengthMm ? endAllowanceMm : 0);
  if (installed + allowance > settings.maximumPieceLengthMm) return false;
  /**
   * A run that is short on its own is geometry, not a planner choice, so the
   * whole-run piece is never rejected for being below the minimum. Only a
   * piece the planner *creates* by splitting must satisfy the minimum and the
   * minimum support count (research §2.2).
   */
  const isWholeRun = from === 0 && to === lengthMm;
  if (isWholeRun) return true;
  if (installed < settings.minimumPieceLengthMm) return false;
  const resting = supportsAt.filter((at) => at >= from && at <= to).length;
  return resting >= settings.minimumSupportsPerPiece;
}

function unresolvedRun(
  run: LinearRun,
  reason: LinearUnresolvedReason,
): LinearUnresolvedRun {
  return {
    runId: run.id,
    sequenceId: run.sequenceId,
    lengthMm: run.lengthMm,
    reason,
  };
}

function planRun(
  run: LinearRun,
  settings: LinearAssemblySettings,
  ledger: StaggerLedger,
): {
  pieces: InstallablePiece[];
  unresolved?: LinearUnresolvedRun;
  staggerRelaxed: boolean;
} {
  if (!Number.isFinite(run.lengthMm) || run.lengthMm <= 0)
    return {
      pieces: [],
      unresolved: unresolvedRun(run, 'invalid-run'),
      staggerRelaxed: false,
    };

  if (settings.policy === 'manual-required')
    return {
      pieces: [],
      unresolved: unresolvedRun(run, 'manual-decision-required'),
      staggerRelaxed: false,
    };

  const start = endAllowance(run.startEnd, settings);
  const end = endAllowance(run.endEnd, settings);
  for (const value of [start, end])
    if (value === 'unresolved-unknown')
      return {
        pieces: [],
        unresolved: unresolvedRun(run, 'unknown-end-geometry'),
        staggerRelaxed: false,
      };
  for (const value of [start, end])
    if (value === 'unresolved-angled')
      return {
        pieces: [],
        unresolved: unresolvedRun(run, 'angled-end-allowance-required'),
        staggerRelaxed: false,
      };
  const startAllowanceMm = start as number;
  const endAllowanceMm = end as number;

  const wholeBlank = run.lengthMm + startAllowanceMm + endAllowanceMm;
  if (wholeBlank <= settings.maximumPieceLengthMm)
    return {
      pieces: [
        piece(
          run,
          0,
          run.lengthMm,
          run.startEnd,
          run.endEnd,
          startAllowanceMm + endAllowanceMm,
          0,
        ),
      ],
      staggerRelaxed: false,
    };

  if (settings.policy === 'continuous-piece-required')
    return {
      pieces: [],
      unresolved: unresolvedRun(run, 'run-longer-than-available-piece'),
      staggerRelaxed: false,
    };

  if (settings.policy === 'joint-along-supporting-member')
    return splitContinuously(run, settings, startAllowanceMm, endAllowanceMm);

  return splitAtSupports(
    run,
    settings,
    startAllowanceMm,
    endAllowanceMm,
    ledger,
  );
}

function piece(
  run: LinearRun,
  fromMm: number,
  toMm: number,
  startEnd: LinearEndKind,
  endEnd: LinearEndKind,
  fabricationAllowanceMm: number,
  index: number,
  startJointSupportId?: string,
  endJointSupportId?: string,
): InstallablePiece {
  const installedLengthMm = toMm - fromMm;
  return {
    id: `${run.id}#${index}`,
    runId: run.id,
    sequenceId: run.sequenceId,
    sequenceIndex: run.sequenceIndex,
    fromMm,
    toMm,
    installedLengthMm,
    requiredBlankLengthMm: installedLengthMm + fabricationAllowanceMm,
    fabricationAllowanceMm,
    startEnd,
    endEnd,
    ...(startJointSupportId === undefined ? {} : { startJointSupportId }),
    ...(endJointSupportId === undefined ? {} : { endJointSupportId }),
  };
}

/**
 * Counter-batten case: the member below supports the run everywhere, so the
 * only constraints are the longest stock and the minimum piece. Pieces are cut
 * as evenly as the millimetre grid allows, which avoids a useless offcut-sized
 * last piece and keeps the plan reproducible.
 */
function splitContinuously(
  run: LinearRun,
  settings: LinearAssemblySettings,
  startAllowanceMm: number,
  endAllowanceMm: number,
): {
  pieces: InstallablePiece[];
  unresolved?: LinearUnresolvedRun;
  staggerRelaxed: boolean;
} {
  const allowanceTotal = startAllowanceMm + endAllowanceMm;
  let count = Math.ceil(
    (run.lengthMm + allowanceTotal) / settings.maximumPieceLengthMm,
  );
  for (; count <= 4096; count += 1) {
    const base = Math.floor(run.lengthMm / count);
    let remainder = run.lengthMm - base * count;
    const lengths: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      lengths.push(base + extra);
    }
    const fits = lengths.every((length, index) => {
      const allowance =
        (index === 0 ? startAllowanceMm : 0) +
        (index === count - 1 ? endAllowanceMm : 0);
      return (
        length + allowance <= settings.maximumPieceLengthMm &&
        length >= settings.minimumPieceLengthMm
      );
    });
    if (!fits) continue;
    let cursor = 0;
    const pieces = lengths.map((length, index) => {
      const from = cursor;
      cursor += length;
      const allowance =
        (index === 0 ? startAllowanceMm : 0) +
        (index === count - 1 ? endAllowanceMm : 0);
      return piece(
        run,
        from,
        cursor,
        index === 0 ? run.startEnd : 'square',
        index === count - 1 ? run.endEnd : 'square',
        allowance,
        index,
      );
    });
    return { pieces, staggerRelaxed: false };
  }
  return {
    pieces: [],
    unresolved: unresolvedRun(run, 'no-legal-joint-position'),
    staggerRelaxed: false,
  };
}

/**
 * Tile-batten case: a joint may only sit over a resolved support
 * (research §2.1). Stations are the supports strictly inside the run; the DP
 * picks the fewest pieces, and among the paths that keep that optimum the
 * least-loaded support wins so joints stagger between courses (research §2.3).
 */
function splitAtSupports(
  run: LinearRun,
  settings: LinearAssemblySettings,
  startAllowanceMm: number,
  endAllowanceMm: number,
  ledger: StaggerLedger,
): {
  pieces: InstallablePiece[];
  unresolved?: LinearUnresolvedRun;
  staggerRelaxed: boolean;
} {
  const supportsAt = run.supports
    .map((support) => support.atMm)
    .filter((at) => Number.isFinite(at) && at >= 0 && at <= run.lengthMm)
    .sort((a, b) => a - b);
  const inner = run.supports
    .filter((support) => support.atMm > 0 && support.atMm < run.lengthMm)
    .slice()
    .sort((a, b) => a.atMm - b.atMm || (a.supportId < b.supportId ? -1 : 1));
  const stations: Station[] = [
    { atMm: 0 },
    ...inner.map((support) => ({
      atMm: support.atMm,
      supportId: support.supportId,
    })),
    { atMm: run.lengthMm },
  ];
  const cost = minimumPieceCounts(
    stations,
    run.lengthMm,
    startAllowanceMm,
    endAllowanceMm,
    settings,
    supportsAt,
  );
  if (!Number.isFinite(cost[0]!))
    return {
      pieces: [],
      unresolved: unresolvedRun(run, 'no-legal-joint-position'),
      staggerRelaxed: false,
    };

  const window = settings.stagger?.consecutiveRuns ?? 0;
  const limit = settings.stagger?.joints ?? Number.POSITIVE_INFINITY;
  const pieces: InstallablePiece[] = [];
  let staggerRelaxed = false;
  let current = 0;
  let index = 0;
  let previousSupportId: string | undefined;
  while (stations[current]!.atMm < run.lengthMm) {
    const candidates: number[] = [];
    for (let j = current + 1; j < stations.length; j += 1)
      if (
        Number.isFinite(cost[j]!) &&
        cost[j]! + 1 === cost[current]! &&
        edgeIsLegal(
          current,
          j,
          stations,
          run.lengthMm,
          startAllowanceMm,
          endAllowanceMm,
          settings,
          supportsAt,
        )
      )
        candidates.push(j);
    // `cost[current]` is finite, so an optimality-preserving edge always exists.
    const scored = candidates.map((j) => {
      const supportId = stations[j]!.supportId;
      const load =
        supportId === undefined || window === 0
          ? 0
          : staggerLoad(
              ledger,
              run.sequenceId,
              supportId,
              run.sequenceIndex,
              window,
            );
      return { j, load, within: load < limit };
    });
    const preferred = scored.filter((entry) => entry.within);
    const pool = preferred.length > 0 ? preferred : scored;
    if (preferred.length === 0 && scored.some((entry) => !entry.within))
      staggerRelaxed = true;
    /**
     * Least-loaded support first (stagger), then the station nearest an even
     * division of what is left.
     *
     * Balance matters commercially: splitting 8 m as 4 m + 4 m fills two 4 m
     * lengths exactly, while 4,8 m + 3,2 m needs a 5 m and a 4 m and throws
     * away a metre. Taking the furthest legal station would do the latter.
     * The station index breaks remaining ties so the plan stays deterministic.
     */
    const cursorMm = stations[current]!.atMm;
    const target = cursorMm + (run.lengthMm - cursorMm) / cost[current]!;
    pool.sort(
      (a, b) =>
        a.load - b.load ||
        Math.abs(stations[a.j]!.atMm - target) -
          Math.abs(stations[b.j]!.atMm - target) ||
        b.j - a.j,
    );
    const chosen = pool[0]!.j;
    const supportId = stations[chosen]!.supportId;
    const from = stations[current]!.atMm;
    const to = stations[chosen]!.atMm;
    const isFirst = from === 0;
    const isLast = to === run.lengthMm;
    pieces.push(
      piece(
        run,
        from,
        to,
        isFirst ? run.startEnd : 'square',
        isLast ? run.endEnd : 'square',
        (isFirst ? startAllowanceMm : 0) + (isLast ? endAllowanceMm : 0),
        index,
        previousSupportId,
        supportId,
      ),
    );
    if (supportId !== undefined)
      recordJoint(ledger, run.sequenceId, supportId, run.sequenceIndex);
    previousSupportId = supportId;
    current = chosen;
    index += 1;
  }
  return { pieces, staggerRelaxed };
}

export function planLinearAssembly(input: {
  runs: readonly LinearRun[];
  settings: LinearAssemblySettings;
}): LinearAssemblyResult {
  const { settings } = input;
  const runs = input.runs
    .slice()
    .sort(
      (a, b) =>
        (a.sequenceId < b.sequenceId
          ? -1
          : a.sequenceId > b.sequenceId
            ? 1
            : 0) ||
        a.sequenceIndex - b.sequenceIndex ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
  const ledger: StaggerLedger = new Map();
  const pieces: InstallablePiece[] = [];
  const unresolved: LinearUnresolvedRun[] = [];
  let staggerRelaxed = false;
  let resolvedRunCount = 0;
  for (const run of runs) {
    const planned = planRun(run, settings, ledger);
    staggerRelaxed = staggerRelaxed || planned.staggerRelaxed;
    if (planned.unresolved) {
      unresolved.push(planned.unresolved);
      continue;
    }
    resolvedRunCount += 1;
    pieces.push(...planned.pieces);
  }
  const installedLengthMm = pieces.reduce(
    (total, item) => total + item.installedLengthMm,
    0,
  );
  const fabricationAllowanceMm = pieces.reduce(
    (total, item) => total + item.fabricationAllowanceMm,
    0,
  );
  const status: LinearAssemblyResult['status'] =
    unresolved.length === 0
      ? 'resolved'
      : pieces.length === 0
        ? 'unresolved'
        : 'partial';
  return {
    status,
    policy: settings.policy,
    pieces,
    unresolved,
    summary: {
      runCount: runs.length,
      resolvedRunCount,
      pieceCount: pieces.length,
      jointCount: pieces.length - resolvedRunCount,
      installedLengthMm,
      requiredBlankLengthMm: installedLengthMm + fabricationAllowanceMm,
      fabricationAllowanceMm,
      staggerRelaxed,
    },
  };
}

/**
 * Package-internal building blocks for the V49 stock-aware planner. Not part
 * of the public barrel: callers use `planLinearAssembly` or
 * `planStockAwareAssembly`, never these.
 */
export { endAllowance as runEndAllowance, piece as buildInstallablePiece };
