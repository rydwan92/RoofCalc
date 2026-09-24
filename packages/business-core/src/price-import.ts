import { z } from 'zod';
import { normalizeSaleUnit, parseAssortmentCsv, parseMoneyMinor } from './csv';
import { saleUnitSchema } from './persistence';

export const priceImportMappingSchema = z
  .object({
    externalKey: z.string().min(1),
    netAmount: z.string().min(1),
    vatRate: z.string().min(1).optional(),
    saleUnit: z.string().min(1).optional(),
  })
  .strict();
export type PriceImportMapping = z.infer<typeof priceImportMappingSchema>;

export const priceImportRowSchema = z
  .object({
    sourceLine: z.number().int().min(1),
    externalKey: z.string().min(1),
    netAmountMinor: z.number().int().min(0),
    vatRateBps: z.number().int().min(0).max(10_000).optional(),
    saleUnit: saleUnitSchema.optional(),
  })
  .strict();
export type PriceImportRow = z.infer<typeof priceImportRowSchema>;
export type PriceImportProblem = {
  sourceLine: number;
  externalKey: string;
  code: 'invalid-row' | 'duplicate-sku';
};

/** Parse only organization SKU, net amount, optional VAT and sale unit. */
export function mapPriceImportRows(
  csv: string,
  mapping: PriceImportMapping,
): {
  rows: PriceImportRow[];
  problems: PriceImportProblem[];
} {
  const parsed = parseAssortmentCsv(csv);
  if (
    !parsed.headers.includes(mapping.externalKey) ||
    !parsed.headers.includes(mapping.netAmount) ||
    (mapping.vatRate && !parsed.headers.includes(mapping.vatRate)) ||
    (mapping.saleUnit && !parsed.headers.includes(mapping.saleUnit))
  )
    throw new Error('invalid-price-mapping');
  const rows: PriceImportRow[] = [];
  const problems: PriceImportProblem[] = [];
  const seen = new Set<string>();
  for (const record of parsed.rows) {
    const get = (column?: string) =>
      column ? (record.values[column] ?? '').trim() : '';
    const externalKey = get(mapping.externalKey);
    const netAmountMinor = parseMoneyMinor(get(mapping.netAmount));
    const rawVat = get(mapping.vatRate).replace('%', '').replace(',', '.');
    const vatRateBps =
      rawVat === ''
        ? undefined
        : /^\d+(?:\.\d{1,2})?$/.test(rawVat)
          ? Math.round(Number(rawVat) * 100)
          : NaN;
    const rawUnit = get(mapping.saleUnit);
    const saleUnit = rawUnit ? normalizeSaleUnit(rawUnit) : undefined;
    if (
      !externalKey ||
      netAmountMinor === undefined ||
      !Number.isSafeInteger(netAmountMinor) ||
      (vatRateBps !== undefined &&
        (!Number.isInteger(vatRateBps) ||
          vatRateBps < 0 ||
          vatRateBps > 10_000)) ||
      (rawUnit && !saleUnit)
    ) {
      problems.push({
        sourceLine: record.sourceLine,
        externalKey,
        code: 'invalid-row',
      });
      continue;
    }
    if (seen.has(externalKey)) {
      problems.push({
        sourceLine: record.sourceLine,
        externalKey,
        code: 'duplicate-sku',
      });
      continue;
    }
    seen.add(externalKey);
    rows.push({
      sourceLine: record.sourceLine,
      externalKey,
      netAmountMinor,
      ...(vatRateBps !== undefined ? { vatRateBps } : {}),
      ...(saleUnit ? { saleUnit } : {}),
    });
  }
  return { rows, problems };
}
