import { describe, expect, it } from 'vitest';
import {
  resolveRoofSurfaceGeometry,
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import { resolveRoofFeatureTopology } from '@cieslacalc/roof-math';
import {
  planeFeatureEdges,
  regularCourseGauge,
  tileToneIndex,
} from './covering-scheme-geometry';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';

const gable = gableTemplateFromAssembly(assemblyDefaults);
const hip = convertRoofTemplate(gable, 'hip');

const kinds = (template: RoofTemplateSpec, id: string) =>
  planeFeatureEdges(
    resolveRoofFeatureTopology(resolveRoofSurfaceGeometry({ template })),
    id,
  )
    .map((edge) => edge.kind)
    .sort();

describe('planeFeatureEdges (canonical roof features in the drawing)', () => {
  it('gable plane: eave, ridge and two verges', () => {
    expect(kinds(gable, 'roof-plane:left')).toEqual([
      'eave',
      'ridge',
      'verge',
      'verge',
    ]);
  });

  it('hip planes: eave plus hips, and a ridge on the long planes', () => {
    const left = kinds(hip, 'roof-plane:left');
    expect(left.filter((kind) => kind === 'eave')).toHaveLength(1);
    expect(left.filter((kind) => kind === 'hip')).toHaveLength(2);
    expect(kinds(hip, 'roof-plane:front')).toEqual(
      expect.arrayContaining(['eave', 'hip', 'hip']),
    );
    expect(kinds(hip, 'roof-plane:front')).not.toContain('verge');
  });

  it('a shared ridge is one feature drawn on both planes', () => {
    const topology = resolveRoofFeatureTopology(
      resolveRoofSurfaceGeometry({ template: gable }),
    );
    const ridgeOn = (id: string) =>
      planeFeatureEdges(topology, id).find((edge) => edge.kind === 'ridge')!
        .featureId;
    expect(ridgeOn('roof-plane:left')).toBe(ridgeOn('roof-plane:right'));
    expect(planeFeatureEdges(topology, 'unknown')).toEqual([]);
  });
});

describe('presentation helpers', () => {
  it('tone index is deterministic and bounded', () => {
    expect(tileToneIndex('tile:a:1')).toBe(tileToneIndex('tile:a:1'));
    for (const id of ['a', 'b', 'tile:x:roof-plane:left:3:1:7'])
      expect(tileToneIndex(id)).toBeGreaterThanOrEqual(0);
    expect(tileToneIndex('anything', 3)).toBeLessThan(3);
  });

  it('reports a regular gauge only when every gap agrees', () => {
    expect(regularCourseGauge([250, 651.7, 1053.4])).toBeCloseTo(401.7, 1);
    expect(regularCourseGauge([0, 300, 700])).toBeUndefined();
    expect(regularCourseGauge([100])).toBeUndefined();
  });
});
