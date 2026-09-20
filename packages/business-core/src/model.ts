/**
 * V54 — the pure wholesale/business domain. This is the layer **above** the
 * commercial variant, and the first layer in the repository that is owned by
 * a specific company rather than by the global technical truth:
 *
 * ```text
 * TechnicalRevision      global, immutable (catalog-core)
 *   → CommercialVariant  global (catalog-core)
 *     → OrganizationAssortmentItem   organization-owned  ← this package
 *       → organization PriceList     organization-owned  (pricing-core)
 * ```
 *
 * Nothing here knows a roof, a plane, a tile dimension or a layout rule. A
 * `commercialVariantId` is an opaque catalogue reference exactly as it is in
 * `pricing-core`; this package never imports `catalog-core`, so a wholesaler's
 * assortment can never redefine technical truth.
 */

import type { PriceList, PriceListEntry } from '@cieslacalc/pricing-core';

/** A wholesaler / merchant / any company whose assortment powers RoofCalc. */
export interface Organization {
  id: string;
  slug: string;
  name: string;
  /** ISO 4217. Every price list this organization owns must match it. */
  currencyCode: string;
  active: boolean;
  /** Display facts only — never accounting, never a tax computation input. */
  taxId?: string;
  address?: string;
  logoUrl?: string;
}

/**
 * One row of what an organization actually sells.
 *
 * `commercialVariantId` is **deliberately nullable**. A real wholesale import
 * of 4 280 rows maps perhaps 3 900 of them; throwing the other 380 away would
 * lose the company's own data and silently under-report its assortment. An
 * unmapped row is preserved and reported as `unmatched`, never guessed at.
 */
export interface OrganizationAssortmentItem {
  id: string;
  organizationId: string;
  /** `undefined` = the row exists but RoofCalc cannot identify the product. */
  commercialVariantId?: string;
  /** The organization's own stable key: its internal SKU / warehouse code. */
  externalKey: string;
  ean?: string;
  /** The name exactly as the organization's own source system supplies it. */
  sourceName: string;
  /** An operator-chosen display name that overrides `sourceName` in pickers. */
  displayNameOverride?: string;
  active: boolean;
  /** A commercial preference only. Never a technical recommendation (§45). */
  preferred: boolean;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * The commercial state of one assortment row. Three named states, never a
 * score: an `unmatched` row is *not* a technically usable roof product,
 * because RoofCalc knows no dimension, coverage or installation rule for it.
 */
export type AssortmentCommercialState = 'matched' | 'unmatched' | 'inactive';

/**
 * The active business context of the *application*, never of a project
 * (§12/§49). A roof's geometry must not become invalid because the user
 * switched wholesaler, so this never enters `RoofProjectDocumentV1`.
 */
export interface OrganizationContext {
  organization: Organization;
  /** Which price source the user is allowed to fall back to (§41). */
  pricePolicy: OrganizationPricePolicy;
}

/**
 * Explicit, visible fallback order. `organization-only` is the strict
 * wholesaler mode: a missing organization price says so instead of quietly
 * showing someone else's price.
 */
export type OrganizationPricePolicy =
  'organization-only' | 'organization-then-catalogue';

/** Where a resolved price came from. Always shown, never inferred silently. */
export type OrganizationPriceSource = 'organization' | 'catalogue';

/** One resolved commercial price, with its provenance kept intact (§11). */
export interface ResolvedOrganizationPrice {
  source: OrganizationPriceSource;
  /** Present only for `source: 'organization'`. */
  organizationId?: string;
  priceListId: string;
  priceListLabel: string;
  entryId: string;
  commercialVariantId: string;
  saleUnit: PriceListEntry['saleUnit'];
  netAmountMinor: number;
  currencyCode: string;
  validFrom: string;
  validTo?: string;
}

/** Why no price could be resolved — a named reason, never a silent blank. */
export type OrganizationPriceMissingReason =
  | 'not-in-assortment'
  | 'assortment-inactive'
  | 'assortment-unmatched'
  | 'no-organization-price'
  | 'no-price';

export interface OrganizationPriceResult {
  price?: ResolvedOrganizationPrice;
  missing?: OrganizationPriceMissingReason;
}

/**
 * A price list may belong to an organization. Global/source-backed lists
 * (the V34C/V35 retail observations) keep `organizationId: undefined` and
 * stay visible to everyone; a wholesaler's list is scoped to it and must
 * never reach another organization (§9, §10, §58).
 */
export interface OrganizationPriceList extends PriceList {
  organizationId?: string;
}

/**
 * One mapped CSV row, after column mapping and before any write. The shape a
 * provider adapter (XLSX/XML/API) must terminate at, exactly as catalogue
 * provider adapters terminate at `CatalogImportBatchV1`.
 */
export interface AssortmentImportRow {
  /** 1-based line number in the source file, for a truthful problem list. */
  sourceLine: number;
  externalKey: string;
  sourceName: string;
  ean?: string;
  manufacturerName?: string;
  /** Integer minor units, already net — the same convention as pricing-core. */
  netAmountMinor?: number;
  vatRateBps?: number;
  saleUnit?: PriceListEntry['saleUnit'];
  active?: boolean;
  preferred?: boolean;
}

/** Named import problems. No row is written while it carries a blocker. */
export type AssortmentImportIssueCode =
  | 'missing-external-key'
  | 'missing-name'
  | 'invalid-price'
  | 'gross-price-without-vat-rate'
  | 'invalid-sale-unit'
  | 'duplicate-external-key';

export interface AssortmentImportIssue {
  sourceLine: number;
  externalKey?: string;
  code: AssortmentImportIssueCode;
  /** `blocker` rows are never applied; `warning` rows are applied as-is. */
  severity: 'blocker' | 'warning';
}

/** The four match states an admin sees. Named, never a fake percentage (§28). */
export type AssortmentMatchState =
  'matched' | 'suggested' | 'ambiguous' | 'no-match';

/** Why a row matched. Only deterministic, verifiable evidence (§27). */
export type AssortmentMatchReason =
  'existing-mapping' | 'variant-sku' | 'ean' | 'normalized-name';

/**
 * The narrow view of a catalogue variant this package needs to match against.
 * Structural on purpose: `business-core` never imports `catalog-core`, and the
 * caller (the API layer) is the one allowed to join the two.
 */
export interface AssortmentMatchCandidate {
  commercialVariantId: string;
  sku?: string;
  ean?: string;
  manufacturerName?: string;
  productName?: string;
  variantName?: string;
}

export interface AssortmentMatchResult {
  state: AssortmentMatchState;
  /** Set only for `matched`; a suggestion is never applied automatically. */
  commercialVariantId?: string;
  /** Set for `suggested`/`ambiguous` — the admin chooses explicitly (§27). */
  candidateIds?: string[];
  reason?: AssortmentMatchReason;
}

/** What one previewed row would do to the database, before anything is written. */
export type AssortmentImportAction = 'create' | 'update' | 'unchanged' | 'skip';

export interface AssortmentImportPreviewRow {
  row: AssortmentImportRow;
  action: AssortmentImportAction;
  match: AssortmentMatchResult;
  issues: AssortmentImportIssue[];
}

/** The dry-run report an admin approves before any write happens (§26). */
export interface AssortmentImportPreview {
  organizationId: string;
  rows: AssortmentImportPreviewRow[];
  counts: {
    total: number;
    matched: number;
    needsReview: number;
    noMatch: number;
    invalidPrice: number;
    create: number;
    update: number;
    unchanged: number;
    skip: number;
  };
}

/** A completed import, recorded for audit (§32). Raw files are never stored. */
export interface AssortmentImportAudit {
  id: string;
  organizationId: string;
  sourceLabel: string;
  /** SHA-256 over the canonical mapped rows, same convention as catalogue. */
  checksum: string;
  startedAt: string;
  completedAt: string;
  status: 'completed' | 'failed';
  counts: AssortmentImportPreview['counts'];
}

export type BusinessValidationIssueCode =
  | 'invalid-id'
  | 'invalid-slug'
  | 'invalid-currency-code'
  | 'organization-mismatch'
  | 'duplicate-external-key'
  | 'duplicate-active-variant';

export interface BusinessValidationIssue {
  path: string;
  code: BusinessValidationIssueCode;
}
