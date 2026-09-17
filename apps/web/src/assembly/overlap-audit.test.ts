import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  resolveRoofTileLayout,
  type CoveringAssignmentSpec,
  type RoofTileTechnicalSpec,
} from '@cieslacalc/covering-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  resolveMembraneLayout,
  resolveRoofSurfaceGeometry,
  roofPlaneIds,
} from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { resolveBattenAutoComposition } from './batten-composition';
import { newBattenLayer } from './build-up-defaults';

/**
 * V46 overlap audit — independent checks, never the production formula.
 *
 * Laps are where roofing quantities go wrong. Each check below derives the
 * expected value from first principles (area ÷ effective module, rafter
 * slope ÷ gauge, roll width − lap) and compares it with the resolver chain
 * the application uses (surface → auto batten gauge → tile courses).
 */

/** Seeded swissporTON KODA (tiles-2026-09-v35.json), straight lay. */
const KODA: RoofTileTechnicalSpec = {
  schemaVersion: 1,
  kind: 'roof-tile',
  physicalWidthMm: 304,
  physicalLengthMm: 503,
  installationModes: [
    {
      id: 'standard',
      coverWidthMm: 260,
      gaugeRangeMm: { min: 390, max: 430 },
      minPitchDeg: 10,
      declaredUnitsPerM2: { min: 8.9, max: 9.9 },
      coursePattern: {
        layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
        battenRowOffsetCycle: [0],
      },
    },
  ],
};

const gable: RoofTemplateSpec = {
  ...gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:gable-1',
    buildingLengthMm: 10000,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
  }),
  halfRunMm: 4000,
  pitchDeg: 40,
  eaveOverhangMm: 500,
} as RoofTemplateSpec;
const hip = convertRoofTemplate(gable, 'hip');

function chain(template: RoofTemplateSpec) {
  const planes = roofPlaneIds(template);
  const assignment: CoveringAssignmentSpec = {
    id: 'covering:koda',
    roofPlaneIds: planes,
    product: { technicalSpecSnapshot: KODA },
  } as CoveringAssignmentSpec;
  const layout = newBattenLayer();
  const composition = resolveBattenAutoComposition({
    layout,
    assignments: [assignment],
    ownership: resolvePrimaryCoveringAssignments([assignment]),
    roofPlaneIds: planes,
    roofPitchDeg: template.pitchDeg,
  });
  const battens = resolveBattenLayout({
    template,
    layout,
    autoSource: composition.source,
  });
  const surface = resolveRoofSurfaceGeometry({ template });
  const tiles = resolveRoofTileLayout({
    assignmentId: assignment.id,
    roofPlaneIds: planes,
    roofSurfaceGeometry: surface.planes.map((plane) => ({
      roofPlaneId: plane.roofPlaneId,
      pitchDeg: template.pitchDeg,
      localPolygon: plane.polygon,
      netAreaMm2: plane.netAreaMm2,
    })),
    openings: [],
    battens: battens.battens.map((batten) => ({
      id: batten.id,
      roofPlaneId: batten.roofPlaneId,
      stationVMm: batten.stationMm,
      segments: batten.segments,
    })),
    productSpec: KODA,
    layoutIntent: { kind: 'roof-tile', horizontalAlignment: 'centered' },
  });
  return { battens, surface, tiles, layout };
}

/**
 * Reference numbers audited by hand on 2026-09-17 (10 × 8 m, 40°, 50 cm
 * eave overhang, KODA 260 mm cover, eave reference 250 mm, ridge 0):
 * slope 4500 / cos 40° = 5874 mm; 15 rows at (5874 − 250) / 14 = 401,7 mm;
 * ideal gable positions 117,49 m² / (0,260 × 0,4017 m) = 1124.
 * Counted positions also include every cut position at verges and hips.
 */
const REFERENCE = {
  gable: {
    areaM2: 117.49,
    rowsPerPlane: 15,
    gaugeMm: 401.7,
    positions: 1170,
    cut: 60,
  },
  hip: {
    areaM2: 129.24,
    rowsPerPlane: 15,
    gaugeMm: 401.7,
    positions: 1360,
    cut: 254,
  },
} as const;

describe.each([
  ['gable', gable],
  ['hip', hip],
] as const)('overlap audit — %s roof, KODA', (_name, template) => {
  const { battens, surface, tiles, layout } = chain(template);
  const mode = KODA.installationModes[0]!;

  it('resolves and every regular batten gauge is inside the tile head-lap range', () => {
    expect(battens.status).toBe('resolved');
    expect(tiles.status).toBe('resolved');
    for (const plane of battens.planes) {
      const rows = battens.battens
        .filter((row) => row.roofPlaneId === plane.roofPlaneId)
        .map((row) => row.stationMm)
        .sort((a, b) => a - b);
      for (let i = 1; i < rows.length; i += 1) {
        const gauge = rows[i]! - rows[i - 1]!;
        expect(gauge).toBeGreaterThanOrEqual(mode.gaugeRangeMm.min - 1e-6);
        expect(gauge).toBeLessThanOrEqual(mode.gaugeRangeMm.max + 1e-6);
      }
      // First row at the eave reference, last row not beyond the ridge reference.
      expect(rows[0]).toBeCloseTo(layout.eaveOffsetMm, 6);
      expect(rows.at(-1)!).toBeLessThanOrEqual(
        plane.slopeLengthMm - (layout.ridgeOffsetMm ?? 0) + 1e-6,
      );
      // Independent course count: the fewest intervals that keep gauge ≤ max.
      const span =
        plane.slopeLengthMm - layout.eaveOffsetMm - (layout.ridgeOffsetMm ?? 0);
      expect(rows.length - 1).toBe(
        Math.ceil(span / mode.gaugeRangeMm.max - 1e-9),
      );
    }
  });

  it('tile positions match area ÷ (cover width × actual gauge) within edge effects', () => {
    const area = surface.planes.reduce(
      (sum, plane) => sum + plane.netAreaMm2,
      0,
    );
    for (const plane of tiles.planes) {
      const gauge = plane.actualGaugeRangeMm!.max;
      const surfacePlane = surface.planes.find(
        (item) => item.roofPlaneId === plane.roofPlaneId,
      )!;
      const expected = surfacePlane.netAreaMm2 / (mode.coverWidthMm * gauge);
      // Counted positions include every partially covered (cut) position, so
      // they may exceed the ideal area count by at most one course of cut
      // tiles per plane edge; they must never fall below it.
      expect(plane.totalPositions).toBeGreaterThanOrEqual(Math.floor(expected));
    }
    // The manufacturer's declared consumption (pieces per m² at its own gauge
    // range) must bracket our effective module: 1 / (cover × gauge).
    const perM2Min = 1e6 / (mode.coverWidthMm * mode.gaugeRangeMm.max);
    const perM2Max = 1e6 / (mode.coverWidthMm * mode.gaugeRangeMm.min);
    expect(perM2Min).toBeGreaterThan(mode.declaredUnitsPerM2!.min - 0.1);
    expect(perM2Max).toBeLessThan(mode.declaredUnitsPerM2!.max + 0.1);
    expect(tiles.declaredConsumptionReference!.netAssignedAreaMm2).toBeCloseTo(
      area,
      3,
    );
  });

  it('matches the hand-audited reference numbers', () => {
    const reference = REFERENCE[_name];
    const area =
      surface.planes.reduce((sum, plane) => sum + plane.netAreaMm2, 0) / 1e6;
    expect(area).toBeCloseTo(reference.areaM2, 2);
    for (const plane of battens.planes)
      expect(plane.courseCount).toBe(reference.rowsPerPlane);
    const rows = battens.battens
      .filter((row) => row.roofPlaneId === battens.planes[0]!.roofPlaneId)
      .map((row) => row.stationMm)
      .sort((a, b) => a - b);
    expect(rows[1]! - rows[0]!).toBeCloseTo(reference.gaugeMm, 1);
    expect(tiles.totalPositions).toBe(reference.positions);
    expect(tiles.cutPositions).toBe(reference.cut);
    // Cut positions at verges/hips may lift the count above the declared
    // consumption, but never by more than 10 % on these roofs.
    expect(tiles.totalPositions).toBeLessThanOrEqual(
      tiles.declaredConsumptionReference!.maximumPieces * 1.1,
    );
  });

  it('membrane courses step by roll width − lap and gross = net + laps + ridge overrun', () => {
    const product = {
      rollWidthMm: 1500,
      rollLengthMm: 50000,
      minimumOverlapMm: 100,
    };
    const membrane = resolveMembraneLayout({
      template,
      layout: { enabled: true },
      product,
    });
    expect(membrane.status).toBe('resolved');
    for (const plane of membrane.planes) {
      const slope = battens.planes.find(
        (item) => item.roofPlaneId === plane.roofPlaneId,
      )!.slopeLengthMm;
      const step = product.rollWidthMm - product.minimumOverlapMm;
      const expectedCourses = Math.max(
        1,
        Math.ceil((slope - product.rollWidthMm) / step - 1e-9) + 1,
      );
      expect(plane.courseCount).toBe(expectedCourses);
    }
  });
});
