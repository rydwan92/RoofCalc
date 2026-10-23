import { describe, expect, it } from 'vitest';
import {
  MONO_PITCH_PLANE_ID,
  MONO_PITCH_SOLVER_SCOPE,
  monoPitchFromBearingElevations,
  monoPitchRiseMm,
  monoPitchRoofSpecSchema,
  resolveMonoPitchRoof,
  type MonoPitchRoofSpec,
} from './mono-pitch-roof';
import { projectPlaneLocalToWorld } from './roof-features';

/**
 * Reference vectors from docs/domain/MONO_PITCH_ROOF.md §5, hand-checked
 * with tan 15° = 2 − √3 and cos 15° = (√6 + √2) / 4.
 */
const TAN15 = 2 - Math.sqrt(3);
const COS15 = (Math.sqrt(6) + Math.sqrt(2)) / 4;

const V1: MonoPitchRoofSpec = {
  type: 'mono-pitch',
  id: 'template:mono-demo',
  buildingLengthMm: 6000,
  runMm: 4000,
  pitchDeg: 15,
  lowEaveOverhangMm: 0,
  topEdge: 'abutment',
  highOverhangMm: 0,
  vergeOverhangMm: 0,
};

describe('mono-pitch V1 — the brief demonstration, 6 × 4 m at 15°', () => {
  const roof = resolveMonoPitchRoof(V1);

  it('rises 4000·tan 15° = 1071.797 mm between the bearing lines', () => {
    expect(roof.riseMm).toBeCloseTo(4000 * TAN15, 9);
    expect(roof.riseMm).toBeCloseTo(1071.79677, 4);
    expect(roof.bearingSlopeLengthMm).toBeCloseTo(4141.104722, 5);
    expect(monoPitchRiseMm(4000, 15)).toBeCloseTo(roof.riseMm, 12);
  });

  it('covers 24 m² in plan and 24 / cos 15° m² on the slope', () => {
    expect(roof.planAreaMm2).toBeCloseTo(24_000_000, 6);
    expect(roof.grossAreaMm2).toBeCloseTo(24_000_000 / COS15, 4);
    expect(roof.grossAreaMm2 / 1e6).toBeCloseTo(24.846628, 6);
  });

  it('is one plane with an eave, an abutment and two verges', () => {
    expect(roof.planes.map((plane) => plane.roofPlaneId)).toEqual([
      MONO_PITCH_PLANE_ID,
    ]);
    expect(roof.lines.map((line) => line.kind)).toEqual([
      'eave',
      'abutment',
      'verge',
      'verge',
    ]);
    expect(roof.lines.map((line) => line.lengthMm)).toEqual([
      6000,
      6000,
      expect.closeTo(4141.104722, 5),
      expect.closeTo(4141.104722, 5),
    ]);
    for (const line of roof.lines)
      expect(line.incidentPlaneIds).toEqual([MONO_PITCH_PLANE_ID]);
  });

  it('places the elevations relative to the low bearing line', () => {
    expect(roof.elevations).toEqual({
      lowBearingMm: 0,
      highBearingMm: expect.closeTo(1071.79677, 4),
      eaveMm: 0,
      topMm: expect.closeTo(1071.79677, 4),
    });
  });

  it('answers only the surface — framing, fabrication, covering and drainage are not supported', () => {
    expect(roof.scope).toBe(MONO_PITCH_SOLVER_SCOPE);
    expect(MONO_PITCH_SOLVER_SCOPE).toEqual({
      surfaceGeometry: 'supported',
      framing: 'not-supported',
      fabrication: 'not-supported',
      covering: 'not-supported',
      drainage: 'not-supported',
    });
    // No member, cut or support is invented.
    expect(Object.keys(roof).sort()).toEqual([
      'bearingSlopeLengthMm',
      'elevations',
      'grossAreaMm2',
      'lines',
      'planAreaMm2',
      'planes',
      'riseMm',
      'scope',
      'spec',
    ]);
  });
});

describe('mono-pitch V2 — low eave and verge overhangs', () => {
  const roof = resolveMonoPitchRoof({
    ...V1,
    lowEaveOverhangMm: 500,
    vergeOverhangMm: 300,
  });
  const [plane] = roof.planes;

  it('extends the plane horizontally and drops the eave below the bearing', () => {
    expect(roof.elevations.eaveMm).toBeCloseTo(-500 * TAN15, 9);
    expect(roof.elevations.eaveMm).toBeCloseTo(-133.974596, 5);
    expect(plane.widthMm).toBe(6600);
    expect(plane.slopeLengthMm).toBeCloseTo(4658.742812, 5);
    expect(roof.planAreaMm2).toBeCloseTo(29_700_000, 6);
    expect(roof.grossAreaMm2 / 1e6).toBeCloseTo(30.747703, 6);
  });

  it('keeps the rise between the bearing lines independent of overhangs', () => {
    expect(roof.riseMm).toBeCloseTo(1071.79677, 4);
    expect(roof.elevations.highBearingMm).toBeCloseTo(1071.79677, 4);
  });

  it('local frame: u along the eave, v uphill, round-trips every corner', () => {
    expect(plane.basis.normal.z).toBeCloseTo(COS15, 12);
    expect(plane.basis.vAxis.z).toBeGreaterThan(0);
    plane.polygon.forEach((local, index) => {
      const world = projectPlaneLocalToWorld(plane.basis, local);
      const expected = plane.worldPolygon[index]!;
      expect(world.x).toBeCloseTo(expected.x, 9);
      expect(world.y).toBeCloseTo(expected.y, 9);
      expect(world.z).toBeCloseTo(expected.z, 9);
    });
  });

  it('uses the gable frame: x across from the low plate, y along the building', () => {
    // VNext-7B-2: the same axes as gable/hip, so skeleton, 3D and the
    // section view read every roof alike.
    const eave = roof.lines.find((line) => line.kind === 'eave')!;
    expect(eave.start.x).toBeCloseTo(-500, 9);
    expect(eave.end.x).toBeCloseTo(-500, 9);
    // Walking −y along the eave, the roof (uphill, +x) is on the left.
    expect(eave.start.y).toBeGreaterThan(eave.end.y);
    expect(eave.outwardPlan).toEqual({ x: -1, y: 0 });
    expect(plane.basis.uAxis).toEqual({ x: 0, y: 1, z: 0 });
    expect(plane.basis.normal.x).toBeLessThan(0);
    expect(plane.basis.normal.z).toBeGreaterThan(0);
  });
});

describe('mono-pitch V3 — free top edge at 10°', () => {
  const roof = resolveMonoPitchRoof({
    ...V1,
    pitchDeg: 10,
    lowEaveOverhangMm: 600,
    topEdge: 'free',
    highOverhangMm: 400,
    vergeOverhangMm: 250,
    lowBearingElevationMm: 2600,
  });

  it('matches the hand-checked vector', () => {
    expect(roof.riseMm).toBeCloseTo(705.307923, 5);
    expect(roof.planes[0].slopeLengthMm).toBeCloseTo(5077.133059, 5);
    expect(roof.grossAreaMm2 / 1e6).toBeCloseTo(33.001365, 6);
  });

  it('ends in a top edge (a mono-pitch ridge) and adds the datum', () => {
    expect(roof.lines[1]!.kind).toBe('ridge');
    expect(roof.elevations).toEqual({
      lowBearingMm: 2600,
      highBearingMm: expect.closeTo(2600 + 705.307923, 5),
      eaveMm: expect.closeTo(2600 - 105.796188, 5),
      topMm: expect.closeTo(2600 + 775.838715, 5),
    });
  });
});

describe('mono-pitch from wall heights (V4) and invalid input (V5, V6)', () => {
  it('derives the pitch as the exact inverse of rise = run · tan(pitch)', () => {
    const { pitchDeg, riseMm } = monoPitchFromBearingElevations({
      lowMm: 2600,
      highMm: 3400,
      runMm: 4000,
    });
    expect(pitchDeg).toBeCloseTo(11.309932474, 8);
    expect(riseMm).toBe(800);
    const roof = resolveMonoPitchRoof({ ...V1, pitchDeg });
    expect(roof.riseMm).toBeCloseTo(800, 9);
    expect(roof.bearingSlopeLengthMm).toBeCloseTo(4079.215611, 5);
  });

  it('refuses a high side that does not rise or an out-of-range pitch', () => {
    expect(() =>
      monoPitchFromBearingElevations({
        lowMm: 3000,
        highMm: 3000,
        runMm: 4000,
      }),
    ).toThrow('not_rising');
    expect(() =>
      monoPitchFromBearingElevations({ lowMm: 0, highMm: 10, runMm: 4000 }),
    ).toThrow('pitch_out_of_range');
    expect(() =>
      monoPitchFromBearingElevations({
        lowMm: Number.NaN,
        highMm: 10,
        runMm: 4000,
      }),
    ).toThrow('invalid_elevation');
  });

  it('rejects an overhang beyond a wall the roof abuts', () => {
    const result = monoPitchRoofSpecSchema.safeParse({
      ...V1,
      highOverhangMm: 200,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['highOverhangMm'],
        message: 'abutment_overhang',
      }),
    ]);
    expect(() =>
      resolveMonoPitchRoof({ ...V1, highOverhangMm: 200 }),
    ).toThrow();
  });

  it('rejects pitches and sizes outside the gable/hip ranges', () => {
    for (const bad of [
      { pitchDeg: 0.5 },
      { pitchDeg: 85 },
      { runMm: 0 },
      { buildingLengthMm: 200_000 },
      { vergeOverhangMm: -1 },
      { id: 'mono' },
    ])
      expect(monoPitchRoofSpecSchema.safeParse({ ...V1, ...bad }).success).toBe(
        false,
      );
  });
});
