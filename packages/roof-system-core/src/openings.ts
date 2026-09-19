import { z } from 'zod';

/**
 * V52 roof openings: window identity and flashing kits.
 *
 * Geometry stays generic (a roof-window feature is a rectangle in its plane).
 * A real product is an optional user assignment. A flashing kit is offered
 * only when it structurally matches: same window system, same size code,
 * the covering class the user confirmed at this opening, and the pitch of
 * the owning plane inside the kit's declared range. Nothing is inferred from
 * a product name, and a generic opening never receives a "compatible" kit.
 */
const stableId = z.string().min(1).max(128);
const positiveMm = z.number().finite().positive().max(100_000);
const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const ROOF_WINDOW_COMPONENT_ROLES = [
  'roof-window',
  'window-flashing-kit',
  'membrane-collar',
  'insulation-collar',
] as const;
export type RoofWindowComponentRole =
  (typeof ROOF_WINDOW_COMPONENT_ROLES)[number];

/** What a flashing kit physically contains, as the source lists it. */
export const WINDOW_KIT_PARTS = [
  'window-flashing',
  'membrane-collar',
  'insulation-collar',
] as const;
export type WindowKitPart = (typeof WINDOW_KIT_PARTS)[number];

/**
 * Covering class a flashing is designed for — only because window flashings
 * are documented that way (profile height / sheet thickness), not a general
 * covering taxonomy.
 */
export const flashingCoveringSchema = z.discriminatedUnion('class', [
  z
    .object({ class: z.literal('profiled'), maxProfileHeightMm: positiveMm })
    .strict(),
  z.object({ class: z.literal('flat'), maxThicknessMm: positiveMm }).strict(),
]);
export type FlashingCovering = z.infer<typeof flashingCoveringSchema>;
export type CoveringProfileClass = FlashingCovering['class'];

export const roofWindowComponentTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('roof-window-component'),
    role: z.enum(ROOF_WINDOW_COMPONENT_ROLES),
    /** Manufacturer's window system, e.g. `velux-pitched`. */
    windowSystemKey: slug,
    /** Manufacturer's size code, e.g. `MK06`. Matched exactly. */
    sizeCode: z
      .string()
      .min(1)
      .max(16)
      .regex(/^[A-Z0-9]+$/),
    /** Window only: nominal outer size as the source states it. */
    nominalWidthMm: positiveMm.optional(),
    nominalHeightMm: positiveMm.optional(),
    /** Flashing only. */
    covering: flashingCoveringSchema.optional(),
    pitchRangeDeg: z
      .object({
        min: z.number().finite().min(0).max(90),
        max: z.number().finite().min(0).max(90),
      })
      .strict()
      .optional(),
    installationDepth: z.enum(['standard', 'recessed']).optional(),
    includes: z.array(z.enum(WINDOW_KIT_PARTS)).max(3).optional(),
  })
  .strict()
  .superRefine((spec, context) => {
    if (
      spec.role === 'roof-window' &&
      (!spec.nominalWidthMm || !spec.nominalHeightMm)
    )
      context.addIssue({ code: 'custom', message: 'window_requires_size' });
    if (
      spec.role === 'window-flashing-kit' &&
      (!spec.covering || !spec.includes?.includes('window-flashing'))
    )
      context.addIssue({ code: 'custom', message: 'kit_requires_covering' });
  });
export type RoofWindowComponentTechnicalSpec = z.infer<
  typeof roofWindowComponentTechnicalSpecSchema
>;

const catalogRefSchema = z.object({
  productId: stableId,
  technicalRevisionId: stableId,
  variantId: stableId.optional(),
});

export const roofWindowProductSnapshotSchema = z.object({
  name: z.string().trim().min(1).max(240),
  manufacturer: z.string().trim().min(1).max(160).optional(),
  spec: roofWindowComponentTechnicalSpecSchema,
  catalogRef: catalogRefSchema.optional(),
});
export type RoofWindowProductSnapshot = z.infer<
  typeof roofWindowProductSnapshotSchema
>;

/** Persisted per-opening decisions. Geometry is never stored here. */
export const roofOpeningIntentSchema = z.object({
  /** The roof-window feature (opaque). */
  featureId: stableId,
  /** Absent = generic opening (geometry only). */
  window: roofWindowProductSnapshotSchema.optional(),
  /** The covering class the user confirmed around this opening. */
  coveringClass: z.enum(['profiled', 'flat']).optional(),
  flashing: z
    .discriminatedUnion('source', [
      z.object({
        source: z.literal('catalog'),
        product: roofWindowProductSnapshotSchema,
      }),
      z.object({
        source: z.literal('manual'),
        name: z.string().trim().min(1).max(240),
        quantity: z.number().int().min(0).max(100),
      }),
    ])
    .optional(),
});
export type RoofOpeningIntent = z.infer<typeof roofOpeningIntentSchema>;

export type FlashingIncompatibility =
  | 'not-a-flashing-kit'
  | 'window-generic'
  | 'window-system-mismatch'
  | 'size-code-mismatch'
  | 'covering-class-unconfirmed'
  | 'covering-class-mismatch'
  | 'pitch-out-of-range'
  | 'opening-not-rectangular';

/**
 * Structural compatibility of a flashing kit with one opening. Every reason
 * is returned (not only the first) so the UI can say exactly why.
 */
export function flashingCompatibility(args: {
  kit: RoofWindowComponentTechnicalSpec;
  window: RoofWindowComponentTechnicalSpec | undefined;
  coveringClass: CoveringProfileClass | undefined;
  pitchDeg: number;
  rectangular: boolean;
}): FlashingIncompatibility[] {
  const reasons: FlashingIncompatibility[] = [];
  const { kit, window } = args;
  if (kit.role !== 'window-flashing-kit') reasons.push('not-a-flashing-kit');
  if (!window) reasons.push('window-generic');
  else {
    if (window.windowSystemKey !== kit.windowSystemKey)
      reasons.push('window-system-mismatch');
    if (window.sizeCode !== kit.sizeCode) reasons.push('size-code-mismatch');
  }
  if (!args.coveringClass) reasons.push('covering-class-unconfirmed');
  else if (kit.covering && kit.covering.class !== args.coveringClass)
    reasons.push('covering-class-mismatch');
  if (
    kit.pitchRangeDeg &&
    (args.pitchDeg < kit.pitchRangeDeg.min - 1e-6 ||
      args.pitchDeg > kit.pitchRangeDeg.max + 1e-6)
  )
    reasons.push('pitch-out-of-range');
  if (!args.rectangular) reasons.push('opening-not-rectangular');
  return reasons;
}

export interface OpeningInput {
  featureId: string;
  ordinal: number;
  widthMm: number;
  heightMm: number;
  pitchDeg: number;
  rectangular: boolean;
}

export type OpeningFlashingStatus =
  'requires-product' | 'requires-decision' | 'incompatible' | 'resolved';

export interface ResolvedOpeningSystem {
  featureId: string;
  ordinal: number;
  widthMm: number;
  heightMm: number;
  pitchDeg: number;
  window?: RoofWindowProductSnapshot;
  /** The assigned window's nominal size differs from the drawn opening. */
  windowSizeDiffers: boolean;
  coveringClass?: CoveringProfileClass;
  flashing: {
    status: OpeningFlashingStatus;
    source?: 'catalog' | 'manual';
    name?: string;
    quantity?: number;
    product?: RoofWindowProductSnapshot;
    includes: WindowKitPart[];
    reasons: FlashingIncompatibility[];
  };
}

const SIZE_TOLERANCE_MM = 5;

export function resolveOpeningSystems(args: {
  openings: readonly OpeningInput[];
  intents: readonly RoofOpeningIntent[] | undefined;
}): ResolvedOpeningSystem[] {
  return args.openings.map((opening) => {
    const intent = args.intents?.find(
      (item) => item.featureId === opening.featureId,
    );
    const window = intent?.window;
    const windowSizeDiffers =
      !!window &&
      (Math.abs((window.spec.nominalWidthMm ?? 0) - opening.widthMm) >
        SIZE_TOLERANCE_MM ||
        Math.abs((window.spec.nominalHeightMm ?? 0) - opening.heightMm) >
          SIZE_TOLERANCE_MM);
    const base = {
      featureId: opening.featureId,
      ordinal: opening.ordinal,
      widthMm: opening.widthMm,
      heightMm: opening.heightMm,
      pitchDeg: opening.pitchDeg,
      ...(window ? { window } : {}),
      windowSizeDiffers,
      ...(intent?.coveringClass ? { coveringClass: intent.coveringClass } : {}),
    };
    const flashing = intent?.flashing;
    if (flashing?.source === 'manual')
      return {
        ...base,
        flashing: {
          status: 'resolved' as const,
          source: 'manual' as const,
          name: flashing.name,
          quantity: flashing.quantity,
          includes: [],
          reasons: [],
        },
      };
    if (flashing?.source === 'catalog') {
      const reasons = flashingCompatibility({
        kit: flashing.product.spec,
        window: window?.spec,
        coveringClass: intent?.coveringClass,
        pitchDeg: opening.pitchDeg,
        rectangular: opening.rectangular,
      });
      return {
        ...base,
        flashing: {
          status: reasons.length
            ? ('incompatible' as const)
            : ('resolved' as const),
          source: 'catalog' as const,
          name: flashing.product.name,
          product: flashing.product,
          includes: flashing.product.spec.includes ?? [],
          reasons,
          ...(reasons.length ? {} : { quantity: 1 }),
        },
      };
    }
    return {
      ...base,
      flashing: {
        status: window
          ? ('requires-decision' as const)
          : ('requires-product' as const),
        includes: [],
        reasons: [],
      },
    };
  });
}
