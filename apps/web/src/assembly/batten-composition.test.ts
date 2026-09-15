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

  it('keeps a missing installation mode explicit', () => {
    const assignment = {
      ...tileAssignment('covering:tile'),
      selectedInstallationModeId: undefined,
    };
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
