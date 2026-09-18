import { z } from 'zod';

/**
 * V50 roof-tile purchase vocabulary: schemas only.
 *
 * Nothing here computes a quantity (that is `@cieslacalc/tile-procurement`)
 * and nothing here names a price (ADR-005). The tile layout stays the only
 * geometric authority; these schemas describe (1) the commercial packaging a
 * source declares, (2) the user's canonical purchase decision on a covering
 * assignment and (3) roof-tile system accessories as their own technical kind.
 */

const stableId = z.string().min(1);
const finitePositive = z.number().finite().positive();
const wholePieces = z.number().int().positive().max(100_000);

/**
 * Packaging as a source declares it. `piecesPerPack` is the smallest handled
 * bundle (e.g. swissporTON's 4-piece minipack), `piecesPerPallet` the full
 * packaging unit. Either may be absent: only source-backed values are stored.
 */
export const commercialPackagingFactsSchema = z
  .object({
    piecesPerPack: wholePieces.optional(),
    piecesPerPallet: wholePieces.optional(),
    sourceLabel: z.string().trim().min(1).max(240).optional(),
    sourceUrl: z.string().url().optional(),
  })
  .refine(
    (facts) =>
      facts.piecesPerPack !== undefined || facts.piecesPerPallet !== undefined,
    'packaging_without_quantity',
  );
export type CommercialPackagingFacts = z.infer<
  typeof commercialPackagingFactsSchema
>;

export const COMMERCIAL_SALE_UNITS = ['piece', 'pack', 'pallet'] as const;
export type CommercialSaleUnit = (typeof COMMERCIAL_SALE_UNITS)[number];

/** The unit the user buys in. A piece is always one piece per unit. */
export const commercialPackagingSchema = z
  .object({
    saleUnit: z.enum(COMMERCIAL_SALE_UNITS),
    piecesPerUnit: wholePieces,
    source: z.enum(['catalog', 'manual']),
  })
  .refine(
    (packaging) =>
      packaging.saleUnit !== 'piece' || packaging.piecesPerUnit === 1,
    'piece_is_one_piece',
  );
export type CommercialPackaging = z.infer<typeof commercialPackagingSchema>;

export const ROOF_TILE_ACCESSORY_ROLES = [
  'ridge',
  'hip-ridge',
  'verge-left',
  'verge-right',
  'half',
  'ventilation',
] as const;
export type RoofTileAccessoryRole = (typeof ROOF_TILE_ACCESSORY_ROLES)[number];

/**
 * A roof-tile system accessory. A separate catalogue kind, never a member of
 * the primary-covering union: an accessory never owns a roof plane.
 *
 * Role and compatibility are declared, never inferred from a name, colour,
 * SKU prefix or similar dimensions. Quantity semantics are optional and
 * source-backed only:
 * - `effectiveCoverLengthMm` — installed cover length along a ridge/hip line;
 * - `declaredUnitsPerMetre` — a manufacturer's stated consumption per metre
 *   of line (`approximate` when the source says "ok.");
 * - `quantityRule: 'one-per-course'` — one element per tile course at the
 *   edge it finishes (verges).
 * Without one, the accessory is known but its quantity requires a decision.
 */
export const roofTileAccessoryTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('roof-tile-accessory'),
    roles: z
      .array(z.enum(ROOF_TILE_ACCESSORY_ROLES))
      .min(1)
      .refine((roles) => new Set(roles).size === roles.length, 'duplicate'),
    /** Catalogue technical product-family IDs this accessory belongs to. */
    compatibleProductIds: z.array(stableId).min(1),
    physicalWidthMm: finitePositive.optional(),
    physicalLengthMm: finitePositive.optional(),
    weightKgPerPiece: finitePositive.optional(),
    effectiveCoverLengthMm: finitePositive.optional(),
    declaredUnitsPerMetre: z
      .object({
        value: finitePositive,
        approximate: z.boolean(),
      })
      .optional(),
    quantityRule: z.literal('one-per-course').optional(),
  })
  .refine(
    (spec) =>
      !(
        spec.effectiveCoverLengthMm !== undefined &&
        spec.declaredUnitsPerMetre !== undefined
      ),
    'one_length_semantic_only',
  );
export type RoofTileAccessoryTechnicalSpec = z.infer<
  typeof roofTileAccessoryTechnicalSpecSchema
>;

export const roofTileAccessorySelectionSchema = z.object({
  /** The role this pick fills in the project (one accessory may declare several). */
  role: z.enum(ROOF_TILE_ACCESSORY_ROLES),
  catalogRef: z.object({
    productId: stableId,
    technicalRevisionId: stableId,
    variantId: stableId.optional(),
  }),
  displaySnapshot: z
    .object({
      manufacturer: z.string().min(1).optional(),
      familyName: z.string().min(1).optional(),
      variantName: z.string().min(1).optional(),
      revisionCode: z.string().min(1).optional(),
    })
    .optional(),
  technicalSpecSnapshot: roofTileAccessoryTechnicalSpecSchema,
  /**
   * The user explicitly accepted one element per course for a verge whose
   * source does not state it. Never set automatically.
   */
  userConfirmedRule: z.literal('one-per-course').optional(),
});
export type RoofTileAccessorySelection = z.infer<
  typeof roofTileAccessorySelectionSchema
>;

/**
 * The user's canonical purchase decision for one roof-tile covering
 * assignment. Its presence means "a purchase plan is prepared"; its absence
 * leaves the covering geometric only. Reserve defaults to 0 — nothing is
 * silently added.
 */
export const roofTilePurchaseDecisionSchema = z.object({
  kind: z.literal('roof-tile'),
  cutPolicy: z.literal('no-offcut-reuse'),
  /** User reserve in basis points of the physical requirement (200 = 2 %). */
  reserveBps: z.number().int().min(0).max(5_000),
  packaging: commercialPackagingSchema.optional(),
  accessories: z.array(roofTileAccessorySelectionSchema).optional(),
});
export type RoofTilePurchaseDecision = z.infer<
  typeof roofTilePurchaseDecisionSchema
>;
