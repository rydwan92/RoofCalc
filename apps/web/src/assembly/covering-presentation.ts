import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';

const PLANE_KEYS: Record<string, string> = {
  'roof-plane:left': 'assembly.roofPlaneName.left',
  'roof-plane:right': 'assembly.roofPlaneName.right',
  'roof-plane:front': 'assembly.roofPlaneName.front',
  'roof-plane:rear': 'assembly.roofPlaneName.rear',
};

/** Compact plane words used inside dense context/inline strings. */
const PLANE_SHORT_KEYS: Record<string, string> = {
  'roof-plane:left': 'assembly.left',
  'roof-plane:right': 'assembly.right',
  'roof-plane:front': 'assembly.front',
  'roof-plane:rear': 'assembly.rear',
};

export function roofPlaneLabelKey(roofPlaneId: string) {
  return PLANE_KEYS[roofPlaneId] ?? 'assembly.roofPlaneName.generic';
}

/**
 * Single presentation boundary between an opaque roof-plane ID and its short
 * label. UI must never build a translation key by slicing the ID: an unknown
 * plane (a future second structure, an imported document) has to fall back to
 * a translated generic instead of rendering a missing key.
 */
export function roofPlaneShortLabelKey(roofPlaneId: string) {
  return PLANE_SHORT_KEYS[roofPlaneId] ?? 'assembly.roofPlaneName.generic';
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
