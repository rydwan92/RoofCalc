import type {
  CuttingPlanInput,
  ProcurementValidationIssue,
  SolverLimits,
} from './model';

const MAX_CONFIGURABLE_EXACT_PIECES = 20;
const MAX_CONFIGURABLE_SEARCH_STATES = 100_000;

export const DEFAULT_SOLVER_LIMITS: Readonly<Required<SolverLimits>> = {
  exactPieceLimit: 16,
  searchStateBudgetPerStockClass: 50_000,
};

export class ProcurementValidationError extends Error {
  readonly issues: ProcurementValidationIssue[];

  constructor(issues: ProcurementValidationIssue[]) {
    super('invalid_procurement_input');
    this.name = 'ProcurementValidationError';
    this.issues = issues;
  }
}

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
    if (!positiveFinite(piece.requiredBlankLengthMm)) {
      issues.push({
        path: `${path}.requiredBlankLengthMm`,
        code: 'invalid-required-piece-length',
      });
    }
    if (piece.source && !validId(piece.source.referenceId)) {
      issues.push({
        path: `${path}.source.referenceId`,
        code: 'invalid-required-piece-source',
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

  for (const key of [
    'kerfMm',
    'endTrimMm',
    'minimumReusableRemnantMm',
  ] as const) {
    if (!nonnegativeFinite(input.settings[key])) {
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

export function resolveSolverLimits(
  limits?: SolverLimits,
): Required<SolverLimits> {
  return {
    exactPieceLimit:
      limits?.exactPieceLimit ?? DEFAULT_SOLVER_LIMITS.exactPieceLimit,
    searchStateBudgetPerStockClass:
      limits?.searchStateBudgetPerStockClass ??
      DEFAULT_SOLVER_LIMITS.searchStateBudgetPerStockClass,
  };
}
