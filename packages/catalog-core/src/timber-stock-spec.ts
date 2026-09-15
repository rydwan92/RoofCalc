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
});

export type TimberStockTechnicalSpec = z.infer<
  typeof timberStockTechnicalSpecSchema
>;
