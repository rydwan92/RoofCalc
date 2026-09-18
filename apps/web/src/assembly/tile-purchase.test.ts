import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { projectRecordV1Schema } from '@cieslacalc/project-core';
import {
  resolveBattenLayout,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  resolveRoofTileLayout,
  type CoveringAssignmentSpec,
  type RoofTilePurchaseDecision,
} from '@cieslacalc/covering-core';
import type {
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import {
  addCostLine,
  createCostLine,
  createEmptyCostScenario,
} from '@cieslacalc/cost-core';
import {
  createCostSuggestions,
  currentSuggestionQuantityValue,
  supersededByTilePlan,
} from './cost-adapter';
import { createExportCandidates, type ExportFacts } from './export-adapter';
import { createMaterialPlanRows } from './material-plan';
import { materialTestFacts } from './material-test-facts';
import {
  createTilePurchasePlans,
  roofLineLengths,
  tilePurchaseQuantity,
} from './tile-purchase';
import type { VariantPrice } from '../pricing/client';

function record(name: string) {
  return projectRecordV1Schema.parse(
    JSON.parse(
      readFileSync(
        new URL(`../../../../fixtures/projects/${name}`, import.meta.url),
        'utf8',
      ),
    ),
  );
}

const gableTile = record('05-gable-roof-tile.cieslacalc.json');
const tileAssignment = gableTile.document.project.coverings[0]!;
const battenLayout = gableTile.document.project.buildUp.battenLayout!;
const window1 = record('03-gable-three-roof-windows.cieslacalc.json').document
  .project.features[0] as RoofWindowFeature;

const decision = (
  overrides: Partial<RoofTilePurchaseDecision> = {},
): RoofTilePurchaseDecision => ({
  kind: 'roof-tile',
  cutPolicy: 'no-offcut-reuse',
  reserveBps: 0,
  packaging: { saleUnit: 'piece', piecesPerUnit: 1, source: 'manual' },
  ...overrides,
});

/** The Page pipeline for one roof: surface → battens → tile layout → plan. */
function project(args: {
  roof?: RoofTemplateSpec;
  windows?: RoofWindowFeature[];
  assignment?: Partial<CoveringAssignmentSpec>;
  purchase?: RoofTilePurchaseDecision | null;
}): ExportFacts {
  const roof = args.roof ?? gableTile.document.project.roof;
  const windows = args.windows ?? [];
  const surface = resolveRoofSurfaceGeometry({
    template: roof,
    features: windows,
  });
  const battens = resolveBattenLayout({
    template: roof,
    layout: battenLayout,
    features: windows,
  });
  const planeIds = surface.planes.map((plane) => plane.roofPlaneId);
  const assignment: CoveringAssignmentSpec = {
    ...tileAssignment,
    roofPlaneIds: planeIds,
    ...args.assignment,
    ...(args.purchase === null
      ? {}
      : { purchase: args.purchase ?? decision() }),
  };
  if (args.purchase === null) delete assignment.purchase;
  const spec = assignment.product.technicalSpecSnapshot;
  if (spec.kind !== 'roof-tile') throw new Error('fixture is not a tile');
  const layout = resolveRoofTileLayout({
    assignmentId: assignment.id,
    roofPlaneIds: planeIds,
    roofSurfaceGeometry: surface.planes.map((plane) => ({
      roofPlaneId: plane.roofPlaneId,
      pitchDeg: roof.pitchDeg,
      localPolygon: plane.polygon,
      netAreaMm2: plane.netAreaMm2,
    })),
    openings: windows.map((feature) => ({
      id: feature.id,
      roofPlaneId: feature.roofPlaneId,
      fromUMm: feature.position.uMm,
      toUMm: feature.position.uMm + feature.widthMm,
      fromVMm: feature.position.vMm,
      toVMm: feature.position.vMm + feature.heightMm,
    })),
    battens: battens.battens.map((batten) => ({
      id: batten.id,
      roofPlaneId: batten.roofPlaneId,
      stationVMm: batten.stationMm,
      segments: batten.segments,
    })),
    productSpec: spec,
    selectedInstallationModeId: assignment.selectedInstallationModeId,
    layoutIntent:
      assignment.layoutIntent?.kind === 'roof-tile'
        ? assignment.layoutIntent
        : { kind: 'roof-tile', horizontalAlignment: 'centered' },
  });
  const base = materialTestFacts();
  const coverings = [assignment];
  return {
    ...base,
    template: roof,
    surface,
    windows,
    coverings,
    coveringLayouts: [layout],
    coveringStatuses: [
      { assignmentId: assignment.id, status: layout.status, warnings: [] },
    ],
    tilePurchasePlans: createTilePurchasePlans({
      coverings,
      layouts: [layout],
      surface,
    }),
  };
}

const plan = (facts: ExportFacts) => facts.tilePurchasePlans![0]!;

describe('V50 — tile purchase plan on real roofs', () => {
  it('gable + tile: physical requirement is full + cut, never exact with cuts', () => {
    const facts = project({});
    const { requirement } = plan(facts);
    const layout = facts.coveringLayouts![0]!;
    expect(layout.status).toBe('resolved');
    expect(requirement.totalPositionCount).toBe(
      layout.kind === 'roof-tile' ? layout.totalPositions : -1,
    );
    expect(requirement.physicalBaseTileCount).toBe(
      requirement.fullPositionCount + requirement.cutPositionCount,
    );
    expect(requirement.status).toBe(
      requirement.cutPositionCount ? 'conservative' : 'exact',
    );
  });

  it('gable: ridge line = building length, no hips, owned by the one covering', () => {
    const facts = project({});
    expect(
      roofLineLengths(facts.surface, ['roof-plane:left', 'roof-plane:right']),
    ).toEqual({
      ridgeMm: facts.template.buildingLengthMm,
      hipMm: 0,
      complete: true,
    });
    // A covering on one plane does not own the shared ridge.
    expect(roofLineLengths(facts.surface, ['roof-plane:left']).complete).toBe(
      false,
    );
  });

  it('hip + tile: hip planes are cut along the hips and hip lines are reported', () => {
    const hipRoof = record('02-basic-hip.cieslacalc.json').document.project
      .roof;
    const facts = project({ roof: hipRoof });
    const tilePlan = plan(facts);
    expect(tilePlan.requirement.status).toBe('conservative');
    expect(tilePlan.requirement.edgeCutPositionCount).toBeGreaterThan(0);
    expect(tilePlan.lines.hipMm).toBeGreaterThan(0);
    // A hip roof has no gable verge: no verge accessory is required.
    expect(
      tilePlan.accessories.some((item) => item.role.startsWith('verge')),
    ).toBe(false);
    expect(
      tilePlan.accessories.find((item) => item.role === 'hip-ridge'),
    ).toMatchObject({ status: 'requires-decision' });
  });

  it('roof window: adding and removing an opening changes the plan and back', () => {
    const without = plan(project({})).requirement;
    const withWindow = plan(project({ windows: [window1] })).requirement;
    expect(
      withWindow.openingCutPositionCount + withWindow.splitPositionCount,
    ).toBeGreaterThan(0);
    expect(withWindow.status).toBe('conservative');
    expect(withWindow.physicalBaseTileCount).not.toBe(
      without.physicalBaseTileCount,
    );
    expect(plan(project({})).requirement).toEqual(without);
  });

  it('geometry change: a longer building needs more tiles', () => {
    const roof = gableTile.document.project.roof;
    const longer = plan(
      project({
        roof: { ...roof, buildingLengthMm: roof.buildingLengthMm + 3000 },
      }),
    ).requirement;
    expect(longer.physicalBaseTileCount).toBeGreaterThan(
      plan(project({})).requirement.physicalBaseTileCount,
    );
  });

  it('product change: a narrower cover width needs more tiles; the decision survives', () => {
    const spec = tileAssignment.product.technicalSpecSnapshot;
    if (spec.kind !== 'roof-tile') throw new Error('tile');
    const narrower = project({
      assignment: {
        product: {
          ...tileAssignment.product,
          technicalSpecSnapshot: {
            ...spec,
            installationModes: spec.installationModes.map((mode) => ({
              ...mode,
              coverWidthMm: mode.coverWidthMm - 40,
            })),
          },
        },
      },
      purchase: decision({ reserveBps: 200 }),
    });
    expect(plan(narrower).requirement.physicalBaseTileCount).toBeGreaterThan(
      plan(project({})).requirement.physicalBaseTileCount,
    );
    expect(plan(narrower).requirement.reserveBps).toBe(200);
  });

  it('a catalogue pack that the new product no longer declares is never applied', () => {
    const facts = project({
      assignment: {
        product: {
          ...tileAssignment.product,
          commercialSnapshot: { packaging: { piecesPerPack: 4 } },
        },
      },
      purchase: decision({
        packaging: { saleUnit: 'pack', piecesPerUnit: 6, source: 'catalog' },
      }),
    });
    expect(plan(facts).packagingStale).toBe(true);
    expect(plan(facts).requirement.purchase).toBeUndefined();
  });
});

describe('V50 — cost uses the purchase quantity, sale-unit safe', () => {
  const variantId = 'variant:tile:red';
  const catalogue = {
    ...tileAssignment.product,
    catalogRef: {
      productId: 'product:tile',
      technicalRevisionId: 'rev:tile',
      variantId,
    },
    commercialSnapshot: { packaging: { piecesPerPack: 4 } },
  };
  const price = (saleUnit: 'piece' | 'pack', amount: number): VariantPrice =>
    ({
      variantId,
      currencyCode: 'PLN',
      ownerLabel: 'Test',
      entry: {
        id: `price:${saleUnit}`,
        priceListId: 'list',
        commercialVariantId: variantId,
        saleUnit,
        netAmountMinor: amount,
        validFrom: '2026-09-01',
      },
    }) as VariantPrice;

  it('prices pieces and removes the consumption/position suggestions', () => {
    const facts = project({ assignment: { product: catalogue } });
    const suggestions = createCostSuggestions({
      ...facts,
      variantPrices: [price('piece', 900)],
    });
    const tile = suggestions.find((item) => item.kind === 'tile-purchase');
    expect(tile).toMatchObject({
      quantity: {
        value: plan(facts).requirement.requiredPieces,
        unit: 'piece',
      },
      unitPriceMinor: 900,
      quantityBasis: 'procurement-stock',
    });
    expect(
      suggestions.some(
        (item) =>
          item.kind === 'covering-consumption' ||
          item.kind === 'covering-positions',
      ),
    ).toBe(false);
  });

  it('a pack price multiplies packs, only when the plan is bought in packs', () => {
    const packs = project({
      assignment: { product: catalogue },
      purchase: decision({
        packaging: { saleUnit: 'pack', piecesPerUnit: 4, source: 'catalog' },
      }),
    });
    const tilePlan = plan(packs);
    const tile = createCostSuggestions({
      ...packs,
      variantPrices: [price('pack', 3600)],
    }).find((item) => item.kind === 'tile-purchase');
    expect(tile?.quantity).toEqual({
      value: tilePlan.requirement.purchase!.units,
      unit: 'pack',
    });
    expect(tilePurchaseQuantity(tilePlan, 'piece')).toBe(
      tilePlan.requirement.purchase!.purchasedPieces,
    );
  });

  it('never matches a pack price to a piece quantity', () => {
    const pieces = project({ assignment: { product: catalogue } });
    const tile = createCostSuggestions({
      ...pieces,
      variantPrices: [price('pack', 3600)],
    }).find((item) => item.kind === 'tile-purchase');
    expect(tile?.quantity.unit).toBe('piece');
    expect((tile as { unitPriceMinor?: number }).unitPriceMinor).toBe(
      undefined,
    );
    expect(tilePurchaseQuantity(plan(pieces), 'pack')).toBeUndefined();
  });

  it('reserve change drifts the live quantity instead of rewriting a line', () => {
    const base = project({});
    const key = `tile-purchase:${tileAssignment.id}`;
    const before = currentSuggestionQuantityValue(base, key)!;
    const after = currentSuggestionQuantityValue(
      project({ purchase: decision({ reserveBps: 500 }) }),
      key,
    )!;
    expect(after).toBe(before + Math.ceil((before * 500) / 10_000));
  });

  it('an accepted consumption line is flagged as superseded, not deleted', () => {
    const withoutPlan = project({ purchase: null });
    expect(
      createCostSuggestions(withoutPlan).some(
        (item) => item.kind === 'covering-consumption',
      ),
    ).toBe(true);
    const facts = project({});
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'covering-consumption',
        category: 'material',
        label: 'Pokrycie',
        quantity: { value: 100, unit: 'piece' },
        quantityBasis: 'effective-coverage',
        suitability: 'execution-based',
        currencyCode: 'PLN',
        source: 'manual',
        noteKeys: [],
      }),
    );
    expect(scenario.lines).toHaveLength(1);
    expect(supersededByTilePlan(facts, 'covering-consumption')).toBe(true);
    expect(supersededByTilePlan(withoutPlan, 'covering-consumption')).toBe(
      false,
    );
  });
});

describe('V50 — material plan and material list show the same plan', () => {
  it('the tile row quantity is the purchase quantity with the geometry beside it', () => {
    const facts = project({
      purchase: decision({
        reserveBps: 200,
        packaging: { saleUnit: 'pack', piecesPerUnit: 20, source: 'manual' },
      }),
    });
    const requirement = plan(facts).requirement;
    const row = createMaterialPlanRows(facts).find(
      (item) => item.labelKey === 'tileBase',
    )!;
    expect(row.quantity).toBe(requirement.purchase!.purchasedPieces);
    expect(row.range).toBeUndefined();
    // No duplicate row appears from the cost suggestion projection.
    expect(
      createMaterialPlanRows(facts).filter(
        (item) =>
          item.labelKey.startsWith('tile-') ||
          item.id.startsWith('tile-purchase'),
      ),
    ).toHaveLength(1);
    const metric = (key: string) =>
      row.metrics.find((item) => item.labelKey === key)?.value;
    expect(metric('tilePhysical')).toBe(requirement.physicalBaseTileCount);
    expect(metric('tileReserve')).toBe(requirement.reservePieces);
    expect(metric('tileRequired')).toBe(requirement.requiredPieces);
    expect(metric('tilePacks')).toBe(requirement.purchase!.units);
    expect(metric('tileCommercialOverage')).toBe(
      requirement.purchase!.commercialOveragePieces,
    );

    const list = createExportCandidates(facts).find(
      (candidate) => candidate.kind === 'material-list',
    )?.section;
    if (list?.kind !== 'material-list') throw new Error('no material list');
    const exported = list.rows.find((item) => item.labelKey === 'tileBase')!;
    expect(exported.quantity).toBe(row.quantity);
    expect(exported.metrics).toEqual(row.metrics);
  });

  it('without a plan the declared range stays an estimate, never a purchase', () => {
    const row = createMaterialPlanRows(project({ purchase: null })).find(
      (item) => item.labelKey === 'tile',
    )!;
    expect(row.range).toBeDefined();
    expect(row.basis).toBe('effective-coverage');
  });

  it('the execution document carries courses, gauge and accessories, not packaging', () => {
    const facts = project({});
    const covering = createExportCandidates(facts).find(
      (candidate) => candidate.kind === 'covering',
    )?.section;
    if (covering?.kind !== 'covering') throw new Error('no covering');
    const tile = covering.rows[0]!.tile!;
    expect(tile.courseCount).toBeGreaterThan(0);
    expect(tile.gaugeMinMm).toBeGreaterThan(0);
    expect(tile.accessories.map((item) => item.role)).toContain('ridge');
  });
});
