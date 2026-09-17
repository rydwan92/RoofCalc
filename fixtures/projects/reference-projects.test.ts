import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { projectRecordV1Schema } from '@cieslacalc/project-core';
import {
  createRoofSkeleton,
  resolveBattenLayout,
  resolveCounterBattenLayout,
  resolveOpeningFramingSet,
  resolveRoofSurfaceGeometry,
  resolveRoofTemplate,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import {
  createCutToLengthSheetQuantitySource,
  createModularSheetQuantitySource,
  createRoofTileQuantitySource,
  createStandingSeamQuantitySource,
  resolveCutToLengthSheetLayout,
  resolveModularSheetLayout,
  resolvePrimaryCoveringAssignments,
  resolveRoofTileLayout,
  resolveStandingSeamLayout,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import type { RoofWindowFeature } from '@cieslacalc/timber-model';

/**
 * Golden reference corpus. Each file is a real `ProjectRecordV1` archive in the
 * format the application saves and imports, so these double as import
 * regression cases.
 *
 * Assertions are deliberately AGGREGATE: counts, areas, statuses and totals.
 * Raw coordinates are not snapshotted, because a legitimate rendering or
 * ordering change must not look like a domain regression, while a change in how
 * many members a roof needs, or whether a covering is trusted, must.
 *
 * Procurement is NOT exercised here — `packages/procurement-core` owns its own
 * golden fixtures, and no quantity → procurement bridge exists yet by design.
 */

const directory = fileURLToPath(new URL('.', import.meta.url));

const ACCEPTANCE: [string, Record<string, number>][] = [
  [
    '01-basic-gable.cieslacalc.json',
    { roofAreaM2: 87.9, k1StockCm: 560.9, k1: 22, j1: 0, battenM: 0 },
  ],
  [
    '02-basic-hip.cieslacalc.json',
    {
      roofAreaM2: 142.8,
      k1StockCm: 560.9,
      h1LengthCm: 707,
      k1: 14,
      j1: 32,
      battenM: 0,
    },
  ],
  [
    '04-hip-opening-framing.cieslacalc.json',
    {
      roofAreaM2: 141.2,
      k1StockCm: 560.9,
      h1LengthCm: 707,
      k1: 14,
      j1: 32,
      battenM: 0,
    },
  ],
  [
    '05-gable-roof-tile.cieslacalc.json',
    {
      roofAreaM2: 87.9,
      k1StockCm: 560.9,
      k1: 22,
      j1: 0,
      battenM: 272,
      counterBattenM: 120.9,
    },
  ],
  [
    '09-hip-catalogue-snapshot.cieslacalc.json',
    {
      roofAreaM2: 142.8,
      k1StockCm: 560.9,
      h1LengthCm: 707,
      k1: 14,
      j1: 32,
      battenM: 439.4,
      counterBattenM: 174.6,
    },
  ],
  [
    // Direct meeting: no ridge board to deduct, so K1 is longer than 01.
    '10-gable-collar-tie-direct-meeting.cieslacalc.json',
    { roofAreaM2: 87.9, k1StockCm: 563.4, k1: 22, j1: 0, battenM: 0 },
  ],
];

function loadRecord(file: string) {
  return projectRecordV1Schema.parse(
    JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8')),
  );
}

function resolveProject(file: string) {
  const record = loadRecord(file);
  const { roof, features, openingFraming, buildUp } = record.document.project;
  const baseSkeleton = createRoofSkeleton(roof);
  const roofWindows = features.filter(
    (feature): feature is RoofWindowFeature => feature.kind === 'roof-window',
  );
  const framing = resolveOpeningFramingSet({
    template: roof,
    skeleton: baseSkeleton,
    features: roofWindows,
    framingSpecs: openingFraming,
  });
  const surface = resolveRoofSurfaceGeometry({
    template: roof,
    features: roofWindows,
  });
  const battens = buildUp.battenLayout?.enabled
    ? resolveBattenLayout({
        template: roof,
        layout: buildUp.battenLayout,
        features: roofWindows,
      })
    : { battens: [], totalLengthMm: 0 };
  const counterBattens = buildUp.counterBattens
    ? resolveCounterBattenLayout({
        template: roof,
        skeleton: framing.composedSkeleton,
        layout: buildUp.counterBattens,
        features: roofWindows,
      })
    : undefined;
  const schedule = createRoofMemberSchedule({
    skeleton: framing.composedSkeleton,
  });
  return {
    record,
    roof,
    roofWindows,
    coverings: record.document.project.coverings,
    baseSkeleton,
    framing,
    surface,
    battens,
    counterBattens,
    schedule,
  };
}

/** Neutral inputs, exactly as the workbench feeds the covering solvers. */
function coveringInputs(project: ReturnType<typeof resolveProject>) {
  return {
    roofSurfaceGeometry: project.surface.planes.map((plane) => ({
      roofPlaneId: plane.roofPlaneId,
      pitchDeg: project.roof.pitchDeg,
      localPolygon: plane.polygon,
      netAreaMm2: plane.netAreaMm2,
    })),
    openings: project.roofWindows.map((feature) => ({
      id: feature.id,
      roofPlaneId: feature.roofPlaneId,
      fromUMm: feature.position.uMm,
      toUMm: feature.position.uMm + feature.widthMm,
      fromVMm: feature.position.vMm,
      toVMm: feature.position.vMm + feature.heightMm,
    })),
    battens: project.battens.battens.map((batten) => ({
      id: batten.id,
      roofPlaneId: batten.roofPlaneId,
      stationVMm: batten.stationMm,
      segments: batten.segments,
    })),
    buildUp: {
      battenGaugeMm:
        project.record.document.project.buildUp.battenLayout?.gaugeMm,
    },
  };
}

/** Mirrors the Page pipeline: ownership gate, then one family resolver. */
function resolveCovering(
  project: ReturnType<typeof resolveProject>,
  assignment: CoveringAssignmentSpec,
) {
  const ownership = resolvePrimaryCoveringAssignments(project.coverings);
  const common = {
    ...coveringInputs(project),
    assignmentId: assignment.id,
    roofPlaneIds:
      ownership.trustedRoofPlaneIdsByAssignment[assignment.id] ?? [],
  };
  const spec = assignment.product.technicalSpecSnapshot;
  const productDisplay = assignment.product.displaySnapshot;
  if (spec.kind === 'roof-tile') {
    const layout = resolveRoofTileLayout({
      ...common,
      productSpec: spec,
      selectedInstallationModeId: assignment.selectedInstallationModeId,
      layoutIntent:
        assignment.layoutIntent?.kind === 'roof-tile'
          ? assignment.layoutIntent
          : { kind: 'roof-tile', horizontalAlignment: 'centered' },
    });
    return {
      layout,
      source: createRoofTileQuantitySource({ layout, productDisplay }),
    };
  }
  if (spec.kind === 'standing-seam') {
    const layout = resolveStandingSeamLayout({
      ...common,
      productSpec: spec,
      selectedInstallationModeId: assignment.selectedInstallationModeId,
      layoutIntent:
        assignment.layoutIntent?.kind === 'standing-seam'
          ? assignment.layoutIntent
          : { kind: 'standing-seam', horizontalAlignment: 'centered' },
    });
    return {
      layout,
      source: createStandingSeamQuantitySource({ layout, productDisplay }),
    };
  }
  if (spec.lengthModel.kind === 'cut-to-length') {
    const previous = assignment.layoutIntent;
    const layout = resolveCutToLengthSheetLayout({
      ...common,
      productSpec: spec as never,
      layoutIntent:
        previous?.kind === 'modular-sheet-cut-to-length'
          ? previous
          : {
              kind: 'modular-sheet-cut-to-length',
              horizontalAlignment: 'centered',
            },
    });
    return {
      layout,
      source: createCutToLengthSheetQuantitySource({ layout, productDisplay }),
    };
  }
  const layout = resolveModularSheetLayout({
    ...common,
    productSpec: spec,
    layoutIntent:
      assignment.layoutIntent?.kind === 'modular-sheet'
        ? assignment.layoutIntent
        : { kind: 'modular-sheet', horizontalAlignment: 'centered' },
  });
  return {
    layout,
    source: createModularSheetQuantitySource({ layout, productDisplay }),
  };
}

const squareMetres = (areaMm2: number) => areaMm2 / 1_000_000;

describe('reference project corpus', () => {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.cieslacalc.json'))
    .sort();

  it('contains the documented reference projects', () => {
    expect(files).toEqual([
      '01-basic-gable.cieslacalc.json',
      '02-basic-hip.cieslacalc.json',
      '03-gable-three-roof-windows.cieslacalc.json',
      '04-hip-opening-framing.cieslacalc.json',
      '05-gable-roof-tile.cieslacalc.json',
      '06-gable-fixed-modular-sheet.cieslacalc.json',
      '07-gable-standing-seam.cieslacalc.json',
      '08-gable-cut-to-length-sheet.cieslacalc.json',
      '09-hip-catalogue-snapshot.cieslacalc.json',
      '10-gable-collar-tie-direct-meeting.cieslacalc.json',
    ]);
  });

  it.each(files)('%s parses as a saved project archive', (file) => {
    const record = loadRecord(file);
    expect(record.schemaVersion).toBe(1);
    expect(record.document.schemaVersion).toBe(1);
    expect(record.name.length).toBeGreaterThan(0);
  });

  it.each(files)(
    '%s references only roof planes its own template defines',
    (file) => {
      const project = resolveProject(file);
      const known = new Set(roofPlaneIds(project.roof));
      for (const feature of project.roofWindows)
        expect(known.has(feature.roofPlaneId)).toBe(true);
      for (const assignment of project.coverings)
        for (const id of assignment.roofPlaneIds)
          expect(known.has(id)).toBe(true);
    },
  );
});

describe('geometry invariants', () => {
  it('01 basic gable resolves a complete two-plane skeleton', () => {
    const project = resolveProject('01-basic-gable.cieslacalc.json');
    expect(project.surface.status).toBe('resolved');
    expect(project.surface.planes).toHaveLength(2);
    expect(project.surface.openingAreaMm2).toBe(0);
    expect(squareMetres(project.surface.netAreaMm2)).toBeCloseTo(87.86, 1);
    expect(
      project.schedule.rows.find((row) => row.familyKey === 'K1')?.quantity,
    ).toBe(22);
  });

  it('02 basic hip resolves four planes with hip and jack families', () => {
    const project = resolveProject('02-basic-hip.cieslacalc.json');
    expect(project.surface.status).toBe('resolved');
    expect(project.surface.planes.map((plane) => plane.roofPlaneId)).toEqual([
      'roof-plane:left',
      'roof-plane:right',
      'roof-plane:front',
      'roof-plane:rear',
    ]);
    expect(project.schedule.rows.some((row) => row.familyKey === 'H1')).toBe(
      true,
    );
    expect(project.schedule.rows.some((row) => row.familyKey === 'J1')).toBe(
      true,
    );
  });

  it('03 three roof windows deduct three openings from one plane', () => {
    const project = resolveProject(
      '03-gable-three-roof-windows.cieslacalc.json',
    );
    expect(project.roofWindows).toHaveLength(3);
    const left = project.surface.planes.find(
      (plane) => plane.roofPlaneId === 'roof-plane:left',
    )!;
    expect(left.openingPolygons).toHaveLength(3);
    expect(
      squareMetres(project.surface.grossAreaMm2 - project.surface.netAreaMm2),
    ).toBeCloseTo(3 * 0.78 * 1.18, 2);
  });

  it('04 hip opening framing stays accepted and carries structured provenance', () => {
    const project = resolveProject('04-hip-opening-framing.cieslacalc.json');
    const result = project.framing.results[0]!;
    expect(result.status).toBe('resolved');
    expect(result.reviewStatus).toBe('valid');
    const headers = project.framing.composedSkeleton.members.filter(
      (member) => member.kind === 'opening-header',
    );
    expect(headers).toHaveLength(2);
    for (const header of headers) {
      // ADR-007: role and provenance are fields, never ID suffixes.
      expect(header.sourceFeatureId).toBe('feature:roof-window-1');
      expect(['upper', 'lower']).toContain(header.openingRole);
    }
    const segments = project.framing.composedSkeleton.members.filter(
      (member) => member.kind === 'rafter-segment',
    );
    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments) {
      expect(segment.sourceMemberId).toBeDefined();
      expect(segment.sourceFeatureId).toBe('feature:roof-window-1');
    }
    expect(project.schedule.rows.some((row) => row.familyKey === 'O1')).toBe(
      true,
    );
    expect(
      project.schedule.rows.some((row) => row.role === 'upper') &&
        project.schedule.rows.some((row) => row.role === 'lower'),
    ).toBe(true);
  });

  it('10 collar-tie roof with a direct ridge meeting resolves both K1 and C1', () => {
    const project = resolveProject(
      '10-gable-collar-tie-direct-meeting.cieslacalc.json',
    );
    expect(project.roof.type).toBe('gable');
    if (project.roof.type !== 'gable')
      throw new Error('expected a gable template');
    expect(project.roof.structure?.system).toBe('rafter-collar-tie');
    expect(project.roof.ridge.connection).toBe('direct-meeting');
    const k1 = project.schedule.rows.find((row) => row.familyKey === 'K1');
    const c1 = project.schedule.rows.find((row) => row.familyKey === 'C1');
    expect(k1?.quantity).toBe(22);
    expect(c1?.quantity).toBe(11);
    expect(c1?.lengthMm).toBeGreaterThan(0);
    expect(c1?.lengthMm).toBeLessThan(project.roof.halfRunMm * 2);
  });
});

describe('covering invariants', () => {
  it('05 roof tile resolves a trusted coverage-position quantity', () => {
    const project = resolveProject('05-gable-roof-tile.cieslacalc.json');
    const { layout, source } = resolveCovering(project, project.coverings[0]!);
    expect(layout.status).toBe('resolved');
    expect(source).toMatchObject({
      layoutKind: 'roof-tile',
      semantic: 'effective-coverage-position',
      unit: 'coverage-position',
      requirementReadiness: 'geometric-only',
    });
    expect(source!.quantity).toBeGreaterThan(0);
    expect(source!.sourceRoofPlaneIds).toEqual([
      'roof-plane:left',
      'roof-plane:right',
    ]);
  });

  it('06 fixed modular sheet counts geometric positions, not purchases', () => {
    const project = resolveProject(
      '06-gable-fixed-modular-sheet.cieslacalc.json',
    );
    const { layout, source } = resolveCovering(project, project.coverings[0]!);
    expect(layout.status).toBe('resolved');
    expect(source).toMatchObject({
      layoutKind: 'modular-sheet',
      semantic: 'effective-coverage-position',
      unit: 'coverage-position',
      requirementReadiness: 'geometric-only',
    });
    expect(source!.quantity).toBeGreaterThan(0);
  });

  it('07 standing seam reports geometric runs with exact length groups', () => {
    const project = resolveProject('07-gable-standing-seam.cieslacalc.json');
    const { layout, source } = resolveCovering(project, project.coverings[0]!);
    expect(['resolved', 'limited']).toContain(layout.status);
    if (source?.semantic !== 'geometric-panel-run')
      throw new Error('expected geometric panel-run quantity');
    expect(source!.totalLengthMm).toBeGreaterThan(0);
    expect(source!.quantity).toBe(
      source!.lengthGroups!.reduce((sum, group) => sum + group.quantity, 0),
    );
  });

  it('08 cut-to-length splits runs around openings and invents no order length', () => {
    const project = resolveProject(
      '08-gable-cut-to-length-sheet.cieslacalc.json',
    );
    const { layout, source } = resolveCovering(project, project.coverings[0]!);
    if (layout.kind !== 'modular-sheet-cut-to-length')
      throw new Error(`unexpected layout kind: ${layout.kind}`);
    expect(['resolved', 'limited']).toContain(layout.status);
    expect(layout.openingInterruptedRuns).toBeGreaterThan(0);
    // A partial-width opening leaves one connected notched run; only a
    // full-width opening splits a strip. Both are legitimate, so the corpus
    // asserts the weaker invariant and leaves the split case to covering-core.
    expect(layout.physicalRunCount).toBeGreaterThanOrEqual(layout.stripCount);
    expect(layout.totalGeometricLengthMm).toBeGreaterThan(0);
    for (const plane of layout.planes)
      for (const column of plane.columns)
        for (const run of column.runs)
          expect(run.orderLengthMm).toBeUndefined();
    expect(source!.warningKeys).toContain(
      'geometric-sheet-runs-not-purchase-quantity',
    );
  });

  it('09 a catalogue project calculates from its snapshot with no catalogue access', () => {
    const project = resolveProject('09-hip-catalogue-snapshot.cieslacalc.json');
    const assignment = project.coverings[0]!;
    expect(assignment.product.catalogRef?.technicalRevisionId).toBe(
      'revision:demo-roof:cut-350:2026-01',
    );
    const { layout, source } = resolveCovering(project, assignment);
    expect(['resolved', 'limited']).toContain(layout.status);
    expect(source!.quantity).toBeGreaterThan(0);
  });

  it('one primary covering per plane stays the only ownership gate', () => {
    const project = resolveProject('05-gable-roof-tile.cieslacalc.json');
    const ownership = resolvePrimaryCoveringAssignments([
      ...project.coverings,
      { ...project.coverings[0]!, id: 'covering:duplicate' },
    ]);
    expect(ownership.conflicts.length).toBeGreaterThan(0);
  });
});

/**
 * V44 reference acceptance numbers. A handful of facts a roofer would check by
 * hand, rounded to the display precision (0.1 cm, 0.1 m, 0.1 m²). A change here
 * must be a deliberate, explained domain change — never a side effect.
 */
function acceptanceEvidence(file: string) {
  const project = resolveProject(file);
  const resolved = resolveRoofTemplate(project.roof);
  const round = (value: number, digits = 1) =>
    Math.round(value * 10 ** digits) / 10 ** digits;
  const count = (code: string) =>
    resolved.memberPrototypes.find((prototype) => prototype.code === code)
      ?.count ?? 0;
  return {
    roofAreaM2: round(project.surface.netAreaMm2 / 1_000_000),
    k1StockCm: round(resolved.calculation.plan.minimumStockLengthMm / 10),
    h1LengthCm:
      'hipRafter' in resolved
        ? round(resolved.hipRafter.result.outerEaveToRidgeFaceMm / 10)
        : undefined,
    k1: count('K1'),
    j1: count('J1'),
    battenM: round(project.battens.totalLengthMm / 1000),
    counterBattenM: project.counterBattens
      ? round(project.counterBattens.totalVisibleLengthMm / 1000)
      : undefined,
  };
}

describe('V44 reference acceptance numbers', () => {
  it.each(ACCEPTANCE)('%s', (file, expected) => {
    expect(acceptanceEvidence(file)).toEqual(expected);
  });
});
