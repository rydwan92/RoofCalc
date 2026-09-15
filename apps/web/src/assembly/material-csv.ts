import type { MaterialPlanRow, MaterialPriceSelection } from './material-plan';
import { materialValue } from './material-plan';
import { materialCopy, materialText } from './material-copy';

function cell(value: string | number) {
  const text = String(value);
  const safe =
    typeof value === 'string' && /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function materialCsv(
  rows: readonly MaterialPlanRow[],
  prices: Readonly<Record<string, MaterialPriceSelection>>,
  locale = 'pl',
) {
  const m = materialCopy(locale);
  const header = locale.startsWith('pl')
    ? [
        'Lp',
        'Kategoria',
        'Materiał',
        'Produkt',
        'Podstawa ilości',
        'Ilość',
        'Jm',
        'Cena netto',
        'Źródło ceny',
        'Wartość netto',
        'Uwagi',
      ]
    : [
        'No',
        'Category',
        'Material',
        'Product',
        'Quantity basis',
        'Quantity',
        'Unit',
        'Net price',
        'Price source',
        'Net value',
        'Notes',
      ];
  const data = rows.map((row, index) => {
    const chosen = prices[row.id];
    const price =
      chosen &&
      chosen.valid !== false &&
      (chosen.source === 'manual' ||
        (chosen.variantId === row.product?.variantId &&
          chosen.saleUnit === row.unit))
        ? chosen
        : undefined;
    const value = materialValue(row, price);
    const basis = row.range
      ? m.manufacturer
      : row.basis === 'procurement-stock'
        ? m.procurement
        : row.basis === 'fabrication-requirement'
          ? m.fabrication
          : m.geometry;
    return [
      index + 1,
      m[row.category],
      `${materialText(locale, row.labelKey)} ${row.description ?? ''}`.trim(),
      row.product?.name ?? '',
      basis,
      row.range ? `${row.range.min}–${row.range.max}` : (row.quantity ?? ''),
      row.unit,
      price ? `${price.amountMinor / 100} ${price.currencyCode}` : '',
      price?.source === 'manual' ? m.manual : (price?.provenance ?? ''),
      value
        ? `${value.min / 100}${value.min === value.max ? '' : `–${value.max / 100}`} ${price!.currencyCode}`
        : '',
      [
        row.partial ? m.partial : '',
        ...row.metrics.map(
          (metric) =>
            `${materialText(locale, metric.labelKey)}: ${metric.value}${metric.maxValue !== undefined ? `–${metric.maxValue}` : ''} ${metric.unit}`,
        ),
        ...row.warnings.map((warning) => materialText(locale, warning)),
      ]
        .filter(Boolean)
        .join(' · '),
    ];
  });
  return (
    '\uFEFF' +
    [header, ...data].map((row) => row.map(cell).join(';')).join('\r\n')
  );
}
export function downloadMaterialCsv(
  rows: readonly MaterialPlanRow[],
  prices: Record<string, MaterialPriceSelection>,
  name: string,
  locale: string,
) {
  const url = URL.createObjectURL(
    new Blob([materialCsv(rows, prices, locale)], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}_-]/gu, '_')}-materialy.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
