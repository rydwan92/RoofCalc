import { describe, expect, it } from 'vitest';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import {
  createManualDrainageSystem,
  type DrainageIntent,
  type RoofSystemIntent,
} from '@cieslacalc/roof-system-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { createCostSuggestions } from './cost-adapter';
import { createExportCandidates, type ExportFacts } from './export-adapter';
import { createMaterialPlanRows } from './material-plan';
import { materialTestFacts } from './material-test-facts';
import {
  freezeAutoLayout,
  resolveRoofSystemFacts,
  roofLineLengthsFromFeatures,
  withDrainage,
} from './roof-system';
import {
  gutterLine,
  planView,
  pointAtStation,
  roundStation,
  stationAtPoint,
} from './drainage-view';

const gable = gableTemplateFromAssembly(assemblyDefaults);
const hip = convertRoofTemplate(gable, 'hip');
const system = createManualDrainageSystem({
  name: 'Test 125/90',
  gutterLengthsMm: [4000],
  downpipeLengthsMm: [3000],
  hookMaxSpacingMm: 600,
  clampMaxSpacingMm: 1800,
});

function roof(template: RoofTemplateSpec, drainage?: DrainageIntent) {
  const surface = resolveRoofSurfaceGeometry({ template });
  const intent: RoofSystemIntent | undefined = drainage
    ? { drainage }
    : undefined;
  return { surface, facts: resolveRoofSystemFacts({ surface, intent }) };
}

function exportFacts(template: RoofTemplateSpec, drainage?: DrainageIntent) {
  const { surface, facts } = roof(template, drainage);
  return {
    ...materialTestFacts(),
    template,
    surface,
    roofSystem: facts,
  } satisfies ExportFacts;
}

describe('V51 roof system — canonical features feed drainage', () => {
  it('gable AUTO: two eaves become two independent runs with end caps', () => {
    const { facts } = roof(gable, { enabled: true, mode: 'auto', system });
    expect(facts.eaves).toHaveLength(2);
    expect(facts.drainage.runs).toHaveLength(2);
    expect(facts.drainage.runs.map((run) => run.lengthMm)).toEqual(
      facts.eaves.map((eave) => eave.lengthMm),
    );
    expect(
      facts.drainage.bom.find((row) => row.role === 'gutter-end-cap')?.quantity,
    ).toBe(4);
    expect(
      facts.drainage.bom.some((row) => row.role.startsWith('gutter-corner')),
    ).toBe(false);
  });

  it('hip AUTO: corners come from the roof adjacency, not a constant', () => {
    const { facts } = roof(hip, { enabled: true, mode: 'auto', system });
    const corners = facts.topology.eaveCorners.length;
    expect(corners).toBe(4);
    expect(facts.drainage.runs).toHaveLength(1);
    expect(facts.drainage.runs[0]!.closed).toBe(true);
    expect(
      facts.drainage.bom.find((row) => row.role === 'gutter-corner-external')
        ?.quantity,
    ).toBe(corners);
    expect(
      facts.drainage.bom.find((row) => row.role === 'gutter-end-cap'),
    ).toBeUndefined();
    // Gutter length is the sum of the canonical eaves, never a perimeter guess.
    expect(facts.drainage.totalGutterLengthMm).toBeCloseTo(
      facts.eaves.reduce((sum, eave) => sum + eave.lengthMm, 0),
      6,
    );
  });

  it('hip separate: freezing AUTO then separating every corner gives open runs', () => {
    const auto: DrainageIntent = { enabled: true, mode: 'auto', system };
    const { facts } = roof(hip, auto);
    const frozen = freezeAutoLayout(auto, facts.drainage);
    expect(frozen.mode).toBe('manual');
    expect(frozen.gutteredEaveIds).toHaveLength(4);
    const separate = roof(hip, {
      ...frozen,
      corners: frozen.corners!.map((corner) => ({
        ...corner,
        connection: 'separate' as const,
      })),
    }).facts;
    expect(separate.drainage.runs).toHaveLength(4);
    expect(
      separate.drainage.bom.find((row) => row.role === 'gutter-end-cap')
        ?.quantity,
    ).toBe(8);
  });

  it('V50 ridge/hip line lengths read the canonical features', () => {
    const { surface, facts } = roof(hip);
    const all = surface.planes.map((plane) => plane.roofPlaneId);
    const lines = roofLineLengthsFromFeatures(facts.topology, all);
    expect(lines.complete).toBe(true);
    expect(lines.ridgeMm).toBeCloseTo(
      hip.buildingLengthMm - 2 * hip.halfRunMm,
      6,
    );
    expect(lines.hipMm).toBeCloseTo(
      surface.planes.reduce((sum, p) => sum + p.hipBoundaryLengthMm / 2, 0),
      6,
    );
    expect(
      roofLineLengthsFromFeatures(facts.topology, all.slice(0, 1)).complete,
    ).toBe(false);
  });

  it('turning drainage off removes the intent without touching line components', () => {
    const intent: RoofSystemIntent = {
      drainage: { enabled: true, mode: 'auto' },
      lineComponents: [
        {
          id: 'c1',
          role: 'ridge-tape',
          name: 'Taśma',
          rule: {
            kind: 'linear-effective-cover',
            effectiveCoverLengthMm: 5000,
          },
        },
      ],
    };
    expect(withDrainage(intent, undefined)).toEqual({
      lineComponents: intent.lineComponents,
    });
    expect(withDrainage({ drainage: intent.drainage }, undefined)).toBe(
      undefined,
    );
  });
});

describe('V51 roof system — materials, cost and documents', () => {
  const complete: DrainageIntent = {
    enabled: true,
    mode: 'auto',
    system,
    outlets: [
      {
        id: 'o1',
        // Replaced with a real canonical eave ID in each test.
        eaveId: 'placeholder',
        station: 0.95,
        downpipeHeightMm: 5400,
        elbowCount: 2,
      },
    ],
  };

  it('drainage is one compact state when not configured: no material rows', () => {
    const rows = createMaterialPlanRows(exportFacts(gable));
    expect(rows.some((row) => row.category === 'drainage')).toBe(false);
  });

  it('a resolved plan becomes drainage rows priced per commercial piece', () => {
    const facts = exportFacts(gable);
    const eaveId = facts.roofSystem.eaves[0]!.id;
    const withOutlet = exportFacts(gable, {
      ...complete,
      outlets: [{ ...complete.outlets![0]!, eaveId }],
    });
    const rows = createMaterialPlanRows(withOutlet).filter(
      (row) => row.category === 'drainage',
    );
    const sections = rows.find(
      (row) => row.roofSystemRole === 'gutter-section',
    );
    expect(sections?.unit).toBe('piece');
    expect(sections?.quantity).toBe(
      withOutlet.roofSystem.drainage.runs.reduce(
        (sum, run) =>
          sum +
          run.segments.reduce(
            (total, segment) => total + segment.assembly!.sectionsMm.length,
            0,
          ),
        0,
      ),
    );
    // The manual system names itself, never a role key.
    expect(sections?.product?.name).toBe('Test 125/90');
    const pipe = rows.find((row) => row.roofSystemRole === 'downpipe');
    expect(pipe?.quantity).toBe(2);
    const suggestions = createCostSuggestions(withOutlet).filter(
      (suggestion) => suggestion.kind === 'roof-system',
    );
    expect(suggestions.every((item) => item.quantity.unit === 'piece')).toBe(
      true,
    );
    expect(
      suggestions.find((item) => item.key === 'drainage:downpipe:3000')
        ?.quantity.value,
    ).toBe(2);
  });

  it('a row that needs a decision is never suggested for cost', () => {
    const eaveId = exportFacts(gable).roofSystem.eaves[0]!.id;
    const missingHeight = exportFacts(gable, {
      enabled: true,
      mode: 'auto',
      system,
      outlets: [{ id: 'o1', eaveId, station: 0.5 }],
    });
    const keys = createCostSuggestions(missingHeight).map((item) => item.key);
    expect(keys).toContain('drainage:gutter-section:4000');
    expect(keys.some((key) => key.startsWith('drainage:downpipe'))).toBe(false);
    const rows = createMaterialPlanRows(missingHeight);
    expect(rows.find((row) => row.roofSystemRole === 'downpipe')?.partial).toBe(
      true,
    );
  });

  it('the execution package gets a concise drainage plan, the material list the rows', () => {
    const facts = exportFacts(hip);
    const eaveId = facts.roofSystem.eaves[1]!.id;
    const configured = exportFacts(hip, {
      ...complete,
      outlets: [{ ...complete.outlets![0]!, eaveId }],
    });
    const candidates = createExportCandidates(configured);
    const plan = candidates.find((item) => item.kind === 'drainage-plan');
    expect(plan?.readiness).not.toBe('unavailable');
    const section = plan?.section;
    expect(section?.kind).toBe('drainage-plan');
    if (section?.kind !== 'drainage-plan') return;
    expect(section.hydraulicsNotVerified).toBe(true);
    expect(section.runs).toHaveLength(1);
    expect(section.outlets[0]).toMatchObject({
      label: 'P1',
      downpipeHeightMm: 5400,
      elbows: 2,
    });
    // No price or quantity table in the execution drainage plan.
    expect(JSON.stringify(section)).not.toMatch(/price|quantity/i);
    const list = candidates.find((item) => item.kind === 'material-list');
    expect(
      list?.section?.kind === 'material-list' &&
        list.section.rows.some((row) => row.category === 'drainage'),
    ).toBe(true);
    // Without drainage the section is simply absent.
    expect(
      createExportCandidates(exportFacts(hip)).find(
        (item) => item.kind === 'drainage-plan',
      )?.readiness,
    ).toBe('unavailable');
  });
});

describe('drainage plan view', () => {
  it('maps a pointer back to a clamped station along the gutter', () => {
    const { surface, facts } = roof(gable);
    const view = planView(surface);
    const line = gutterLine(facts.eaves[0]!, view.gutterOffsetMm);
    for (const station of [0, 0.25, 0.5, 1])
      expect(stationAtPoint(line, pointAtStation(line, station))).toBeCloseTo(
        station,
        9,
      );
    expect(stationAtPoint(line, { x: 1e9, y: 1e9 })).toBeGreaterThanOrEqual(0);
    expect(stationAtPoint(line, { x: 1e9, y: 1e9 })).toBeLessThanOrEqual(1);
    expect(roundStation(0.123456, 10000)).toBeCloseTo(0.1235, 9);
  });
});
