import { describe, expect, it } from 'vitest';
import {
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { resolveBattenAutoComposition } from './batten-composition';

const planes = ['roof-plane:left', 'roof-plane:right'];
const layout = {
  enabled: true,
  mode: 'auto-from-covering' as const,
  battenHeightMm: 40,
  battenWidthMm: 60,
  gaugeMm: 350,
  eaveOffsetMm: 250,
  ridgeOffsetMm: 0,
};

function tileAssignment(
  id: string,
  roofPlaneIds = planes,
): CoveringAssignmentSpec {
  return {
    id,
    roofPlaneIds,
    selectedInstallationModeId: 'standard',
    product: {
      technicalSpecSnapshot: {
        schemaVersion: 1,
        kind: 'roof-tile',
        installationModes: [
          {
            id: 'standard',
            coverWidthMm: 300,
            gaugeRangeMm: { min: 320, max: 380 },
          },
        ],
      },
    },
  };
}

describe('batten auto composition', () => {
  it('maps one trusted covering snapshot to neutral gauge constraints', () => {
    const assignment = tileAssignment('covering:tile');
    expect(
      resolveBattenAutoComposition({
        layout,
        assignments: [assignment],
        ownership: resolvePrimaryCoveringAssignments([assignment]),
        roofPlaneIds: planes,
      }),
    ).toMatchObject({
      assignmentId: assignment.id,
      source: {
        status: 'resolved',
        minimumGaugeMm: 320,
        maximumGaugeMm: 380,
      },
    });
  });

  it('does not silently use a covering that owns only some target planes', () => {
    const assignment = tileAssignment('covering:tile', ['roof-plane:left']);
    expect(
      resolveBattenAutoComposition({
        layout,
        assignments: [assignment],
        ownership: resolvePrimaryCoveringAssignments([assignment]),
        roofPlaneIds: planes,
      }),
    ).toMatchObject({
      reason: 'target-planes-not-covered',
      source: { status: 'missing' },
    });
  });

  it('returns a conflict instead of picking one overlapping assignment', () => {
    const first = tileAssignment('covering:a');
    const second = tileAssignment('covering:b');
    const assignments = [first, second];
    expect(
      resolveBattenAutoComposition({
        layout,
        assignments,
        ownership: resolvePrimaryCoveringAssignments(assignments),
        roofPlaneIds: planes,
      }),
    ).toMatchObject({
      reason: 'covering-source-conflict',
      source: { status: 'conflict' },
    });
  });

  it('requires explicit selection among multiple installation modes', () => {
    const assignment = {
      ...tileAssignment('covering:tile'),
      selectedInstallationModeId: undefined,
    };
    if (assignment.product.technicalSpecSnapshot.kind === 'roof-tile')
      assignment.product.technicalSpecSnapshot.installationModes.push({
        ...assignment.product.technicalSpecSnapshot.installationModes[0]!,
        id: 'alternative',
      });
    expect(
      resolveBattenAutoComposition({
        layout,
        assignments: [assignment],
        ownership: resolvePrimaryCoveringAssignments([assignment]),
        roofPlaneIds: planes,
      }),
    ).toMatchObject({
      reason: 'installation-mode-missing',
      source: { status: 'missing' },
    });
  });
});

/** VNext-9C: an asymmetric gable — each plane at its own pitch. */
describe('batten auto composition across two pitches', () => {
  const pitchOf = (roofPlaneId: string) =>
    roofPlaneId === 'roof-plane:right' ? 20 : 45;
  function ruledTile(
    flat: { min: number; max: number },
    steep: { min: number; max: number },
  ): CoveringAssignmentSpec {
    const assignment = tileAssignment('covering:tile');
    const spec = assignment.product.technicalSpecSnapshot;
    if (spec.kind !== 'roof-tile') throw new Error('expected a tile');
    return {
      ...assignment,
      product: {
        ...assignment.product,
        technicalSpecSnapshot: {
          ...spec,
          installationModes: [
            {
              ...spec.installationModes[0]!,
              gaugeRangeMm: {
                min: Math.min(flat.min, steep.min),
                max: Math.max(flat.max, steep.max),
              },
              installationRules: [
                {
                  id: 'flat',
                  pitchRangeDeg: { min: 10, max: 30 },
                  gaugeRangeMm: flat,
                },
                {
                  id: 'steep',
                  pitchRangeDeg: { min: 30, max: 60 },
                  gaugeRangeMm: steep,
                },
              ],
            },
          ],
        },
      },
    };
  }
  const compose = (assignment: CoveringAssignmentSpec) =>
    resolveBattenAutoComposition({
      layout,
      assignments: [assignment],
      ownership: resolvePrimaryCoveringAssignments([assignment]),
      roofPlaneIds: planes,
      roofPitchDeg: 45,
      pitchOf,
    });

  it('takes the gauges valid on both planes', () => {
    expect(
      compose(ruledTile({ min: 300, max: 350 }, { min: 330, max: 380 })),
    ).toMatchObject({
      source: { status: 'resolved', minimumGaugeMm: 330, maximumGaugeMm: 350 },
    });
  });

  it('says so when no single gauge suits both pitches', () => {
    expect(
      compose(ruledTile({ min: 280, max: 310 }, { min: 330, max: 380 })),
    ).toMatchObject({
      reason: 'pitch-gauges-differ',
      source: { status: 'missing' },
    });
  });
});
