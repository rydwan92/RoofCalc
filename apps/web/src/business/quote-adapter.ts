import type {
  CostLine,
  CostScenario,
  QuantityUnit,
} from '@cieslacalc/cost-core';
import {
  createQuoteDraft,
  quoteSourceFingerprint,
  type CreateQuoteDraftInput,
  type QuoteDraft,
  type QuoteLine,
  type QuoteLineGroup,
} from '@cieslacalc/quote-core';
import type { OrganizationPricesResponse } from '@cieslacalc/business-core';
import type {
  MaterialPlanRow,
  MaterialPriceSelection,
} from '../assembly/material-plan';

function groupOf(row: MaterialPlanRow | undefined): QuoteLineGroup {
  if (!row) return 'other';
  if (row.category === 'covering') return 'covering';
  if (row.category === 'layers') return 'layers';
  if (row.category === 'drainage') return 'drainage';
  if (row.category === 'timber') return 'construction';
  if (row.category === 'eave' || row.category === 'openings')
    return 'roof-system';
  return 'other';
}

function matchingLine(
  scenario: CostScenario,
  row: MaterialPlanRow,
): CostLine | undefined {
  return scenario.lines.find(
    (line) => line.id === row.id || line.id === row.costSuggestionKey,
  );
}

function priceState(
  prices: OrganizationPricesResponse['items'],
  variantId: string | undefined,
) {
  return variantId
    ? prices.find((item) => item.commercialVariantId === variantId)
    : undefined;
}

function quoteLineFromMaterial(input: {
  row: MaterialPlanRow;
  scenario: CostScenario;
  price?: MaterialPriceSelection;
  organizationPrices: OrganizationPricesResponse['items'];
  description: string;
}): QuoteLine | undefined {
  const { row, scenario } = input;
  if (row.quantity === undefined || row.range || row.partial) return undefined;
  const costLine = matchingLine(scenario, row);
  const organization = priceState(
    input.organizationPrices,
    row.product?.variantId,
  );
  const selectedMinor = costLine?.unitPriceMinor ?? input.price?.amountMinor;
  const selectedManual =
    costLine?.priceProvenance?.source === 'manual' ||
    input.price?.source === 'manual';
  const unit = row.unit as QuantityUnit;
  const technicalValue = costLine?.projectQuantityValue ?? row.quantity;
  const offerValue = costLine?.quantity.value ?? row.quantity;
  return {
    id: costLine?.id ?? row.id,
    group: groupOf(row),
    description: input.description,
    ...(organization?.externalKey
      ? { organizationSku: organization.externalKey }
      : {}),
    ...(row.product?.variantId
      ? { commercialVariantId: row.product.variantId }
      : {}),
    technicalQuantity: { value: technicalValue, unit },
    offerQuantity: { value: offerValue, unit },
    quantityOverridden: offerValue !== technicalValue,
    ...(selectedMinor !== undefined
      ? { unitNetAmountMinor: selectedMinor }
      : {}),
    ...(organization?.price
      ? { organizationUnitNetAmountMinor: organization.price.netAmountMinor }
      : {}),
    priceSource:
      selectedMinor === undefined
        ? 'missing'
        : selectedManual
          ? 'manual-estimation'
          : 'organization-price-list',
    ...(scenario.taxRateBps !== undefined
      ? { vatRateBps: scenario.taxRateBps }
      : {}),
    included: costLine?.included ?? true,
  };
}

export function commercialProjectionFingerprint(input: {
  rows: readonly MaterialPlanRow[];
  scenario: CostScenario;
  prices: Record<string, MaterialPriceSelection>;
  organizationPrices: OrganizationPricesResponse['items'];
}): string {
  return quoteSourceFingerprint({
    rows: input.rows.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      range: row.range,
      unit: row.unit,
      basis: row.basis,
      partial: row.partial,
      variantId: row.product?.variantId,
    })),
    scenario: input.scenario.lines.map((line) => ({
      id: line.id,
      quantity: line.quantity,
      projectQuantityValue: line.projectQuantityValue,
      included: line.included,
      unitPriceMinor: line.unitPriceMinor,
      priceProvenance: line.priceProvenance,
    })),
    taxRateBps: input.scenario.taxRateBps,
    prices: input.prices,
    organizationPrices: input.organizationPrices,
  });
}

export function createQuoteFromMaterialPlan(input: {
  draft: Omit<CreateQuoteDraftInput, 'lines' | 'sourceFingerprint'>;
  rows: readonly MaterialPlanRow[];
  scenario: CostScenario;
  prices: Record<string, MaterialPriceSelection>;
  organizationPrices: OrganizationPricesResponse['items'];
  label: (row: MaterialPlanRow) => string;
}): QuoteDraft {
  const sourceFingerprint = commercialProjectionFingerprint(input);
  const materialLines = input.rows.flatMap((row) => {
    const line = quoteLineFromMaterial({
      row,
      scenario: input.scenario,
      price: input.prices[row.id],
      organizationPrices: input.organizationPrices,
      description: input.label(row),
    });
    return line ? [line] : [];
  });
  const materialIds = new Set(
    input.rows.flatMap((row) => [row.id, row.costSuggestionKey ?? row.id]),
  );
  const manualLines: QuoteLine[] = input.scenario.lines
    .filter((line) => line.included && !materialIds.has(line.id))
    .map((line) => ({
      id: line.id,
      group: 'other',
      description: line.label,
      technicalQuantity: { ...line.quantity },
      offerQuantity: { ...line.quantity },
      quantityOverridden: false,
      ...(line.unitPriceMinor !== undefined
        ? { unitNetAmountMinor: line.unitPriceMinor }
        : {}),
      priceSource:
        line.unitPriceMinor === undefined
          ? 'missing'
          : line.source === 'price-list'
            ? 'organization-price-list'
            : 'manual-estimation',
      ...(input.scenario.taxRateBps !== undefined
        ? { vatRateBps: input.scenario.taxRateBps }
        : {}),
      included: true,
    }));
  return createQuoteDraft({
    ...input.draft,
    sourceFingerprint,
    lines: [...materialLines, ...manualLines],
  });
}
