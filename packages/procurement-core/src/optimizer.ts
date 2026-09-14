import {
  canonicalizeAndFinalizeUsages,
  createSummary,
  evaluatePlanScore,
} from './accounting';
import {
  boundedSearchClassPlan,
  MAX_EXACT_STOCK_OPTIONS,
} from './bounded-search';
import {
  fits,
  requiredPieceOrder,
  stockOptionOrder,
  usableLength,
  type MutableStockUsage,
} from './fit';
import { createHeuristicClassPlan } from './heuristic';
import type {
  CuttingPlan,
  CuttingPlanInput,
  OptimalityStatus,
  SolverDiagnostics,
  SolverStrategy,
  StockClassFallbackReason,
  StockClassSolverDiagnostic,
  UnassignedPiece,
} from './model';
import {
  ProcurementValidationError,
  resolveSolverLimits,
  validateCuttingPlanInput,
} from './validation';

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
    .sort(requiredPieceOrder);
  const options = input.stockOptions
    .map((option) => ({ ...option }))
    .sort(stockOptionOrder);
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
          fits(
            piece.requiredBlankLengthMm,
            usableLength(option, input.settings),
          ),
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
      b.requiredBlankLengthMm - a.requiredBlankLengthMm ||
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
