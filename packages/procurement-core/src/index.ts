/**
 * Pure timber stock-length planning. All lengths are canonical millimetres.
 * Stock-class identifiers are opaque: this package compares them for equality
 * and never infers compatibility from their text.
 */
export type StockClassId = string;

export interface RequiredPieceSource {
  memberId?: string;
  family?: string;
}

/** One indivisible physical member requirement. */
export interface RequiredPiece {
  id: string;
  stockClassId: StockClassId;
  lengthMm: number;
  source?: RequiredPieceSource;
}

/** One available commercial length. Undefined availability means unlimited. */
export interface StockOption {
  id: string;
  stockClassId: StockClassId;
  lengthMm: number;
  availability?: number;
}

export interface CuttingSettings {
  /** Material consumed between two adjacent required pieces. */
  kerfMm: number;
  /** Material removed from each end of every opened stock item. */
  endTrimMm: number;
  /** A positive remainder at or above this length is reusable. */
  minimumReusableRemnantMm: number;
}

export type OptimizationObjective =
  'minimum-waste' | 'minimum-purchased-length' | 'minimum-stock-count';

export interface SolverLimits {
  /** Groups above this size use the deterministic heuristic fallback. */
  exactPieceLimit?: number;
  /** Hard branch-and-bound state budget applied independently per stock class. */
  searchStateBudgetPerStockClass?: number;
}

export interface CuttingPlanInput {
  requiredPieces: readonly RequiredPiece[];
  stockOptions: readonly StockOption[];
  settings: CuttingSettings;
  objective?: OptimizationObjective;
  solverLimits?: SolverLimits;
}

export interface CutAssignment {
  requiredPieceId: string;
  fromMm: number;
  toMm: number;
  lengthMm: number;
}

export type RemnantClassification = 'none' | 'waste' | 'reusable-remnant';

export interface StockUsage {
  stockClassId: StockClassId;
  stockOptionId: string;
  stockInstanceId: string;
  originalLengthMm: number;
  usableLengthMm: number;
  cuts: CutAssignment[];
  /** Sum of required piece lengths, excluding kerf and trims. */
  usedLengthMm: number;
  kerfTotalMm: number;
  endTrimLossMm: number;
  /** Unallocated length inside the two trimmed ends. */
  remainingLengthMm: number;
  remnantClassification: RemnantClassification;
}

export type UnassignedPieceReason =
  'no-compatible-stock' | 'piece-longer-than-stock' | 'availability-exhausted';

export interface UnassignedPiece {
  requiredPieceId: string;
  stockClassId: StockClassId;
  lengthMm: number;
  reason: UnassignedPieceReason;
}

export interface CuttingPlanSummary {
  requiredPieceCount: number;
  assignedPieceCount: number;
  unassignedPieceCount: number;
  stockItemCount: number;
  /** Sum of all requested pieces, including unassigned pieces. */
  requiredLengthMm: number;
  assignedLengthMm: number;
  purchasedStockLengthMm: number;
  kerfLossMm: number;
  endTrimLossMm: number;
  /** End trims plus non-reusable positive remainders; kerf is separate. */
  wasteLengthMm: number;
  reusableRemnantLengthMm: number;
  /** Assigned required length divided by opened commercial stock length. */
  utilizationRatio: number;
}

/** Pure physical plan evaluation. The signature is the final stable tie-break. */
export interface PlanScore {
  stockItemCount: number;
  purchasedStockLengthMm: number;
  /** Kerf + end trims + positive non-reusable remainders. */
  irreversibleLossMm: number;
  reusableRemnantLengthMm: number;
  /** All opened stock not assigned to required pieces in this project. */
  unusedPurchasedLengthMm: number;
  deterministicSignature: string;
}

export type SolverStrategy = 'hybrid-bounded-branch-and-bound-v2';
export type OptimalityStatus =
  'heuristic' | 'proven-within-search-space' | 'search-budget-exhausted';

export type StockClassFallbackReason =
  'group-too-large' | 'stock-option-count-limit' | 'unfulfilled-requirements';

export interface StockClassSolverDiagnostic {
  stockClassId: StockClassId;
  pieceCount: number;
  stockOptionCount: number;
  strategy: 'bounded-branch-and-bound' | 'heuristic-fallback';
  optimality: OptimalityStatus;
  searchStatesVisited: number;
  searchStateBudget: number;
  searchBudgetReached: boolean;
  fallbackReason?: StockClassFallbackReason;
}

export interface SolverDiagnostics {
  objective: OptimizationObjective;
  strategy: SolverStrategy;
  optimality: OptimalityStatus;
  searchStatesVisited: number;
  searchStateBudgetPerStockClass: number;
  searchBudgetReached: boolean;
  stockClasses: StockClassSolverDiagnostic[];
}

export interface CuttingPlan {
  status: 'complete' | 'partial' | 'unfulfilled';
  objective: OptimizationObjective;
  solver: SolverStrategy;
  optimality: OptimalityStatus;
  score: PlanScore;
  diagnostics: SolverDiagnostics;
  stockUsages: StockUsage[];
  unassignedPieces: UnassignedPiece[];
  summary: CuttingPlanSummary;
}

export interface StockRequirement {
  stockClassId: StockClassId;
  stockOptionId: string;
  lengthMm: number;
  quantity: number;
}

export type ProcurementValidationIssueCode =
  | 'invalid-id'
  | 'duplicate-required-piece-id'
  | 'duplicate-stock-option-id'
  | 'invalid-required-piece-length'
  | 'invalid-stock-length'
  | 'invalid-availability'
  | 'invalid-cutting-setting'
  | 'invalid-objective'
  | 'invalid-solver-limit';

export interface ProcurementValidationIssue {
  path: string;
  code: ProcurementValidationIssueCode;
}

export class ProcurementValidationError extends Error {
  readonly issues: ProcurementValidationIssue[];

  constructor(issues: ProcurementValidationIssue[]) {
    super('invalid_procurement_input');
    this.name = 'ProcurementValidationError';
    this.issues = issues;
  }
}

interface MutableStockUsage {
  stockClassId: StockClassId;
  stockOptionId: string;
  originalLengthMm: number;
  usableLengthMm: number;
  cuts: CutAssignment[];
  remainingLengthMm: number;
}

interface ProjectedFill {
  pieceCount: number;
  usedLengthMm: number;
  remainingLengthMm: number;
}

interface HeuristicClassPlan {
  usages: MutableStockUsage[];
  unassignedPieces: UnassignedPiece[];
}

interface SearchResult {
  usages: MutableStockUsage[];
  statesVisited: number;
  budgetReached: boolean;
  foundCompletePlan: boolean;
}

interface ResolvedSolverLimits {
  exactPieceLimit: number;
  searchStateBudgetPerStockClass: number;
}

const LENGTH_EPSILON_MM = 1e-9;
const MAX_EXACT_STOCK_OPTIONS = 8;
const MAX_CONFIGURABLE_EXACT_PIECES = 20;
const MAX_CONFIGURABLE_SEARCH_STATES = 100_000;

export const DEFAULT_SOLVER_LIMITS: Readonly<ResolvedSolverLimits> = {
  exactPieceLimit: 16,
  searchStateBudgetPerStockClass: 50_000,
};

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function validBoundedInteger(value: unknown, maximum: number) {
  return (
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum
  );
}

/** Returns all boundary problems without mutating or partially solving input. */
export function validateCuttingPlanInput(
  input: CuttingPlanInput,
): ProcurementValidationIssue[] {
  const issues: ProcurementValidationIssue[] = [];
  const pieceIds = new Set<string>();
  const optionIds = new Set<string>();

  input.requiredPieces.forEach((piece, index) => {
    const path = `requiredPieces[${index}]`;
    if (!validId(piece.id) || !validId(piece.stockClassId)) {
      issues.push({ path, code: 'invalid-id' });
    }
    if (pieceIds.has(piece.id)) {
      issues.push({ path: `${path}.id`, code: 'duplicate-required-piece-id' });
    }
    pieceIds.add(piece.id);
    if (!positiveFinite(piece.lengthMm)) {
      issues.push({
        path: `${path}.lengthMm`,
        code: 'invalid-required-piece-length',
      });
    }
  });

  input.stockOptions.forEach((option, index) => {
    const path = `stockOptions[${index}]`;
    if (!validId(option.id) || !validId(option.stockClassId)) {
      issues.push({ path, code: 'invalid-id' });
    }
    if (optionIds.has(option.id)) {
      issues.push({ path: `${path}.id`, code: 'duplicate-stock-option-id' });
    }
    optionIds.add(option.id);
    if (!positiveFinite(option.lengthMm)) {
      issues.push({ path: `${path}.lengthMm`, code: 'invalid-stock-length' });
    }
    if (
      option.availability !== undefined &&
      (!Number.isInteger(option.availability) || option.availability < 0)
    ) {
      issues.push({
        path: `${path}.availability`,
        code: 'invalid-availability',
      });
    }
  });

  const settings = input.settings;
  for (const key of [
    'kerfMm',
    'endTrimMm',
    'minimumReusableRemnantMm',
  ] as const) {
    if (!nonnegativeFinite(settings[key])) {
      issues.push({
        path: `settings.${key}`,
        code: 'invalid-cutting-setting',
      });
    }
  }

  if (
    input.objective !== undefined &&
    input.objective !== 'minimum-waste' &&
    input.objective !== 'minimum-purchased-length' &&
    input.objective !== 'minimum-stock-count'
  ) {
    issues.push({ path: 'objective', code: 'invalid-objective' });
  }

  if (
    input.solverLimits?.exactPieceLimit !== undefined &&
    !validBoundedInteger(
      input.solverLimits.exactPieceLimit,
      MAX_CONFIGURABLE_EXACT_PIECES,
    )
  ) {
    issues.push({
      path: 'solverLimits.exactPieceLimit',
      code: 'invalid-solver-limit',
    });
  }
  if (
    input.solverLimits?.searchStateBudgetPerStockClass !== undefined &&
    !validBoundedInteger(
      input.solverLimits.searchStateBudgetPerStockClass,
      MAX_CONFIGURABLE_SEARCH_STATES,
    )
  ) {
    issues.push({
      path: 'solverLimits.searchStateBudgetPerStockClass',
      code: 'invalid-solver-limit',
    });
  }

  return issues;
}

function resolveSolverLimits(limits?: SolverLimits): ResolvedSolverLimits {
  return {
    exactPieceLimit:
      limits?.exactPieceLimit ?? DEFAULT_SOLVER_LIMITS.exactPieceLimit,
    searchStateBudgetPerStockClass:
      limits?.searchStateBudgetPerStockClass ??
      DEFAULT_SOLVER_LIMITS.searchStateBudgetPerStockClass,
  };
}

function usableLength(option: StockOption, settings: CuttingSettings) {
  return Math.max(0, option.lengthMm - 2 * settings.endTrimMm);
}

function fits(requiredMm: number, availableMm: number) {
  return requiredMm <= availableMm + LENGTH_EPSILON_MM;
}

function normalizedLength(value: number) {
  return Math.abs(value) <= LENGTH_EPSILON_MM ? 0 : value;
}

function compareNumber(a: number, b: number) {
  if (Math.abs(a - b) <= LENGTH_EPSILON_MM) return 0;
  return a < b ? -1 : 1;
}

function pieceOrder(a: RequiredPiece, b: RequiredPiece) {
  return (
    b.lengthMm - a.lengthMm ||
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.id.localeCompare(b.id)
  );
}

function optionOrder(a: StockOption, b: StockOption) {
  return (
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.lengthMm - b.lengthMm ||
    a.id.localeCompare(b.id)
  );
}

function requiredSpaceFor(
  usage: MutableStockUsage,
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  return piece.lengthMm + (usage.cuts.length > 0 ? settings.kerfMm : 0);
}

function projectCandidateFill(
  option: StockOption,
  currentPiece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
): ProjectedFill {
  let remainingLengthMm =
    usableLength(option, settings) - currentPiece.lengthMm;
  let pieceCount = 1;
  let usedLengthMm = currentPiece.lengthMm;
  for (const piece of futurePieces) {
    if (piece.stockClassId !== option.stockClassId) continue;
    const requiredMm = settings.kerfMm + piece.lengthMm;
    if (!fits(requiredMm, remainingLengthMm)) continue;
    remainingLengthMm = normalizedLength(remainingLengthMm - requiredMm);
    pieceCount += 1;
    usedLengthMm += piece.lengthMm;
  }
  return { pieceCount, usedLengthMm, remainingLengthMm };
}

function chooseOpenUsage(
  usages: MutableStockUsage[],
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  return usages
    .filter(
      (usage) =>
        usage.stockClassId === piece.stockClassId &&
        fits(requiredSpaceFor(usage, piece, settings), usage.remainingLengthMm),
    )
    .sort((a, b) => {
      const aRemaining =
        a.remainingLengthMm - requiredSpaceFor(a, piece, settings);
      const bRemaining =
        b.remainingLengthMm - requiredSpaceFor(b, piece, settings);
      return (
        aRemaining - bRemaining ||
        a.originalLengthMm - b.originalLengthMm ||
        a.stockOptionId.localeCompare(b.stockOptionId) ||
        mutableUsageSignature(a).localeCompare(mutableUsageSignature(b))
      );
    })[0];
}

function stockOptionComparator(
  piece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
) {
  return (a: StockOption, b: StockOption) => {
    if (objective === 'minimum-stock-count') {
      const aProjection = projectCandidateFill(
        a,
        piece,
        futurePieces,
        settings,
      );
      const bProjection = projectCandidateFill(
        b,
        piece,
        futurePieces,
        settings,
      );
      return (
        bProjection.pieceCount - aProjection.pieceCount ||
        bProjection.usedLengthMm - aProjection.usedLengthMm ||
        aProjection.remainingLengthMm - bProjection.remainingLengthMm ||
        a.lengthMm - b.lengthMm ||
        a.id.localeCompare(b.id)
      );
    }
    const aRemaining = usableLength(a, settings) - piece.lengthMm;
    const bRemaining = usableLength(b, settings) - piece.lengthMm;
    return (
      aRemaining - bRemaining ||
      a.lengthMm - b.lengthMm ||
      a.id.localeCompare(b.id)
    );
  };
}

function chooseStockOption(
  options: readonly StockOption[],
  openedByOption: ReadonlyMap<string, number>,
  piece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
) {
  return options
    .filter((option) => {
      const available = option.availability;
      const opened = openedByOption.get(option.id) ?? 0;
      return (
        option.stockClassId === piece.stockClassId &&
        (available === undefined || opened < available) &&
        fits(piece.lengthMm, usableLength(option, settings))
      );
    })
    .sort(stockOptionComparator(piece, futurePieces, settings, objective))[0];
}

function appendPiece(
  usage: MutableStockUsage,
  piece: RequiredPiece,
  settings: CuttingSettings,
) {
  const previousCut = usage.cuts.at(-1);
  const fromMm = previousCut
    ? previousCut.toMm + settings.kerfMm
    : settings.endTrimMm;
  const toMm = fromMm + piece.lengthMm;
  usage.cuts.push({
    requiredPieceId: piece.id,
    fromMm,
    toMm,
    lengthMm: piece.lengthMm,
  });
  usage.remainingLengthMm = normalizedLength(
    usage.remainingLengthMm -
      piece.lengthMm -
      (previousCut ? settings.kerfMm : 0),
  );
}

function classifyRemnant(
  remainingLengthMm: number,
  minimumReusableRemnantMm: number,
): RemnantClassification {
  if (remainingLengthMm <= LENGTH_EPSILON_MM) return 'none';
  return remainingLengthMm + LENGTH_EPSILON_MM >= minimumReusableRemnantMm
    ? 'reusable-remnant'
    : 'waste';
}

function mutableUsageSignature(usage: MutableStockUsage) {
  return `${usage.stockOptionId}[${usage.cuts
    .map((cut) => `${cut.requiredPieceId}:${cut.lengthMm}`)
    .join(',')}]`;
}

function cloneMutableUsage(usage: MutableStockUsage): MutableStockUsage {
  return {
    ...usage,
    cuts: usage.cuts.map((cut) => ({ ...cut })),
  };
}

function canonicalMutableUsageOrder(
  a: MutableStockUsage,
  b: MutableStockUsage,
) {
  return (
    a.stockClassId.localeCompare(b.stockClassId) ||
    a.originalLengthMm - b.originalLengthMm ||
    a.stockOptionId.localeCompare(b.stockOptionId) ||
    mutableUsageSignature(a).localeCompare(mutableUsageSignature(b))
  );
}

function finalizeUsage(
  usage: MutableStockUsage,
  stockInstanceId: string,
  settings: CuttingSettings,
): StockUsage {
  const usedLengthMm = usage.cuts.reduce(
    (total, cut) => total + cut.lengthMm,
    0,
  );
  return {
    stockClassId: usage.stockClassId,
    stockOptionId: usage.stockOptionId,
    stockInstanceId,
    originalLengthMm: usage.originalLengthMm,
    usableLengthMm: usage.usableLengthMm,
    cuts: usage.cuts.map((cut) => ({ ...cut })),
    usedLengthMm,
    kerfTotalMm: Math.max(0, usage.cuts.length - 1) * settings.kerfMm,
    endTrimLossMm: 2 * settings.endTrimMm,
    remainingLengthMm: usage.remainingLengthMm,
    remnantClassification: classifyRemnant(
      usage.remainingLengthMm,
      settings.minimumReusableRemnantMm,
    ),
  };
}

function canonicalizeAndFinalizeUsages(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
): StockUsage[] {
  const ordinals = new Map<string, number>();
  return usages
    .map(cloneMutableUsage)
    .sort(canonicalMutableUsageOrder)
    .map((usage) => {
      const ordinal = (ordinals.get(usage.stockOptionId) ?? 0) + 1;
      ordinals.set(usage.stockOptionId, ordinal);
      return finalizeUsage(
        usage,
        `stock:${usage.stockOptionId}:${ordinal}`,
        settings,
      );
    });
}

function unassignedReason(
  piece: RequiredPiece,
  options: readonly StockOption[],
  settings: CuttingSettings,
): UnassignedPieceReason {
  const compatible = options.filter(
    (option) => option.stockClassId === piece.stockClassId,
  );
  if (compatible.length === 0) return 'no-compatible-stock';
  if (
    compatible.every(
      (option) => !fits(piece.lengthMm, usableLength(option, settings)),
    )
  ) {
    return 'piece-longer-than-stock';
  }
  return 'availability-exhausted';
}

function createSummary(
  requiredPieces: readonly RequiredPiece[],
  stockUsages: readonly StockUsage[],
  unassignedPieces: readonly UnassignedPiece[],
): CuttingPlanSummary {
  const requiredLengthMm = requiredPieces.reduce(
    (total, piece) => total + piece.lengthMm,
    0,
  );
  const assignedLengthMm = stockUsages.reduce(
    (total, usage) => total + usage.usedLengthMm,
    0,
  );
  const purchasedStockLengthMm = stockUsages.reduce(
    (total, usage) => total + usage.originalLengthMm,
    0,
  );
  const kerfLossMm = stockUsages.reduce(
    (total, usage) => total + usage.kerfTotalMm,
    0,
  );
  const endTrimLossMm = stockUsages.reduce(
    (total, usage) => total + usage.endTrimLossMm,
    0,
  );
  const nonReusableRemainderMm = stockUsages
    .filter((usage) => usage.remnantClassification === 'waste')
    .reduce((total, usage) => total + usage.remainingLengthMm, 0);
  const reusableRemnantLengthMm = stockUsages
    .filter((usage) => usage.remnantClassification === 'reusable-remnant')
    .reduce((total, usage) => total + usage.remainingLengthMm, 0);
  return {
    requiredPieceCount: requiredPieces.length,
    assignedPieceCount: requiredPieces.length - unassignedPieces.length,
    unassignedPieceCount: unassignedPieces.length,
    stockItemCount: stockUsages.length,
    requiredLengthMm,
    assignedLengthMm,
    purchasedStockLengthMm,
    kerfLossMm,
    endTrimLossMm,
    wasteLengthMm: endTrimLossMm + nonReusableRemainderMm,
    reusableRemnantLengthMm,
    utilizationRatio:
      purchasedStockLengthMm === 0
        ? 0
        : assignedLengthMm / purchasedStockLengthMm,
  };
}

function planSignature(stockUsages: readonly StockUsage[]) {
  return stockUsages
    .map(
      (usage) =>
        `${usage.stockClassId}|${usage.stockOptionId}|${usage.originalLengthMm}` +
        `[${usage.cuts
          .map((cut) => `${cut.requiredPieceId}:${cut.lengthMm}`)
          .join(',')}]`,
    )
    .join(';');
}

/** Evaluates a canonical physical plan without prices or weighted scores. */
export function evaluatePlanScore(
  plan: Pick<CuttingPlan, 'stockUsages' | 'summary'>,
): PlanScore {
  return {
    stockItemCount: plan.summary.stockItemCount,
    purchasedStockLengthMm: plan.summary.purchasedStockLengthMm,
    irreversibleLossMm: plan.summary.kerfLossMm + plan.summary.wasteLengthMm,
    reusableRemnantLengthMm: plan.summary.reusableRemnantLengthMm,
    unusedPurchasedLengthMm:
      plan.summary.purchasedStockLengthMm - plan.summary.assignedLengthMm,
    deterministicSignature: planSignature(plan.stockUsages),
  };
}

/**
 * Lexicographic objective comparison. Negative means `a` is preferred.
 * No weighted or monetary approximation is used.
 */
export function comparePlanScores(
  a: PlanScore,
  b: PlanScore,
  objective: OptimizationObjective,
): number {
  const keys: (keyof Omit<PlanScore, 'deterministicSignature'>)[] =
    objective === 'minimum-stock-count'
      ? [
          'stockItemCount',
          'purchasedStockLengthMm',
          'irreversibleLossMm',
          'reusableRemnantLengthMm',
          'unusedPurchasedLengthMm',
        ]
      : objective === 'minimum-purchased-length'
        ? [
            'purchasedStockLengthMm',
            'irreversibleLossMm',
            'stockItemCount',
            'reusableRemnantLengthMm',
            'unusedPurchasedLengthMm',
          ]
        : [
            'unusedPurchasedLengthMm',
            'irreversibleLossMm',
            'reusableRemnantLengthMm',
            'stockItemCount',
            'purchasedStockLengthMm',
          ];
  for (const key of keys) {
    const result = compareNumber(a[key], b[key]);
    if (result !== 0) return result;
  }
  return a.deterministicSignature.localeCompare(b.deterministicSignature);
}

function createHeuristicClassPlan(
  pieces: readonly RequiredPiece[],
  options: readonly StockOption[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
): HeuristicClassPlan {
  const usages: MutableStockUsage[] = [];
  const openedByOption = new Map<string, number>();
  const unassignedPieces: UnassignedPiece[] = [];

  pieces.forEach((piece, index) => {
    let usage = chooseOpenUsage(usages, piece, settings);
    if (!usage) {
      const option = chooseStockOption(
        options,
        openedByOption,
        piece,
        pieces.slice(index + 1),
        settings,
        objective,
      );
      if (!option) {
        unassignedPieces.push({
          requiredPieceId: piece.id,
          stockClassId: piece.stockClassId,
          lengthMm: piece.lengthMm,
          reason: unassignedReason(piece, options, settings),
        });
        return;
      }
      openedByOption.set(option.id, (openedByOption.get(option.id) ?? 0) + 1);
      usage = {
        stockClassId: option.stockClassId,
        stockOptionId: option.id,
        originalLengthMm: option.lengthMm,
        usableLengthMm: usableLength(option, settings),
        cuts: [],
        remainingLengthMm: usableLength(option, settings),
      };
      usages.push(usage);
    }
    appendPiece(usage, piece, settings);
  });

  return { usages, unassignedPieces };
}

function completedScore(
  pieces: readonly RequiredPiece[],
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
) {
  const stockUsages = canonicalizeAndFinalizeUsages(usages, settings);
  const summary = createSummary(pieces, stockUsages, []);
  return evaluatePlanScore({ stockUsages, summary });
}

function lowerBoundIrreversibleLoss(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
) {
  return usages.reduce(
    (total, usage) =>
      total +
      2 * settings.endTrimMm +
      Math.max(0, usage.cuts.length - 1) * settings.kerfMm,
    0,
  );
}

function shouldPruneSearchState(
  usages: readonly MutableStockUsage[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
  bestScore: PlanScore,
) {
  const stockItemCount = usages.length;
  const purchasedStockLengthMm = usages.reduce(
    (total, usage) => total + usage.originalLengthMm,
    0,
  );
  const irreversibleLowerBound = lowerBoundIrreversibleLoss(usages, settings);

  if (objective === 'minimum-stock-count') {
    if (stockItemCount > bestScore.stockItemCount) return true;
    if (
      stockItemCount === bestScore.stockItemCount &&
      compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) >
        0
    ) {
      return true;
    }
    return (
      stockItemCount === bestScore.stockItemCount &&
      compareNumber(
        purchasedStockLengthMm,
        bestScore.purchasedStockLengthMm,
      ) === 0 &&
      compareNumber(irreversibleLowerBound, bestScore.irreversibleLossMm) > 0
    );
  }

  if (
    compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) > 0
  ) {
    return true;
  }
  return (
    compareNumber(purchasedStockLengthMm, bestScore.purchasedStockLengthMm) ===
      0 &&
    compareNumber(irreversibleLowerBound, bestScore.irreversibleLossMm) > 0
  );
}

function searchStateKey(
  pieceIndex: number,
  usages: readonly MutableStockUsage[],
) {
  return `${pieceIndex}|${usages
    .map(
      (usage) =>
        `${usage.stockOptionId}:${usage.remainingLengthMm}:${usage.cuts
          .map((cut) => cut.requiredPieceId)
          .join(',')}`,
    )
    .sort()
    .join(';')}`;
}

function countOpenedOption(
  usages: readonly MutableStockUsage[],
  stockOptionId: string,
) {
  return usages.filter((usage) => usage.stockOptionId === stockOptionId).length;
}

function boundedSearchClassPlan(
  pieces: readonly RequiredPiece[],
  options: readonly StockOption[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
  initialCompleteUsages: readonly MutableStockUsage[] | undefined,
  stateBudget: number,
): SearchResult {
  let bestUsages = initialCompleteUsages?.map(cloneMutableUsage);
  let bestScore = bestUsages
    ? completedScore(pieces, bestUsages, settings)
    : undefined;
  let statesVisited = 0;
  let budgetReached = false;
  const seenStates = new Set<string>();

  const visit = (pieceIndex: number, usages: MutableStockUsage[]) => {
    const stateKey = searchStateKey(pieceIndex, usages);
    if (seenStates.has(stateKey)) return;
    if (statesVisited >= stateBudget) {
      budgetReached = true;
      return;
    }
    seenStates.add(stateKey);
    statesVisited += 1;

    if (
      bestScore &&
      shouldPruneSearchState(usages, settings, objective, bestScore)
    ) {
      return;
    }
    if (pieceIndex === pieces.length) {
      const score = completedScore(pieces, usages, settings);
      if (!bestScore || comparePlanScores(score, bestScore, objective) < 0) {
        bestScore = score;
        bestUsages = usages.map(cloneMutableUsage);
      }
      return;
    }

    const piece = pieces[pieceIndex]!;
    const existingCandidates = usages
      .map((usage, index) => ({ usage, index }))
      .filter(({ usage }) =>
        fits(requiredSpaceFor(usage, piece, settings), usage.remainingLengthMm),
      )
      .sort(
        (a, b) =>
          a.usage.remainingLengthMm -
            requiredSpaceFor(a.usage, piece, settings) -
            (b.usage.remainingLengthMm -
              requiredSpaceFor(b.usage, piece, settings)) ||
          canonicalMutableUsageOrder(a.usage, b.usage),
      );
    const equivalentOpenUsages = new Set<string>();
    for (const { usage, index } of existingCandidates) {
      const equivalenceKey = `${usage.stockOptionId}|${usage.remainingLengthMm}`;
      if (equivalentOpenUsages.has(equivalenceKey)) continue;
      equivalentOpenUsages.add(equivalenceKey);
      const nextUsages = usages.map(cloneMutableUsage);
      appendPiece(nextUsages[index]!, piece, settings);
      visit(pieceIndex + 1, nextUsages);
      if (budgetReached) return;
    }

    const newOptions = options
      .filter(
        (option) =>
          (option.availability === undefined ||
            countOpenedOption(usages, option.id) < option.availability) &&
          fits(piece.lengthMm, usableLength(option, settings)),
      )
      .sort(
        stockOptionComparator(
          piece,
          pieces.slice(pieceIndex + 1),
          settings,
          objective,
        ),
      );
    for (const option of newOptions) {
      const newUsage: MutableStockUsage = {
        stockClassId: option.stockClassId,
        stockOptionId: option.id,
        originalLengthMm: option.lengthMm,
        usableLengthMm: usableLength(option, settings),
        cuts: [],
        remainingLengthMm: usableLength(option, settings),
      };
      appendPiece(newUsage, piece, settings);
      visit(pieceIndex + 1, [...usages.map(cloneMutableUsage), newUsage]);
      if (budgetReached) return;
    }
  };

  visit(0, []);
  return {
    usages: bestUsages ?? [],
    statesVisited,
    budgetReached,
    foundCompletePlan: bestUsages !== undefined,
  };
}

function overallOptimality(
  diagnostics: readonly StockClassSolverDiagnostic[],
): OptimalityStatus {
  if (diagnostics.some((item) => item.searchBudgetReached)) {
    return 'search-budget-exhausted';
  }
  if (diagnostics.some((item) => item.optimality === 'heuristic')) {
    return 'heuristic';
  }
  return 'proven-within-search-space';
}

/**
 * Hybrid deterministic optimizer.
 *
 * Stock classes are independent. Each class starts with a best-fit-decreasing
 * heuristic plan. Small complete groups are then improved by bounded
 * branch-and-bound; large, incomplete or budget-exhausted groups safely return
 * the best deterministic plan found.
 */
export function createCuttingPlan(input: CuttingPlanInput): CuttingPlan {
  const validationIssues = validateCuttingPlanInput(input);
  if (validationIssues.length > 0) {
    throw new ProcurementValidationError(validationIssues);
  }

  const objective = input.objective ?? 'minimum-waste';
  const limits = resolveSolverLimits(input.solverLimits);
  const pieces = input.requiredPieces
    .map((item) => ({
      ...item,
      source: item.source ? { ...item.source } : undefined,
    }))
    .sort(pieceOrder);
  const options = input.stockOptions
    .map((option) => ({ ...option }))
    .sort(optionOrder);
  const stockClassIds = [
    ...new Set(pieces.map((item) => item.stockClassId)),
  ].sort();
  const selectedUsages: MutableStockUsage[] = [];
  const unassignedPieces: UnassignedPiece[] = [];
  const stockClassDiagnostics: StockClassSolverDiagnostic[] = [];

  for (const stockClassId of stockClassIds) {
    const classPieces = pieces.filter(
      (item) => item.stockClassId === stockClassId,
    );
    const classOptions = options.filter(
      (option) => option.stockClassId === stockClassId,
    );
    const heuristic = createHeuristicClassPlan(
      classPieces,
      classOptions,
      input.settings,
      objective,
    );
    let usages = heuristic.usages;
    let classUnassignedPieces = heuristic.unassignedPieces;
    let strategy: StockClassSolverDiagnostic['strategy'] =
      'bounded-branch-and-bound';
    let optimality: OptimalityStatus = 'proven-within-search-space';
    let statesVisited = 0;
    let budgetReached = false;
    let fallbackReason: StockClassFallbackReason | undefined;

    const everyPieceHasAvailableFit = classPieces.every((piece) =>
      classOptions.some(
        (option) =>
          (option.availability === undefined || option.availability > 0) &&
          fits(piece.lengthMm, usableLength(option, input.settings)),
      ),
    );

    if (!everyPieceHasAvailableFit) {
      strategy = 'heuristic-fallback';
      optimality = 'heuristic';
      fallbackReason = 'unfulfilled-requirements';
    } else if (classPieces.length > limits.exactPieceLimit) {
      strategy = 'heuristic-fallback';
      optimality = 'heuristic';
      fallbackReason = 'group-too-large';
    } else if (classOptions.length > MAX_EXACT_STOCK_OPTIONS) {
      strategy = 'heuristic-fallback';
      optimality = 'heuristic';
      fallbackReason = 'stock-option-count-limit';
    } else {
      const search = boundedSearchClassPlan(
        classPieces,
        classOptions,
        input.settings,
        objective,
        heuristic.unassignedPieces.length === 0 ? heuristic.usages : undefined,
        limits.searchStateBudgetPerStockClass,
      );
      statesVisited = search.statesVisited;
      budgetReached = search.budgetReached;
      if (search.foundCompletePlan) {
        usages = search.usages;
        classUnassignedPieces = [];
        optimality = search.budgetReached
          ? 'search-budget-exhausted'
          : 'proven-within-search-space';
      } else {
        strategy = 'heuristic-fallback';
        optimality = search.budgetReached
          ? 'search-budget-exhausted'
          : 'heuristic';
        fallbackReason = 'unfulfilled-requirements';
      }
    }

    selectedUsages.push(...usages);
    unassignedPieces.push(...classUnassignedPieces);
    stockClassDiagnostics.push({
      stockClassId,
      pieceCount: classPieces.length,
      stockOptionCount: classOptions.length,
      strategy,
      optimality,
      searchStatesVisited: statesVisited,
      searchStateBudget: limits.searchStateBudgetPerStockClass,
      searchBudgetReached: budgetReached,
      ...(fallbackReason ? { fallbackReason } : {}),
    });
  }

  unassignedPieces.sort(
    (a, b) =>
      a.stockClassId.localeCompare(b.stockClassId) ||
      b.lengthMm - a.lengthMm ||
      a.requiredPieceId.localeCompare(b.requiredPieceId),
  );
  const stockUsages = canonicalizeAndFinalizeUsages(
    selectedUsages,
    input.settings,
  );
  const summary = createSummary(pieces, stockUsages, unassignedPieces);
  const solver: SolverStrategy = 'hybrid-bounded-branch-and-bound-v2';
  const optimality = overallOptimality(stockClassDiagnostics);
  const diagnostics: SolverDiagnostics = {
    objective,
    strategy: solver,
    optimality,
    searchStatesVisited: stockClassDiagnostics.reduce(
      (total, item) => total + item.searchStatesVisited,
      0,
    ),
    searchStateBudgetPerStockClass: limits.searchStateBudgetPerStockClass,
    searchBudgetReached: stockClassDiagnostics.some(
      (item) => item.searchBudgetReached,
    ),
    stockClasses: stockClassDiagnostics,
  };
  return {
    status:
      unassignedPieces.length === 0
        ? 'complete'
        : summary.assignedPieceCount === 0
          ? 'unfulfilled'
          : 'partial',
    objective,
    solver,
    optimality,
    score: evaluatePlanScore({ stockUsages, summary }),
    diagnostics,
    stockUsages,
    unassignedPieces,
    summary,
  };
}

/** Aggregates the physical commercial stock opened by a plan. */
export function aggregateStockRequirements(
  plan: Pick<CuttingPlan, 'stockUsages'>,
): StockRequirement[] {
  const groups = new Map<string, StockRequirement>();
  for (const usage of plan.stockUsages) {
    const key = `${usage.stockClassId}\u0000${usage.stockOptionId}\u0000${usage.originalLengthMm}`;
    const existing = groups.get(key);
    if (existing) existing.quantity += 1;
    else {
      groups.set(key, {
        stockClassId: usage.stockClassId,
        stockOptionId: usage.stockOptionId,
        lengthMm: usage.originalLengthMm,
        quantity: 1,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.stockClassId.localeCompare(b.stockClassId) ||
      a.lengthMm - b.lengthMm ||
      a.stockOptionId.localeCompare(b.stockOptionId),
  );
}
