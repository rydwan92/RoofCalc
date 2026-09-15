import { describe, expect, it } from 'vitest';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import {
  assemblyDefaults,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  createCostSuggestions,
  currentSuggestionQuantityValue,
} from './cost-adapter';
import {
  createK1CuttingRequirement,
  k1RequirementSignature,
} from './k1-cutting-adapter';
import { createWorkbenchProjectResolver } from './workbench-project';
import type { ExportFacts } from './export-adapter';

const source = {
  projectId: 'p1',
  projectName: 'Test',
  projectCreatedAt: '2026-09-01T00:00:00.000Z',
  projectUpdatedAt: '2026-09-14T00:00:00.000Z',
  projectSchemaVersion: 1,
};

const noBuildUpFacts = {
  battens: {
    status: 'disabled' as const,
    mode: 'manual' as const,
    battens: [],
    totalLengthMm: 0,
    planes: [],
    issues: [],
  },
  battenAutoSource: { status: 'missing' as const },
  counterBattens: {
    status: 'disabled' as const,
    rows: [],
    totalVisibleLengthMm: 0,
    warnings: [],
    issues: [],
    resolvedAxisCount: 0,
    visibleSegmentCount: 0,
    roofPlaneIds: [],
  },
};

function baseFacts(): ExportFacts {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const resolved = createWorkbenchProjectResolver().resolve(gable);
  const schedule = createRoofMemberSchedule({ skeleton: resolved.skeleton });
  const k1 = createK1CuttingRequirement(resolved.resolved, schedule);
  return {
    source,
    template: gable,
    resolved: resolved.resolved,
    skeleton: resolved.skeleton,
    surface: resolveRoofSurfaceGeometry({ template: gable, features: [] }),
    windows: [],
    schedule,
    details: resolved.detailPreviews,
    k1,
    membraneEnabled: false,
    counterBattensEnabled: false,
    battensEnabled: false,
    ...noBuildUpFacts,
    coverings: [],
    coveringStatuses: [],
  } as unknown as ExportFacts;
}

describe('cost suggestion adapter', () => {
  it('never suggests K1 stock before a cutting plan has been run', () => {
    const facts = baseFacts();
    expect(facts.k1.status).toBe('resolved');
    expect(facts.cutting).toBeUndefined();
    expect(
      createCostSuggestions(facts).some((s) => s.kind === 'k1-stock'),
    ).toBe(false);
  });

  it('groups K1 procurement stock as an exact-purchase suggestion', () => {
    const facts = baseFacts();
    if (facts.k1.status !== 'resolved') throw new Error('expected resolved K1');
    const settings = { kerfMm: 3, endTrimMm: 5, minimumReusableRemnantMm: 200 };
    const plan = createCuttingPlan({
      requiredPieces: facts.k1.requiredPieces,
      stockOptions: [
        {
          id: 'stock',
          stockClassId: facts.k1.stockClassId,
          lengthMm: facts.k1.blank.requiredBlankLengthMm + 500,
        },
      ],
      settings,
    });
    const withPlan: ExportFacts = {
      ...facts,
      cutting: {
        signature: k1RequirementSignature(facts.k1),
        value: plan,
        settings,
        scenario: {
          unit: 'mm',
          stocks: [],
          kerf: '3',
          endTrim: '5',
          remnant: '200',
        },
        objective: 'minimum-purchased-length',
      },
    };
    const suggestions = createCostSuggestions(withPlan);
    const k1Stock = suggestions.filter((s) => s.kind === 'k1-stock');
    expect(k1Stock.length).toBeGreaterThan(0);
    for (const suggestion of k1Stock) {
      expect(suggestion.suitability).toBe('exact-purchase');
      expect(suggestion.quantityBasis).toBe('procurement-stock');
      expect(suggestion.quantity.unit).toBe('piece');
    }
    const totalPieces = k1Stock.reduce((sum, s) => sum + s.quantity.value, 0);
    expect(totalPieces).toBe(plan.stockUsages.length);
  });

  it('exposes battens as a geometric-length estimate, never exact purchase', () => {
    const facts = baseFacts();
    const withBattens: ExportFacts = {
      ...facts,
      battensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts.skeleton,
        buildUp: [
          {
            id: 'batten:1',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 5000,
            section: { widthMm: 60, depthMm: 40 },
          },
          {
            id: 'batten:2',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 7000,
            section: { widthMm: 60, depthMm: 40 },
          },
        ],
      }),
    };
    const battens = createCostSuggestions(withBattens).find(
      (s) => s.kind === 'battens',
    );
    expect(battens).toBeDefined();
    if (battens?.kind !== 'battens') return;
    expect(battens.suitability).toBe('geometric-estimate');
    expect(battens.quantityBasis).toBe('geometric-length');
    expect(battens.quantity).toEqual({ value: 12, unit: 'm' });
    expect(battens.noteKeys).toContain('no-allowance-no-stock-length');
  });

  it('flags a partial counter-batten result without hiding it', () => {
    const facts = baseFacts();
    const withCounter: ExportFacts = {
      ...facts,
      counterBattensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts.skeleton,
        buildUp: [
          {
            id: 'counter:1',
            familyKey: 'KL',
            memberKind: 'counter-batten',
            lengthMm: 6000,
            section: { widthMm: 40, depthMm: 60 },
          },
        ],
      }),
      counterBattens: {
        status: 'partial',
        rows: [],
        totalVisibleLengthMm: 6000,
        warnings: ['hip-boundary-detail-unresolved'],
        issues: [],
        resolvedAxisCount: 12,
        visibleSegmentCount: 13,
        roofPlaneIds: ['roof-plane:left'],
      },
    };
    const suggestion = createCostSuggestions(withCounter).find(
      (s) => s.kind === 'counter-battens',
    );
    expect(suggestion).toBeDefined();
    if (suggestion?.kind !== 'counter-battens') return;
    expect(suggestion.suitability).toBe('geometric-estimate');
    expect(suggestion.partial).toBe(true);
    expect(suggestion.noteKeys).toContain('partial-counter-battens');
  });

  it('exposes membrane as a net-area estimate', () => {
    const facts = baseFacts();
    const withMembrane: ExportFacts = {
      ...facts,
      membraneEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts.skeleton,
        surfaceBuildUp: [
          {
            id: 'membrane:1',
            familyKey: 'M',
            memberKind: 'membrane',
            semantic: 'net-geometric',
            areaMm2: 200_000_000,
          },
        ],
      }),
    };
    const suggestion = createCostSuggestions(withMembrane).find(
      (s) => s.kind === 'membrane',
    );
    expect(suggestion).toBeDefined();
    if (suggestion?.kind !== 'membrane') return;
    expect(suggestion.suitability).toBe('geometric-estimate');
    expect(suggestion.quantityBasis).toBe('net-area');
    expect(suggestion.quantity).toEqual({ value: 200, unit: 'm2' });
  });

  it('never turns covering coverage positions into a purchase quantity', () => {
    const facts = baseFacts();
    const withCovering: ExportFacts = {
      ...facts,
      schedule: createRoofMemberSchedule({
        skeleton: facts.skeleton,
        covering: [
          {
            id: 'covering:1',
            coveringAssignmentId: 'assignment-1',
            sourceRoofPlaneIds: ['roof-plane:left'],
            quantity: 2070,
            requirementReadiness: 'geometric-only',
            layoutKind: 'roof-tile',
            semantic: 'effective-coverage-position',
            unit: 'coverage-position',
            fullPositions: 2000,
            cutPositions: 70,
          },
        ],
      }),
    };
    const suggestions = createCostSuggestions(withCovering);
    const covering = suggestions.find((s) => s.kind === 'covering-positions');
    expect(covering).toBeDefined();
    if (covering?.kind !== 'covering-positions') return;
    expect(covering.suitability).toBe('manual-required');
    expect(covering.totalPositions).toBe(2070);
    // Critical truthfulness invariant: no automatically priceable quantity.
    expect('quantity' in covering).toBe(false);
    expect(suggestions.some((s) => s.kind === 'k1-stock')).toBe(false);
  });

  it('reports no live suggestion quantity for an unknown key', () => {
    expect(currentSuggestionQuantityValue(baseFacts(), 'nope')).toBeUndefined();
  });

  it('resolves the current live quantity for a project-derived suggestion key', () => {
    const facts = baseFacts();
    const withBattens: ExportFacts = {
      ...facts,
      battensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: facts.skeleton,
        buildUp: [
          {
            id: 'batten:1',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 10000,
            section: { widthMm: 60, depthMm: 40 },
          },
        ],
      }),
    };
    expect(currentSuggestionQuantityValue(withBattens, 'battens')).toBe(10);
  });
});
