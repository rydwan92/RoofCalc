import {
  comparePlanScores,
  createCuttingPlan,
  type CuttingPlan,
  type CuttingSettings,
  type OptimizationObjective,
  type PlanScore,
  type SolverLimits,
  type StockClassId,
  type StockOption,
} from '@cieslacalc/procurement-core';
import {
  buildInstallablePiece,
  planLinearAssembly,
  runEndAllowance,
} from './assembly';
import type {
  InstallablePiece,
  LinearAssemblyResult,
  LinearAssemblySettings,
  LinearRun,
} from './model';
import { installablePiecesToRequiredPieces } from './required-pieces';

/**
 * V49 — stock-aware choice between *legal* assemblies.
 *
 * V48 split every run on its own (fewest pieces, evenly balanced) and only
 * then asked `procurement-core` to pack the pieces. Piece lengths therefore
 * ignored the stock they would be cut from. Here the split of each run is
 * chosen from a bounded set of legal candidates *by the final purchase plan*:
 * every candidate assembly is priced by `procurement-core` itself, so there is
 * exactly one stock accounting in the repository, and the score is always the
 * score of the real, global plan in which pieces from different runs share
 * commercial lengths.
 *
 * What commercial optimisation may never do: make an illegal joint legal.
 * Every candidate is generated from the same legality rules as V48 (resolved
 * support stations for battens, minimum piece, minimum supports, allowances),
 * and the stagger rule is a constraint the search may not worsen.
 *
 * Search, in order:
 *  1. The V48 assembly is the starting state, so V49 can never be worse.
 *  2. If the whole bounded space is small it is enumerated exhaustively.
 *  3. Otherwise a deterministic first-improvement local search moves groups of
 *     identical runs between candidates, bounded by `maxEvaluations`.
 *
 * Comparison of two complete assemblies, first difference wins:
 *   fewer unassigned pieces → the user's procurement objective (lexicographic,
 *   `procurement-core`'s own ordering) → fewer joints → fewer stagger
 *   violations → a stable state signature.
 */

export interface StockAwareLimits {
  /** Legal splits kept per run after ranking; the V48 split is always kept. */
  maxCandidatesPerRun?: number;
  /** Complete-plan evaluations the search may spend. */
  maxEvaluations?: number;
  /** Paths enumerated per run before ranking. */
  maxEnumeratedPathsPerRun?: number;
  /**
   * Packing budget used while *comparing* candidates. Small on purpose: the
   * exact packer would otherwise spend its full budget on every candidate.
   * The chosen assembly is re-packed with the caller's full limits.
   */
  searchStateBudgetPerStockClass?: number;
}

export const DEFAULT_STOCK_AWARE_LIMITS: Readonly<Required<StockAwareLimits>> =
  {
    maxCandidatesPerRun: 6,
    maxEvaluations: 80,
    maxEnumeratedPathsPerRun: 256,
    searchStateBudgetPerStockClass: 1500,
  };

export type StockAwareOptimality =
  /** Every candidate combination was evaluated and the packing was exact. */
  | 'proven-within-search-space'
  /** Local search converged, or the packing itself was heuristic. */
  | 'heuristic'
  /** The evaluation budget ran out before the search converged. */
  | 'search-budget-exhausted';

export interface StockAwareSearch {
  runCount: number;
  groupCount: number;
  candidateCount: number;
  evaluations: number;
  evaluationBudget: number;
  exhaustive: boolean;
  /** The chosen assembly differs from the V48 one and scores better. */
  improvedOverBaseline: boolean;
  optimality: StockAwareOptimality;
}

export interface StockAwareResult {
  assembly: LinearAssemblyResult;
  plan: CuttingPlan;
  /** The V48 stock-unaware assembly and its plan, kept for comparison. */
  baseline: { assembly: LinearAssemblyResult; plan: CuttingPlan };
  search: StockAwareSearch;
}

export interface StockAwareInput {
  runs: readonly LinearRun[];
  settings: LinearAssemblySettings;
  stockClassId: StockClassId;
  stockOptions: readonly StockOption[];
  cutting: CuttingSettings;
  objective?: OptimizationObjective;
  limits?: StockAwareLimits;
  solverLimits?: SolverLimits;
}

/** A split of one run: interior cut stations and the supports under them. */
interface Candidate {
  cuts: number[];
  cutSupportIds: (string | undefined)[];
  /** Stable identity of the shape, independent of which run carries it. */
  shape: string;
}

interface RunEntry {
  run: LinearRun;
  startAllowanceMm: number;
  endAllowanceMm: number;
  candidates: Candidate[];
}

interface Group {
  key: string;
  runs: RunEntry[];
  /** Candidates by index; identical shapes for every run of the group. */
  candidateCount: number;
}

const sortRuns = (a: LinearRun, b: LinearRun) =>
  (a.sequenceId < b.sequenceId ? -1 : a.sequenceId > b.sequenceId ? 1 : 0) ||
  a.sequenceIndex - b.sequenceIndex ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function piecesFor(entry: RunEntry, candidate: Candidate): InstallablePiece[] {
  const { run } = entry;
  const points = [0, ...candidate.cuts, run.lengthMm];
  const pieces: InstallablePiece[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const isFirst = index === 0;
    const isLast = index === points.length - 2;
    pieces.push(
      buildInstallablePiece(
        run,
        from,
        to,
        isFirst ? run.startEnd : 'square',
        isLast ? run.endEnd : 'square',
        (isFirst ? entry.startAllowanceMm : 0) +
          (isLast ? entry.endAllowanceMm : 0),
        index,
        isFirst ? undefined : candidate.cutSupportIds[index - 1],
        isLast ? undefined : candidate.cutSupportIds[index],
      ),
    );
  }
  return pieces;
}

function pieceIsLegal(
  entry: RunEntry,
  from: number,
  to: number,
  settings: LinearAssemblySettings,
): boolean {
  const { run } = entry;
  const installed = to - from;
  if (!(installed > 0)) return false;
  const allowance =
    (from === 0 ? entry.startAllowanceMm : 0) +
    (to === run.lengthMm ? entry.endAllowanceMm : 0);
  if (installed + allowance > settings.maximumPieceLengthMm) return false;
  if (from === 0 && to === run.lengthMm) return true;
  if (installed < settings.minimumPieceLengthMm) return false;
  if (settings.policy === 'joint-at-support') {
    const resting = run.supports.filter(
      (support) => support.atMm >= from && support.atMm <= to,
    ).length;
    if (resting < settings.minimumSupportsPerPiece) return false;
  }
  return true;
}

function shapeOf(cuts: readonly number[]) {
  return cuts.map((cut) => Math.round(cut)).join(',');
}

/**
 * How well a piece fills commercial stock on its own or with copies of
 * itself — used only to *rank* candidates before the global evaluation, never
 * as the final score.
 */
function localWaste(
  blanks: readonly number[],
  stockLengths: readonly number[],
  cutting: CuttingSettings,
) {
  let total = 0;
  for (const blank of blanks) {
    let best = Number.POSITIVE_INFINITY;
    for (const length of stockLengths) {
      const usable = length - 2 * cutting.endTrimMm;
      if (blank > usable) continue;
      const count = Math.max(
        1,
        Math.floor((usable + cutting.kerfMm) / (blank + cutting.kerfMm)),
      );
      const left = usable - count * blank - (count - 1) * cutting.kerfMm;
      best = Math.min(best, left / count);
    }
    total += Number.isFinite(best) ? best : 1e9;
  }
  return total;
}

function blanksFor(entry: RunEntry, cuts: readonly number[]) {
  const points = [0, ...cuts, entry.run.lengthMm];
  return points.slice(1).map((to, index) => {
    const from = points[index]!;
    return (
      to -
      from +
      (index === 0 ? entry.startAllowanceMm : 0) +
      (index === points.length - 2 ? entry.endAllowanceMm : 0)
    );
  });
}

/** Legal splits over resolved support stations (battens). */
function supportCandidates(
  entry: RunEntry,
  settings: LinearAssemblySettings,
  limit: number,
): { cuts: number[]; ids: (string | undefined)[] }[] {
  const { run } = entry;
  const inner = run.supports
    .filter((support) => support.atMm > 0 && support.atMm < run.lengthMm)
    .slice()
    .sort((a, b) => a.atMm - b.atMm || (a.supportId < b.supportId ? -1 : 1));
  const stations = [
    { atMm: 0, id: undefined as string | undefined },
    ...inner.map((support) => ({ atMm: support.atMm, id: support.supportId })),
    { atMm: run.lengthMm, id: undefined as string | undefined },
  ];
  // Fewest pieces reachable from each station, so the enumeration can stop
  // paths that could only finish with more than one extra joint.
  const last = stations.length - 1;
  const cost = new Array<number>(stations.length).fill(Infinity);
  cost[last] = 0;
  for (let i = last - 1; i >= 0; i -= 1)
    for (let j = i + 1; j <= last; j += 1)
      if (
        Number.isFinite(cost[j]!) &&
        pieceIsLegal(entry, stations[i]!.atMm, stations[j]!.atMm, settings)
      )
        cost[i] = Math.min(cost[i]!, 1 + cost[j]!);
  if (!Number.isFinite(cost[0]!)) return [];
  const maxPieces = cost[0]! + 1;
  const found: { cuts: number[]; ids: (string | undefined)[] }[] = [];
  const walk = (at: number, cuts: number[], ids: (string | undefined)[]) => {
    if (found.length >= limit) return;
    if (at === last) {
      found.push({ cuts: [...cuts], ids: [...ids] });
      return;
    }
    // Furthest first keeps the fewest-piece paths early in the enumeration.
    for (let next = last; next > at; next -= 1) {
      if (found.length >= limit) return;
      if (!Number.isFinite(cost[next]!)) continue;
      if (cuts.length + 1 + cost[next]! > maxPieces) continue;
      if (
        !pieceIsLegal(entry, stations[at]!.atMm, stations[next]!.atMm, settings)
      )
        continue;
      if (next === last) walk(next, cuts, ids);
      else {
        cuts.push(stations[next]!.atMm);
        ids.push(stations[next]!.id);
        walk(next, cuts, ids);
        cuts.pop();
        ids.pop();
      }
    }
  };
  walk(0, [], []);
  return found;
}

/**
 * Legal splits for a continuously supported run (counter-battens). The joint
 * may be anywhere, so candidates are built from the commercial lengths
 * themselves: whole usable lengths first or last, and even divisions.
 */
function continuousCandidates(
  entry: RunEntry,
  settings: LinearAssemblySettings,
  stockLengths: readonly number[],
  cutting: CuttingSettings,
): { cuts: number[]; ids: (string | undefined)[] }[] {
  const { run } = entry;
  const L = run.lengthMm;
  const found: number[][] = [];
  const legal = (cuts: number[]) => {
    const points = [0, ...cuts, L];
    for (let index = 0; index < points.length - 1; index += 1)
      if (!pieceIsLegal(entry, points[index]!, points[index + 1]!, settings))
        return false;
    return true;
  };
  const minimum = Math.ceil(
    (L + entry.startAllowanceMm + entry.endAllowanceMm) /
      settings.maximumPieceLengthMm,
  );
  for (const count of [minimum, minimum + 1]) {
    if (count < 1) continue;
    const even = Array.from({ length: count - 1 }, (_, index) =>
      Math.round(((index + 1) * L) / count),
    );
    found.push(even);
    for (const length of stockLengths) {
      const usable = length - 2 * cutting.endTrimMm;
      // One full commercial length at the start, the rest divided evenly…
      const head = usable - entry.startAllowanceMm;
      if (count >= 2 && head > 0 && head < L) {
        const rest = L - head;
        found.push([
          head,
          ...Array.from({ length: count - 2 }, (_, index) =>
            Math.round(head + ((index + 1) * rest) / (count - 1)),
          ),
        ]);
      }
      // …or at the end.
      const tail = usable - entry.endAllowanceMm;
      if (count >= 2 && tail > 0 && tail < L) {
        const rest = L - tail;
        found.push([
          ...Array.from({ length: count - 2 }, (_, index) =>
            Math.round(((index + 1) * rest) / (count - 1)),
          ),
          rest,
        ]);
      }
      // Two pieces that together fill one commercial length exactly.
      if (count === 2) {
        const pair = Math.floor((usable - cutting.kerfMm) / 2);
        if (pair > 0 && pair < L) {
          found.push([pair]);
          found.push([L - pair]);
        }
      }
    }
  }
  const seen = new Set<string>();
  return found
    .map((cuts) => [...cuts].sort((a, b) => a - b))
    .filter((cuts) => {
      const key = shapeOf(cuts);
      if (seen.has(key) || !legal(cuts)) return false;
      seen.add(key);
      return true;
    })
    .map((cuts) => ({ cuts, ids: cuts.map(() => undefined) }));
}

/** Cut stations of the V48 assembly for one run. */
function baselineCandidate(pieces: readonly InstallablePiece[]): {
  cuts: number[];
  ids: (string | undefined)[];
} {
  const ordered = [...pieces].sort((a, b) => a.fromMm - b.fromMm);
  return {
    cuts: ordered.slice(0, -1).map((item) => item.toMm),
    ids: ordered.slice(0, -1).map((item) => item.endJointSupportId),
  };
}

function groupKey(entry: RunEntry, settings: LinearAssemblySettings) {
  const { run } = entry;
  // The V48 split is part of the key: V48 staggers by giving identical rows
  // different joints, and the search must start from exactly that assembly.
  return JSON.stringify([
    entry.candidates[0]?.shape ?? '',
    Math.round(run.lengthMm),
    run.startEnd,
    run.endEnd,
    settings.policy === 'joint-at-support'
      ? run.supports
          .map((support) => Math.round(support.atMm))
          .sort((a, b) => a - b)
      : [],
  ]);
}

/** Joints exceeding the stagger limit within the sliding window. */
function staggerViolations(
  pieces: readonly InstallablePiece[],
  settings: LinearAssemblySettings,
) {
  const rule = settings.stagger;
  if (!rule || settings.policy !== 'joint-at-support') return 0;
  const bySupport = new Map<string, number[]>();
  for (const item of pieces)
    if (item.endJointSupportId !== undefined) {
      const key = JSON.stringify([item.sequenceId, item.endJointSupportId]);
      const list = bySupport.get(key);
      if (list) list.push(item.sequenceIndex);
      else bySupport.set(key, [item.sequenceIndex]);
    }
  let violations = 0;
  for (const indices of bySupport.values()) {
    indices.sort((a, b) => a - b);
    for (let index = 0; index < indices.length; index += 1) {
      const current = indices[index]!;
      const inWindow = indices.filter(
        (other) => other <= current && current - other < rule.consecutiveRuns,
      ).length;
      if (inWindow > rule.joints) violations += 1;
    }
  }
  return violations;
}

interface Evaluated {
  assignment: number[][];
  pieces: InstallablePiece[];
  plan: CuttingPlan;
  joints: number;
  violations: number;
  signature: string;
}

function neutral(score: PlanScore): PlanScore {
  return { ...score, deterministicSignature: '' };
}

function compare(a: Evaluated, b: Evaluated, objective: OptimizationObjective) {
  return (
    a.plan.summary.unassignedPieceCount - b.plan.summary.unassignedPieceCount ||
    comparePlanScores(
      neutral(a.plan.score),
      neutral(b.plan.score),
      objective,
    ) ||
    a.joints - b.joints ||
    a.violations - b.violations ||
    a.signature.localeCompare(b.signature)
  );
}

/**
 * Candidate index per run of a group from per-candidate counts. Interleaving
 * (0,3,0,3 rather than 0,0,3,3) spreads joints across courses.
 */
function distribute(counts: readonly number[]) {
  const left = [...counts];
  const order: number[] = [];
  let remaining = left.reduce((sum, value) => sum + value, 0);
  while (remaining > 0)
    for (let index = 0; index < left.length; index += 1)
      if (left[index]! > 0) {
        order.push(index);
        left[index]! -= 1;
        remaining -= 1;
      }
  return order;
}

export function planStockAwareAssembly(
  input: StockAwareInput,
): StockAwareResult {
  const limits = { ...DEFAULT_STOCK_AWARE_LIMITS, ...input.limits };
  const objective = input.objective ?? 'minimum-waste';
  const { settings, cutting } = input;
  const stockLengths = [
    ...new Set(input.stockOptions.map((option) => option.lengthMm)),
  ].sort((a, b) => a - b);

  const baselineAssembly = planLinearAssembly({ runs: input.runs, settings });
  const pack = (pieces: InstallablePiece[], solverLimits?: SolverLimits) =>
    createCuttingPlan({
      requiredPieces: installablePiecesToRequiredPieces(
        pieces,
        input.stockClassId,
      ),
      stockOptions: input.stockOptions,
      settings: cutting,
      objective,
      ...(solverLimits ? { solverLimits } : {}),
    });
  const searchLimits: SolverLimits = {
    ...input.solverLimits,
    searchStateBudgetPerStockClass: Math.min(
      limits.searchStateBudgetPerStockClass,
      input.solverLimits?.searchStateBudgetPerStockClass ?? Infinity,
    ),
  };
  const evaluate = (pieces: InstallablePiece[]) => pack(pieces, searchLimits);
  const baselinePlan = pack(baselineAssembly.pieces, input.solverLimits);

  // Runs the V48 planner resolved are the only ones with candidates; an
  // unresolved run stays unresolved (a raking end is never guessed here).
  const resolvedIds = new Set(
    baselineAssembly.pieces.map((item) => item.runId),
  );
  const piecesByRun = new Map<string, InstallablePiece[]>();
  for (const item of baselineAssembly.pieces) {
    const list = piecesByRun.get(item.runId);
    if (list) list.push(item);
    else piecesByRun.set(item.runId, [item]);
  }

  const entries: RunEntry[] = [];
  for (const run of [...input.runs].sort(sortRuns)) {
    if (!resolvedIds.has(run.id)) continue;
    const start = runEndAllowance(run.startEnd, settings);
    const end = runEndAllowance(run.endEnd, settings);
    const entry: RunEntry = {
      run,
      startAllowanceMm: typeof start === 'number' ? start : 0,
      endAllowanceMm: typeof end === 'number' ? end : 0,
      candidates: [],
    };
    const base = baselineCandidate(piecesByRun.get(run.id)!);
    const raw =
      settings.policy === 'joint-at-support'
        ? supportCandidates(entry, settings, limits.maxEnumeratedPathsPerRun)
        : settings.policy === 'joint-along-supporting-member'
          ? continuousCandidates(entry, settings, stockLengths, cutting)
          : [];
    const seen = new Set<string>([shapeOf(base.cuts)]);
    const ranked = raw
      .filter((item) => {
        const key = shapeOf(item.cuts);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        item,
        waste: localWaste(blanksFor(entry, item.cuts), stockLengths, cutting),
      }))
      .sort(
        (a, b) =>
          a.waste - b.waste ||
          a.item.cuts.length - b.item.cuts.length ||
          shapeOf(a.item.cuts).localeCompare(shapeOf(b.item.cuts)),
      )
      .slice(0, Math.max(0, limits.maxCandidatesPerRun - 1))
      .map(({ item }) => item);
    entry.candidates = [base, ...ranked].map((item) => ({
      cuts: item.cuts,
      cutSupportIds: item.ids,
      shape: shapeOf(item.cuts),
    }));
    entries.push(entry);
  }

  // Identical runs share a candidate list by shape, so the search moves whole
  // groups instead of exploring every run separately.
  const groupsByKey = new Map<string, RunEntry[]>();
  for (const entry of entries) {
    const key = groupKey(entry, settings);
    const list = groupsByKey.get(key);
    if (list) list.push(entry);
    else groupsByKey.set(key, [entry]);
  }
  const groups: Group[] = [...groupsByKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, runs]) => {
      // Every run in a group shares the shapes of the first run's candidates;
      // the support identities come from each run's own supports.
      const shapes = runs[0]!.candidates;
      for (const entry of runs.slice(1)) {
        const byShape = new Map(entry.candidates.map((c) => [c.shape, c]));
        entry.candidates = shapes.map((shape) => {
          const own = byShape.get(shape.shape);
          if (own) return own;
          // Same offsets, so the same cut positions are supported here too.
          const ids = shape.cuts.map(
            (cut) =>
              entry.run.supports.find(
                (support) => Math.abs(support.atMm - cut) < 0.5,
              )?.supportId,
          );
          return { cuts: shape.cuts, cutSupportIds: ids, shape: shape.shape };
        });
      }
      return { key, runs, candidateCount: shapes.length };
    });

  const assemble = (counts: number[][]): Evaluated => {
    const pieces: InstallablePiece[] = [];
    let joints = 0;
    groups.forEach((group, groupIndex) => {
      const order = distribute(counts[groupIndex]!);
      group.runs.forEach((entry, runIndex) => {
        const candidate = entry.candidates[order[runIndex]!]!;
        joints += candidate.cuts.length;
        pieces.push(...piecesFor(entry, candidate));
      });
    });
    return {
      assignment: counts.map((row) => [...row]),
      pieces,
      plan: evaluate(pieces),
      joints,
      violations: staggerViolations(pieces, settings),
      signature: JSON.stringify(counts),
    };
  };

  const initial = groups.map((group) => {
    const row = new Array<number>(group.candidateCount).fill(0);
    row[0] = group.runs.length;
    return row;
  });
  let evaluations = 0;
  const start = assemble(initial);
  evaluations += 1;
  let best = start;

  // Size of the full space: multisets of candidates per group.
  const choose = (n: number, k: number) => {
    let result = 1;
    for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
    return result;
  };
  const spaceSize = groups.reduce(
    (product, group) =>
      product *
      choose(
        group.runs.length + group.candidateCount - 1,
        group.candidateCount - 1,
      ),
    1,
  );
  const exhaustive = spaceSize <= limits.maxEvaluations;

  const accept = (candidate: Evaluated) =>
    candidate.violations <= best.violations &&
    compare(candidate, best, objective) < 0;

  if (exhaustive) {
    // Enumerate every multiset per group (small by construction).
    const compositions = (n: number, parts: number): number[][] => {
      if (parts === 1) return [[n]];
      const out: number[][] = [];
      for (let first = n; first >= 0; first -= 1)
        for (const rest of compositions(n - first, parts - 1))
          out.push([first, ...rest]);
      return out;
    };
    const perGroup = groups.map((group) =>
      compositions(group.runs.length, group.candidateCount),
    );
    const walk = (index: number, chosen: number[][]) => {
      if (index === groups.length) {
        if (JSON.stringify(chosen) === start.signature) return;
        const candidate = assemble(chosen);
        evaluations += 1;
        if (accept(candidate)) best = candidate;
        return;
      }
      for (const option of perGroup[index]!)
        walk(index + 1, [...chosen, option]);
    };
    walk(0, []);
  } else {
    let improved = true;
    while (improved && evaluations < limits.maxEvaluations) {
      improved = false;
      for (
        let groupIndex = 0;
        groupIndex < groups.length && evaluations < limits.maxEvaluations;
        groupIndex += 1
      ) {
        const group = groups[groupIndex]!;
        const row = best.assignment[groupIndex]!;
        const from = row.indexOf(Math.max(...row));
        const size = row[from]!;
        // Largest move first: identical runs usually want the same split, so
        // moving the whole group at once converges in one evaluation where
        // single-run steps would spend the budget one row at a time.
        const steps = [...new Set([size, Math.ceil(size / 2), 1])].filter(
          (step) => step >= 1 && step <= size,
        );
        for (let to = 0; to < group.candidateCount; to += 1) {
          if (to === from) continue;
          for (const step of steps) {
            if (evaluations >= limits.maxEvaluations) break;
            const next = best.assignment.map((item) => [...item]);
            next[groupIndex]![from]! -= step;
            next[groupIndex]![to]! += step;
            const candidate = assemble(next);
            evaluations += 1;
            if (accept(candidate)) {
              best = candidate;
              improved = true;
              break;
            }
          }
          if (improved) break;
        }
        if (improved) break;
      }
    }
  }

  const budgetHit = !exhaustive && evaluations >= limits.maxEvaluations;
  // The search compared cheap packings. Re-pack the winner with the caller's
  // full limits and keep the V48 assembly unless the winner still wins: the
  // no-regression guarantee is checked on the plans the user will actually see.
  let finalPlan = baselinePlan;
  if (best !== start) {
    const full = pack(best.pieces, input.solverLimits);
    const challenger = { ...best, plan: full };
    const incumbent = {
      ...start,
      plan: baselinePlan,
      violations: staggerViolations(baselineAssembly.pieces, settings),
    };
    if (
      challenger.violations <= incumbent.violations &&
      compare(challenger, incumbent, objective) < 0
    )
      finalPlan = full;
    else best = start;
  }
  const assembly: LinearAssemblyResult = {
    status: baselineAssembly.status,
    policy: baselineAssembly.policy,
    pieces: best.pieces,
    unresolved: baselineAssembly.unresolved,
    summary: {
      ...baselineAssembly.summary,
      pieceCount: best.pieces.length,
      jointCount: best.joints,
      installedLengthMm: best.pieces.reduce(
        (sum, item) => sum + item.installedLengthMm,
        0,
      ),
      requiredBlankLengthMm: best.pieces.reduce(
        (sum, item) => sum + item.requiredBlankLengthMm,
        0,
      ),
      fabricationAllowanceMm: best.pieces.reduce(
        (sum, item) => sum + item.fabricationAllowanceMm,
        0,
      ),
      staggerRelaxed: best.violations > 0,
    },
  };
  return {
    assembly: best === start ? baselineAssembly : assembly,
    plan: finalPlan,
    baseline: { assembly: baselineAssembly, plan: baselinePlan },
    search: {
      runCount: entries.length,
      groupCount: groups.length,
      candidateCount: entries.reduce(
        (sum, entry) => sum + entry.candidates.length,
        0,
      ),
      evaluations,
      evaluationBudget: limits.maxEvaluations,
      exhaustive,
      improvedOverBaseline: best !== start,
      optimality: budgetHit
        ? 'search-budget-exhausted'
        : exhaustive && finalPlan.optimality === 'proven-within-search-space'
          ? 'proven-within-search-space'
          : 'heuristic',
    },
  };
}
