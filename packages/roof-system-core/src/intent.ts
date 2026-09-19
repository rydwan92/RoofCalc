import { z } from 'zod';
import { drainageIntentSchema } from './drainage-spec';
import { roofOpeningIntentSchema } from './openings';
import { roofLineComponentIntentSchema } from './system-component-spec';

/**
 * `project.roofSystem` — additive-optional (V51), extended in V52 with
 * `openings`. User decisions only; every count is derived.
 */
export const roofSystemIntentSchema = z.object({
  drainage: drainageIntentSchema.optional(),
  lineComponents: z.array(roofLineComponentIntentSchema).max(50).optional(),
  openings: z.array(roofOpeningIntentSchema).max(100).optional(),
});
export type RoofSystemIntent = z.infer<typeof roofSystemIntentSchema>;
