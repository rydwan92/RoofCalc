/** Pure stock-length procurement contracts. All lengths are canonical millimetres. */
export type StockClassId = string;

/**
 * Opaque upstream correlation. Procurement preserves the required-piece ID and
 * never parses or assigns meaning to this reference.
 */
export interface RequiredPieceSource {
  referenceId: string;
}

/**
 * One indivisible physical fabrication blank requirement.
 *
 * `requiredBlankLengthMm` is the length procurement must obtain from one
 * compatible stock item before procurement kerf and stock-end trims are
 * applied. Any fabrication allowance has already been resolved upstream.
 */
export interface RequiredPiece {
  id: string;
  stockClassId: StockClassId;
  requiredBlankLengthMm: number;
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
  /** Material consumed between two adjacent required blanks. */
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
  requiredBlankLengthMm: number;
}

export type RemnantClassification = 'none' | 'waste' | 'reusable-remnant';

export interface StockUsage {
  stockClassId: StockClassId;
  stockOptionId: string;
  stockInstanceId: string;
  originalLengthMm: number;
  usableLengthMm: number;
  cuts: CutAssignment[];
  /** Sum of assigned fabrication-blank lengths, excluding kerf and trims. */
  assignedBlankLengthMm: number;
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
  requiredBlankLengthMm: number;
  reason: UnassignedPieceReason;
}

export interface CuttingPlanSummary {
  requiredPieceCount: number;
  assignedPieceCount: number;
  unassignedPieceCount: number;
  stockItemCount: number;
  /** Sum of all required blanks, including unassigned blanks. */
  requiredBlankLengthMm: number;
  assignedBlankLengthMm: number;
  purchasedStockLengthMm: number;
  kerfLossMm: number;
  endTrimLossMm: number;
  /** End trims plus non-reusable positive remainders; kerf is separate. */
  wasteLengthMm: number;
  reusableRemnantLengthMm: number;
  /** Assigned blank length divided by opened commercial stock length. */
  utilizationRatio: number;
}

/** Pure physical plan evaluation. The signature is the final stable tie-break. */
export interface PlanScore {
  stockItemCount: number;
  purchasedStockLengthMm: number;
  /** Kerf + end trims + positive non-reusable remainders. */
  irreversibleLossMm: number;
  reusableRemnantLengthMm: number;
  /** All opened stock not assigned to required blanks in this plan. */
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
  /** Commercial stock length, not a fabrication-blank length. */
  lengthMm: number;
  quantity: number;
}

export type ProcurementValidationIssueCode =
  | 'invalid-id'
  | 'duplicate-required-piece-id'
  | 'duplicate-stock-option-id'
  | 'invalid-required-piece-source'
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
