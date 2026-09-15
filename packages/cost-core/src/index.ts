/**
 * Public API for the pure cost-estimate model (V34B). Money, quantity basis,
 * suitability, cost lines and scenario totals only — no product, geometry or
 * procurement concept, and no translation (ADR-005).
 */
export { COST_LINE_CATEGORIES } from './model';
export type {
  ComputedCostLine,
  CostCategoryTotal,
  CostLine,
  CostLineCategory,
  CostLineSource,
  CostQuantityBasis,
  CostScenario,
  CostScenarioSummary,
  CostSuitability,
  CostValidationIssue,
  CostValidationIssueCode,
  Money,
  Quantity,
  QuantityUnit,
} from './model';
export {
  CostValidationError,
  createMoney,
  isValidCurrencyCode,
  isValidMinorUnits,
  isValidQuantityValue,
  isValidTaxRateBps,
  isValidUnitPriceMinor,
  MINOR_UNITS_PER_MAJOR,
  validateMoney,
} from './validation';
export {
  acceptProjectQuantity,
  calculateLine,
  createCostLine,
  keepManualQuantity,
  projectQuantityDiverged,
  restoreFromProject,
  sortCostLines,
  withIncluded,
  withManualQuantity,
  withUnitPrice,
} from './line';
export type { CostLineInput } from './line';
export {
  addCostLine,
  createEmptyCostScenario,
  linesByCategory,
  removeCostLine,
  replaceCostLine,
  setScenarioTaxRateBps,
  sortedScenarioLines,
  summarizeCostScenario,
} from './scenario';
export {
  costScenarioV1Schema,
  parseCostScenario,
  serializeCostScenario,
} from './persistence';
