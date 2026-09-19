import { z } from 'zod';
import type { PriceList, PriceListEntry } from './model';

const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/);
const nonBlank = z.string().trim().min(1).max(240);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minorUnits = z.number().int().min(0);
const saleUnitSchema = z.enum([
  'piece',
  'pack',
  'pallet',
  'roll',
  'm',
  'm2',
  'm3',
  'kg',
  'hour',
  'flat',
]);

export const priceListSchema = z
  .object({
    id: idSchema,
    ownerLabel: nonBlank,
    currencyCode,
    regionCode: z.string().trim().min(1).max(16).optional(),
    taxContext: z.string().trim().min(1).max(160).optional(),
    validFrom: dateString,
    validTo: dateString.optional(),
  })
  .strict()
  .refine(
    (list) => list.validTo === undefined || list.validTo >= list.validFrom,
    { message: 'invalid_date_range', path: ['validTo'] },
  );

export const priceListEntrySchema = z
  .object({
    id: idSchema,
    priceListId: idSchema,
    commercialVariantId: idSchema,
    saleUnit: saleUnitSchema,
    netAmountMinor: minorUnits,
    sourceAmountBasis: z.enum(['net', 'gross']).optional(),
    sourceVatRateBps: z.number().int().min(0).max(100_00).optional(),
    validFrom: dateString,
    validTo: dateString.optional(),
  })
  .strict()
  .refine(
    (entry) => entry.validTo === undefined || entry.validTo >= entry.validFrom,
    { message: 'invalid_date_range', path: ['validTo'] },
  );

/**
 * Canonical import format, mirroring `catalog-core`'s `CatalogImportBatchV1`
 * shape and self-containment rule: an entry's `priceListId` must resolve
 * inside the *same* batch's `priceLists[]`, exactly like a revision must
 * resolve its product within its own batch.
 */
export const priceImportBatchV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    source: z
      .object({
        id: idSchema,
        label: nonBlank,
        sourceRevision: z.string().trim().min(1).max(160).optional(),
      })
      .strict(),
    priceLists: z.array(priceListSchema),
    entries: z.array(priceListEntrySchema),
  })
  .strict()
  .superRefine((batch, ctx) => {
    const listIds = new Set<string>();
    for (const [index, list] of batch.priceLists.entries()) {
      if (listIds.has(list.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate-id:${list.id}`,
          path: ['priceLists', index, 'id'],
        });
      listIds.add(list.id);
    }
    const entryIds = new Set<string>();
    for (const [index, entry] of batch.entries.entries()) {
      if (entryIds.has(entry.id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate-id:${entry.id}`,
          path: ['entries', index, 'id'],
        });
      entryIds.add(entry.id);
      if (!listIds.has(entry.priceListId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `missing-price-list:${entry.priceListId}`,
          path: ['entries', index, 'priceListId'],
        });
    }
  });

export type PriceImportBatchV1 = z.infer<typeof priceImportBatchV1Schema>;

/** Deterministic key-sorted JSON, for stable equality/checksum comparisons. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  return value;
}

/**
 * Write-once comparison for one entry ID, mirroring `catalog-core`'s
 * `compareTechnicalRevision`: identical data under an existing ID is
 * `unchanged`; any difference is a `conflict`, never a silent overwrite —
 * a real price change must arrive as a new entry ID with a later
 * `validFrom`, so history stays auditable.
 */
export function comparePriceListEntry(
  existing: PriceListEntry | undefined,
  incoming: PriceListEntry,
): 'new' | 'unchanged' | 'conflict' {
  if (!existing) return 'new';
  return canonicalJson(existing) === canonicalJson(incoming)
    ? 'unchanged'
    : 'conflict';
}

export type { PriceList, PriceListEntry };
