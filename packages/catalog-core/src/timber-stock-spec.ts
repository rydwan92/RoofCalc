import { z } from 'zod';

/**
 * A dimensional-lumber/board catalog product's technical shape (V35). Lives
 * alongside `covering-core`'s technical specs in `catalogTechnicalSpecSchema`
 * (`./index.ts`) — never inside `covering-core` itself, since timber stock
 * has no roof-plane geometry concept at all and only ever feeds
 * `procurement-core` through the web-layer adapter
 * (`apps/web/src/assembly/timber-stock-adapter.ts`).
 *
 * `lengthMm` is a technical fact here, not a commercial-variant attribute:
 * each distinct (width, depth, length, grade, treatment) combination is a
 * genuinely different physical item, so it gets its own product family and
 * revision rather than being modeled as a "size variant" of one family.
 */

export const TIMBER_STOCK_TECHNICAL_SCHEMA_VERSION = 1 as const;

/** V49: applications a source may declare for a timber-stock product. */
export const TIMBER_STOCK_APPLICATIONS = [
  'batten',
  'counter-batten',
  'structural-framing',
  'general',
] as const;
export type TimberStockApplication = (typeof TIMBER_STOCK_APPLICATIONS)[number];

const finitePositive = z.number().finite().positive();

export const timberStockTechnicalSpecSchema = z.object({
  schemaVersion: z.literal(TIMBER_STOCK_TECHNICAL_SCHEMA_VERSION),
  kind: z.literal('timber-stock'),
  widthMm: finitePositive,
  depthMm: finitePositive,
  lengthMm: finitePositive,
  strengthClass: z.string().trim().min(1).max(32).optional(),
  species: z.string().trim().min(1).max(64).optional(),
  kilnDried: z.boolean().optional(),
  planed: z.boolean().optional(),
  treated: z.boolean().optional(),
  moisturePercentRange: z
    .object({
      min: z.number().finite().nonnegative(),
      max: z.number().finite().nonnegative(),
    })
    .refine((range) => range.min <= range.max, 'invalid_range')
    .optional(),
  salesUnit: z.enum(['piece', 'm', 'm3']),
  /**
   * V49. What the *source* declares or markets this physical product for —
   * never a RoofCalc statement that the section is structurally adequate for
   * a given roof. Additive-optional: every V35 revision without it stays
   * valid under the same schema version, and absent means "not declared",
   * not "general". The exact source wording is kept in the revision's
   * `source.label` so each classification stays auditable.
   */
  declaredApplications: z
    .array(z.enum(TIMBER_STOCK_APPLICATIONS))
    .min(1)
    .refine(
      (values) => new Set(values).size === values.length,
      'duplicate_application',
    )
    .optional(),
});

export type TimberStockTechnicalSpec = z.infer<
  typeof timberStockTechnicalSpecSchema
>;
