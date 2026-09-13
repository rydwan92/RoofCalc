import { describe, expect, it } from 'vitest';
import {
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
});
