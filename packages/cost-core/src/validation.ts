import type {
  CostValidationIssue,
  CostValidationIssueCode,
  Money,
} from './model';

export class CostValidationError extends Error {
  override readonly name = 'CostValidationError';
  readonly issues: readonly CostValidationIssue[];

  constructor(issues: readonly CostValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.code}`).join('; '));
    this.issues = issues;
  }
}

function issue(
  path: string,
  code: CostValidationIssueCode,
): CostValidationIssue {
  return { path, code };
}

export const MINOR_UNITS_PER_MAJOR = 100;

export function isValidCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

export function isValidMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Money is always non-negative; a discount/refund line is out of scope for V34B. */
export function validateMoney(
  money: Money,
  path = 'money',
): CostValidationIssue[] {
  const issues: CostValidationIssue[] = [];
  if (!isValidCurrencyCode(money.currencyCode))
    issues.push(issue(`${path}.currencyCode`, 'invalid-currency-code'));
  if (!isValidMinorUnits(money.minorUnits))
    issues.push(issue(`${path}.minorUnits`, 'invalid-minor-units'));
  return issues;
}

export function createMoney(currencyCode: string, minorUnits: number): Money {
  const issues = validateMoney({ currencyCode, minorUnits });
  if (issues.length) throw new CostValidationError(issues);
  return { currencyCode, minorUnits };
}

export function isValidQuantityValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidUnitPriceMinor(value: unknown): value is number {
  return isValidMinorUnits(value);
}

/** Tax is expressed in basis points (100 bps = 1%); 0-100% inclusive. */
export function isValidTaxRateBps(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 10000
  );
}

export { issue as costIssue };
