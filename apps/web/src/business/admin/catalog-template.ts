import type { CatalogProductDetail } from '@cieslacalc/catalog-core';

/**
 * VNext-4: a catalogue template for the wholesaler's assortment import.
 *
 * One row per RoofCalc commercial variant of the chosen products, with the
 * RoofCalc ID filled in, so the import links each row exactly
 * (`catalog-id`). The wholesaler fills only their own code and price. No
 * price, VAT or code is invented: those columns stay empty, except a code
 * the catalogue itself states (the variant SKU).
 */
export const CATALOG_TEMPLATE_HEADERS = [
  'Kod',
  'Nazwa',
  'Producent',
  'EAN',
  'Cena netto',
  'VAT',
  'Jednostka',
  'ID RoofCalc',
] as const;

function cell(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export interface CatalogTemplate {
  csv: string;
  rows: number;
  /** Products without a commercial variant cannot be linked; listed apart. */
  withoutVariants: string[];
}

export function catalogTemplateCsv(
  details: readonly CatalogProductDetail[],
): CatalogTemplate {
  const lines: string[] = [CATALOG_TEMPLATE_HEADERS.join(';')];
  const withoutVariants: string[] = [];
  let rows = 0;
  const sorted = [...details].sort(
    (a, b) =>
      a.manufacturer.name.localeCompare(b.manufacturer.name, 'pl') ||
      a.product.name.localeCompare(b.product.name, 'pl'),
  );
  for (const detail of sorted) {
    const variants = detail.variants.filter((variant) => variant.active);
    if (!variants.length) {
      withoutVariants.push(
        `${detail.manufacturer.name} ${detail.product.name}`,
      );
      continue;
    }
    for (const variant of variants) {
      rows += 1;
      lines.push(
        [
          variant.sku ?? '',
          `${detail.product.name} — ${variant.name}`,
          detail.manufacturer.name,
          '',
          '',
          '',
          '',
          variant.id,
        ]
          .map(cell)
          .join(';'),
      );
    }
  }
  // A BOM lets spreadsheet programs open the UTF-8 file with Polish letters.
  return { csv: `\uFEFF${lines.join('\r\n')}\r\n`, rows, withoutVariants };
}
