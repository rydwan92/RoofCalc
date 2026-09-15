import {
  calculateLine,
  sortedScenarioLines,
  type CostLineCategory,
  type CostQuantityBasis,
  type CostScenario,
} from '@cieslacalc/cost-core';

const CATEGORY_LABEL: Record<CostLineCategory, string> = {
  material: 'Materiał',
  labour: 'Robocizna',
  transport: 'Transport',
  equipment: 'Sprzęt',
  other: 'Inne',
};

const BASIS_LABEL: Record<CostQuantityBasis, string> = {
  'procurement-stock': 'Plan zakupu',
  'fabrication-requirement': 'Wymóg przygotowania',
  'geometric-length': 'Geometria',
  'net-area': 'Powierzchnia netto',
  'gross-area': 'Powierzchnia brutto (z zakładami)',
  'effective-coverage': 'Pozycje krycia',
  manual: 'Ręcznie',
};

function csvCell(value: string): string {
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function money(minor: number | undefined, locale: string): string {
  if (minor === undefined) return '';
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2 }).format(
    minor / 100,
  );
}

/**
 * Semicolon-delimited CSV with a UTF-8 BOM for Polish Excel compatibility
 * (§34). Mirrors exactly what the printed estimate shows — only included
 * lines, never a heavier spreadsheet dependency.
 */
export function costScenarioToCsv(
  scenario: CostScenario,
  locale = 'pl',
): string {
  const header = [
    'Lp',
    'Kategoria',
    'Pozycja',
    'Podstawa',
    'Ilość',
    'Jm',
    'Cena netto',
    'Wartość netto',
    'VAT',
    'Wartość brutto',
    'Uwagi',
  ];
  const rows = sortedScenarioLines(scenario)
    .filter((line) => line.included)
    .map((line, index) => {
      const computed = calculateLine(line, scenario.taxRateBps);
      return [
        String(index + 1),
        CATEGORY_LABEL[line.category],
        line.label,
        BASIS_LABEL[line.quantityBasis],
        new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(
          line.quantity.value,
        ),
        line.quantity.unit,
        money(line.unitPriceMinor, locale),
        money(computed.netMinor, locale),
        computed.taxRateBps !== undefined
          ? `${(computed.taxRateBps / 100).toFixed(0)}%`
          : '',
        money(computed.grossMinor, locale),
        line.noteKeys.join(' | '),
      ];
    });
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(';'));
  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}`;
}

export function costEstimateCsvFilename(projectName: string): string {
  const safeName = projectName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `${safeName || 'projekt'}_kosztorys.csv`;
}

export function downloadCostEstimateCsv(
  scenario: CostScenario,
  projectName: string,
  locale = 'pl',
): void {
  const blob = new Blob([costScenarioToCsv(scenario, locale)], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = costEstimateCsvFilename(projectName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
