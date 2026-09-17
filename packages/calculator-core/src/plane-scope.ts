import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';
import { roofPlaneIds } from '@cieslacalc/roof-math';
import type { RoofBuildUp, RoofTemplateSpec } from '@cieslacalc/timber-model';

/**
 * V46 plane-scope reconciliation.
 *
 * Roof-plane IDs are owned by the roof template (`roof-math`): a gable roof
 * has `left/right`, a hip roof `left/right/front/rear`. Coverings and build-up
 * layers store plane lists, so an explicit roof-type change used to leave
 * them pointing at planes that no longer exist ("Nie znaleziono przypisanej
 * połaci") or covering only half of the new roof.
 *
 * Rules (intent-preserving, deterministic, never invents a product):
 * - a scope that covered **every** plane of the previous roof covers every
 *   plane of the next roof (whole-roof intent survives the switch);
 * - a subset keeps only the planes that still exist;
 * - a covering whose subset disappears takes the next roof's planes that no
 *   other covering owns; if none are free it is removed and reported;
 * - a build-up layer whose subset disappears returns to whole-roof scope
 *   (`roofPlaneIds` absent), because an empty layer scope has no meaning.
 */
export type PlaneScopeChange =
  | { kind: 'covering-extended-to-roof'; assignmentId: string }
  | { kind: 'covering-narrowed'; assignmentId: string; removed: string[] }
  | { kind: 'covering-moved-to-free-planes'; assignmentId: string }
  | { kind: 'covering-removed'; assignmentId: string }
  | {
      kind: 'layer-scope-reset';
      layer: 'membrane' | 'counterBattens' | 'battenLayout';
    };

export interface PlaneScopeReconciliation {
  coverings: CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
  changes: PlaneScopeChange[];
}

const coversAll = (ids: readonly string[], all: readonly string[]) =>
  all.length > 0 && all.every((id) => ids.includes(id));

export function reconcilePlaneScopes(args: {
  previousTemplate: RoofTemplateSpec;
  nextTemplate: RoofTemplateSpec;
  coverings: readonly CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
}): PlaneScopeReconciliation {
  const previous = roofPlaneIds(args.previousTemplate);
  const next = roofPlaneIds(args.nextTemplate);
  const changes: PlaneScopeChange[] = [];

  // Pass 1: whole-roof and surviving subsets.
  const staged = args.coverings.map((assignment) => {
    if (coversAll(assignment.roofPlaneIds, previous)) {
      const extended = !coversAll(assignment.roofPlaneIds, next);
      if (extended || assignment.roofPlaneIds.some((id) => !next.includes(id)))
        changes.push({
          kind: 'covering-extended-to-roof',
          assignmentId: assignment.id,
        });
      return { assignment, planes: [...next] };
    }
    const kept = assignment.roofPlaneIds.filter((id) => next.includes(id));
    const removed = assignment.roofPlaneIds.filter((id) => !next.includes(id));
    if (removed.length && kept.length)
      changes.push({
        kind: 'covering-narrowed',
        assignmentId: assignment.id,
        removed,
      });
    return { assignment, planes: kept };
  });

  // Pass 2: a covering that lost every plane takes free planes, in order.
  const owned = new Set(staged.flatMap((item) => item.planes));
  const coverings: CoveringAssignmentSpec[] = [];
  for (const item of staged) {
    if (item.planes.length) {
      coverings.push({ ...item.assignment, roofPlaneIds: item.planes });
      continue;
    }
    const free = next.filter((id) => !owned.has(id));
    if (!free.length) {
      changes.push({
        kind: 'covering-removed',
        assignmentId: item.assignment.id,
      });
      continue;
    }
    free.forEach((id) => owned.add(id));
    changes.push({
      kind: 'covering-moved-to-free-planes',
      assignmentId: item.assignment.id,
    });
    coverings.push({ ...item.assignment, roofPlaneIds: free });
  }

  const layer = <T extends { roofPlaneIds?: string[] }>(
    name: 'membrane' | 'counterBattens' | 'battenLayout',
    spec: T | undefined,
  ): T | undefined => {
    if (!spec?.roofPlaneIds) return spec;
    const { roofPlaneIds: ids, ...rest } = spec;
    const kept = ids.filter((id) => next.includes(id));
    if (coversAll(ids, previous) || !kept.length) {
      if (coversAll(ids, previous) && coversAll(ids, next)) return spec;
      changes.push({ kind: 'layer-scope-reset', layer: name });
      return rest as T;
    }
    return kept.length === ids.length ? spec : { ...spec, roofPlaneIds: kept };
  };

  const buildUp: RoofBuildUp = { ...args.buildUp };
  for (const name of ['membrane', 'counterBattens', 'battenLayout'] as const) {
    if (!(name in args.buildUp)) continue;
    const value = layer(name, args.buildUp[name]);
    if (value) (buildUp as Record<string, unknown>)[name] = value;
  }
  return { coverings, buildUp, changes };
}

/** Planes of the current roof that no primary covering owns. */
export function uncoveredRoofPlaneIds(
  template: RoofTemplateSpec,
  coverings: readonly CoveringAssignmentSpec[],
): string[] {
  const owned = new Set(coverings.flatMap((item) => item.roofPlaneIds));
  return roofPlaneIds(template).filter((id) => !owned.has(id));
}

/** Plane IDs stored in the project that the current roof does not have. */
export function staleRoofPlaneReferences(
  template: RoofTemplateSpec,
  coverings: readonly CoveringAssignmentSpec[],
  buildUp: RoofBuildUp,
): string[] {
  const known = new Set(roofPlaneIds(template));
  const referenced = [
    ...coverings.flatMap((item) => item.roofPlaneIds),
    ...(buildUp.membrane?.roofPlaneIds ?? []),
    ...(buildUp.counterBattens?.roofPlaneIds ?? []),
    ...(buildUp.battenLayout?.roofPlaneIds ?? []),
  ];
  return [...new Set(referenced.filter((id) => !known.has(id)))].sort();
}
