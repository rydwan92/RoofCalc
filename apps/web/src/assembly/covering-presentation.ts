import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';

const PLANE_KEYS: Record<string, string> = {
  'roof-plane:left': 'assembly.roofPlaneName.left',
  'roof-plane:right': 'assembly.roofPlaneName.right',
  'roof-plane:front': 'assembly.roofPlaneName.front',
  'roof-plane:rear': 'assembly.roofPlaneName.rear',
};

export function roofPlaneLabelKey(roofPlaneId: string) {
  return PLANE_KEYS[roofPlaneId] ?? 'assembly.roofPlaneName.generic';
}

export function coveringKindLabelKey(assignment: CoveringAssignmentSpec) {
  const spec = assignment.product.technicalSpecSnapshot;
  return spec.kind === 'modular-sheet'
    ? spec.lengthModel.kind === 'cut-to-length'
      ? 'assembly.cutToLengthSheet'
      : 'assembly.manualModularSheet'
    : spec.kind === 'roof-tile'
      ? 'assembly.manualRoofTile'
      : 'assembly.manualStandingSeam';
}

export function installationModeLabelKey(modeId: string) {
  return modeId === 'manual-standard'
    ? 'assembly.installationModeStandard'
    : 'assembly.installationModeNamed';
}
