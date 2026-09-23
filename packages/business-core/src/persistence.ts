import { z } from 'zod';

/**
 * Serializable contracts for the business layer. Same conventions as
 * `pricing-core`'s persistence module: opaque string IDs, ISO calendar dates,
 * integer minor units, and `.strict()` everywhere so an unexpected field from
 * a database row or an API payload is a loud failure rather than silent data.
 */

export const businessIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const nonBlank = z.string().trim().min(1).max(240);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const webUrl = z.union([
  z.literal(''),
  z
    .string()
    .url()
    .max(2048)
    .refine((value) => /^https?:\/\//i.test(value)),
]);
export const organizationProfileSchema = z
  .object({
    name: nonBlank,
    taxId: z.string().trim().max(64).optional(),
    address: z.string().trim().max(400).optional(),
    logoUrl: webUrl.optional(),
    phone: z.string().trim().max(64).optional(),
    email: z.union([z.literal(''), z.string().email().max(254)]).optional(),
    website: webUrl.optional(),
    defaultValidityDays: z.number().int().min(1).max(365).optional(),
    offerFooter: z.string().max(16000).optional(),
  })
  .strict();
export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
);

export const SALE_UNITS = [
  'piece',
  'pack',
  'pallet',
  'roll',
  'm',
  'm2',
  'm3',
  'kg',
  'hour',
  'flat',
] as const;
export const saleUnitSchema = z.enum(SALE_UNITS);

export const organizationSchema = z
  .object({
    ...organizationProfileSchema.shape,
    id: businessIdSchema,
    slug: slugSchema,
    name: nonBlank,
    currencyCode,
    active: z.boolean(),
  })
  .strict();

/**
 * An organization's own product row. `externalKey` is the identity the
 * organization owns and re-imports against (§29); `commercialVariantId` is the
 * optional bridge into the global technical catalogue (§6).
 */
export const organizationAssortmentItemSchema = z
  .object({
    id: businessIdSchema,
    organizationId: businessIdSchema,
    commercialVariantId: businessIdSchema.optional(),
    externalKey: z.string().trim().min(1).max(160),
    ean: z
      .string()
      .trim()
      .regex(/^\d{8}$|^\d{12,14}$/)
      .optional(),
    sourceName: nonBlank,
    displayNameOverride: nonBlank.optional(),
    active: z.boolean(),
    preferred: z.boolean(),
    metadata: z.record(jsonValueSchema).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();

export const organizationPricePolicySchema = z.enum([
  'organization-only',
  'organization-then-catalogue',
]);

export const assortmentImportRowSchema = z
  .object({
    sourceLine: z.number().int().min(1),
    externalKey: z.string().trim().min(1).max(160),
    sourceName: nonBlank,
    ean: z.string().trim().min(1).max(32).optional(),
    manufacturerName: z.string().trim().min(1).max(240).optional(),
    netAmountMinor: z.number().int().min(0).optional(),
    vatRateBps: z.number().int().min(0).max(100_00).optional(),
    saleUnit: saleUnitSchema.optional(),
    active: z.boolean().optional(),
    preferred: z.boolean().optional(),
  })
  .strict();

/**
 * The admin's column mapping: source header name → business field. Source
 * headers are never required to use RoofCalc's own names (§25).
 */
export const ASSORTMENT_IMPORT_FIELDS = [
  'externalKey',
  'sourceName',
  'ean',
  'manufacturerName',
  'netAmount',
  'grossAmount',
  'vatRate',
  'saleUnit',
  'active',
] as const;
export type AssortmentImportField = (typeof ASSORTMENT_IMPORT_FIELDS)[number];

export const assortmentColumnMappingSchema = z
  .object({
    externalKey: z.string().min(1),
    sourceName: z.string().min(1),
    ean: z.string().min(1).optional(),
    manufacturerName: z.string().min(1).optional(),
    netAmount: z.string().min(1).optional(),
    grossAmount: z.string().min(1).optional(),
    vatRate: z.string().min(1).optional(),
    saleUnit: z.string().min(1).optional(),
    active: z.string().min(1).optional(),
  })
  .strict();
export type AssortmentColumnMapping = z.infer<
  typeof assortmentColumnMappingSchema
>;

/** Deterministic key-sorted JSON, for stable checksums (mirrors pricing-core). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}
