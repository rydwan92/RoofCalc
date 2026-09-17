import { describe, expect, it } from 'vitest';
import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';
import {
  assemblyDefaults,
  convertRoofTemplate,
  gableTemplateFromAssembly,
} from '@cieslacalc/roof-math';
import {
  reconcilePlaneScopes,
  staleRoofPlaneReferences,
  uncoveredRoofPlaneIds,
} from './plane-scope';

const gable = gableTemplateFromAssembly(assemblyDefaults);
const hip = convertRoofTemplate(gable, 'hip');
const HIP = [
  'roof-plane:left',
  'roof-plane:right',
  'roof-plane:front',
  'roof-plane:rear',
];
const GABLE = ['roof-plane:left', 'roof-plane:right'];

// Only the plane scope matters here; the product is opaque to reconciliation.
const covering = (id: string, roofPlaneIds: string[]) =>
  ({ id, roofPlaneIds, product: {} }) as unknown as CoveringAssignmentSpec;

describe('reconcilePlaneScopes', () => {
  it('keeps a whole-roof covering whole when hip becomes gable and back', () => {
    const toGable = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: gable,
      coverings: [covering('covering:tile', HIP)],
      buildUp: {},
    });
    expect(toGable.coverings[0]!.roofPlaneIds).toEqual(GABLE);
    const toHip = reconcilePlaneScopes({
      previousTemplate: gable,
      nextTemplate: hip,
      coverings: toGable.coverings,
      buildUp: {},
    });
    expect(toHip.coverings[0]!.roofPlaneIds).toEqual(HIP);
    expect(toHip.changes).toEqual([
      { kind: 'covering-extended-to-roof', assignmentId: 'covering:tile' },
    ]);
  });

  it('narrows a subset to surviving planes', () => {
    const result = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: gable,
      coverings: [
        covering('covering:a', ['roof-plane:left', 'roof-plane:front']),
      ],
      buildUp: {},
    });
    expect(result.coverings[0]!.roofPlaneIds).toEqual(['roof-plane:left']);
    expect(result.changes[0]).toMatchObject({
      kind: 'covering-narrowed',
      removed: ['roof-plane:front'],
    });
  });

  it('moves a covering that lost every plane to free planes, never duplicating ownership', () => {
    const result = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: gable,
      coverings: [
        covering('covering:a', ['roof-plane:left']),
        covering('covering:b', ['roof-plane:front']),
      ],
      buildUp: {},
    });
    expect(result.coverings.map((item) => item.roofPlaneIds)).toEqual([
      ['roof-plane:left'],
      ['roof-plane:right'],
    ]);
  });

  it('removes and reports a covering with no plane left to own', () => {
    const result = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: gable,
      coverings: [
        covering('covering:a', ['roof-plane:left', 'roof-plane:right']),
        covering('covering:b', ['roof-plane:front', 'roof-plane:rear']),
      ],
      buildUp: {},
    });
    expect(result.coverings.map((item) => item.id)).toEqual(['covering:a']);
    expect(result.changes).toContainEqual({
      kind: 'covering-removed',
      assignmentId: 'covering:b',
    });
  });

  it('resets whole-roof or emptied layer scopes and leaves unscoped layers untouched', () => {
    const buildUp = {
      membrane: { enabled: true },
      counterBattens: {
        enabled: true,
        roofPlaneIds: GABLE,
        widthMm: 50,
        heightMm: 30,
      },
      battenLayout: {
        enabled: true,
        mode: 'auto-from-covering' as const,
        roofPlaneIds: ['roof-plane:left'],
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
      },
    };
    const toHip = reconcilePlaneScopes({
      previousTemplate: gable,
      nextTemplate: hip,
      coverings: [],
      buildUp,
    });
    expect(toHip.buildUp.membrane).toEqual({ enabled: true });
    expect(toHip.buildUp.counterBattens?.roofPlaneIds).toBeUndefined();
    expect(toHip.buildUp.counterBattens?.widthMm).toBe(50);
    expect(toHip.buildUp.battenLayout?.roofPlaneIds).toEqual([
      'roof-plane:left',
    ]);

    const emptied = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: gable,
      coverings: [],
      buildUp: {
        battenLayout: {
          ...buildUp.battenLayout,
          roofPlaneIds: ['roof-plane:rear'],
        },
      },
    });
    expect(emptied.buildUp.battenLayout?.roofPlaneIds).toBeUndefined();
    expect(emptied.changes).toEqual([
      { kind: 'layer-scope-reset', layer: 'battenLayout' },
    ]);
  });

  it('is a no-op when the roof type does not change', () => {
    const coverings = [covering('covering:a', ['roof-plane:front'])];
    const result = reconcilePlaneScopes({
      previousTemplate: hip,
      nextTemplate: hip,
      coverings,
      buildUp: {},
    });
    expect(result.coverings).toEqual(coverings);
    expect(result.changes).toEqual([]);
  });
});

describe('scope diagnostics', () => {
  it('lists uncovered planes and stale references', () => {
    const coverings = [covering('covering:a', HIP)];
    expect(uncoveredRoofPlaneIds(hip, [covering('c', GABLE)])).toEqual([
      'roof-plane:front',
      'roof-plane:rear',
    ]);
    expect(
      staleRoofPlaneReferences(gable, coverings, {
        battenLayout: {
          enabled: true,
          roofPlaneIds: ['roof-plane:front'],
          battenHeightMm: 40,
          battenWidthMm: 60,
          gaugeMm: 350,
          eaveOffsetMm: 250,
        },
      }),
    ).toEqual(['roof-plane:front', 'roof-plane:rear']);
  });
});
