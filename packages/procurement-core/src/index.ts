/**
 * Public API for pure physical fabrication-blank procurement planning.
 * Algorithm/search internals are intentionally not exported from this barrel.
 */
export { aggregateStockRequirements } from './aggregation';
export { evaluatePlanScore } from './accounting';
export { createCuttingPlan } from './optimizer';
export { comparePlanScores } from './scoring';
export {
  DEFAULT_SOLVER_LIMITS,
  ProcurementValidationError,
  validateCuttingPlanInput,
} from './validation';
export type {
  CutAssignment,
  CuttingPlan,
  CuttingPlanInput,
  CuttingPlanSummary,
  CuttingSettings,
  OptimizationObjective,
  OptimalityStatus,
  PlanScore,
  ProcurementValidationIssue,
  ProcurementValidationIssueCode,
  RemnantClassification,
  RequiredPiece,
  RequiredPieceSource,
  SolverDiagnostics,
  SolverLimits,
  SolverStrategy,
  StockClassFallbackReason,
  StockClassId,
  StockClassSolverDiagnostic,
  StockOption,
  StockRequirement,
  StockUsage,
  UnassignedPiece,
  UnassignedPieceReason,
} from './model';
