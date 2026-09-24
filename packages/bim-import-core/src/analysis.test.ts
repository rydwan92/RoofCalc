import { describe, expect, it } from 'vitest';
import { analyzeIfcRoof, type IfcRoofAnalysisInput } from './analysis';

function gable(angle = 0, translation = 0, scale = 1000): IfcRoofAnalysisInput {
  const rise = 4 * Math.tan((35 * Math.PI) / 180);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const positions = [
    [-4, -6, 0],
    [0, -6, rise],
    [0, 6, rise],
    [-4, 6, 0],
    [4, -6, 0],
    [4, 6, 0],
  ].flatMap(([x, y, z]) => [
    ((x! * c - y! * s) * 1000) / scale + translation,
    ((x! * s + y! * c) * 1000) / scale - translation,
    (z! * 1000) / scale + translation,
  ]);
  return {
    sourceRoof: {
      expressId: 7,
      name: 'Not a shape hint',
      sourceClass: 'IfcRoof',
      evidence: [],
    },
    sourceToMillimetres: scale,
    geometry: [{ positions, indices: [0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 5, 2] }],
  };
}

describe('conservative gable analysis', () => {
  it.each([
    [0, 0, 1000],
    [(33 * Math.PI) / 180, 0, 1000],
    [0, 1e9, 1000],
    [0.6, 1e9, 1],
    [0.6, 0, 10],
  ])(
    'recognizes physical dimensions (rotation %s, translation %s, scale %s)',
    (angle, translation, scale) => {
      const result = analyzeIfcRoof(gable(angle, translation, scale));
      expect(result.status).toBe('supported');
      if (result.status !== 'supported') throw new Error('Expected gable');
      expect(result.proposed.buildingLengthMm).toBeCloseTo(12000, 2);
      expect(result.proposed.buildingWidthMm).toBeCloseTo(8000, 2);
      expect(result.proposed.pitchDeg).toBeCloseTo(35, 4);
      expect(result.geometry.halfRunMm).toBeCloseTo(4000, 2);
      expect(
        result.geometry.ridgeLevelMm - result.geometry.eaveLevelMm,
      ).toBeCloseTo(2800.830152839, 2);
    },
  );
  it('rejects a pyramid even with misleading GABLE_ROOF semantics', () => {
    const input = gable();
    input.semanticEvidence = ['GABLE_ROOF'];
    input.geometry = [
      {
        positions: [-4, -4, 0, 4, -4, 0, 4, 4, 0, -4, 4, 0, 0, 0, 3],
        indices: [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4],
      },
    ];
    expect(analyzeIfcRoof(input)).toMatchObject({
      status: 'unsupported',
      reason: 'unsupported-roof-shape',
    });
  });
  it.each([undefined, 0, -1, NaN, Infinity])(
    'blocks unknown/invalid units: %s',
    (scale) => {
      expect(
        analyzeIfcRoof({ ...gable(), sourceToMillimetres: scale }),
      ).toMatchObject({ status: 'ambiguous', reason: 'missing-units' });
    },
  );
  it('does not guess from insufficient geometry or a bounding box', () => {
    expect(analyzeIfcRoof({ ...gable(), geometry: [] })).toMatchObject({
      reason: 'insufficient-geometry',
    });
    const input = gable();
    input.geometry = [{ ...input.geometry[0]!, indices: [0, 1, 2] }];
    expect(analyzeIfcRoof(input).status).not.toBe('supported');
  });
  it('rejects missing patches even when extreme vertices remain', () => {
    const input = gable();
    input.geometry = [
      { ...input.geometry[0]!, indices: [0, 1, 2, 0, 2, 3, 1, 4, 5, 1, 4, 5] },
    ];
    expect(analyzeIfcRoof(input).status).not.toBe('supported');
  });
  it('rejects malformed indices and nonfinite coordinates without throwing', () => {
    const input = gable();
    for (const indices of [
      [0, 1, 999],
      [0, -1, 2],
      [0, 1.5, 2],
      [0, 1],
    ])
      expect(
        analyzeIfcRoof({
          ...input,
          geometry: [{ ...input.geometry[0]!, indices }],
        }).status,
      ).not.toBe('supported');
    expect(
      analyzeIfcRoof({
        ...input,
        geometry: [{ positions: [NaN, 0, 0], indices: [] }],
      }).status,
    ).not.toBe('supported');
  });
  it('rejects asymmetric slopes', () => {
    const input = gable();
    const positions = Array.from(input.geometry[0]!.positions);
    positions[3] = 1;
    positions[6] = 1;
    expect(
      analyzeIfcRoof({
        ...input,
        geometry: [{ ...input.geometry[0]!, positions }],
      }).status,
    ).not.toBe('supported');
  });
  it('rejects warped slopes', () => {
    const input = gable();
    const positions = Array.from(input.geometry[0]!.positions);
    positions[2] = 0.2;
    expect(
      analyzeIfcRoof({
        ...input,
        geometry: [{ ...input.geometry[0]!, positions }],
      }).status,
    ).not.toBe('supported');
  });
});
