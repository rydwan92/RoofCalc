import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import type {
  RoofSystemIntent,
  RoofWindowComponentTechnicalSpec,
} from '@cieslacalc/roof-system-core';
import type {
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import type { VariantPrice } from '../pricing/client';
import { createCostSuggestions } from './cost-adapter';
import { createExportCandidates, type ExportFacts } from './export-adapter';
import {
  compatibleMaterialPrices,
  createMaterialPlanRows,
} from './material-plan';
import { materialTestFacts } from './material-test-facts';
import {
  featureScopeLabel,
  resolveRoofSystemFacts,
  withLineComponent,
  withOpening,
} from './roof-system';
import { resolveRoofSystemChecklist } from './roof-system-checklist';

const gable = gableTemplateFromAssembly(assemblyDefaults);
// A longer building, so the hip roof has a ridge (the default is square).
const hip = convertRoofTemplate(
  { ...gable, buildingLengthMm: gable.halfRunMm * 2 + 4000 },
  'hip',
);
const window: RoofWindowFeature = {
  id: 'feature:roof-window-1',
  kind: 'roof-window',
  roofPlaneId: 'roof-plane:left',
  widthMm: 780,
  heightMm: 1180,
  position: { uMm: 2000, vMm: 1200 },
};

function build(
  template: RoofTemplateSpec,
  intent?: RoofSystemIntent,
  features: RoofWindowFeature[] = [],
) {
  const surface = resolveRoofSurfaceGeometry({ template, features });
  const roofSystem = resolveRoofSystemFacts({ surface, intent });
  const facts = {
    ...materialTestFacts(),
    template,
    surface,
    roofSystem,
  } satisfies ExportFacts;
  return { surface, roofSystem, facts };
}

const count = (facts: ReturnType<typeof build>['roofSystem'], kind: string) =>
  facts.topology.features.filter((item) => item.kind === kind).length;

describe('V52 — roof features stay stable', () => {
  it('gable and hip feature counts are unchanged by the system work', () => {
    const g = build(gable).roofSystem;
    expect([count(g, 'ridge'), count(g, 'eave'), count(g, 'verge')]).toEqual([
      1, 2, 4,
    ]);
    const h = build(hip).roofSystem;
    expect([
      count(h, 'ridge'),
      count(h, 'hip'),
      count(h, 'eave'),
      count(h, 'verge'),
    ]).toEqual([1, 4, 4, 0]);
    // A shared ridge/hip is one feature with both planes, never two.
    for (const feature of h.topology.features.filter(
      (item) => item.kind === 'ridge' || item.kind === 'hip',
    ))
      expect(feature.incidentPlaneIds).toHaveLength(2);
  });

  it('ridge ends come from topology: gable 2 open, hip 4 open hip feet', () => {
    expect(build(gable).roofSystem.lineEnds.filter((e) => e.open)).toHaveLength(
      2,
    );
    expect(build(hip).roofSystem.lineEnds.filter((e) => e.open)).toHaveLength(
      4,
    );
  });
});

describe('V52 — ridge tape in rolls through the whole pipeline', () => {
  const intent = withLineComponent(undefined, {
    id: 'line-component-1',
    role: 'ridge-tape',
    name: 'Taśma 5 m',
    source: 'manual',
    rule: { kind: 'roll-length', rollLengthMm: 5000 },
  });
  const { roofSystem, facts } = build(hip, intent);
  const tape = roofSystem.lineComponents[0]!;

  it('requirement = ridge + hips; purchase = whole rolls; surplus is not waste', () => {
    const ridgeHip = roofSystem.topology.features
      .filter((item) => item.kind === 'ridge' || item.kind === 'hip')
      .reduce((sum, item) => sum + item.lengthMm, 0);
    expect(tape.requirementMm).toBeCloseTo(ridgeHip, 6);
    expect(tape.quantity).toBe(Math.ceil(ridgeHip / 5000));
    expect(tape.unit).toBe('roll');
    expect(tape.commercialSurplusMm).toBeCloseTo(
      tape.quantity! * 5000 - ridgeHip,
      6,
    );
  });

  it('the material row and the cost suggestion are counted in rolls', () => {
    const row = createMaterialPlanRows(facts).find(
      (item) => item.id === 'line-component:line-component-1',
    )!;
    expect(row.unit).toBe('roll');
    expect(row.quantity).toBe(tape.quantity);
    expect(row.subgroup).toBe('ridge');
    expect(row.appliesTo).toEqual(tape.featureIds);
    const suggestion = createCostSuggestions(facts).find(
      (item) => item.key === 'line-component:line-component-1',
    )!;
    expect('quantity' in suggestion && suggestion.quantity).toEqual({
      value: tape.quantity,
      unit: 'roll',
    });
  });

  it('a per-piece price never joins a roll row (no cross-unit multiplication)', () => {
    const row = {
      ...createMaterialPlanRows(facts).find(
        (item) => item.id === 'line-component:line-component-1',
      )!,
      product: { name: 'Taśma', variantId: 'variant:tape', facts: [] },
    };
    const price = (saleUnit: 'piece' | 'roll'): VariantPrice =>
      ({
        variantId: 'variant:tape',
        currencyCode: 'PLN',
        entry: {
          commercialVariantId: 'variant:tape',
          saleUnit,
          sourceAmountBasis: 'net',
        },
      }) as unknown as VariantPrice;
    expect(
      compatibleMaterialPrices(row, [price('piece'), price('roll')], 'PLN').map(
        (item) => item.entry.saleUnit,
      ),
    ).toEqual(['roll']);
  });

  it('"applies to" names the physical lines', () => {
    expect(featureScopeLabel(roofSystem.topology, tape.featureIds, 'pl')).toBe(
      'Kalenica, Grzbiety 1–4',
    );
  });
});

describe('V52 — eave components only on selected eaves', () => {
  it('an unselected eave gets no component; pieces per commercial length', () => {
    const plain = build(gable).roofSystem;
    const first = plain.eaves[0]!;
    const intent = withLineComponent(undefined, {
      id: 'line-component-1',
      role: 'drip-edge',
      name: 'Okapnik 2 m',
      source: 'manual',
      featureIds: [first.id],
      rule: { kind: 'linear-effective-cover', effectiveCoverLengthMm: 1900 },
    });
    const { roofSystem } = build(gable, intent);
    const drip = roofSystem.lineComponents[0]!;
    expect(drip.featureIds).toEqual([first.id]);
    expect(drip.quantity).toBe(Math.ceil(first.lengthMm / 1900 - 1e-9));
    expect(drip.unit).toBe('piece');
  });
});

const velux = (
  role: 'roof-window' | 'window-flashing-kit',
  extra: Partial<RoofWindowComponentTechnicalSpec> = {},
): RoofWindowComponentTechnicalSpec => ({
  schemaVersion: 1,
  kind: 'roof-window-component',
  role,
  windowSystemKey: 'velux-pitched',
  sizeCode: 'MK06',
  ...(role === 'roof-window'
    ? { nominalWidthMm: 780, nominalHeightMm: 1180 }
    : {
        covering: { class: 'profiled', maxProfileHeightMm: 120 },
        pitchRangeDeg: { min: 15, max: 90 },
        includes: ['window-flashing'],
      }),
  ...extra,
});

describe('V52 — roof window flashing', () => {
  it('a generic opening needs a product; nothing is costed', () => {
    const { roofSystem, facts } = build(gable, undefined, [window]);
    expect(roofSystem.openings).toHaveLength(1);
    expect(roofSystem.openingSystems[0]!.flashing.status).toBe(
      'requires-product',
    );
    const row = createMaterialPlanRows(facts).find(
      (item) => item.category === 'openings',
    )!;
    expect(row.partial).toBe(true);
    expect(row.quantity).toBeUndefined();
    expect(
      createCostSuggestions(facts).some((item) =>
        item.key.startsWith('opening:'),
      ),
    ).toBe(false);
    const checklist = resolveRoofSystemChecklist(facts);
    expect(checklist.areas.find((area) => area.key === 'openings')?.state).toBe(
      'needs-decision',
    );
  });

  it('a compatible catalogue kit resolves to one piece in materials and cost', () => {
    const intent = withOpening(undefined, {
      featureId: window.id,
      window: { name: 'VELUX MK06', spec: velux('roof-window') },
      coveringClass: 'profiled',
      flashing: {
        source: 'catalog',
        product: {
          name: 'VELUX kołnierz EDW 0000 MK06',
          spec: velux('window-flashing-kit'),
        },
      },
    });
    const { roofSystem, facts } = build(gable, intent, [window]);
    expect(roofSystem.openingSystems[0]!.flashing).toMatchObject({
      status: 'resolved',
      quantity: 1,
    });
    const suggestion = createCostSuggestions(facts).find(
      (item) => item.key === `opening:${window.id}`,
    )!;
    expect('quantity' in suggestion && suggestion.quantity).toEqual({
      value: 1,
      unit: 'piece',
    });
    const details = createExportCandidates(facts).find(
      (item) => item.kind === 'roof-details',
    )!;
    expect(details.readiness).toBe('available');
  });

  it('an incompatible kit is visible, not counted', () => {
    const intent = withOpening(undefined, {
      featureId: window.id,
      window: { name: 'VELUX MK06', spec: velux('roof-window') },
      coveringClass: 'flat',
      flashing: {
        source: 'catalog',
        product: {
          name: 'VELUX kołnierz EDW 0000 MK06',
          spec: velux('window-flashing-kit'),
        },
      },
    });
    const { roofSystem, facts } = build(gable, intent, [window]);
    expect(roofSystem.openingSystems[0]!.flashing.status).toBe('incompatible');
    expect(roofSystem.openingSystems[0]!.flashing.reasons).toEqual([
      'covering-class-mismatch',
    ]);
    expect(
      createCostSuggestions(facts).some((item) =>
        item.key.startsWith('opening:'),
      ),
    ).toBe(false);
  });
});

describe('V52 — system checklist', () => {
  it('counts areas, never a percentage; roof without windows: openings N/A', () => {
    const { facts } = build(hip);
    const checklist = resolveRoofSystemChecklist(facts);
    expect(checklist.areas.find((area) => area.key === 'openings')?.state).toBe(
      'not-applicable',
    );
    expect(checklist.areas.find((area) => area.key === 'verge')?.state).toBe(
      'not-applicable',
    );
    expect(checklist.counts).toEqual(
      expect.objectContaining({
        ready: expect.any(Number),
        attention: expect.any(Number),
        optional: expect.any(Number),
      }),
    );
  });
});
