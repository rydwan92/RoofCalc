import { z } from 'zod';
import { roofTemplateSchema } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';

/** Canonical, serializable boundary for future project persistence and revisions. */
export interface RoofProjectDocumentV1 {
  schemaVersion: 1;
  project: {
    roof: RoofTemplateSpec;
  };
}

export const roofProjectDocumentV1Schema: z.ZodType<RoofProjectDocumentV1> =
  z.object({
    schemaVersion: z.literal(1),
    project: z.object({
      roof: roofTemplateSchema,
    }),
  });

export function createRoofProjectDocument(
  roof: RoofTemplateSpec,
): RoofProjectDocumentV1 {
  return roofProjectDocumentV1Schema.parse({
    schemaVersion: 1,
    project: { roof },
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
