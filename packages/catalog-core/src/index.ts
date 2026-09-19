import { z } from 'zod';
import {
  commercialPackagingFactsSchema,
  coveringProductSelectionSchema,
  coveringTechnicalSpecSchema,
  ROOF_TILE_ACCESSORY_ROLES,
  roofTileAccessoryTechnicalSpecSchema,
  membraneProductSelectionSchema,
  membraneTechnicalSpecSchema,
  type CoveringKind,
  type CoveringProductSelection,
  type CoveringTechnicalSpec,
  type MembraneProductSelection,
} from '@cieslacalc/covering-core';
import {
  DRAINAGE_COMPONENT_ROLES,
  ROOF_LINE_COMPONENT_ROLES,
  ROOF_WINDOW_COMPONENT_ROLES,
  roofDrainageComponentTechnicalSpecSchema,
  roofSystemComponentTechnicalSpecSchema,
  roofWindowComponentTechnicalSpecSchema,
} from '@cieslacalc/roof-system-core';
import {
  TIMBER_STOCK_APPLICATIONS,
  timberStockTechnicalSpecSchema,
} from './timber-stock-spec';
export * from './timber-stock-spec';

export const CATALOG_IMPORT_SCHEMA_VERSION = 1 as const;

/**
 * Every technical product kind the catalog can store a revision for (V35).
 * A strict superset of `CoveringKind` (roof-tile/modular-sheet/standing-seam,
 * the primary-covering kinds that compete for roof-plane ownership) plus
 * `membrane` and `timber-stock`, which are build-up/procurement inputs, not
 * primary coverings — `isCoveringKind` below stays narrow on purpose. The
 * `covering_kind` DB column and `coveringKind` field name are kept
 * unchanged for API/schema compatibility even though the field is now a
 * general catalog-product-kind discriminant, not only a covering one.
 */
export const CATALOG_PRODUCT_KINDS = [
  'roof-tile',
  'modular-sheet',
  'standing-seam',
  'membrane',
  'timber-stock',
  // V50: roof-tile system accessories (ridge, verge, …). Never a covering.
  'roof-tile-accessory',
  // V51: gutter-system components. One kind; the role is a field.
  'roof-drainage-component',
  // V52: line-bound roof-system elements (ridge tape, ridge ends, eave and
  // verge elements). One kind; the role is a field.
  'roof-system-component',
  // V52: roof windows (size identity) and their flashing kits.
  'roof-window-component',
] as const;
export type CatalogProductKind = (typeof CATALOG_PRODUCT_KINDS)[number];

/**
 * Every technical spec shape a catalog revision may hold. Wider than
 * `covering-core`'s own `coveringTechnicalSpecSchema` (which stays scoped to
 * primary coverings) — this union exists only at the catalog/revision
 * boundary, never inside `covering-core`'s own primary-covering contracts.
 */
export const catalogTechnicalSpecSchema = z.union([
  coveringTechnicalSpecSchema,
  membraneTechnicalSpecSchema,
  timberStockTechnicalSpecSchema,
  roofTileAccessoryTechnicalSpecSchema,
  roofDrainageComponentTechnicalSpecSchema,
  roofSystemComponentTechnicalSpecSchema,
  roofWindowComponentTechnicalSpecSchema,
]);
export type CatalogTechnicalSpec = z.infer<typeof catalogTechnicalSpecSchema>;

export const catalogIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonBlank = z.string().trim().min(1).max(240);
const nullableDate = z.string().date().optional();

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

export const manufacturerSchema = z
  .object({
    id: catalogIdSchema,
    slug: slugSchema,
    name: nonBlank,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    websiteUrl: z.string().url().optional(),
    active: z.boolean(),
  })
  .strict();
export type Manufacturer = z.infer<typeof manufacturerSchema>;

export const technicalProductFamilySchema = z
  .object({
    id: catalogIdSchema,
    manufacturerId: catalogIdSchema,
    slug: slugSchema,
    name: nonBlank,
    coveringKind: z.enum(CATALOG_PRODUCT_KINDS),
    active: z.boolean(),
  })
  .strict();
export type TechnicalProductFamily = z.infer<
  typeof technicalProductFamilySchema
>;

export const technicalRevisionSourceSchema = z
  .object({
    label: nonBlank.optional(),
    url: z.string().url().optional(),
    revision: z.string().trim().min(1).max(160).optional(),
    hash: z.string().trim().min(1).max(256).optional(),
  })
  .strict();

export const technicalProductRevisionSchema = z
  .object({
    id: catalogIdSchema,
    productId: catalogIdSchema,
    revisionCode: z.string().trim().min(1).max(128),
    technicalSpec: catalogTechnicalSpecSchema,
    validFrom: nullableDate,
    source: technicalRevisionSourceSchema.optional(),
  })
  .strict();
export type TechnicalProductRevision = z.infer<
  typeof technicalProductRevisionSchema
>;

export const commercialVariantSchema = z
  .object({
    id: catalogIdSchema,
    productId: catalogIdSchema,
    sku: z.string().trim().min(1).max(160).optional(),
    name: nonBlank,
    color: z.string().trim().min(1).max(160).optional(),
    finish: z.string().trim().min(1).max(160).optional(),
    /**
     * Free commercial facts. V50 types one key: `packaging`, the source-backed
     * pack/pallet sizes (stored in the existing JSON column — no migration).
     */
    metadata: z
      .object({ packaging: commercialPackagingFactsSchema.optional() })
      .catchall(jsonValueSchema)
      .optional(),
    active: z.boolean(),
  })
  .strict();
export type CommercialVariant = z.infer<typeof commercialVariantSchema>;

export const catalogImportSourceSchema = z
  .object({
    id: catalogIdSchema,
    label: nonBlank,
    sourceRevision: z.string().trim().min(1).max(160).optional(),
    sourceUrl: z.string().url().optional(),
  })
  .strict();

function duplicateIds<T extends { id: string }>(items: readonly T[]) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (seen.has(item.id)) return true;
      seen.add(item.id);
      return false;
    })
    .map((item) => item.id);
}

export const catalogImportBatchV1Schema = z
  .object({
    schemaVersion: z.literal(CATALOG_IMPORT_SCHEMA_VERSION),
    source: catalogImportSourceSchema,
    manufacturers: z.array(manufacturerSchema),
    products: z.array(technicalProductFamilySchema),
    revisions: z.array(technicalProductRevisionSchema),
    variants: z.array(commercialVariantSchema),
  })
  .strict()
  .superRefine((batch, context) => {
    const duplicates = [
      ...duplicateIds(batch.manufacturers).map(
        (id) => ['manufacturers', id] as const,
      ),
      ...duplicateIds(batch.products).map((id) => ['products', id] as const),
      ...duplicateIds(batch.revisions).map((id) => ['revisions', id] as const),
      ...duplicateIds(batch.variants).map((id) => ['variants', id] as const),
    ];
    for (const [path, id] of duplicates)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `duplicate-id:${id}`,
      });

    const manufacturers = new Set(batch.manufacturers.map((item) => item.id));
    const products = new Map(batch.products.map((item) => [item.id, item]));
    for (const product of batch.products)
      if (!manufacturers.has(product.manufacturerId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['products'],
          message: `missing-manufacturer:${product.manufacturerId}`,
        });
    for (const revision of batch.revisions) {
      const product = products.get(revision.productId);
      if (!product)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions'],
          message: `missing-product:${revision.productId}`,
        });
      else if (product.coveringKind !== revision.technicalSpec.kind)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['revisions'],
          message: `covering-kind-mismatch:${revision.id}`,
        });
    }
    for (const variant of batch.variants)
      if (!products.has(variant.productId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['variants'],
          message: `missing-product:${variant.productId}`,
        });
  });
export type CatalogImportBatchV1 = z.infer<typeof catalogImportBatchV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export type ImmutableRevisionComparison = 'new' | 'unchanged' | 'conflict';

/** A revision ID is an immutable technical identity. */
export function compareTechnicalRevision(
  existing: TechnicalProductRevision | undefined,
  incoming: TechnicalProductRevision,
): ImmutableRevisionComparison {
  if (!existing) return 'new';
  return canonicalJson(existing) === canonicalJson(incoming)
    ? 'unchanged'
    : 'conflict';
}

export function createCatalogProductSelection(args: {
  manufacturer: Manufacturer;
  product: TechnicalProductFamily;
  revision: TechnicalProductRevision;
  variant?: CommercialVariant;
}): CoveringProductSelection {
  if (args.revision.productId !== args.product.id)
    throw new Error('catalog-revision-product-mismatch');
  if (args.product.manufacturerId !== args.manufacturer.id)
    throw new Error('catalog-product-manufacturer-mismatch');
  if (args.product.coveringKind !== args.revision.technicalSpec.kind)
    throw new Error('catalog-covering-kind-mismatch');
  if (args.variant && args.variant.productId !== args.product.id)
    throw new Error('catalog-variant-product-mismatch');
  return coveringProductSelectionSchema.parse({
    catalogRef: {
      productId: args.product.id,
      technicalRevisionId: args.revision.id,
      variantId: args.variant?.id,
    },
    displaySnapshot: {
      manufacturer: args.manufacturer.name,
      familyName: args.product.name,
      variantName: args.variant?.name,
      revisionCode: args.revision.revisionCode,
    },
    technicalSpecSnapshot: structuredClone(args.revision.technicalSpec),
    ...(args.variant?.metadata?.packaging
      ? {
          commercialSnapshot: {
            packaging: structuredClone(args.variant.metadata.packaging),
          },
        }
      : {}),
  });
}

/**
 * `createCatalogProductSelection`'s membrane-kind counterpart: builds a
 * `MembraneProductSelection` (`@cieslacalc/covering-core`) from catalogue
 * identity, validating the revision's spec is really a membrane spec rather
 * than blending kinds.
 */
export function createMembraneProductSelection(args: {
  manufacturer: Manufacturer;
  product: TechnicalProductFamily;
  revision: TechnicalProductRevision;
  variant?: CommercialVariant;
}): MembraneProductSelection {
  if (args.revision.productId !== args.product.id)
    throw new Error('catalog-revision-product-mismatch');
  if (args.product.manufacturerId !== args.manufacturer.id)
    throw new Error('catalog-product-manufacturer-mismatch');
  if (args.product.coveringKind !== args.revision.technicalSpec.kind)
    throw new Error('catalog-covering-kind-mismatch');
  if (args.revision.technicalSpec.kind !== 'membrane')
    throw new Error('catalog-not-a-membrane-spec');
  if (args.variant && args.variant.productId !== args.product.id)
    throw new Error('catalog-variant-product-mismatch');
  return membraneProductSelectionSchema.parse({
    catalogRef: {
      productId: args.product.id,
      technicalRevisionId: args.revision.id,
      variantId: args.variant?.id,
    },
    displaySnapshot: {
      manufacturer: args.manufacturer.name,
      familyName: args.product.name,
      variantName: args.variant?.name,
      revisionCode: args.revision.revisionCode,
    },
    technicalSpecSnapshot: structuredClone(args.revision.technicalSpec),
  });
}

export const catalogTechnicalPreviewSchema = z
  .object({
    effectiveWidthMm: z.number().finite().positive().optional(),
    gaugeMinMm: z.number().finite().positive().optional(),
    gaugeMaxMm: z.number().finite().positive().optional(),
    minPitchDeg: z.number().finite().positive().optional(),
    sheetLengthModel: z.enum(['fixed-sheet', 'cut-to-length']).optional(),
    minimumSheetLengthMm: z.number().finite().positive().optional(),
    maximumSheetLengthMm: z.number().finite().positive().optional(),
    rollWidthMm: z.number().finite().positive().optional(),
    rollLengthMm: z.number().finite().positive().optional(),
    minimumOverlapMm: z.number().finite().nonnegative().optional(),
    sectionWidthMm: z.number().finite().positive().optional(),
    sectionDepthMm: z.number().finite().positive().optional(),
    lengthMm: z.number().finite().positive().optional(),
    strengthClass: z.string().optional(),
    // V49: lets a picker filter battens without loading every revision.
    treated: z.boolean().optional(),
    declaredApplications: z.array(z.enum(TIMBER_STOCK_APPLICATIONS)).optional(),
    // V50: an accessory list is filtered by role and compatibility client-side.
    accessoryRoles: z.array(z.enum(ROOF_TILE_ACCESSORY_ROLES)).optional(),
    compatibleProductIds: z.array(catalogIdSchema).optional(),
    // V51: a drainage system is assembled client-side by its explicit key.
    drainageSystemKey: z.string().min(1).max(64).optional(),
    drainageRole: z.enum(DRAINAGE_COMPONENT_ROLES).optional(),
    nominalSystemSize: z.string().min(1).max(40).optional(),
    maxSpacingMm: z.number().finite().positive().optional(),
    hand: z.enum(['left', 'right', 'universal']).optional(),
    // V52: roof-system components are filtered by role client-side.
    systemRole: z
      .enum(ROOF_LINE_COMPONENT_ROLES as [string, ...string[]])
      .optional(),
    // V52: windows and flashing kits by system, size and role.
    windowRole: z.enum(ROOF_WINDOW_COMPONENT_ROLES).optional(),
    windowSystemKey: z.string().min(1).max(64).optional(),
    sizeCode: z.string().min(1).max(16).optional(),
    flashingCoveringClass: z.enum(['profiled', 'flat']).optional(),
  })
  .strict();

export const catalogProductSummarySchema = z
  .object({
    id: catalogIdSchema,
    manufacturer: manufacturerSchema.pick({ id: true, name: true }),
    name: nonBlank,
    kind: z.enum(CATALOG_PRODUCT_KINDS),
    currentRevisionId: catalogIdSchema,
    variantCount: z.number().int().nonnegative(),
    technicalPreview: catalogTechnicalPreviewSchema,
  })
  .strict();
export type CatalogProductSummary = z.infer<typeof catalogProductSummarySchema>;

export const catalogProductDetailSchema = z
  .object({
    manufacturer: manufacturerSchema,
    product: technicalProductFamilySchema,
    currentRevision: technicalProductRevisionSchema,
    variants: z.array(commercialVariantSchema),
  })
  .strict();
export type CatalogProductDetail = z.infer<typeof catalogProductDetailSchema>;

export const catalogRevisionDetailSchema = z
  .object({
    manufacturer: manufacturerSchema,
    product: technicalProductFamilySchema,
    revision: technicalProductRevisionSchema,
  })
  .strict();
export type CatalogRevisionDetail = z.infer<typeof catalogRevisionDetailSchema>;

export const catalogSearchQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    kind: z.enum(CATALOG_PRODUCT_KINDS).optional(),
    manufacturerId: catalogIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type CatalogSearchQuery = z.infer<typeof catalogSearchQuerySchema>;

export const catalogManufacturersResponseSchema = z
  .object({ items: z.array(manufacturerSchema) })
  .strict();
export const catalogSearchResponseSchema = z
  .object({
    items: z.array(catalogProductSummarySchema),
    nextCursor: z.string().optional(),
  })
  .strict();
export const catalogProductResponseSchema = z
  .object({ item: catalogProductDetailSchema })
  .strict();
export const catalogRevisionResponseSchema = z
  .object({ item: catalogRevisionDetailSchema })
  .strict();
export const catalogApiErrorSchema = z
  .object({
    error: z
      .object({ code: z.string().min(1), message: z.string().optional() })
      .strict(),
  })
  .strict();

export function technicalPreview(
  spec: CatalogTechnicalSpec,
): z.infer<typeof catalogTechnicalPreviewSchema> {
  if (spec.kind === 'roof-tile') {
    const mode = spec.installationModes[0];
    return {
      effectiveWidthMm: mode?.coverWidthMm,
      gaugeMinMm: mode?.gaugeRangeMm.min,
      gaugeMaxMm: mode?.gaugeRangeMm.max,
      minPitchDeg: mode?.minPitchDeg,
    };
  }
  if (spec.kind === 'modular-sheet')
    return {
      effectiveWidthMm: spec.effectiveWidthMm,
      minPitchDeg: spec.minPitchDeg,
      sheetLengthModel: spec.lengthModel.kind,
      minimumSheetLengthMm:
        spec.lengthModel.kind === 'cut-to-length'
          ? spec.lengthModel.minPanelLengthMm
          : undefined,
      maximumSheetLengthMm:
        spec.lengthModel.kind === 'cut-to-length'
          ? spec.lengthModel.maxPanelLengthMm
          : undefined,
    };
  if (spec.kind === 'membrane')
    return {
      rollWidthMm: spec.rollWidthMm,
      rollLengthMm: spec.rollLengthMm,
      minimumOverlapMm: spec.minimumOverlapMm,
      minPitchDeg: spec.minPitchDeg,
    };
  if (spec.kind === 'roof-tile-accessory')
    return {
      accessoryRoles: spec.roles,
      compatibleProductIds: spec.compatibleProductIds,
    };
  if (spec.kind === 'roof-drainage-component')
    return {
      drainageSystemKey: spec.systemKey,
      drainageRole: spec.role,
      nominalSystemSize: spec.nominalSystemSize,
      lengthMm: spec.lengthMm,
      maxSpacingMm: spec.maxSpacingMm,
      hand: spec.hand,
    };
  if (spec.kind === 'roof-system-component')
    return {
      systemRole: spec.role,
      lengthMm: spec.lengthMm,
      rollLengthMm: spec.rollLengthMm,
      compatibleProductIds:
        spec.compatibility.scope === 'covering-products'
          ? spec.compatibility.productIds
          : undefined,
    };
  if (spec.kind === 'roof-window-component')
    return {
      windowRole: spec.role,
      windowSystemKey: spec.windowSystemKey,
      sizeCode: spec.sizeCode,
      flashingCoveringClass: spec.covering?.class,
      minPitchDeg: spec.pitchRangeDeg?.min || undefined,
    };
  if (spec.kind === 'timber-stock')
    return {
      sectionWidthMm: spec.widthMm,
      sectionDepthMm: spec.depthMm,
      lengthMm: spec.lengthMm,
      strengthClass: spec.strengthClass,
      treated: spec.treated,
      declaredApplications: spec.declaredApplications,
    };
  return {
    effectiveWidthMm: spec.installationModes[0]?.effectiveWidthMm,
    minPitchDeg: spec.minPitchDeg,
  };
}

export function isCoveringKind(value: string): value is CoveringKind {
  return ['roof-tile', 'modular-sheet', 'standing-seam'].includes(value);
}

/**
 * Narrows a catalog revision's technical spec back down to the
 * primary-covering union — for consumers like `CatalogProductPicker.tsx`
 * that only ever query `kind: CoveringKind` and so are guaranteed by
 * construction to get a covering spec back, even though
 * `TechnicalProductRevision.technicalSpec`'s static type is now the wider
 * `CatalogTechnicalSpec` union (V35).
 */
export function isCoveringTechnicalSpec(
  spec: CatalogTechnicalSpec,
): spec is CoveringTechnicalSpec {
  return (
    spec.kind !== 'membrane' &&
    spec.kind !== 'timber-stock' &&
    spec.kind !== 'roof-tile-accessory' &&
    spec.kind !== 'roof-drainage-component' &&
    spec.kind !== 'roof-system-component' &&
    spec.kind !== 'roof-window-component'
  );
}
