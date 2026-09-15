import { z } from 'zod';
import { COST_LINE_CATEGORIES } from './model';
import type { CostScenario } from './model';

const nonBlank = z.string().trim().min(1);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const minorUnits = z.number().int().min(0);
const taxRateBps = z.number().int().min(0).max(10000);
const quantityUnitSchema = z.enum([
  'piece',
  'm',
  'm2',
  'm3',
  'kg',
  'hour',
  'flat',
]);
const quantityBasisSchema = z.enum([
  'procurement-stock',
  'fabrication-requirement',
  'geometric-length',
  'net-area',
  'gross-area',
  'effective-coverage',
  'manual',
]);
const suitabilitySchema = z.enum([
  'exact-purchase',
  'execution-based',
  'geometric-estimate',
  'manual-required',
  'unavailable',
]);
const categorySchema = z.enum(COST_LINE_CATEGORIES as [string, ...string[]]);
const sourceSchema = z.enum(['project-derived', 'manual', 'price-list']);

const costLineV1Schema = z.object({
  id: nonBlank,
  category: categorySchema,
  label: nonBlank,
  quantity: z.object({
    value: z.number().finite().min(0),
    unit: quantityUnitSchema,
  }),
  quantityBasis: quantityBasisSchema,
  suitability: suitabilitySchema,
  currencyCode,
  unitPriceMinor: minorUnits.optional(),
  source: sourceSchema,
  included: z.boolean(),
  noteKeys: z.array(z.string()).default([]),
  projectQuantityValue: z.number().finite().min(0).optional(),
  priceProvenance: z
    .object({
      source: z.enum(['manual', 'price-list']),
      label: z.string().optional(),
      entryId: nonBlank.optional(),
      variantId: nonBlank.optional(),
      saleUnit: quantityUnitSchema.optional(),
    })
    .optional(),
});

/** Sidecar persistence boundary (§13): never inside `RoofProjectDocumentV1`. */
export const costScenarioV1Schema = z.object({
  schemaVersion: z.literal(1),
  currencyCode,
  taxRateBps: taxRateBps.optional(),
  lines: z.array(costLineV1Schema),
  metadata: z.object({ updatedAt: z.string() }),
});

export function serializeCostScenario(scenario: CostScenario): string {
  return JSON.stringify(costScenarioV1Schema.parse(scenario));
}

export function parseCostScenario(raw: string): CostScenario {
  return costScenarioV1Schema.parse(JSON.parse(raw)) as CostScenario;
}
