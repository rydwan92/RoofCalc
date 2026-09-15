import { describe, expect, it } from 'vitest';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import { createCuttingPlan } from '@cieslacalc/procurement-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
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
    coverings: [],
    coveringStatuses: [],
  };
}

describe('execution export adapter', () => {
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
      expect(assumptions.codes).toContain('ridge-half-lap-unresolved');
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
      expect(assumptions.codes).toContain('ridge-direct-meeting');
      expect(assumptions.codes).not.toContain('ridge-board');
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
      expect(assumptions.codes).toContain('collar-tie-geometric');
  });
});
