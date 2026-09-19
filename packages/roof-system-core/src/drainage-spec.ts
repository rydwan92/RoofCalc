import { z } from 'zod';
import { ROOF_LINE_COMPONENT_ROLES } from './roles';

/**
 * V51 drainage vocabulary: schemas only, price-free (ADR-005).
 *
 * One technical catalogue kind — `roof-drainage-component` — covers every
 * fitting; the role is a field, not a table. Compatibility is the explicit
 * `systemKey`, never inferred from a manufacturer, colour, diameter string or
 * product name. Colour/finish is a commercial variant and never changes a
 * quantity rule.
 */
export const DRAINAGE_COMPONENT_ROLES = [
  'gutter-section',
  'gutter-connector',
  'gutter-corner-internal',
  'gutter-corner-external',
  'gutter-end-cap',
  'gutter-outlet',
  'gutter-hook',
  'downpipe',
  'downpipe-connector',
  'downpipe-elbow',
  'downpipe-clamp',
] as const;
export type DrainageComponentRole = (typeof DRAINAGE_COMPONENT_ROLES)[number];

const stableId = z.string().min(1).max(128);
const positiveMm = z.number().finite().positive().max(100_000);

export const roofDrainageComponentTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('roof-drainage-component'),
    /** Stable technical system identifier, e.g. `galeco-stal2-125-80`. */
    systemKey: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    role: z.enum(DRAINAGE_COMPONENT_ROLES),
    /** Nominal gutter/downpipe size as the source states it, e.g. `125/80×80`. */
    nominalSystemSize: z.string().trim().min(1).max(40),
    material: z
      .enum(['steel', 'pvc', 'aluminium', 'copper', 'zinc-titanium', 'other'])
      .optional(),
    /** Commercial length of a gutter section or downpipe. */
    lengthMm: positiveMm.optional(),
    /** Source-backed maximum spacing (hooks along a gutter, clamps on a pipe). */
    maxSpacingMm: positiveMm.optional(),
    /** Source-backed maximum distance of the first/last support from an end. */
    maxEndDistanceMm: z.number().finite().nonnegative().max(10_000).optional(),
    /** Corner or elbow angle as declared. */
    angleDeg: z.number().finite().positive().max(180).optional(),
    hand: z.enum(['left', 'right', 'universal']).optional(),
    /**
     * How sections of this length-component are joined. `separate-connector`
     * means one connector role element per joint.
     */
    joint: z.enum(['separate-connector', 'integrated']).optional(),
  })
  .strict()
  .refine(
    (spec) =>
      !(spec.role === 'gutter-section' || spec.role === 'downpipe') ||
      spec.lengthMm !== undefined,
    'length_component_requires_length',
  );
export type RoofDrainageComponentTechnicalSpec = z.infer<
  typeof roofDrainageComponentTechnicalSpecSchema
>;

/** One component as it was chosen — a reproducible snapshot (ADR-003). */
export const drainageComponentSnapshotSchema = z.object({
  spec: roofDrainageComponentTechnicalSpecSchema,
  name: z.string().trim().min(1).max(240),
  catalogRef: z
    .object({
      productId: stableId,
      technicalRevisionId: stableId,
      variantId: stableId.optional(),
    })
    .optional(),
});
export type DrainageComponentSnapshot = z.infer<
  typeof drainageComponentSnapshotSchema
>;

/** The user's selected gutter system: what RoofCalc plans materials for. */
export const drainageSystemSnapshotSchema = z.object({
  systemKey: z.string().min(1).max(64),
  source: z.enum(['catalog', 'manual']),
  name: z.string().trim().min(1).max(240),
  manufacturer: z.string().trim().min(1).max(160).optional(),
  nominalSystemSize: z.string().trim().min(1).max(40).optional(),
  components: z.array(drainageComponentSnapshotSchema).max(200),
});
export type DrainageSystemSnapshot = z.infer<
  typeof drainageSystemSnapshotSchema
>;

export const drainageOutletSchema = z.object({
  id: stableId,
  /** The canonical eave the outlet sits on (opaque ID). */
  eaveId: stableId,
  /** Normalized position along that eave, 0 = its start, 1 = its end. */
  station: z.number().finite().min(0).max(1),
  /** Downpipe height from the outlet to the discharge, entered by the user. */
  downpipeHeightMm: positiveMm.optional(),
  /** User-confirmed elbow count for this downpipe (never guessed). */
  elbowCount: z.number().int().min(0).max(12).optional(),
  /** User-stated clamp count, used when no source-backed spacing exists. */
  clampCount: z.number().int().min(0).max(100).optional(),
});
export type DrainageOutletIntent = z.infer<typeof drainageOutletSchema>;

export const drainageCornerDecisionSchema = z.object({
  endingEaveId: stableId,
  startingEaveId: stableId,
  connection: z.enum(['connected', 'separate']),
});
export type DrainageCornerDecision = z.infer<
  typeof drainageCornerDecisionSchema
>;

/**
 * Persisted drainage intent: user decisions only, never a derived count.
 *
 * `mode: 'auto'` follows the roof — every canonical eave is guttered and
 * corners use the proposed continuous layout. `mode: 'manual'` freezes the
 * explicit eave list and corner decisions. Outlets are always explicit: a
 * proposed outlet exists only on screen until the user confirms it.
 */
export const drainageIntentSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['auto', 'manual']),
  system: drainageSystemSnapshotSchema.optional(),
  gutteredEaveIds: z.array(stableId).max(200).optional(),
  corners: z.array(drainageCornerDecisionSchema).max(200).optional(),
  outlets: z.array(drainageOutletSchema).max(100).optional(),
  hookSpacing: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('auto') }),
      z.object({ mode: z.literal('manual'), spacingMm: positiveMm }),
    ])
    .optional(),
});
export type DrainageIntent = z.infer<typeof drainageIntentSchema>;

/**
 * A user-specified line component (ridge tape, eave strip, …) with an
 * explicit technical rule. Manual by nature until catalogue data exists.
 */
export const roofLineComponentIntentSchema = z.object({
  id: stableId,
  role: z.enum(ROOF_LINE_COMPONENT_ROLES as [string, ...string[]]),
  name: z.string().trim().min(1).max(240),
  rule: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('linear-effective-cover'),
      effectiveCoverLengthMm: positiveMm,
    }),
    z.object({
      kind: z.literal('manual'),
      quantity: z.number().int().min(0).max(100_000),
    }),
  ]),
});
export type RoofLineComponentIntent = z.infer<
  typeof roofLineComponentIntentSchema
>;

/** V51 additive-optional `project.roofSystem`. */
export const roofSystemIntentSchema = z.object({
  drainage: drainageIntentSchema.optional(),
  lineComponents: z.array(roofLineComponentIntentSchema).max(50).optional(),
});
export type RoofSystemIntent = z.infer<typeof roofSystemIntentSchema>;

/**
 * A manual gutter system: the user states commercial lengths and, only if
 * they know them, the maximum hook and clamp spacing. Every other role is a
 * generic element whose quantity RoofCalc still derives from topology.
 */
export function createManualDrainageSystem(args: {
  name: string;
  gutterLengthsMm: readonly number[];
  downpipeLengthsMm: readonly number[];
  hookMaxSpacingMm?: number;
  clampMaxSpacingMm?: number;
}): DrainageSystemSnapshot {
  const systemKey = 'manual';
  const nominalSystemSize = 'manual';
  const base = {
    schemaVersion: 1 as const,
    kind: 'roof-drainage-component' as const,
    systemKey,
    nominalSystemSize,
  };
  const component = (
    role: DrainageComponentRole,
    extra: Partial<RoofDrainageComponentTechnicalSpec> = {},
  ): DrainageComponentSnapshot => ({
    name: role,
    spec: { ...base, role, ...extra },
  });
  return {
    systemKey,
    source: 'manual',
    name: args.name,
    components: [
      ...[...new Set(args.gutterLengthsMm)].map((lengthMm) =>
        component('gutter-section', { lengthMm, joint: 'separate-connector' }),
      ),
      ...[...new Set(args.downpipeLengthsMm)].map((lengthMm) =>
        component('downpipe', { lengthMm, joint: 'separate-connector' }),
      ),
      component('gutter-connector'),
      component('gutter-corner-external'),
      component('gutter-corner-internal'),
      component('gutter-end-cap', { hand: 'universal' }),
      component('gutter-outlet'),
      component(
        'gutter-hook',
        args.hookMaxSpacingMm ? { maxSpacingMm: args.hookMaxSpacingMm } : {},
      ),
      component('downpipe-connector'),
      component('downpipe-elbow'),
      component(
        'downpipe-clamp',
        args.clampMaxSpacingMm ? { maxSpacingMm: args.clampMaxSpacingMm } : {},
      ),
    ],
  };
}
