import { describe, expect, it } from 'vitest';
import {
  aggregateStockRequirements,
  createCuttingPlan,
} from '@cieslacalc/procurement-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofTemplate,
  createRoofSkeletonFromResolved,
} from '@cieslacalc/roof-math';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import type { TimberStockTechnicalSpec } from '@cieslacalc/catalog-core';
import type { PriceListEntry } from '@cieslacalc/pricing-core';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import { timberCatalogItemToStockOption } from './timber-stock-adapter';

/**
 * V35 Phase 9 — no new UI, only a walk proving the data a future Cost/BOM/
 * Export pass would need is already present end-to-end: required pieces
 * (geometry) → a real cutting plan → `aggregateStockRequirements()` → a
 * price join, producing one plain row per purchased stock item with every
 * field a BOM line needs. This is a read-only join in the test itself —
 * no product code computes it, since none exists yet by design.
 */
describe('V35 Phase 9: Cost/BOM/Export readiness (verification only)', () => {
  it('joins a real K1 cutting plan, catalogue stock option and price into one complete BOM-ready row', () => {
    const gable = gableTemplateFromAssembly(assemblyDefaults);
    const resolved = resolveRoofTemplate(gable);
    const schedule = createRoofMemberSchedule({
      skeleton: createRoofSkeletonFromResolved(resolved),
    });
    const requirement = createK1CuttingRequirement(resolved, schedule);
    expect(requirement.status).toBe('resolved');
    if (requirement.status !== 'resolved') return;

    const spec: TimberStockTechnicalSpec = {
      schemaVersion: 1,
      kind: 'timber-stock',
      widthMm: requirement.blank.section.widthMm,
      depthMm: requirement.blank.section.depthMm,
      lengthMm:
        Math.ceil(requirement.blank.requiredBlankLengthMm / 1000) * 1000 + 1000,
      strengthClass: 'C24',
      treated: true,
      salesUnit: 'piece',
    };
    const catalogPick = {
      id: 'variant:timber:c24-45x145x4000-treated:standard',
      spec,
    };
    const stockOption = timberCatalogItemToStockOption(catalogPick);
    expect(stockOption.stockClassId).toBe(requirement.stockClassId);

    const plan = createCuttingPlan({
      requiredPieces: requirement.requiredPieces,
      stockOptions: [stockOption],
      settings: { kerfMm: 3, endTrimMm: 5, minimumReusableRemnantMm: 200 },
    });
    expect(plan.status).toBe('complete');
    expect(plan.unassignedPieces).toHaveLength(0);

    const priceEntry: PriceListEntry = {
      id: 'price:obi:2026-09:c24-45x145x4000-treated',
      priceListId: 'price-list:obi-retail-2026-09',
      commercialVariantId: catalogPick.id,
      saleUnit: 'piece',
      netAmountMinor: 11_301,
      sourceAmountBasis: 'gross',
      sourceVatRateBps: 2300,
      validFrom: '2026-09-15',
    };
    const currencyCode = 'PLN';

    const requirements = aggregateStockRequirements(plan);
    const bomRows = requirements.map((row) => ({
      stockOptionId: stockOption.id,
      sectionWidthMm: spec.widthMm,
      sectionDepthMm: spec.depthMm,
      purchasedLengthMm: row.lengthMm,
      quantity: row.quantity,
      unitPriceMinor: priceEntry.netAmountMinor,
      currencyCode,
      lineTotalMinor: priceEntry.netAmountMinor * row.quantity,
      priceSourceBasis: priceEntry.sourceAmountBasis,
    }));

    expect(bomRows).toHaveLength(1);
    const [row] = bomRows;
    expect(row).toMatchObject({
      stockOptionId: catalogPick.id,
      sectionWidthMm: requirement.blank.section.widthMm,
      sectionDepthMm: requirement.blank.section.depthMm,
      purchasedLengthMm: spec.lengthMm,
      currencyCode: 'PLN',
      priceSourceBasis: 'gross',
    });
    expect(row!.quantity).toBeGreaterThan(0);
    expect(row!.lineTotalMinor).toBe(priceEntry.netAmountMinor * row!.quantity);

    const totalPurchasedLengthMm = bomRows.reduce(
      (sum, item) => sum + item.purchasedLengthMm * item.quantity,
      0,
    );
    expect(totalPurchasedLengthMm).toBe(plan.summary.purchasedStockLengthMm);
  });
});
