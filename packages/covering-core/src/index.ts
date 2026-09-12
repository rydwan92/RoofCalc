import { z } from 'zod';

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

export const tileInstallationModeSchema = z.object({
  id: stableId,
  coverWidthMm: finitePositive,
  gaugeRangeMm: rangeSchema,
  /** Additive in V19: absent V18 snapshots remain valid but cannot be laid out. */
  coursePattern: tileCoursePatternSchema.optional(),
  declaredUnitsPerM2: rangeSchema.optional(),
  minPitchDeg: pitchDeg.optional(),
  technicalConditionId: stableId.optional(),
});

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
  moduleLengthMm: finitePositive,
  moduleWidthMm: finitePositive.optional(),
  profileHeightMm: finitePositive.optional(),
  minPitchDeg: pitchDeg.optional(),
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
    })
    .optional(),
  technicalSpecSnapshot: coveringTechnicalSpecSchema,
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
    layoutIntent: roofTileLayoutIntentSchema.optional(),
  })
  .superRefine((assignment, context) => {
    const selected = assignment.selectedInstallationModeId;
    if (!selected) return;
    const spec = assignment.product.technicalSpecSnapshot;
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

export type CoveringCompatibilityCode =
  | 'installation-mode-required'
  | 'installation-mode-not-found'
  | 'below-minimum-pitch'
  | 'batten-gauge-required'
  | 'batten-gauge-below-minimum'
  | 'batten-gauge-above-maximum';

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
  if (!Number.isFinite(roofPitchDeg) || roofPitchDeg <= 0)
    throw new RangeError('invalid_roof_pitch');

  if (productSpec.kind === 'roof-tile') {
    if (!selectedInstallationModeId) {
      issues.push({
        code: 'installation-mode-required',
        severity: 'incomplete',
      });
    } else {
      const mode = productSpec.installationModes.find(
        (candidate) => candidate.id === selectedInstallationModeId,
      );
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

/** Future quantity-core bridge. V18 deliberately produces no quantity rows. */
export interface CoveringQuantitySource {
  id: string;
  coveringAssignmentId: string;
  sourceRoofPlaneIds: string[];
  unit: 'piece' | 'metre' | 'square-metre';
  quantity: number;
  fullPositions?: number;
  cutPositions?: number;
  splitPositions?: number;
  basis: string;
  productDisplay?: CoveringProductSelection['displaySnapshot'];
  netAreaMm2?: number;
  declaredQuantityRange?: { minimum: number; maximum: number };
  warningKeys?: string[];
}

export * from './tile-layout';
