import { z } from 'zod';
import {
  businessIdSchema,
  organizationAssortmentItemSchema,
  organizationSchema,
  saleUnitSchema,
} from './persistence';

/**
 * Read-API payloads for the business layer, shared by `apps/api` and
 * `apps/web` so the wire shape is written once (the same role
 * `catalogSearchResponseSchema` plays for the catalogue).
 *
 * One deliberate looseness: `catalog.kind` is a bounded **string**, not
 * `catalog-core`'s `CatalogProductKind` enum. `business-core` must not import
 * the technical catalogue (§1) — if it did, adding a product kind would become
 * a business-layer change. The consumer that cares about a specific kind (the
 * product picker) compares it against its own `CoveringKind` literal, which is
 * exactly the same string.
 */

export const assortmentCommercialStateSchema = z.enum([
  'matched',
  'unmatched',
  'inactive',
]);

/**
 * Display facts joined from the global catalogue. A **snapshot for display
 * only**: nothing downstream may calculate from it. A roof is still built from
 * the project's own technical snapshot (§13), never from this.
 */
export const assortmentCatalogFactsSchema = z
  .object({
    productId: businessIdSchema,
    productName: z.string().min(1).max(240),
    manufacturerId: businessIdSchema,
    manufacturerName: z.string().min(1).max(240),
    kind: z.string().min(1).max(32),
    currentRevisionId: businessIdSchema,
    variantId: businessIdSchema,
    variantName: z.string().min(1).max(240),
    variantSku: z.string().min(1).max(160).optional(),
  })
  .strict();

/** The resolved price for one row, with its provenance intact (§11, §40). */
export const assortmentPriceSchema = z
  .object({
    priceListId: businessIdSchema,
    priceListLabel: z.string().min(1).max(240),
    entryId: businessIdSchema,
    netAmountMinor: z.number().int().min(0),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    saleUnit: saleUnitSchema,
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    validTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();

export const organizationAssortmentRowSchema = z
  .object({
    item: organizationAssortmentItemSchema,
    state: assortmentCommercialStateSchema,
    catalog: assortmentCatalogFactsSchema.optional(),
    price: assortmentPriceSchema.optional(),
  })
  .strict();
export type OrganizationAssortmentRow = z.infer<
  typeof organizationAssortmentRowSchema
>;

export const organizationsResponseSchema = z
  .object({ items: z.array(organizationSchema) })
  .strict();

export const assortmentSummarySchema = z
  .object({
    total: z.number().int().min(0),
    matched: z.number().int().min(0),
    unmatched: z.number().int().min(0),
    inactive: z.number().int().min(0),
    withoutPrice: z.number().int().min(0),
    withoutVat: z.number().int().min(0),
  })
  .strict();
export type AssortmentSummary = z.infer<typeof assortmentSummarySchema>;

export const organizationAssortmentResponseSchema = z
  .object({
    organization: organizationSchema,
    items: z.array(organizationAssortmentRowSchema),
    summary: assortmentSummarySchema,
    nextCursor: z.string().optional(),
  })
  .strict();
export type OrganizationAssortmentResponse = z.infer<
  typeof organizationAssortmentResponseSchema
>;

/** Admin filters (§19) plus the picker's own narrowing. */
export const ASSORTMENT_FILTERS = [
  'all',
  'active',
  'unmatched',
  'without-price',
  'without-vat',
  'inactive',
  'preferred',
] as const;
export type AssortmentFilter = (typeof ASSORTMENT_FILTERS)[number];

const queryBoolean = z.preprocess((value) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean());

export const assortmentQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    filter: z.enum(ASSORTMENT_FILTERS).default('all'),
    state: assortmentCommercialStateSchema.optional(),
    active: queryBoolean.optional(),
    preferred: queryBoolean.optional(),
    hasPrice: queryBoolean.optional(),
    kind: z.string().trim().max(32).optional(),
    manufacturerId: businessIdSchema.optional(),
    manufacturer: z.string().trim().max(240).optional(),
    /** Backward-compatible alias; new clients use `preferred`. */
    preferredOnly: queryBoolean.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(40),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type AssortmentQuery = z.infer<typeof assortmentQuerySchema>;

export const organizationPricesResponseSchema = z
  .object({
    organizationId: businessIdSchema,
    items: z.array(
      z
        .object({
          commercialVariantId: businessIdSchema,
          /** Absent when the organization has no row for this variant. */
          externalKey: z.string().min(1).max(160).optional(),
          vatRateBps: z.number().int().min(0).max(10_000).optional(),
          price: assortmentPriceSchema.optional(),
          missing: z
            .enum([
              'not-in-assortment',
              'assortment-inactive',
              'assortment-unmatched',
              'no-organization-price',
              'no-price',
            ])
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();
export type OrganizationPricesResponse = z.infer<
  typeof organizationPricesResponseSchema
>;

export const businessApiErrorSchema = z
  .object({
    error: z
      .object({ code: z.string().min(1), message: z.string().optional() })
      .strict(),
  })
  .strict();

/* ------------------------------------------------------------------ */
/* Admin mutation payloads — only ever reachable behind the local/dev  */
/* capability gate (§33). No production authentication exists yet.     */
/* ------------------------------------------------------------------ */

export const assortmentLinkRequestSchema = z
  .object({
    itemId: businessIdSchema,
    commercialVariantId: businessIdSchema,
  })
  .strict();

export const assortmentUnlinkRequestSchema = z
  .object({ itemId: businessIdSchema })
  .strict();

export const assortmentFlagsRequestSchema = z
  .object({
    itemId: businessIdSchema,
    active: z.boolean().optional(),
    preferred: z.boolean().optional(),
    vatRateBps: z.number().int().min(0).max(10_000).optional(),
    displayNameOverride: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .nullable()
      .optional(),
  })
  .strict();

export const assortmentBulkFlagsRequestSchema = z
  .object({
    itemIds: z.array(businessIdSchema).min(1).max(500),
    active: z.boolean().optional(),
    preferred: z.boolean().optional(),
    vatRateBps: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.active !== undefined ||
      value.preferred !== undefined ||
      value.vatRateBps !== undefined,
    { message: 'at least one flag is required' },
  );

const manualPriceFields = {
  netAmountMinor: z.number().int().min(0),
  saleUnit: saleUnitSchema,
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vatRateBps: z.number().int().min(0).max(10_000).optional(),
} as const;

export const assortmentCreateRequestSchema = z
  .object({
    externalKey: z.string().trim().min(1).max(160),
    sourceName: z.string().trim().min(1).max(240),
    ean: z
      .string()
      .trim()
      .regex(/^\d{8}$|^\d{12,14}$/)
      .optional(),
    commercialVariantId: businessIdSchema.optional(),
    active: z.boolean().default(true),
    preferred: z.boolean().default(false),
    vatRateBps: z.number().int().min(0).max(10_000).optional(),
    price: z.object(manualPriceFields).strict().optional(),
  })
  .strict()
  .refine((value) => !value.price || Boolean(value.commercialVariantId), {
    message: 'a price requires a matched commercial variant',
    path: ['price'],
  });
export type AssortmentCreateRequest = z.infer<
  typeof assortmentCreateRequestSchema
>;

export const assortmentPriceCreateRequestSchema = z
  .object({ itemId: businessIdSchema, ...manualPriceFields })
  .strict();
export type AssortmentPriceCreateRequest = z.infer<
  typeof assortmentPriceCreateRequestSchema
>;

export const assortmentDetailResponseSchema = z
  .object({
    row: organizationAssortmentRowSchema,
    priceHistory: z.array(assortmentPriceSchema),
  })
  .strict();
export type AssortmentDetailResponse = z.infer<
  typeof assortmentDetailResponseSchema
>;

export const assortmentImportRequestSchema = z
  .object({
    sourceLabel: z.string().trim().min(1).max(240),
    csv: z.string().min(1).max(4_000_000),
    mapping: z.record(z.string().min(1)),
    /** `false` (the default) is a dry run: it writes nothing (§24 step 3). */
    apply: z.boolean().default(false),
  })
  .strict();

export const assortmentPreviewResponseSchema = z
  .object({
    organizationId: businessIdSchema,
    applied: z.boolean(),
    counts: z
      .object({
        total: z.number().int().min(0),
        matched: z.number().int().min(0),
        needsReview: z.number().int().min(0),
        noMatch: z.number().int().min(0),
        invalidPrice: z.number().int().min(0),
        create: z.number().int().min(0),
        update: z.number().int().min(0),
        unchanged: z.number().int().min(0),
        skip: z.number().int().min(0),
      })
      .strict(),
    rows: z.array(
      z
        .object({
          sourceLine: z.number().int().min(1),
          externalKey: z.string(),
          sourceName: z.string(),
          action: z.enum(['create', 'update', 'unchanged', 'skip']),
          matchState: z.enum(['matched', 'suggested', 'ambiguous', 'no-match']),
          commercialVariantId: businessIdSchema.optional(),
          candidateIds: z.array(businessIdSchema).optional(),
          netAmountMinor: z.number().int().min(0).optional(),
          vatRateBps: z.number().int().min(0).max(10_000).optional(),
          issues: z.array(
            z
              .object({
                code: z.string(),
                severity: z.enum(['blocker', 'warning']),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type AssortmentPreviewResponse = z.infer<
  typeof assortmentPreviewResponseSchema
>;

export const priceImportRequestSchema = z
  .object({
    csv: z.string().min(1).max(4_000_000),
    mapping: z
      .object({
        externalKey: z.string().min(1),
        netAmount: z.string().min(1),
        vatRate: z.string().min(1).optional(),
        saleUnit: z.string().min(1).optional(),
      })
      .strict(),
    validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    apply: z.boolean().default(false),
  })
  .strict();
export type PriceImportRequest = z.infer<typeof priceImportRequestSchema>;
export const priceImportPreviewResponseSchema = z
  .object({
    applied: z.boolean(),
    counts: z
      .object({
        total: z.number(),
        changed: z.number(),
        unchanged: z.number(),
        unknown: z.number(),
        invalid: z.number(),
        withVat: z.number(),
        withoutVat: z.number(),
      })
      .strict(),
    rows: z.array(
      z
        .object({
          sourceLine: z.number(),
          externalKey: z.string(),
          netAmountMinor: z.number().optional(),
          vatRateBps: z.number().optional(),
          status: z.enum(['changed', 'unchanged', 'unknown-sku', 'invalid']),
        })
        .strict(),
    ),
  })
  .strict();
export type PriceImportPreviewResponse = z.infer<
  typeof priceImportPreviewResponseSchema
>;
