import { z } from 'zod';
import { resolveInstallationMode } from './roof-tile-installation';
export * from './roof-tile-installation';
export * from './covering-support-capability';
export * from './roof-tile-purchase-spec';
import {
  commercialPackagingFactsSchema,
  roofTilePurchaseDecisionSchema,
} from './roof-tile-purchase-spec';

export const COVERING_TECHNICAL_SCHEMA_VERSION = 1 as const;

const finitePositive = z.number().finite().positive();
const pitchDeg = finitePositive.max(90);
const stableId = z.string().min(1);
const uniqueIds = <T extends { id: string }>(items: readonly T[]) =>
  new Set(items.map((item) => item.id)).size === items.length;

const rangeSchema = z
  .object({ min: finitePositive, max: finitePositive })
  .refine((range) => range.min <= range.max, 'invalid_range');

const normalizedOffsetFraction = z.number().finite().min(0).lt(1);

export const tileCoursePatternSchema = z.object({
  layers: z
    .array(
      z.object({
        id: stableId,
        horizontalOffsetFraction: normalizedOffsetFraction,
      }),
    )
    .min(1)
    .refine(uniqueIds, 'duplicate_tile_pattern_layer'),
  battenRowOffsetCycle: z.array(normalizedOffsetFraction).min(1),
});

/**
 * A pitch-dependent override for one installation mode (V35). Absent this,
 * the mode's own `gaugeRangeMm`/`minPitchDeg` are unconditional. Schema only
 * this iteration — `resolveInstallationMode`/`evaluateRoofTileInstallation`
 * do not yet select a rule by project pitch, so a product whose real gauge
 * genuinely depends on pitch (e.g. BMI Teviva) must not be seeded with one
 * flattened `gaugeRangeMm` that would silently claim unconditional
 * compatibility (`docs/ARCHITECTURE_V35_MATERIAL_CATALOG_AND_DB_BOOTSTRAP.md`).
 */
export const tileInstallationRuleSchema = z.object({
  id: stableId,
  pitchRangeDeg: z.object({ min: pitchDeg, max: pitchDeg.optional() }),
  gaugeRangeMm: rangeSchema.optional(),
  technicalConditionId: stableId.optional(),
});

export const tileInstallationModeSchema = z
  .object({
    id: stableId,
    coverWidthMm: finitePositive,
    /** Additive in V35: the manufacturer's published min/avg/max, when published. */
    coverWidthRangeMm: rangeSchema.optional(),
    gaugeRangeMm: rangeSchema,
    /** Additive in V19: absent V18 snapshots remain valid but cannot be laid out. */
    coursePattern: tileCoursePatternSchema.optional(),
    declaredUnitsPerM2: rangeSchema.optional(),
    /**
     * The enforced compatibility floor (`evaluateRoofTileInstallation` blocks
     * below it) — unchanged semantics since before V35.
     */
    minPitchDeg: pitchDeg.optional(),
    /**
     * Additive in V35: a manufacturer-published *recommended* minimum, always
     * >= `minPitchDeg` when both are set. Purely informational — surfaced as a
     * `'recommendation'`-category issue, never a hard block.
     */
    recommendedMinPitchDeg: pitchDeg.optional(),
    /** Additive in V35, schema/type only this iteration — see doc comment above. */
    installationRules: z.array(tileInstallationRuleSchema).optional(),
    technicalConditionId: stableId.optional(),
  })
  .refine(
    (mode) =>
      mode.minPitchDeg === undefined ||
      mode.recommendedMinPitchDeg === undefined ||
      mode.recommendedMinPitchDeg >= mode.minPitchDeg,
    'invalid_recommended_pitch',
  );

export const roofTileTechnicalSpecSchema = z.object({
  schemaVersion: z.literal(COVERING_TECHNICAL_SCHEMA_VERSION),
  kind: z.literal('roof-tile'),
  physicalWidthMm: finitePositive.optional(),
  physicalLengthMm: finitePositive.optional(),
  material: z.enum(['ceramic', 'concrete', 'other']).optional(),
  weightKgPerPiece: finitePositive.optional(),
  salesUnit: z.enum(['piece', 'square-metre']).optional(),
  installationModes: z
    .array(tileInstallationModeSchema)
    .min(1)
    .refine(uniqueIds, 'duplicate_installation_mode'),
});

const fixedSheetLengthSchema = z.object({
  kind: z.literal('fixed-sheet'),
  effectiveLengthMm: finitePositive,
  totalLengthMm: finitePositive.optional(),
});

const cutToLengthSchema = z
  .object({
    kind: z.literal('cut-to-length'),
    minPanelLengthMm: finitePositive,
    maxPanelLengthMm: finitePositive,
  })
  .refine(
    (range) => range.minPanelLengthMm <= range.maxPanelLengthMm,
    'invalid_panel_length_range',
  );

export const modularSheetTechnicalSpecSchema = z.object({
  schemaVersion: z.literal(COVERING_TECHNICAL_SCHEMA_VERSION),
  kind: z.literal('modular-sheet'),
  effectiveWidthMm: finitePositive,
  totalWidthMm: finitePositive.optional(),
  lengthModel: z.union([fixedSheetLengthSchema, cutToLengthSchema]),
  /** Physical/profile repeat along the roof slope, not support spacing. */
  moduleLengthMm: finitePositive,
  /** Regular support spacing; absent V1 snapshots use moduleLengthMm. */
  battenGaugeMm: finitePositive.optional(),
  moduleWidthMm: finitePositive.optional(),
  profileHeightMm: finitePositive.optional(),
  minPitchDeg: pitchDeg.optional(),
  recommendedMinPitchDeg: pitchDeg.optional(),
  declaredEffectiveAreaM2: finitePositive.optional(),
  weightKgPerPiece: finitePositive.optional(),
  massKgPerM2: finitePositive.optional(),
  stepHeightMm: finitePositive.optional(),
  waveHeightMm: finitePositive.optional(),
  wavePitchMm: finitePositive.optional(),
  profileDepthMm: finitePositive.optional(),
  transverseOverlap: z
    .object({
      minimumOverlapMm: finitePositive,
      minPitchDeg: pitchDeg.optional(),
    })
    .optional(),
  physicalThicknessMm: finitePositive.optional(),
  material: z.enum(['steel', 'aluminium', 'other']).optional(),
  salesUnit: z.enum(['piece', 'square-metre']).optional(),
});

export const standingSeamInstallationModeSchema = z.object({
  id: stableId,
  effectiveWidthMm: finitePositive,
  totalWidthMm: finitePositive.optional(),
  minPitchDeg: pitchDeg.optional(),
});

export const standingSeamTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(COVERING_TECHNICAL_SCHEMA_VERSION),
    kind: z.literal('standing-seam'),
    installationModes: z
      .array(standingSeamInstallationModeSchema)
      .min(1)
      .refine(uniqueIds, 'duplicate_installation_mode'),
    minPanelLengthMm: finitePositive,
    maxPanelLengthMm: finitePositive,
    seamHeightMm: finitePositive,
    minPitchDeg: pitchDeg.optional(),
    recommendedMinPitchDeg: pitchDeg.optional(),
    massKgPerM2: finitePositive.optional(),
    physicalThicknessMm: finitePositive.optional(),
    material: z.enum(['steel', 'aluminium', 'other']).optional(),
    salesUnit: z.enum(['piece', 'square-metre']).optional(),
    transverseOverlap: z
      .object({
        minimumOverlapMm: finitePositive,
        minPitchDeg: pitchDeg.optional(),
      })
      .optional(),
  })
  .refine(
    (spec) => spec.minPanelLengthMm <= spec.maxPanelLengthMm,
    'invalid_panel_length_range',
  );

// Every member carries a literal `kind`, so this remains a discriminated
// domain union while allowing the member-level refinements above to run.
export const coveringTechnicalSpecSchema = z.union([
  roofTileTechnicalSpecSchema,
  modularSheetTechnicalSpecSchema,
  standingSeamTechnicalSpecSchema,
]);

/**
 * A membrane roll's technical shape. Deliberately NOT a member of
 * `coveringTechnicalSpecSchema` — a membrane is a build-up layer under/over
 * the primary covering, not a competing candidate for roof-plane ownership,
 * so it must never enter `resolvePrimaryCoveringAssignments` or any
 * `layoutKind` union.
 */
/**
 * A directional/conditional overlap override (V35). Schema only — the V1
 * course-fit solver (`resolveMembraneCourseFit` in `@cieslacalc/roof-math`)
 * keeps using the flat `minimumOverlapMm` baseline below; a future iteration
 * can select a rule by direction/pitch without another schema change.
 */
export const membraneOverlapRuleSchema = z.object({
  direction: z.enum(['longitudinal', 'transverse']),
  minimumOverlapMm: z.number().finite().nonnegative(),
  pitchRangeDeg: z
    .object({ min: pitchDeg.optional(), max: pitchDeg.optional() })
    .optional(),
  requiresSealing: z.boolean().optional(),
  technicalConditionId: stableId.optional(),
});

export const membraneTechnicalSpecSchema = z
  .object({
    schemaVersion: z.literal(COVERING_TECHNICAL_SCHEMA_VERSION),
    kind: z.literal('membrane'),
    rollWidthMm: finitePositive,
    rollLengthMm: finitePositive,
    minimumOverlapMm: z.number().finite().nonnegative(),
    minPitchDeg: pitchDeg.optional(),
    material: z.enum(['synthetic', 'bituminous', 'other']).optional(),
    salesUnit: z.enum(['roll', 'square-metre']).optional(),
    /** Additive in V35, schema only — see doc comment above. */
    overlapRules: z.array(membraneOverlapRuleSchema).optional(),
  })
  .refine(
    (spec) => spec.minimumOverlapMm < spec.rollWidthMm,
    'invalid_overlap',
  );

export type MembraneTechnicalSpec = z.infer<typeof membraneTechnicalSpecSchema>;

/**
 * A membrane's project selection: catalogue provenance plus the immutable
 * technical snapshot layout/cost calculate from (ADR-003's own pattern,
 * mirrored from `CoveringProductSelection`). Introduced in V35 alongside the
 * membrane catalogue picker; `roofProjectDocumentV1Schema`
 * (`@cieslacalc/calculator-core`) accepts the V34C raw-spec shape too and
 * normalizes it into this wrapper on parse, so a project saved between the
 * V34C membrane-engine push and this change still opens unchanged.
 */
export const membraneProductSelectionSchema = z.object({
  catalogRef: z
    .object({
      productId: stableId,
      technicalRevisionId: stableId,
      variantId: stableId.optional(),
    })
    .optional(),
  displaySnapshot: z
    .object({
      manufacturer: z.string().min(1).optional(),
      familyName: z.string().min(1).optional(),
      variantName: z.string().min(1).optional(),
      revisionCode: z.string().min(1).optional(),
    })
    .optional(),
  technicalSpecSnapshot: membraneTechnicalSpecSchema,
});

export type MembraneProductSelection = z.infer<
  typeof membraneProductSelectionSchema
>;

/**
 * Accepts either the V34C raw `MembraneTechnicalSpec` (identified by its own
 * `kind: 'membrane'` at the top level) or the V35 `MembraneProductSelection`
 * wrapper, normalizing the former into `{ technicalSpecSnapshot: <raw spec> }`
 * — normalization on parse, not a schema-version bump
 * (`docs/SCHEMA_REGISTRY.md` §1's migration policy).
 */
export const membraneProductFieldSchema = z
  .union([membraneTechnicalSpecSchema, membraneProductSelectionSchema])
  .transform((value): MembraneProductSelection =>
    'kind' in value ? { technicalSpecSnapshot: value } : value,
  );

export type RoofTileInstallationMode = z.infer<
  typeof tileInstallationModeSchema
>;
export type TileCoursePattern = z.infer<typeof tileCoursePatternSchema>;
export type RoofTileTechnicalSpec = z.infer<typeof roofTileTechnicalSpecSchema>;
export type ModularSheetTechnicalSpec = z.infer<
  typeof modularSheetTechnicalSpecSchema
>;
export type StandingSeamInstallationMode = z.infer<
  typeof standingSeamInstallationModeSchema
>;
export type StandingSeamTechnicalSpec = z.infer<
  typeof standingSeamTechnicalSpecSchema
>;
export type CoveringTechnicalSpec = z.infer<typeof coveringTechnicalSpecSchema>;
export type CoveringKind = CoveringTechnicalSpec['kind'];

export const coveringProductSelectionSchema = z.object({
  catalogRef: z
    .object({
      productId: stableId,
      technicalRevisionId: stableId,
      variantId: stableId.optional(),
    })
    .optional(),
  displaySnapshot: z
    .object({
      manufacturer: z.string().min(1).optional(),
      familyName: z.string().min(1).optional(),
      variantName: z.string().min(1).optional(),
      revisionCode: z.string().min(1).optional(),
    })
    .optional(),
  technicalSpecSnapshot: coveringTechnicalSpecSchema,
  /**
   * V50: commercial facts copied from the picked catalogue variant (mutable
   * catalogue data, so a snapshot keeps the project reproducible offline).
   */
  commercialSnapshot: z
    .object({ packaging: commercialPackagingFactsSchema.optional() })
    .optional(),
});

export type CoveringProductSelection = z.infer<
  typeof coveringProductSelectionSchema
>;

export const roofTileLayoutIntentSchema = z
  .object({
    kind: z.literal('roof-tile'),
    horizontalAlignment: z.enum(['centered', 'from-u-min', 'manual']),
    planeOffsetsMm: z.record(stableId, z.number().finite()).optional(),
  })
  .superRefine((intent, context) => {
    if (
      intent.horizontalAlignment === 'manual' &&
      (!intent.planeOffsetsMm || !Object.keys(intent.planeOffsetsMm).length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planeOffsetsMm'],
        message: 'manual_tile_offset_required',
      });
  });

export type RoofTileLayoutIntent = z.infer<typeof roofTileLayoutIntentSchema>;

export const modularSheetLayoutIntentSchema = z
  .object({
    kind: z.literal('modular-sheet'),
    horizontalAlignment: z.enum(['centered', 'from-u-min', 'manual']),
    planeOffsetsMm: z.record(stableId, z.number().finite()).optional(),
  })
  .superRefine((intent, context) => {
    if (
      intent.horizontalAlignment === 'manual' &&
      (!intent.planeOffsetsMm || !Object.keys(intent.planeOffsetsMm).length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planeOffsetsMm'],
        message: 'manual_sheet_offset_required',
      });
  });

export type ModularSheetLayoutIntent = z.infer<
  typeof modularSheetLayoutIntentSchema
>;
export const cutToLengthSheetLayoutIntentSchema = z
  .object({
    kind: z.literal('modular-sheet-cut-to-length'),
    horizontalAlignment: z.enum(['centered', 'from-u-min', 'manual']),
    planeOffsetsMm: z.record(stableId, z.number().finite()).optional(),
  })
  .superRefine((intent, context) => {
    if (
      intent.horizontalAlignment === 'manual' &&
      (!intent.planeOffsetsMm || !Object.keys(intent.planeOffsetsMm).length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planeOffsetsMm'],
        message: 'manual_sheet_offset_required',
      });
  });
export type CutToLengthSheetLayoutIntent = z.infer<
  typeof cutToLengthSheetLayoutIntentSchema
>;
export const standingSeamLayoutIntentSchema = z
  .object({
    kind: z.literal('standing-seam'),
    horizontalAlignment: z.enum(['centered', 'from-u-min', 'manual']),
    planeOffsetsMm: z.record(stableId, z.number().finite()).optional(),
  })
  .superRefine((intent, context) => {
    if (
      intent.horizontalAlignment === 'manual' &&
      (!intent.planeOffsetsMm || !Object.keys(intent.planeOffsetsMm).length)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['planeOffsetsMm'],
        message: 'manual_panel_offset_required',
      });
  });
export type StandingSeamLayoutIntent = z.infer<
  typeof standingSeamLayoutIntentSchema
>;
export const coveringLayoutIntentSchema = z.union([
  roofTileLayoutIntentSchema,
  modularSheetLayoutIntentSchema,
  cutToLengthSheetLayoutIntentSchema,
  standingSeamLayoutIntentSchema,
]);
export type CoveringLayoutIntent = z.infer<typeof coveringLayoutIntentSchema>;

export const coveringAssignmentSpecSchema = z
  .object({
    id: stableId,
    roofPlaneIds: z
      .array(stableId)
      .min(1)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'duplicate_roof_plane',
      ),
    product: coveringProductSelectionSchema,
    selectedInstallationModeId: stableId.optional(),
    layoutIntent: coveringLayoutIntentSchema.optional(),
    /** V50: the user's tile purchase decision; absent = geometry only. */
    purchase: roofTilePurchaseDecisionSchema.optional(),
  })
  .superRefine((assignment, context) => {
    const selected = assignment.selectedInstallationModeId;
    const spec = assignment.product.technicalSpecSnapshot;
    const expectedIntentKind =
      spec.kind === 'modular-sheet' && spec.lengthModel.kind === 'cut-to-length'
        ? 'modular-sheet-cut-to-length'
        : spec.kind;
    // Older cut-to-length snapshots may have a V21 modular-sheet intent.
    if (
      assignment.layoutIntent &&
      assignment.layoutIntent.kind !== expectedIntentKind &&
      !(
        expectedIntentKind === 'modular-sheet-cut-to-length' &&
        assignment.layoutIntent.kind === 'modular-sheet'
      )
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['layoutIntent', 'kind'],
        message: 'layout_intent_kind_mismatch',
      });
    if (assignment.purchase && spec.kind !== 'roof-tile')
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purchase'],
        message: 'purchase_kind_mismatch',
      });
    if (!selected) return;
    if (
      spec.kind !== 'modular-sheet' &&
      !spec.installationModes.some((mode) => mode.id === selected)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedInstallationModeId'],
        message: 'unknown_installation_mode',
      });
  });

export type CoveringAssignmentSpec = z.infer<
  typeof coveringAssignmentSpecSchema
>;

export interface PrimaryCoveringPlaneConflict {
  roofPlaneId: string;
  assignmentIds: string[];
}

export interface PrimaryCoveringAssignmentResolution {
  conflicts: PrimaryCoveringPlaneConflict[];
  conflictedAssignmentIds: string[];
  trustedRoofPlaneIdsByAssignment: Record<string, string[]>;
}

/** One primary covering may own a plane. Existing overlaps are reported, never rewritten. */
export function resolvePrimaryCoveringAssignments(
  assignments: readonly CoveringAssignmentSpec[],
): PrimaryCoveringAssignmentResolution {
  const owners = new Map<string, string[]>();
  for (const assignment of [...assignments].sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    for (const roofPlaneId of [...assignment.roofPlaneIds].sort())
      owners.set(roofPlaneId, [
        ...(owners.get(roofPlaneId) ?? []),
        assignment.id,
      ]);
  const conflicts = [...owners.entries()]
    .filter(([, assignmentIds]) => assignmentIds.length > 1)
    .map(([roofPlaneId, assignmentIds]) => ({ roofPlaneId, assignmentIds }))
    .sort((a, b) => a.roofPlaneId.localeCompare(b.roofPlaneId));
  const conflictPlanes = new Set(conflicts.map((item) => item.roofPlaneId));
  return {
    conflicts,
    conflictedAssignmentIds: [
      ...new Set(conflicts.flatMap((item) => item.assignmentIds)),
    ].sort(),
    trustedRoofPlaneIdsByAssignment: Object.fromEntries(
      assignments.map((assignment) => [
        assignment.id,
        assignment.roofPlaneIds
          .filter((roofPlaneId) => !conflictPlanes.has(roofPlaneId))
          .sort(),
      ]),
    ),
  };
}

export type CoveringCompatibilityCode =
  | 'installation-mode-required'
  | 'installation-mode-not-found'
  | 'below-minimum-pitch'
  | 'batten-gauge-required'
  | 'batten-gauge-below-minimum'
  | 'batten-gauge-above-maximum'
  | 'invalid-roof-pitch'
  | 'invalid-product-data'
  | 'invalid-batten-gauge';

export interface CoveringCompatibilityIssue {
  code: CoveringCompatibilityCode;
  severity: 'error' | 'incomplete';
  actual?: number;
  required?: number;
  minimum?: number;
  maximum?: number;
}

export interface CoveringCompatibilityResult {
  status: 'compatible' | 'incompatible' | 'incomplete';
  issues: CoveringCompatibilityIssue[];
}

export function checkCoveringCompatibility(args: {
  productSpec: CoveringTechnicalSpec;
  roofPitchDeg: number;
  selectedInstallationModeId?: string;
  battenGaugeMm?: number;
}): CoveringCompatibilityResult {
  const issues: CoveringCompatibilityIssue[] = [];
  const { productSpec, roofPitchDeg, selectedInstallationModeId } = args;
  if (!Number.isFinite(roofPitchDeg) || roofPitchDeg <= 0 || roofPitchDeg >= 90)
    return {
      status: 'incompatible',
      issues: [{ code: 'invalid-roof-pitch', severity: 'error' }],
    };
  if (!coveringTechnicalSpecSchema.safeParse(productSpec).success)
    return {
      status: 'incompatible',
      issues: [{ code: 'invalid-product-data', severity: 'error' }],
    };
  if (
    args.battenGaugeMm !== undefined &&
    (!Number.isFinite(args.battenGaugeMm) || args.battenGaugeMm <= 0)
  )
    return {
      status: 'incompatible',
      issues: [{ code: 'invalid-batten-gauge', severity: 'error' }],
    };

  if (productSpec.kind === 'roof-tile') {
    const mode = resolveInstallationMode(
      productSpec.installationModes,
      selectedInstallationModeId,
    );
    if (!mode && !selectedInstallationModeId) {
      issues.push({
        code: 'installation-mode-required',
        severity: 'incomplete',
      });
    } else {
      if (!mode)
        issues.push({
          code: 'installation-mode-not-found',
          severity: 'incomplete',
        });
      else {
        if (mode.minPitchDeg !== undefined && roofPitchDeg < mode.minPitchDeg)
          issues.push({
            code: 'below-minimum-pitch',
            severity: 'error',
            actual: roofPitchDeg,
            required: mode.minPitchDeg,
          });
        if (args.battenGaugeMm === undefined)
          issues.push({
            code: 'batten-gauge-required',
            severity: 'incomplete',
            minimum: mode.gaugeRangeMm.min,
            maximum: mode.gaugeRangeMm.max,
          });
        else if (args.battenGaugeMm < mode.gaugeRangeMm.min)
          issues.push({
            code: 'batten-gauge-below-minimum',
            severity: 'error',
            actual: args.battenGaugeMm,
            minimum: mode.gaugeRangeMm.min,
          });
        else if (args.battenGaugeMm > mode.gaugeRangeMm.max)
          issues.push({
            code: 'batten-gauge-above-maximum',
            severity: 'error',
            actual: args.battenGaugeMm,
            maximum: mode.gaugeRangeMm.max,
          });
      }
    }
  } else {
    if (productSpec.kind === 'standing-seam' && !selectedInstallationModeId)
      issues.push({
        code: 'installation-mode-required',
        severity: 'incomplete',
      });
    const mode =
      productSpec.kind === 'standing-seam' && selectedInstallationModeId
        ? productSpec.installationModes.find(
            (candidate) => candidate.id === selectedInstallationModeId,
          )
        : undefined;
    if (
      productSpec.kind === 'standing-seam' &&
      selectedInstallationModeId &&
      !mode
    )
      issues.push({
        code: 'installation-mode-not-found',
        severity: 'incomplete',
      });
    const minimumPitch = mode?.minPitchDeg ?? productSpec.minPitchDeg;
    if (minimumPitch !== undefined && roofPitchDeg < minimumPitch)
      issues.push({
        code: 'below-minimum-pitch',
        severity: 'error',
        actual: roofPitchDeg,
        required: minimumPitch,
      });
  }

  return {
    status: issues.some((issue) => issue.severity === 'error')
      ? 'incompatible'
      : issues.length
        ? 'incomplete'
        : 'compatible',
    issues,
  };
}

export interface CoveringRoofSurfaceGeometry {
  roofPlaneId: string;
  pitchDeg: number;
  localPolygon: readonly { uMm: number; vMm: number }[];
  netAreaMm2: number;
}

export interface CoveringBattenRow {
  id: string;
  roofPlaneId: string;
  stationVMm: number;
  segments: readonly { fromUMm: number; toUMm: number }[];
}

export interface CoveringOpeningGeometry {
  id: string;
  roofPlaneId: string;
  fromUMm: number;
  toUMm: number;
  fromVMm: number;
  toVMm: number;
}

export interface CoveringLayoutInput<
  TSpec extends CoveringTechnicalSpec,
  TIntent,
> {
  roofSurfaceGeometry: readonly CoveringRoofSurfaceGeometry[];
  openings: readonly CoveringOpeningGeometry[];
  buildUp: { battenGaugeMm?: number };
  battens?: readonly CoveringBattenRow[];
  productSpec: TSpec;
  layoutIntent: TIntent;
}

export interface CoveringLayoutResult {
  kind: CoveringKind;
  status: 'resolved' | 'limited' | 'incomplete' | 'incompatible' | 'invalid';
  roofPlaneIds: string[];
  issueCodes: string[];
}

export interface CoveringLayoutStrategy<
  TSpec extends CoveringTechnicalSpec,
  TIntent,
  TResult extends CoveringLayoutResult,
> {
  readonly kind: TSpec['kind'];
  resolve(input: CoveringLayoutInput<TSpec, TIntent>): TResult;
}

export type CoveringQuantitySemantic =
  'effective-coverage-position' | 'geometric-panel-run';
export type CoveringRequirementReadiness = 'geometric-only';
export type CoveringQuantityLayoutKind =
  | 'roof-tile'
  | 'modular-sheet'
  | 'standing-seam'
  | 'modular-sheet-cut-to-length';

interface CoveringQuantitySourceBase {
  id: string;
  coveringAssignmentId: string;
  sourceRoofPlaneIds: string[];
  quantity: number;
  requirementReadiness: CoveringRequirementReadiness;
  productDisplay?: CoveringProductSelection['displaySnapshot'];
  warningKeys?: string[];
}

/** Neutral, typed bridge into quantity-core. No purchase unit is represented. */
export type CoveringQuantitySource =
  | (CoveringQuantitySourceBase & {
      layoutKind: 'roof-tile' | 'modular-sheet';
      semantic: 'effective-coverage-position';
      unit: 'coverage-position';
      fullPositions: number;
      cutPositions: number;
      splitPositions?: number;
      netAreaMm2?: number;
      declaredConsumptionReferenceRange?: {
        minimum: number;
        maximum: number;
      };
    })
  | (CoveringQuantitySourceBase & {
      layoutKind: 'standing-seam' | 'modular-sheet-cut-to-length';
      semantic: 'geometric-panel-run';
      unit: 'geometric-run';
      totalLengthMm: number;
      lengthGroups: { lengthMm: number; quantity: number }[];
    });

export * from './tile-layout';
export * from './modular-sheet-layout';
export * from './variable-panel-layout';
export * from './standing-seam-layout';
export * from './cut-to-length-sheet-layout';
