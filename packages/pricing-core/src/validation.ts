import type {
  PricingValidationIssue,
  PricingValidationIssueCode,
} from './model';

export class PricingValidationError extends Error {
  override readonly name = 'PricingValidationError';
  readonly issues: readonly PricingValidationIssue[];

  constructor(issues: readonly PricingValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.code}`).join('; '));
    this.issues = issues;
  }
}

export function pricingIssue(
  path: string,
  code: PricingValidationIssueCode,
): PricingValidationIssue {
  return { path, code };
}

export function isValidCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value);
}

export function isValidMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Canonical validity dates are plain ISO calendar dates, not timestamps. */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

export function isValidValidityRange(
  validFrom: string,
  validTo: string | undefined,
): boolean {
  if (!isValidDateString(validFrom)) return false;
  if (validTo === undefined) return true;
  return isValidDateString(validTo) && validTo >= validFrom;
}
