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

export type OptimizationObjective = 'minimum-waste' | 'minimum-stock-count';

export interface CuttingPlanInput {
  requiredPieces: readonly RequiredPiece[];
  stockOptions: readonly StockOption[];
  settings: CuttingSettings;
  objective?: OptimizationObjective;
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

export interface CuttingPlan {
  status: 'complete' | 'partial' | 'unfulfilled';
  objective: OptimizationObjective;
  /** Identifies the deterministic heuristic, not a global optimum claim. */
  solver: 'deterministic-best-fit-decreasing-v1';
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
  | 'invalid-objective';

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
  stockInstanceId: string;
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

const LENGTH_EPSILON_MM = 1e-9;

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function positiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
    input.objective !== 'minimum-stock-count'
  ) {
    issues.push({ path: 'objective', code: 'invalid-objective' });
  }

  return issues;
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
        a.stockInstanceId.localeCompare(b.stockInstanceId)
      );
    })[0];
}

function chooseStockOption(
  options: readonly StockOption[],
  openedByOption: ReadonlyMap<string, number>,
  piece: RequiredPiece,
  futurePieces: readonly RequiredPiece[],
  settings: CuttingSettings,
  objective: OptimizationObjective,
) {
  const candidates = options.filter((option) => {
    const available = option.availability;
    const opened = openedByOption.get(option.id) ?? 0;
    return (
      option.stockClassId === piece.stockClassId &&
      (available === undefined || opened < available) &&
      fits(piece.lengthMm, usableLength(option, settings))
    );
  });

  return candidates.sort((a, b) => {
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
  })[0];
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

function finalizeUsage(
  usage: MutableStockUsage,
  settings: CuttingSettings,
): StockUsage {
  const usedLengthMm = usage.cuts.reduce(
    (total, cut) => total + cut.lengthMm,
    0,
  );
  return {
    stockClassId: usage.stockClassId,
    stockOptionId: usage.stockOptionId,
    stockInstanceId: usage.stockInstanceId,
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

/**
 * Deterministic best-fit-decreasing heuristic.
 *
 * Existing compatible remainders are always considered before opening stock.
 * `minimum-waste` opens the shortest immediately fitting option. The
 * `minimum-stock-count` variant uses a bounded one-stock greedy look-ahead to
 * prefer the option that can hold more remaining pieces. Neither objective
 * claims a mathematically global optimum.
 */
export function createCuttingPlan(input: CuttingPlanInput): CuttingPlan {
  const validationIssues = validateCuttingPlanInput(input);
  if (validationIssues.length > 0) {
    throw new ProcurementValidationError(validationIssues);
  }

  const objective = input.objective ?? 'minimum-waste';
  const pieces = input.requiredPieces
    .map((piece) => ({
      ...piece,
      source: piece.source ? { ...piece.source } : undefined,
    }))
    .sort(pieceOrder);
  const options = input.stockOptions
    .map((option) => ({ ...option }))
    .sort(optionOrder);
  const mutableUsages: MutableStockUsage[] = [];
  const openedByOption = new Map<string, number>();
  const unassignedPieces: UnassignedPiece[] = [];

  pieces.forEach((piece, index) => {
    let usage = chooseOpenUsage(mutableUsages, piece, input.settings);
    if (!usage) {
      const option = chooseStockOption(
        options,
        openedByOption,
        piece,
        pieces.slice(index + 1),
        input.settings,
        objective,
      );
      if (!option) {
        unassignedPieces.push({
          requiredPieceId: piece.id,
          stockClassId: piece.stockClassId,
          lengthMm: piece.lengthMm,
          reason: unassignedReason(piece, options, input.settings),
        });
        return;
      }
      const ordinal = (openedByOption.get(option.id) ?? 0) + 1;
      openedByOption.set(option.id, ordinal);
      usage = {
        stockClassId: option.stockClassId,
        stockOptionId: option.id,
        stockInstanceId: `stock:${option.id}:${ordinal}`,
        originalLengthMm: option.lengthMm,
        usableLengthMm: usableLength(option, input.settings),
        cuts: [],
        remainingLengthMm: usableLength(option, input.settings),
      };
      mutableUsages.push(usage);
    }
    appendPiece(usage, piece, input.settings);
  });

  const stockUsages = mutableUsages.map((usage) =>
    finalizeUsage(usage, input.settings),
  );
  const summary = createSummary(
    input.requiredPieces,
    stockUsages,
    unassignedPieces,
  );
  return {
    status:
      unassignedPieces.length === 0
        ? 'complete'
        : summary.assignedPieceCount === 0
          ? 'unfulfilled'
          : 'partial',
    objective,
    solver: 'deterministic-best-fit-decreasing-v1',
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
