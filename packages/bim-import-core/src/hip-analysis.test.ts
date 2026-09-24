import { describe, expect, it } from 'vitest';
import { analyzeIfcRoof, type IfcRoofAnalysisInput } from './analysis';

/**
 * Regular hip, plan L × W metres, equal pitch. Vertices: four eave corners and
 * two ridge ends; faces: two trapezoids (2 triangles each) and two triangles.
 */
function hip(
  options: {
    length?: number;
    width?: number;
    pitch?: number;
    angle?: number;
    translation?: number;
    scale?: number;
    endRun?: number;
    ridgeZ?: number;
    dropFace?: 'end' | 'side';
    ridgeShift?: number;
  } = {},
): IfcRoofAnalysisInput {
  const {
    length = 12,
    width = 8,
    pitch = 35,
    angle = 0,
    translation = 0,
    scale = 1000,
    ridgeShift = 0,
  } = options;
  const h = width / 2;
  const endRun = options.endRun ?? h;
  const rise = options.ridgeZ ?? h * Math.tan((pitch * Math.PI) / 180);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const vertices = [
    [0, -h, 0], // 0 eave corner
    [length, -h, 0], // 1
    [length, h, 0], // 2
    [0, h, 0], // 3
    [endRun, ridgeShift, rise], // 4 ridge start
    [length - endRun, ridgeShift, rise], // 5 ridge end
  ];
  const positions = vertices.flatMap(([x, y, z]) => [
    ((x! * c - y! * s) * 1000) / scale + translation,
    ((x! * s + y! * c) * 1000) / scale - translation,
    (z! * 1000) / scale + translation,
  ]);
  const faces = {
    sideA: [0, 1, 5, 0, 5, 4],
    sideB: [2, 3, 4, 2, 4, 5],
    endA: [3, 0, 4],
    endB: [1, 2, 5],
  };
  const indices = [
    ...faces.sideA,
    ...(options.dropFace === 'side' ? [] : faces.sideB),
    ...(options.dropFace === 'end' ? [] : faces.endA),
    ...faces.endB,
  ];
  return {
    sourceRoof: {
      expressId: 11,
      name: 'Roof',
      sourceClass: 'IfcRoof',
      evidence: ['ifc-roof-class'],
    },
    sourceToMillimetres: scale,
    geometry: [{ positions, indices }],
  };
}

describe('regular hip analysis', () => {
  it.each([
    [0, 0, 1000],
    [(27 * Math.PI) / 180, 0, 1000],
    [0.9, 1e6, 1000],
    [0.4, 0, 1],
    [1.3, 250, 10],
  ])(
    'recognizes exact plan and pitch (rotation %s, translation %s, scale %s)',
    (angle, translation, scale) => {
      const result = analyzeIfcRoof(hip({ angle, translation, scale }));
      expect(result.status).toBe('supported');
      if (result.status !== 'supported') return;
      expect(result.roofType).toBe('hip');
      expect(result.proposed.buildingLengthMm).toBeCloseTo(12000, 3);
      expect(result.proposed.buildingWidthMm).toBeCloseTo(8000, 3);
      expect(result.proposed.pitchDeg).toBeCloseTo(35, 6);
      expect(result.geometry.ridgeLengthMm).toBeCloseTo(4000, 3);
      expect(result.evidence).toEqual(
        expect.arrayContaining(['four-planar-faces', 'consistent-hip-edges']),
      );
    },
  );

  it('keeps recognizing gables as gables', () => {
    const gable = hip({ endRun: 0 });
    // Ridge at the gable ends: the end triangles collapse into vertical walls.
    const result = analyzeIfcRoof({
      ...gable,
      geometry: [
        {
          positions: gable.geometry[0]!.positions,
          indices: [0, 1, 5, 0, 5, 4, 2, 3, 4, 2, 4, 5],
        },
      ],
    });
    expect(result).toMatchObject({ status: 'supported', roofType: 'gable' });
  });

  it.each([
    ['steeper hip ends', { endRun: 3 }],
    ['pyramid without ridge', { length: 8 }],
    ['missing hip-end face', { dropFace: 'end' as const }],
    ['missing side face', { dropFace: 'side' as const }],
    ['off-centre ridge', { ridgeShift: 0.5 }],
  ])('rejects %s', (_name, options) => {
    expect(analyzeIfcRoof(hip(options)).status).not.toBe('supported');
  });

  it('rejects a folded (non-planar) face', () => {
    const input = hip();
    const positions = Array.from(input.geometry[0]!.positions);
    const indices = Array.from(input.geometry[0]!.indices);
    // Add a vertex in the middle of side A, lifted off its plane.
    positions.push(6000, -2000, 1600);
    const extra = positions.length / 3 - 1;
    indices.splice(0, 6, 0, 1, extra, 1, 5, extra, 5, 4, extra, 4, 0, extra);
    expect(
      analyzeIfcRoof({ ...input, geometry: [{ positions, indices }] }).status,
    ).not.toBe('supported');
  });
});

describe('IFC reference placement', () => {
  it('places a rotated, translated hip onto the RoofCalc frame rigidly', async () => {
    const { placeIfcRoofReference } = await import('./reference');
    const input = hip({ angle: 0.7, translation: 5e5, scale: 1 });
    const analysis = analyzeIfcRoof(input);
    if (analysis.status !== 'supported') throw new Error('expected hip');
    const placed = placeIfcRoofReference(input, analysis, {
      buildingLengthMm: 11000,
      ridgeLevelMm: 3500,
    })!;
    const points = Array.from({ length: placed.positions.length / 3 }, (_, i) =>
      Array.from(placed.positions.slice(i * 3, i * 3 + 3)),
    );
    const ridge = points.filter((p) => Math.abs(p[2]! - 3500) < 1);
    expect(ridge).toHaveLength(2);
    for (const [x] of ridge) expect(x).toBeCloseTo(0, 0);
    expect(ridge.map((p) => p[1]!).sort((a, b) => a - b)).toEqual([
      expect.closeTo(5500 - 2000, 0),
      expect.closeTo(5500 + 2000, 0),
    ]);
    const xs = points.map((p) => p[0]!);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(8000, 0);
    expect(placed.outline).toEqual({
      lengthMm: expect.closeTo(12000, 3),
      widthMm: expect.closeTo(8000, 3),
    });
    expect(placed.ridgeLengthMm).toBeCloseTo(4000, 3);
  });
});
