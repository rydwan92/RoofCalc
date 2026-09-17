import { describe, expect, it } from 'vitest';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import {
  addCostLine,
  createCostLine,
  createEmptyCostScenario,
  setScenarioTaxRateBps,
} from '@cieslacalc/cost-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
  resolveBattenLayout,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { resolveBattenAutoComposition } from './batten-composition';
import { evaluateBattenInstallation } from './batten-installation';
import { createExportCandidates } from './export-adapter';
import {
  createK1CuttingRequirement,
  k1RequirementSignature,
} from './k1-cutting-adapter';
import { createWorkbenchProjectResolver } from './workbench-project';

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
    scope: {
      kind: 'whole-roof' as const,
      roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
      knownRoofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
    },
  },
  battenAutoSource: { status: 'missing' as const },
  counterBattens: {
    status: 'disabled' as const,
    rows: [],
    totalVisibleLengthMm: 0,
    warnings: [],
    issues: [],
    resolvedAxisCount: 0,
    interiorAxisCount: 0,
    hipBoundaryRunCount: 0,
    hipBoundaries: [],
    unresolvedHipBoundaryCount: 0,
    visibleSegmentCount: 0,
    roofPlaneIds: [],
  },
};

function facts(hip = false) {
  const gable = gableTemplateFromAssembly(assemblyDefaults);
  const template = hip ? convertRoofTemplate(gable, 'hip') : gable;
  const resolved = createWorkbenchProjectResolver().resolve(template);
  const schedule = createRoofMemberSchedule({ skeleton: resolved.skeleton });
  const k1 = createK1CuttingRequirement(resolved.resolved, schedule);
  return {
    source,
    template,
    resolved: resolved.resolved,
    skeleton: resolved.skeleton,
    surface: resolveRoofSurfaceGeometry({ template, features: [] }),
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
  };
}

describe('execution export adapter', () => {
  it('exports the same per-plane explanation, authority and manual references as the workbench', () => {
    const input = facts();
    const layout = {
      enabled: true,
      mode: 'auto-from-covering' as const,
      gaugeMm: 390,
      battenHeightMm: 40,
      battenWidthMm: 60,
      eaveOffsetMm: 250,
      ridgeOffsetMm: 40,
    };
    const assignment: CoveringAssignmentSpec = {
      id: 'tile',
      roofPlaneIds: roofPlaneIds(input.template),
      product: {
        technicalSpecSnapshot: {
          schemaVersion: 1,
          kind: 'roof-tile',
          installationModes: [
            {
              id: 'standard',
              coverWidthMm: 300,
              gaugeRangeMm: { min: 330, max: 360 },
              minPitchDeg: 19,
            },
          ],
        },
      },
    };
    const composition = resolveBattenAutoComposition({
      layout,
      assignments: [assignment],
      ownership: resolvePrimaryCoveringAssignments([assignment]),
      roofPlaneIds: roofPlaneIds(input.template),
      roofPitchDeg: input.template.pitchDeg,
    });
    const battens = resolveBattenLayout({
      template: input.template,
      layout,
      autoSource: composition.source,
    });
    const decision = evaluateBattenInstallation({
      layout,
      result: battens,
      composition,
    });
    const schedule = createRoofMemberSchedule({
      skeleton: input.skeleton,
      buildUp: battens.battens.map((row) => ({
        id: row.id,
        familyKey: 'L',
        memberKind: 'batten' as const,
        lengthMm: row.usableLengthMm,
        section: { widthMm: 60, depthMm: 40 },
      })),
    });
    const candidate = createExportCandidates({
      ...input,
      schedule,
      battensEnabled: true,
      battens,
      battenAutoSource: composition.source,
      battenInstallationDecision: decision,
    }).find((row) => row.kind === 'layers');
    expect(candidate?.section?.kind).toBe('layers');
    if (candidate?.section?.kind !== 'layers') throw new Error('layers');
    const exported = candidate.section.rows[0]!.layoutFacts!;
    expect(exported).toMatchObject({
      decisionStatus: 'partially-automatic',
      gaugeSource: 'project-user-input',
      eaveOffsetMm: 250,
      ridgeOffsetMm: 40,
      decisionIssueCodes: [],
    });
    expect(exported.autoPlans![0]).toMatchObject({
      planeId: battens.planes[0]!.roofPlaneId,
      intervalCount: battens.planes[0]!.autoPlan!.intervalCount,
      courseCount: battens.planes[0]!.autoPlan!.courseCount,
      actualGaugeMm: battens.planes[0]!.autoPlan!.actualGaugeMm,
      targetGaugeMm: battens.planes[0]!.autoPlan!.targetGaugeMm,
      firstStationMm: battens.planes[0]!.autoPlan!.firstStationMm,
      lastStationMm: battens.planes[0]!.autoPlan!.lastStationMm,
    });
  });
  it.each([false, true])(
    'uses resolved gable/hip facts without inventing H1/J1 fabrication (hip=%s)',
    (hip) => {
      const input = facts(hip);
      const candidates = createExportCandidates(input);
      const summary = candidates.find(
        (row) => row.kind === 'project-summary',
      )?.section;
      expect(summary?.kind).toBe('project-summary');
      if (summary?.kind !== 'project-summary') return;
      expect(summary.roofType).toBe(hip ? 'hip' : 'gable');
      expect(summary.netRoofAreaMm2).toBeGreaterThan(0);
      expect(summary.timberFamilies.some((row) => row.code === 'H1')).toBe(hip);
      const fabrication = candidates.find(
        (row) => row.kind === 'member-fabrication',
      )?.section;
      expect(fabrication?.kind).toBe('member-fabrication');
      if (fabrication?.kind === 'member-fabrication') {
        expect(fabrication.code).toBe('K1');
        expect(fabrication.requiredBlankLengthMm).toBe(
          input.k1.status === 'resolved'
            ? input.k1.blank.requiredBlankLengthMm
            : undefined,
        );
        expect(
          fabrication.details.every((detail) =>
            ['birdsmouth-detail', 'ridge-cut-detail'].includes(detail.type),
          ),
        ).toBe(true);
      }
      expect(
        candidates.find((row) => row.kind === 'cutting-plan'),
      ).toMatchObject({ readiness: 'unavailable', reason: 'plan-k1-first' });
    },
  );

  it('copies the current K1 cutting plan and its loss accounting verbatim', () => {
    const input = facts();
    expect(input.k1.status).toBe('resolved');
    if (input.k1.status !== 'resolved') return;
    const settings = { kerfMm: 3, endTrimMm: 5, minimumReusableRemnantMm: 200 };
    const plan = createCuttingPlan({
      requiredPieces: input.k1.requiredPieces,
      stockOptions: [
        {
          id: 'stock',
          stockClassId: input.k1.stockClassId,
          lengthMm: input.k1.blank.requiredBlankLengthMm + 500,
        },
      ],
      settings,
    });
    const candidate = createExportCandidates({
      ...input,
      cutting: {
        signature: k1RequirementSignature(input.k1),
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
    }).find((row) => row.kind === 'cutting-plan');
    expect(candidate?.readiness).toBe(
      plan.status === 'complete' ? 'available' : 'warning',
    );
    expect(candidate?.section).toMatchObject({
      kind: 'cutting-plan',
      status: plan.status,
      assignedCount: plan.summary.assignedPieceCount,
      kerfMm: settings.kerfMm,
      kerfLossMm: plan.summary.kerfLossMm,
      wasteLengthMm: plan.summary.wasteLengthMm,
      reusableRemnantLengthMm: plan.summary.reusableRemnantLengthMm,
    });
  });

  function factsFromAssembly(assembly: typeof assemblyDefaults) {
    const gable = gableTemplateFromAssembly(assembly);
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
    };
  }

  it('never presents a half-lap ridge connection as fabrication-ready, but explains why', () => {
    const assembly = structuredClone(assemblyDefaults);
    assembly.ridge.connection = 'half-lap';
    const input = factsFromAssembly(assembly);
    expect(input.k1.status).toBe('unresolved');
    const candidates = createExportCandidates(input);
    const fabrication = candidates.find(
      (row) => row.kind === 'member-fabrication',
    );
    expect(fabrication).toMatchObject({
      readiness: 'unavailable',
      reason: 'k1-unresolved',
    });
    const assumptions = candidates.find(
      (row) => row.kind === 'assumptions',
    )?.section;
    expect(assumptions?.kind).toBe('assumptions');
    if (assumptions?.kind === 'assumptions')
      expect(assumptions.limitations.map((fact) => fact.code)).toContain(
        'ridge-half-lap-unresolved',
      );
  });

  it('labels a direct ridge meeting distinctly from the ridge-board default', () => {
    const assembly = structuredClone(assemblyDefaults);
    assembly.ridge.connection = 'direct-meeting';
    const input = factsFromAssembly(assembly);
    const candidates = createExportCandidates(input);
    const fabrication = candidates.find(
      (row) => row.kind === 'member-fabrication',
    )?.section;
    expect(fabrication?.kind).toBe('member-fabrication');
    if (fabrication?.kind === 'member-fabrication')
      expect(fabrication.ridgeConnection).toBe('direct-meeting');
    const assumptions = candidates.find(
      (row) => row.kind === 'assumptions',
    )?.section;
    if (assumptions?.kind === 'assumptions') {
      const scope = assumptions.scope.map((fact) => fact.code);
      expect(scope).toContain('k1-direct-meeting');
      expect(scope).not.toContain('k1-ridge-board');
    }
  });

  it('reports the collar-tie structural system truthfully in the project summary', () => {
    const gable = gableTemplateFromAssembly(assemblyDefaults);
    if (gable.type !== 'gable') throw new Error('expected a gable template');
    gable.structure = {
      system: 'rafter-collar-tie',
      collarTie: {
        heightAboveWallPlateMm: 1000,
        section: { widthMm: 100, depthMm: 38 },
      },
    };
    const resolved = createWorkbenchProjectResolver().resolve(gable);
    const schedule = createRoofMemberSchedule({ skeleton: resolved.skeleton });
    const input = {
      source,
      template: gable,
      resolved: resolved.resolved,
      skeleton: resolved.skeleton,
      surface: resolveRoofSurfaceGeometry({ template: gable, features: [] }),
      windows: [],
      schedule,
      details: resolved.detailPreviews,
      k1: createK1CuttingRequirement(resolved.resolved, schedule),
      membraneEnabled: false,
      counterBattensEnabled: false,
      battensEnabled: false,
      ...noBuildUpFacts,
      coverings: [],
      coveringStatuses: [],
    };
    const candidates = createExportCandidates(input);
    const summary = candidates.find(
      (row) => row.kind === 'project-summary',
    )?.section;
    expect(summary?.kind).toBe('project-summary');
    if (summary?.kind === 'project-summary')
      expect(summary.structuralSystem).toBe('rafter-collar-tie');
    expect(
      schedule.timberRows.find((row) => row.familyKey === 'C1')?.quantity,
    ).toBeGreaterThan(0);
    const assumptions = candidates.find(
      (row) => row.kind === 'assumptions',
    )?.section;
    if (assumptions?.kind === 'assumptions')
      expect(assumptions.limitations.map((fact) => fact.code)).toContain(
        'collar-tie-geometric',
      );
  });

  it('exports automatic batten and partial counter-batten facts without inventing purchase data', () => {
    const input = facts();
    const candidates = createExportCandidates({
      ...input,
      battensEnabled: true,
      counterBattensEnabled: true,
      schedule: createRoofMemberSchedule({
        skeleton: input.skeleton,
        buildUp: [
          {
            id: 'batten:1',
            familyKey: 'L',
            memberKind: 'batten',
            lengthMm: 5000,
            section: { widthMm: 60, depthMm: 40 },
          },
          {
            id: 'counter:1',
            familyKey: 'KL',
            memberKind: 'counter-batten',
            lengthMm: 6000,
            section: { widthMm: 40, depthMm: 60 },
          },
        ],
      }),
      battens: {
        status: 'resolved',
        mode: 'auto-from-covering',
        battens: [],
        totalLengthMm: 5000,
        issues: [],
        scope: {
          kind: 'subset',
          roofPlaneIds: ['roof-plane:left'],
          knownRoofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
        },
        planes: [
          {
            roofPlaneId: 'roof-plane:left',
            status: 'resolved',
            slopeLengthMm: 4000,
            totalRowLengthMm: 5000,
            openingDeductionMm: 0,
            firstStationMm: 250,
            lastStationMm: 3750,
            regularSpanMm: 3500,
            intervalCount: 10,
            courseCount: 11,
            actualGaugeMm: 350,
            stations: [],
            issues: [],
          },
        ],
      },
      battenAutoSource: {
        status: 'resolved',
        minimumGaugeMm: 320,
        maximumGaugeMm: 380,
      },
      counterBattens: {
        status: 'partial',
        rows: [],
        totalVisibleLengthMm: 6000,
        warnings: ['hip-boundary-detail-unresolved'],
        issues: [],
        resolvedAxisCount: 12,
        interiorAxisCount: 0,
        hipBoundaryRunCount: 0,
        hipBoundaries: [],
        unresolvedHipBoundaryCount: 0,
        visibleSegmentCount: 13,
        roofPlaneIds: ['roof-plane:left'],
      },
    });
    const layers = candidates.find(
      (candidate) => candidate.kind === 'layers',
    )?.section;
    expect(layers?.kind).toBe('layers');
    if (layers?.kind !== 'layers') return;
    expect(layers.rows.find((row) => row.code === 'L')?.layoutFacts).toEqual({
      mode: 'auto-from-covering',
      status: 'resolved',
      actualGaugeMm: 350,
      minimumGaugeMm: 320,
      maximumGaugeMm: 380,
      planeCount: 1,
      courseCount: 11,
      autoPlans: [],
    });
    expect(layers.rows.find((row) => row.code === 'KL')?.layoutFacts).toEqual({
      status: 'partial',
      planeCount: 1,
      axisCount: 12,
      segmentCount: 13,
    });
  });

  it('has no cost-estimate section before any line has been added', () => {
    const candidate = createExportCandidates(facts()).find(
      (row) => row.kind === 'cost-estimate',
    );
    expect(candidate).toMatchObject({
      readiness: 'unavailable',
      reason: 'no-cost-lines',
    });
  });

  it('marks an incomplete estimate as needing review, never as finished', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'unpriced',
        category: 'material',
        label: 'Łaty',
        quantity: { value: 100, unit: 'm' },
        quantityBasis: 'geometric-length',
        suitability: 'geometric-estimate',
        currencyCode: 'PLN',
        source: 'project-derived',
      }),
    );
    const candidate = createExportCandidates({
      ...facts(),
      cost: scenario,
    }).find((row) => row.kind === 'cost-estimate');
    expect(candidate?.readiness).toBe('warning');
    expect(candidate?.reason).toBe('cost-incomplete');
    expect(candidate?.section).toMatchObject({ complete: false });
  });

  it('copies a fully priced estimate verbatim, including net/tax/gross', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'battens',
        category: 'material',
        label: 'Łaty',
        quantity: { value: 100, unit: 'm' },
        quantityBasis: 'geometric-length',
        suitability: 'geometric-estimate',
        currencyCode: 'PLN',
        unitPriceMinor: 500,
        source: 'project-derived',
      }),
    );
    scenario = setScenarioTaxRateBps(scenario, 2300);
    const candidate = createExportCandidates({
      ...facts(),
      cost: scenario,
    }).find((row) => row.kind === 'cost-estimate');
    expect(candidate?.readiness).toBe('available');
    expect(candidate?.section).toMatchObject({
      currencyCode: 'PLN',
      taxRateBps: 2300,
      netMinor: 50_000,
      taxMinor: 11_500,
      grossMinor: 61_500,
      complete: true,
    });
    if (candidate?.section?.kind === 'cost-estimate')
      expect(candidate.section.lines[0]).toMatchObject({
        label: 'Łaty',
        basis: 'geometric-length',
        quantityValue: 100,
        quantityUnit: 'm',
        netMinor: 50_000,
      });
  });

  it('never lets a skipped (not-included) line reach the exported estimate', () => {
    let scenario = createEmptyCostScenario('PLN');
    scenario = addCostLine(
      scenario,
      createCostLine({
        id: 'skipped',
        category: 'material',
        label: 'Pominięte',
        quantity: { value: 1, unit: 'piece' },
        quantityBasis: 'manual',
        suitability: 'manual-required',
        currencyCode: 'PLN',
        unitPriceMinor: 1000,
        source: 'manual',
        included: false,
      }),
    );
    const candidate = createExportCandidates({
      ...facts(),
      cost: scenario,
    }).find((row) => row.kind === 'cost-estimate');
    expect(candidate).toMatchObject({
      readiness: 'unavailable',
      reason: 'no-cost-lines',
    });
  });
});
