import type {
  BattenLayoutResult,
  CounterBattenLayoutResult,
} from '@cieslacalc/roof-math';
import type { RoofSkeleton, RoofTemplateSpec } from '@cieslacalc/timber-model';
import {
  planeRafterAxes,
  resolveRoofPlaneBasis,
  roofPlaneIntervalsAtV,
  roofPlaneSide,
} from '@cieslacalc/roof-math';
import {
  planStockAwareAssembly,
  type LinearAssemblyResult,
  type StockAwareLimits,
  type StockAwareSearch,
  type LinearAssemblySettings,
  type LinearJoinPolicy,
  type LinearRun,
} from '@cieslacalc/linear-procurement';
import {
  aggregateStockRequirements,
  type CuttingPlan,
  type CuttingSettings,
  type OptimizationObjective,
  type StockOption,
  type StockRequirement,
} from '@cieslacalc/procurement-core';
import { timberSectionStockClassId } from './timber-stock-class';

/**
 * V48 — commercial planning for linear roof build-up timber.
 *
 * Application bridge only (the same role as `k1-cutting-adapter.ts`): it maps
 * *already resolved* batten and counter-batten geometry onto
 * `@cieslacalc/linear-procurement` runs, and the resulting indivisible pieces
 * onto `procurement-core`. It computes no roof geometry and re-runs no solver.
 */

const EDGE_TOLERANCE_MM = 0.5;
/** Probe distance up the slope used to tell a raking edge from a square one. */
const EDGE_PROBE_MM = 2;

export type LinearMaterialKind = 'batten' | 'counter-batten';

export type LinearRequirementBlocker =
  /** The layer is switched off, so there is nothing to buy. */
  | 'layer-off'
  /** The underlying layout has not resolved (no covering, invalid gauge, …). */
  | 'layout-unresolved'
  /** A hip boundary detail is still an open decision (V48 §11). */
  | 'hip-detail-unresolved'
  /** The layout resolved but produced no run. */
  | 'no-runs'
  /** The section is not known, so no stock class can be formed. */
  | 'section-unknown';

/**
 * The pure intermediate result of V48 §12: what must be installed, expressed
 * as runs that still carry their provenance, before any stock is chosen.
 */
export interface LinearMaterialRequirement {
  kind: LinearMaterialKind;
  status: 'ready' | 'blocked';
  blockers: LinearRequirementBlocker[];
  policy: LinearJoinPolicy;
  section?: { widthMm: number; depthMm: number };
  stockClassId?: string;
  runs: LinearRun[];
  /** Exact installation requirement: the geometry, not a purchase length. */
  installedLengthMm: number;
  /** Runs with at least one raking end, which need an explicit allowance. */
  angledRunCount: number;
}

/**
 * V49: where a commercial length came from. A catalogue length keeps its
 * product identity all the way to cost and documents; a manual one says so.
 */
export type LinearStockSource =
  | { kind: 'manual' }
  | {
      kind: 'catalogue';
      productId: string;
      revisionId: string;
      /** Absent when the product has no single commercial variant to price. */
      variantId?: string;
      productName: string;
      manufacturerName?: string;
    };

export interface LinearStockLength {
  id: string;
  lengthMm: number;
  /** Absent = quantity unknown, planned as unlimited (never invented). */
  availability?: number;
  source?: LinearStockSource;
}

export interface LinearPurchasePlan {
  kind: LinearMaterialKind;
  status: 'complete' | 'partial' | 'unfulfilled';
  /** The section the stock class was formed from, for pricing and documents. */
  section?: { widthMm: number; depthMm: number };
  assembly: LinearAssemblyResult;
  plan: CuttingPlan;
  stock: StockRequirement[];
  /** Commercial length actually bought. */
  purchasedLengthMm: number;
  /** Installed length the pieces cover. */
  installedLengthMm: number;
  utilizationRatio: number;
  /** Stock option ID → where that commercial length came from. */
  stockSources: Record<string, LinearStockSource>;
  /** V49 search evidence: bounds, effort and how far optimality is proven. */
  search: StockAwareSearch;
  /** The V48 stock-unaware plan for the same input, for comparison. */
  baseline: {
    purchasedLengthMm: number;
    wasteLengthMm: number;
    stockItemCount: number;
    utilizationRatio: number;
  };
}

/**
 * Outer u-extent of a plane's row at a station, and whether each side rakes.
 *
 * A verge is square, a hip is not: the probe compares the plane outline at the
 * station and just above it. A raking end has no proven fabrication blank
 * (research §2.6), so the planner will refuse to price it without an explicit
 * allowance instead of hiding a guess (V48 §8).
 */
function planeEdgesAt(
  template: RoofTemplateSpec,
  roofPlaneId: string,
  vMm: number,
) {
  const extent = (atV: number) => {
    const intervals = roofPlaneIntervalsAtV(template, roofPlaneId, atV);
    if (!intervals.length) return undefined;
    return {
      fromUMm: Math.min(...intervals.map((interval) => interval.fromUMm)),
      toUMm: Math.max(...intervals.map((interval) => interval.toUMm)),
    };
  };
  const here = extent(vMm);
  const above = extent(vMm + EDGE_PROBE_MM) ?? extent(vMm - EDGE_PROBE_MM);
  if (!here) return undefined;
  if (!above) return { ...here, startRakes: true, endRakes: true };
  return {
    ...here,
    startRakes: Math.abs(above.fromUMm - here.fromUMm) > EDGE_TOLERANCE_MM,
    endRakes: Math.abs(above.toUMm - here.toUMm) > EDGE_TOLERANCE_MM,
  };
}

/**
 * Tile battens: one run per visible row segment, so a row already broken by a
 * roof window stays broken (V48 §7). Legal joint positions are the plane's
 * resolved rafter axes, never a nominal spacing (V48 §5).
 */
export function battenLinearRuns(args: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  result: BattenLayoutResult;
}): { runs: LinearRun[]; angledRunCount: number } {
  const runs: LinearRun[] = [];
  let angledRunCount = 0;
  const axesByPlane = new Map<
    string,
    { uMm: number; sourceMemberId: string }[]
  >();
  for (const batten of args.result.battens) {
    if (!axesByPlane.has(batten.roofPlaneId)) {
      const side = roofPlaneSide(args.template, batten.roofPlaneId);
      const basis = resolveRoofPlaneBasis(args.template, batten.roofPlaneId);
      axesByPlane.set(
        batten.roofPlaneId,
        side ? planeRafterAxes(args.skeleton, basis, side).axes : [],
      );
    }
    const axes = axesByPlane.get(batten.roofPlaneId)!;
    const edges = planeEdgesAt(
      args.template,
      batten.roofPlaneId,
      batten.stationMm,
    );
    batten.segments.forEach((segment, index) => {
      const lengthMm = segment.toUMm - segment.fromUMm;
      if (!(lengthMm > 0)) return;
      const atStartEdge =
        edges !== undefined &&
        Math.abs(segment.fromUMm - edges.fromUMm) <= EDGE_TOLERANCE_MM;
      const atEndEdge =
        edges !== undefined &&
        Math.abs(segment.toUMm - edges.toUMm) <= EDGE_TOLERANCE_MM;
      const startEnd =
        atStartEdge && edges.startRakes
          ? ('angled' as const)
          : ('square' as const);
      const endEnd =
        atEndEdge && edges.endRakes ? ('angled' as const) : ('square' as const);
      if (startEnd === 'angled' || endEnd === 'angled') angledRunCount += 1;
      runs.push({
        id: `${batten.id}:${index}`,
        sequenceId: batten.roofPlaneId,
        sequenceIndex: batten.rowNumber,
        lengthMm,
        supports: axes
          .filter(
            (axis) =>
              axis.uMm >= segment.fromUMm - EDGE_TOLERANCE_MM &&
              axis.uMm <= segment.toUMm + EDGE_TOLERANCE_MM,
          )
          .map((axis) => ({
            atMm: Math.min(Math.max(axis.uMm - segment.fromUMm, 0), lengthMm),
            supportId: axis.sourceMemberId,
          })),
        startEnd,
        endEnd,
      });
    });
  }
  return { runs, angledRunCount };
}

/**
 * Counter-battens: one run per resolved segment, consuming the V39/V46 rows
 * unchanged (V48 §11). A run that stops short of the plane's top edge died on
 * a hip and is therefore raking, so it is never given a claimed exact blank.
 */
export function counterBattenLinearRuns(args: {
  template: RoofTemplateSpec;
  result: CounterBattenLayoutResult;
}): { runs: LinearRun[]; angledRunCount: number } {
  const runs: LinearRun[] = [];
  let angledRunCount = 0;
  const topByPlane = new Map<string, number>();
  args.result.rows.forEach((row, rowIndex) => {
    if (!topByPlane.has(row.roofPlaneId)) {
      const basis = resolveRoofPlaneBasis(args.template, row.roofPlaneId);
      topByPlane.set(
        row.roofPlaneId,
        Math.max(...basis.polygon.map((point) => point.vMm)),
      );
    }
    const topVMm = topByPlane.get(row.roofPlaneId)!;
    row.segments.forEach((segment, index) => {
      if (!(segment.lengthMm > 0)) return;
      const reachesTop = segment.toLocal.vMm >= topVMm - EDGE_TOLERANCE_MM;
      const endEnd =
        row.role === 'hip-boundary-run' || !reachesTop
          ? ('angled' as const)
          : ('square' as const);
      if (endEnd === 'angled') angledRunCount += 1;
      runs.push({
        id: `${row.id}:${index}`,
        sequenceId: row.roofPlaneId,
        sequenceIndex: rowIndex,
        lengthMm: segment.lengthMm,
        // Continuously carried by the rafter below (research §2.4).
        supports: [],
        startEnd: 'square',
        endEnd,
      });
    });
  });
  return { runs, angledRunCount };
}

export function battenRequirement(args: {
  template: RoofTemplateSpec;
  skeleton: RoofSkeleton;
  result: BattenLayoutResult;
  section?: { widthMm: number; depthMm: number };
}): LinearMaterialRequirement {
  const blockers: LinearRequirementBlocker[] = [];
  if (args.result.status === 'disabled') blockers.push('layer-off');
  else if (args.result.status !== 'resolved')
    blockers.push('layout-unresolved');
  const { runs, angledRunCount } =
    blockers.length > 0
      ? { runs: [] as LinearRun[], angledRunCount: 0 }
      : battenLinearRuns(args);
  if (blockers.length === 0 && runs.length === 0) blockers.push('no-runs');
  const section =
    args.section && args.section.widthMm > 0 && args.section.depthMm > 0
      ? args.section
      : undefined;
  if (blockers.length === 0 && !section) blockers.push('section-unknown');
  return {
    kind: 'batten',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    policy: 'joint-at-support',
    ...(section ? { section } : {}),
    ...(section
      ? {
          stockClassId: timberSectionStockClassId(
            section.widthMm,
            section.depthMm,
          ),
        }
      : {}),
    runs,
    installedLengthMm: runs.reduce((total, run) => total + run.lengthMm, 0),
    angledRunCount,
  };
}

export function counterBattenRequirement(args: {
  template: RoofTemplateSpec;
  result: CounterBattenLayoutResult;
}): LinearMaterialRequirement {
  const blockers: LinearRequirementBlocker[] = [];
  if (args.result.status === 'disabled') blockers.push('layer-off');
  if (args.result.unresolvedHipBoundaryCount > 0)
    blockers.push('hip-detail-unresolved');
  const { runs, angledRunCount } =
    args.result.status === 'disabled'
      ? { runs: [] as LinearRun[], angledRunCount: 0 }
      : counterBattenLinearRuns(args);
  if (blockers.length === 0 && runs.length === 0) blockers.push('no-runs');
  const first = args.result.rows[0]?.section;
  const section =
    first && first.widthMm > 0 && first.depthMm > 0 ? first : undefined;
  if (blockers.length === 0 && !section) blockers.push('section-unknown');
  return {
    kind: 'counter-batten',
    status: blockers.length === 0 ? 'ready' : 'blocked',
    blockers,
    policy: 'joint-along-supporting-member',
    ...(section ? { section } : {}),
    ...(section
      ? {
          stockClassId: timberSectionStockClassId(
            section.widthMm,
            section.depthMm,
          ),
        }
      : {}),
    runs,
    installedLengthMm: runs.reduce((total, run) => total + run.lengthMm, 0),
    angledRunCount,
  };
}

export interface LinearPlanOptions {
  stockLengths: readonly LinearStockLength[];
  cutting: CuttingSettings;
  objective?: OptimizationObjective;
  minimumPieceLengthMm?: number;
  minimumSupportsPerPiece?: number;
  stagger?: LinearAssemblySettings['stagger'];
  /** Explicit allowance for a raking end. Undefined keeps such runs unplanned. */
  angledEndAllowanceMm?: number;
  limits?: StockAwareLimits;
}

/**
 * Requirement + chosen commercial lengths → cutting plan (V48 §18).
 *
 * `procurement-core` receives only the indivisible pieces the join policy
 * produced, so kerf, end trims, waste and reusable remnants keep their own
 * distinct meanings and are never re-derived here.
 */
export function planLinearPurchase(
  requirement: LinearMaterialRequirement,
  options: LinearPlanOptions,
): LinearPurchasePlan | undefined {
  if (requirement.status !== 'ready' || !requirement.stockClassId)
    return undefined;
  const lengths = options.stockLengths.filter((option) => option.lengthMm > 0);
  if (!lengths.length) return undefined;
  const stockClassId = requirement.stockClassId;
  const longest = Math.max(...lengths.map((option) => option.lengthMm));
  const stockOptions: StockOption[] = lengths.map((option) => ({
    id: option.id,
    stockClassId,
    lengthMm: option.lengthMm,
    ...(option.availability === undefined
      ? {}
      : { availability: option.availability }),
  }));
  /**
   * V49: the split of every run is chosen against the commercial lengths by
   * the final purchase plan; `procurement-core` still does all stock
   * accounting. The V48 assembly is the search's starting point, so the
   * result is never worse than it.
   */
  const result = planStockAwareAssembly({
    runs: requirement.runs,
    settings: {
      policy: requirement.policy,
      // A piece must still fit after the two stock-end trims are removed.
      maximumPieceLengthMm: longest - 2 * options.cutting.endTrimMm,
      minimumPieceLengthMm: options.minimumPieceLengthMm ?? 1200,
      minimumSupportsPerPiece: options.minimumSupportsPerPiece ?? 3,
      ...(options.stagger ? { stagger: options.stagger } : {}),
      ...(options.angledEndAllowanceMm === undefined
        ? {}
        : { angledEndAllowanceMm: options.angledEndAllowanceMm }),
    },
    stockClassId,
    stockOptions,
    cutting: options.cutting,
    objective: options.objective ?? 'minimum-waste',
    ...(options.limits ? { limits: options.limits } : {}),
  });
  const { assembly, plan } = result;
  return {
    kind: requirement.kind,
    ...(requirement.section ? { section: requirement.section } : {}),
    status:
      assembly.status === 'resolved' && plan.status === 'complete'
        ? 'complete'
        : plan.stockUsages.length === 0
          ? 'unfulfilled'
          : 'partial',
    assembly,
    plan,
    stock: aggregateStockRequirements(plan),
    stockSources: Object.fromEntries(
      lengths.map((option) => [option.id, option.source ?? { kind: 'manual' }]),
    ),
    purchasedLengthMm: plan.summary.purchasedStockLengthMm,
    installedLengthMm: assembly.summary.installedLengthMm,
    utilizationRatio: plan.summary.utilizationRatio,
    search: result.search,
    baseline: {
      purchasedLengthMm: result.baseline.plan.summary.purchasedStockLengthMm,
      wasteLengthMm: result.baseline.plan.summary.wasteLengthMm,
      stockItemCount: result.baseline.plan.summary.stockItemCount,
      utilizationRatio: result.baseline.plan.summary.utilizationRatio,
    },
  };
}
