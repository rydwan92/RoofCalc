import {
  resolveRoofFeatureTopology,
  type ResolvedRoofFeature,
  type RoofFeatureTopology,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import {
  createManualDrainageSystem,
  resolveDrainagePlan,
  resolveRoofLineComponents,
  type DrainageIntent,
  type DrainagePlan,
  type RoofLineComponentRequirement,
  type RoofSystemIntent,
} from '@cieslacalc/roof-system-core';
import type { RoofLineLengths } from '@cieslacalc/tile-procurement';

/**
 * V51 application boundary for the complete roof system.
 *
 * One resolved topology (from `roof-math`) feeds the covering drawing, the V50
 * tile accessories, line components and drainage. Material Plan, cost,
 * readiness and documents read the `RoofSystemFacts` produced here; none of
 * them re-derives an edge, a run or a count.
 */
export interface RoofSystemFacts {
  topology: RoofFeatureTopology;
  eaves: ResolvedRoofFeature[];
  intent?: RoofSystemIntent;
  drainage: DrainagePlan;
  lineComponents: RoofLineComponentRequirement[];
}

export function resolveRoofSystemFacts(args: {
  surface: RoofSurfaceGeometryResult;
  intent: RoofSystemIntent | undefined;
  topology?: RoofFeatureTopology;
}): RoofSystemFacts {
  const topology = args.topology ?? resolveRoofFeatureTopology(args.surface);
  const eaves = topology.features.filter((feature) => feature.kind === 'eave');
  return {
    topology,
    eaves,
    ...(args.intent ? { intent: args.intent } : {}),
    drainage: resolveDrainagePlan({
      eaves: eaves.map((eave) => ({
        id: eave.id,
        ordinal: eave.ordinal,
        lengthMm: eave.lengthMm,
      })),
      corners: topology.eaveCorners.map((corner) => ({
        id: corner.id,
        endingEaveId: corner.endingEaveId,
        startingEaveId: corner.startingEaveId,
        kind: corner.kind,
      })),
      intent: args.intent?.drainage,
    }),
    lineComponents: resolveRoofLineComponents({
      features: topology.features,
      components: args.intent?.lineComponents ?? [],
    }),
  };
}

/**
 * V50 ridge/hip line lengths, now read from canonical features: one physical
 * line counted once. A line is owned by a covering assignment only when all
 * its incident planes are inside that assignment.
 */
export function roofLineLengthsFromFeatures(
  topology: RoofFeatureTopology,
  roofPlaneIds: readonly string[],
): RoofLineLengths {
  const touched = topology.features.filter(
    (feature) =>
      (feature.kind === 'ridge' || feature.kind === 'hip') &&
      feature.incidentPlaneIds.some((id) => roofPlaneIds.includes(id)),
  );
  const sum = (kind: 'ridge' | 'hip') =>
    touched
      .filter((feature) => feature.kind === kind)
      .reduce((total, feature) => total + feature.lengthMm, 0);
  const planeIds = new Set(
    topology.planeEdges.map((plane) => plane.roofPlaneId),
  );
  return {
    ridgeMm: sum('ridge'),
    hipMm: sum('hip'),
    complete:
      planeIds.size > 0 &&
      [...planeIds].every((id) => roofPlaneIds.includes(id)) &&
      touched.every((feature) =>
        feature.incidentPlaneIds.every((id) => roofPlaneIds.includes(id)),
      ),
  };
}

/** Generated display label for a canonical eave: O1, O2 … (never parsed). */
export function eaveLabel(feature: Pick<ResolvedRoofFeature, 'ordinal'>) {
  return `O${feature.ordinal}`;
}

/** The first-run drainage intent: enabled, AUTO layout, no system yet. */
export function initialDrainageIntent(): DrainageIntent {
  return { enabled: true, mode: 'auto' };
}

export function withDrainage(
  intent: RoofSystemIntent | undefined,
  drainage: DrainageIntent | undefined,
): RoofSystemIntent | undefined {
  const next: RoofSystemIntent = { ...intent };
  if (drainage) next.drainage = drainage;
  else delete next.drainage;
  return next.drainage || next.lineComponents?.length ? next : undefined;
}

/**
 * Switching from AUTO to manual freezes what AUTO proposed — every eave and
 * the proposed corner connections become explicit decisions — so the user
 * edits from what they saw, never from an empty layout.
 */
export function freezeAutoLayout(
  drainage: DrainageIntent,
  plan: DrainagePlan,
): DrainageIntent {
  if (drainage.mode === 'manual') return drainage;
  return {
    ...drainage,
    mode: 'manual',
    gutteredEaveIds: [...plan.gutteredEaveIds],
    corners: plan.corners
      .filter((corner) => corner.source !== 'none')
      .map((corner) => ({
        endingEaveId: corner.endingEaveId,
        startingEaveId: corner.startingEaveId,
        connection: corner.state === 'connected' ? 'connected' : 'separate',
      })),
  };
}

export { createManualDrainageSystem };
