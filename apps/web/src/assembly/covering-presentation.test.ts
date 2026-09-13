import { describe, expect, it } from 'vitest';
import {
  coveringKindLabelKey,
  installationModeLabelKey,
  roofPlaneLabelKey,
} from './covering-presentation';

describe('covering presentation boundaries', () => {
  it('maps stable roof-plane IDs to human label keys in one place', () => {
    expect(roofPlaneLabelKey('roof-plane:left')).toBe(
      'assembly.roofPlaneName.left',
    );
    expect(roofPlaneLabelKey('roof-plane:rear')).toBe(
      'assembly.roofPlaneName.rear',
    );
  });

  it('does not expose the manual installation-mode ID as its normal label', () => {
    expect(installationModeLabelKey('manual-standard')).toBe(
      'assembly.installationModeStandard',
    );
  });

  it('names a cut-to-length metal product from its technical length model', () => {
    expect(
      coveringKindLabelKey({
        id: 'a',
        roofPlaneIds: ['opaque-plane-81'],
        product: {
          technicalSpecSnapshot: {
            schemaVersion: 1,
            kind: 'modular-sheet',
            effectiveWidthMm: 1100,
            moduleLengthMm: 350,
            lengthModel: {
              kind: 'cut-to-length',
              minPanelLengthMm: 500,
              maxPanelLengthMm: 6000,
            },
          },
        },
      }),
    ).toBe('assembly.cutToLengthSheet');
  });
});
