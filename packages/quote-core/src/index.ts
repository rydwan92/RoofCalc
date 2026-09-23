/**
 * Pure commercial quote snapshots. This package deliberately knows no roof,
 * geometry, catalogue API, database, React or browser persistence.
 */

export type QuoteUnit =
  | 'piece'
  | 'pack'
  | 'pallet'
  | 'roll'
  | 'm'
  | 'm2'
  | 'm3'
  | 'kg'
  | 'hour'
  | 'flat';

export type QuoteLineGroup =
  'covering' | 'layers' | 'roof-system' | 'drainage' | 'construction' | 'other';

export interface QuoteOrganizationSnapshot {
  id: string;
  name: string;
  taxId?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export interface QuoteCustomerSnapshot {
  name: string;
  companyName?: string;
  taxId?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface QuoteProjectReference {
  id: string;
  name: string;
  location?: string;
}

export type QuotePriceSource =
  'organization-price-list' | 'manual-estimation' | 'missing';

export interface QuoteQuantity {
  value: number;
  unit: QuoteUnit;
}

export interface QuoteLine {
  id: string;
  group: QuoteLineGroup;
  description: string;
  organizationSku?: string;
  commercialVariantId?: string;
  technicalQuantity: QuoteQuantity;
  offerQuantity: QuoteQuantity;
  /** Explicitly records a downstream sales decision; technicalQuantity never changes. */
  quantityOverridden: boolean;
  /** Current quote price. Undefined when priceSource is `missing`. */
  unitNetAmountMinor?: number;
  /** Kept visible after a manual override, without changing the company list. */
  organizationUnitNetAmountMinor?: number;
  priceSource: QuotePriceSource;
  discountBps?: number;
  /** Missing VAT remains explicit and makes gross totals incomplete. */
  vatRateBps?: number;
  included: boolean;
}

export interface QuoteDraft {
  number?: string;
  issuedOn?: string;
  preparedBy?: string;
  schemaVersion: 1;
  id: string;
  status: 'draft';
  organizationSnapshot: QuoteOrganizationSnapshot;
  customerSnapshot: QuoteCustomerSnapshot;
  projectReference: QuoteProjectReference;
  createdAt: string;
  validUntil?: string;
  currencyCode: string;
  sourceFingerprint: string;
  lines: QuoteLine[];
  notes?: string;
  footer?: string;
}

export { quoteDraftSchema } from './schema';

export interface ComputedQuoteLine {
  line: QuoteLine;
  priced: boolean;
  hasVat: boolean;
  netBeforeDiscountMinor?: number;
  discountMinor?: number;
  netMinor?: number;
  taxMinor?: number;
  grossMinor?: number;
}

export interface QuoteVatTotal {
  vatRateBps: number;
  netMinor: number;
  taxMinor: number;
  grossMinor: number;
}

export interface QuoteSummary {
  includedLineCount: number;
  readyLineCount: number;
  missingPriceCount: number;
  missingVatCount: number;
  overriddenQuantityCount: number;
  netBeforeDiscountMinor: number;
  discountMinor: number;
  netMinor: number;
  taxMinor?: number;
  grossMinor?: number;
  vatTotals: QuoteVatTotal[];
  complete: boolean;
}

function validNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function assertLine(line: QuoteLine): void {
  if (!line.id.trim() || !line.description.trim())
    throw new Error('invalid-quote-line');
  if (
    !validNonNegative(line.technicalQuantity.value) ||
    !validNonNegative(line.offerQuantity.value) ||
    line.technicalQuantity.unit !== line.offerQuantity.unit
  )
    throw new Error('invalid-quote-quantity');
  for (const value of [
    line.unitNetAmountMinor,
    line.organizationUnitNetAmountMinor,
  ])
    if (value !== undefined && (!Number.isInteger(value) || value < 0))
      throw new Error('invalid-quote-money');
  if (
    line.discountBps !== undefined &&
    (!Number.isInteger(line.discountBps) ||
      line.discountBps < 0 ||
      line.discountBps > 10_000)
  )
    throw new Error('invalid-quote-discount');
  if (
    line.vatRateBps !== undefined &&
    (!Number.isInteger(line.vatRateBps) ||
      line.vatRateBps < 0 ||
      line.vatRateBps > 10_000)
  )
    throw new Error('invalid-quote-vat');
  if (line.priceSource === 'missing' && line.unitNetAmountMinor !== undefined)
    throw new Error('missing-price-has-amount');
}

export function calculateQuoteLine(line: QuoteLine): ComputedQuoteLine {
  assertLine(line);
  if (!line.included || line.unitNetAmountMinor === undefined)
    return {
      line,
      priced: line.unitNetAmountMinor !== undefined,
      hasVat: line.vatRateBps !== undefined,
    };
  const netBeforeDiscountMinor = Math.round(
    line.offerQuantity.value * line.unitNetAmountMinor,
  );
  const discountMinor = Math.round(
    (netBeforeDiscountMinor * (line.discountBps ?? 0)) / 10_000,
  );
  const netMinor = netBeforeDiscountMinor - discountMinor;
  const taxMinor =
    line.vatRateBps === undefined
      ? undefined
      : Math.round((netMinor * line.vatRateBps) / 10_000);
  return {
    line,
    priced: true,
    hasVat: taxMinor !== undefined,
    netBeforeDiscountMinor,
    discountMinor,
    netMinor,
    ...(taxMinor === undefined
      ? {}
      : { taxMinor, grossMinor: netMinor + taxMinor }),
  };
}

export function summarizeQuote(draft: QuoteDraft): QuoteSummary {
  const included = draft.lines.filter((line) => line.included);
  const computed = included.map(calculateQuoteLine);
  const priced = computed.filter((line) => line.priced);
  const withVat = computed.filter(
    (
      line,
    ): line is ComputedQuoteLine & {
      netMinor: number;
      taxMinor: number;
      grossMinor: number;
      line: QuoteLine & { vatRateBps: number };
    } =>
      line.netMinor !== undefined &&
      line.taxMinor !== undefined &&
      line.grossMinor !== undefined &&
      line.line.vatRateBps !== undefined,
  );
  const vatMap = new Map<number, QuoteVatTotal>();
  for (const line of withVat) {
    const current = vatMap.get(line.line.vatRateBps) ?? {
      vatRateBps: line.line.vatRateBps,
      netMinor: 0,
      taxMinor: 0,
      grossMinor: 0,
    };
    current.netMinor += line.netMinor;
    current.taxMinor += line.taxMinor;
    current.grossMinor += line.grossMinor;
    vatMap.set(line.line.vatRateBps, current);
  }
  const missingPriceCount = computed.filter((line) => !line.priced).length;
  const missingVatCount = computed.filter((line) => !line.hasVat).length;
  return {
    includedLineCount: included.length,
    readyLineCount: computed.filter((line) => line.priced && line.hasVat)
      .length,
    missingPriceCount,
    missingVatCount,
    overriddenQuantityCount: included.filter((line) => line.quantityOverridden)
      .length,
    netBeforeDiscountMinor: priced.reduce(
      (sum, line) => sum + (line.netBeforeDiscountMinor ?? 0),
      0,
    ),
    discountMinor: priced.reduce(
      (sum, line) => sum + (line.discountMinor ?? 0),
      0,
    ),
    netMinor: priced.reduce((sum, line) => sum + (line.netMinor ?? 0), 0),
    ...(missingVatCount === 0 && missingPriceCount === 0
      ? {
          taxMinor: withVat.reduce((sum, line) => sum + line.taxMinor, 0),
          grossMinor: withVat.reduce((sum, line) => sum + line.grossMinor, 0),
        }
      : {}),
    vatTotals: [...vatMap.values()].sort((a, b) => a.vatRateBps - b.vatRateBps),
    complete:
      included.length > 0 && missingPriceCount === 0 && missingVatCount === 0,
  };
}

export interface CreateQuoteDraftInput {
  footer?: string;
  number?: string;
  issuedOn?: string;
  preparedBy?: string;
  id: string;
  organizationSnapshot: QuoteOrganizationSnapshot;
  customerSnapshot: QuoteCustomerSnapshot;
  projectReference: QuoteProjectReference;
  createdAt: string;
  validUntil?: string;
  currencyCode: string;
  sourceFingerprint: string;
  lines: QuoteLine[];
  notes?: string;
}

export function createQuoteDraft(input: CreateQuoteDraftInput): QuoteDraft {
  if (
    !input.id.trim() ||
    !input.organizationSnapshot.name.trim() ||
    !input.customerSnapshot.name.trim() ||
    !input.projectReference.name.trim() ||
    !/^[A-Z]{3}$/.test(input.currencyCode)
  )
    throw new Error('invalid-quote-draft');
  input.lines.forEach(assertLine);
  return {
    schemaVersion: 1,
    id: input.id,
    status: 'draft',
    ...(input.number ? { number: input.number } : {}),
    ...(input.issuedOn ? { issuedOn: input.issuedOn } : {}),
    ...(input.preparedBy ? { preparedBy: input.preparedBy } : {}),
    organizationSnapshot: { ...input.organizationSnapshot },
    customerSnapshot: { ...input.customerSnapshot },
    projectReference: { ...input.projectReference },
    createdAt: input.createdAt,
    ...(input.validUntil ? { validUntil: input.validUntil } : {}),
    currencyCode: input.currencyCode,
    ...(input.footer ? { footer: input.footer } : {}),
    sourceFingerprint: input.sourceFingerprint,
    lines: input.lines.map((line) => structuredClone(line)),
    ...(input.notes ? { notes: input.notes } : {}),
  };
}

function replaceLine(
  draft: QuoteDraft,
  id: string,
  update: (line: QuoteLine) => QuoteLine,
): QuoteDraft {
  return {
    ...draft,
    lines: draft.lines.map((line) => (line.id === id ? update(line) : line)),
  };
}

export function withQuoteUnitPrice(
  draft: QuoteDraft,
  id: string,
  unitNetAmountMinor: number | undefined,
): QuoteDraft {
  if (
    unitNetAmountMinor !== undefined &&
    (!Number.isInteger(unitNetAmountMinor) || unitNetAmountMinor < 0)
  )
    throw new Error('invalid-quote-money');
  return replaceLine(draft, id, (line) => ({
    ...line,
    ...(unitNetAmountMinor === undefined
      ? { unitNetAmountMinor: undefined, priceSource: 'missing' as const }
      : {
          unitNetAmountMinor,
          priceSource: 'manual-estimation' as const,
        }),
  }));
}

export function withQuoteDiscount(
  draft: QuoteDraft,
  id: string,
  discountBps: number | undefined,
): QuoteDraft {
  if (
    discountBps !== undefined &&
    (!Number.isInteger(discountBps) || discountBps < 0 || discountBps > 10_000)
  )
    throw new Error('invalid-quote-discount');
  return replaceLine(draft, id, (line) => ({ ...line, discountBps }));
}

export function withQuoteVat(
  draft: QuoteDraft,
  id: string,
  vatRateBps: number | undefined,
): QuoteDraft {
  if (
    vatRateBps !== undefined &&
    (!Number.isInteger(vatRateBps) || vatRateBps < 0 || vatRateBps > 10_000)
  )
    throw new Error('invalid-quote-vat');
  return replaceLine(draft, id, (line) => ({ ...line, vatRateBps }));
}

export function withQuoteQuantity(
  draft: QuoteDraft,
  id: string,
  offerValue: number,
): QuoteDraft {
  if (!validNonNegative(offerValue)) throw new Error('invalid-quote-quantity');
  return replaceLine(draft, id, (line) => ({
    ...line,
    offerQuantity: { ...line.offerQuantity, value: offerValue },
    quantityOverridden: offerValue !== line.technicalQuantity.value,
  }));
}

export function withQuoteIncluded(
  draft: QuoteDraft,
  id: string,
  included: boolean,
): QuoteDraft {
  return replaceLine(draft, id, (line) => ({ ...line, included }));
}

export function quoteIsStale(
  draft: QuoteDraft,
  currentFingerprint: string,
): boolean {
  return draft.sourceFingerprint !== currentFingerprint;
}
/** Commercial comparison consumes frozen quotes, never live roof geometry. */
export function summarizeQuoteByGroup(
  draft: QuoteDraft,
): Partial<Record<QuoteLineGroup, QuoteSummary>> {
  return Object.fromEntries(
    [
      ...new Set(
        draft.lines.filter((line) => line.included).map((line) => line.group),
      ),
    ].map((group) => [
      group,
      summarizeQuote({
        ...draft,
        lines: draft.lines.filter((line) => line.group === group),
      }),
    ]),
  );
}
export function compareQuoteTotals(
  base: QuoteDraft,
  variant: QuoteDraft,
): { netDifferenceMinor: number; grossDifferenceMinor?: number } | undefined {
  if (base.currencyCode !== variant.currencyCode) return undefined;
  const a = summarizeQuote(base),
    b = summarizeQuote(variant);
  if (a.missingPriceCount || b.missingPriceCount) return undefined;
  return {
    netDifferenceMinor: b.netMinor - a.netMinor,
    ...(a.grossMinor !== undefined && b.grossMinor !== undefined
      ? { grossDifferenceMinor: b.grossMinor - a.grossMinor }
      : {}),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`;
}

/** Deterministic, non-cryptographic drift fingerprint for a local draft. */
export function quoteSourceFingerprint(value: unknown): string {
  const source = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `q1-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
