import type {
  BattenLayoutSpec,
  CounterBattenLayoutSpec,
  MembraneLayerSpec,
  RoofSkeleton,
} from '@cieslacalc/timber-model';
import {
  counterBattenRowsOnPlane,
  summarizeCounterBattens,
  type CounterBattenLayoutResult,
} from './counter-battens';
import type { MonoPitchFraming } from './mono-pitch-framing';
import type { MonoPitchRoofGeometry } from './mono-pitch-roof';
import {
  resolveBattenLayoutOnPlanes,
  resolveMembraneLayoutOnPlanes,
  type BattenAutoSource,
  type BattenLayoutResult,
  type MembraneCourseProduct,
  type MembraneLayoutResult,
} from './roof-features';

/**
 * VNext-7B: battens on the mono-pitch plane through the one batten engine
 * (`resolveBattenLayoutOnPlanes`); `ridgeOffsetMm` is measured below the top
 * edge.
 */
export function resolveMonoPitchBattens(
  roof: MonoPitchRoofGeometry,
  layout: BattenLayoutSpec,
  autoSource?: BattenAutoSource,
): BattenLayoutResult {
  const [plane] = roof.planes;
  return resolveBattenLayoutOnPlanes({
    knownRoofPlaneIds: [plane.roofPlaneId],
    planeBasis: () => plane.basis,
    layout,
    autoSource,
  });
}

/** VNext-7B-2: membrane courses on the mono-pitch plane, one engine. */
export function resolveMonoPitchMembrane(
  roof: MonoPitchRoofGeometry,
  layout: MembraneLayerSpec,
  product: MembraneCourseProduct,
): MembraneLayoutResult {
  const [plane] = roof.planes;
  return resolveMembraneLayoutOnPlanes({
    knownRoofPlaneIds: [plane.roofPlaneId],
    planeBasis: () => plane.basis,
    layout,
    product,
  });
}

/**
 * VNext-7B-2: counter-battens along the mono-pitch rafters through the one
 * per-plane rule (`counterBattenRowsOnPlane`) and the one summary.
 */
export function resolveMonoPitchCounterBattens(
  framing: MonoPitchFraming,
  skeleton: RoofSkeleton,
  layout: CounterBattenLayoutSpec,
): CounterBattenLayoutResult {
  if (!layout.enabled)
    return { ...summarizeCounterBattens([], []), status: 'disabled' };
  if (
    !(Number.isFinite(layout.widthMm) && layout.widthMm > 0) ||
    !(Number.isFinite(layout.heightMm) && layout.heightMm > 0)
  )
    return summarizeCounterBattens(
      [],
      [{ code: 'invalid-counter-batten-section' }],
    );
  const [plane] = framing.surface.planes;
  const unknown = (layout.roofPlaneIds ?? []).filter(
    (id) => id !== plane.roofPlaneId,
  );
  if (layout.roofPlaneIds && !layout.roofPlaneIds.includes(plane.roofPlaneId))
    return summarizeCounterBattens(
      [],
      unknown.map((roofPlaneId) => ({
        code: 'unknown-roof-plane' as const,
        roofPlaneId,
      })),
    );
  const { rows, issues } = counterBattenRowsOnPlane({
    roofPlaneId: plane.roofPlaneId,
    basis: plane.basis,
    rafterSide: 'center',
    skeleton,
    layout,
  });
  return summarizeCounterBattens(rows, [
    ...issues,
    ...unknown.map((roofPlaneId) => ({
      code: 'unknown-roof-plane' as const,
      roofPlaneId,
    })),
  ]);
}
