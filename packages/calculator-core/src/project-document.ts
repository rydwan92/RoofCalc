import { z } from 'zod';
import {
  coveringAssignmentSpecSchema,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { roofTemplateSchema } from '@cieslacalc/roof-math';
import type {
  RoofBuildUp,
  RoofFeature,
  RoofOpeningFramingSpec,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';

const roofFeatureSchema: z.ZodType<RoofFeature> = z.object({
  id: z.string().min(1),
  kind: z.literal('roof-window'),
  roofPlaneId: z.string().min(1),
  widthMm: z.number().positive(),
  heightMm: z.number().positive(),
  position: z.object({ uMm: z.number().finite(), vMm: z.number().finite() }),
  clearanceMm: z.number().nonnegative().optional(),
});
const roofBuildUpSchema: z.ZodType<RoofBuildUp> = z.object({
  membrane: z
    .object({
      enabled: z.boolean(),
      roofPlaneIds: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  counterBattens: z
    .object({
      enabled: z.boolean(),
      roofPlaneIds: z.array(z.string().min(1)).optional(),
      widthMm: z.number().positive(),
      heightMm: z.number().positive(),
    })
    .optional(),
  battenLayout: z
    .object({
      enabled: z.boolean(),
      roofPlaneIds: z.array(z.string().min(1)).optional(),
      battenHeightMm: z.number().positive(),
      battenWidthMm: z.number().positive(),
      gaugeMm: z.number().positive(),
      eaveOffsetMm: z.number().nonnegative(),
      ridgeOffsetMm: z.number().nonnegative().optional(),
    })
    .optional(),
});
const roofOpeningFramingSchema: z.ZodType<RoofOpeningFramingSpec> = z.object({
  id: z.string().min(1),
  kind: z.literal('roof-opening-framing'),
  featureId: z.string().min(1),
  headerSection: z.object({
    widthMm: z.number().positive(),
    depthMm: z.number().positive(),
  }),
  edgeOffsetMm: z.number().nonnegative(),
  acceptedGeometrySignature: z.string(),
});

/** Canonical, serializable boundary for future project persistence and revisions. */
export interface RoofProjectDocumentV1 {
  schemaVersion: 1;
  project: {
    roof: RoofTemplateSpec;
    features: RoofFeature[];
    openingFraming: RoofOpeningFramingSpec[];
    buildUp: RoofBuildUp;
    coverings: CoveringAssignmentSpec[];
  };
}

export const roofProjectDocumentV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    project: z.object({
      roof: roofTemplateSchema,
      features: z.array(roofFeatureSchema).optional(),
      openingFraming: z.array(roofOpeningFramingSchema).optional(),
      buildUp: roofBuildUpSchema.optional(),
      coverings: z.array(coveringAssignmentSpecSchema).optional(),
    }),
  })
  .transform((document): RoofProjectDocumentV1 => ({
    ...document,
    project: {
      ...document.project,
      features: document.project.features ?? [],
      openingFraming: document.project.openingFraming ?? [],
      buildUp: document.project.buildUp ?? {},
      coverings: document.project.coverings ?? [],
    },
  }));

export function createRoofProjectDocument(
  roof: RoofTemplateSpec,
  composition: Partial<
    Pick<
      RoofProjectDocumentV1['project'],
      'features' | 'openingFraming' | 'buildUp' | 'coverings'
    >
  > = {},
): RoofProjectDocumentV1 {
  return roofProjectDocumentV1Schema.parse({
    schemaVersion: 1,
    project: {
      roof,
      features: composition.features ?? [],
      openingFraming: composition.openingFraming ?? [],
      buildUp: composition.buildUp ?? {},
      coverings: composition.coverings ?? [],
    },
  });
}

export function serializeRoofProjectDocument(
  document: RoofProjectDocumentV1,
): string {
  return JSON.stringify(roofProjectDocumentV1Schema.parse(document));
}

export function parseRoofProjectDocument(
  serialized: string,
): RoofProjectDocumentV1 {
  return roofProjectDocumentV1Schema.parse(JSON.parse(serialized));
}
