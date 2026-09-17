import {
  deriveCoveringSupportCapability,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { roofPlaneIds } from '@cieslacalc/roof-math';
import type { RoofBuildUp, RoofTemplateSpec } from '@cieslacalc/timber-model';
import { battenLayerForWholeRoof, newBattenLayer } from './build-up-defaults';

/**
 * V46/V47 "Dopasuj pokrycie i łaty do dachu" — one explicit, undoable repair.
 *
 * It only changes *scope and ownership* and never an expert decision:
 * - a single primary covering takes every plane of the current roof
 *   (several coverings are a deliberate split and are only cleaned of
 *   planes that no longer exist);
 * - battens, counter-battens and membrane follow the whole roof;
 * - a batten layer that does not exist yet is created AUTO when the covering
 *   data can derive a gauge, or with the sheet's fixed support gauge; a layer
 *   that is switched off while a covering needs it is switched on;
 * - V47: a MANUAL gauge the user owns is never replaced — an incompatible
 *   manual gauge stays a separate, explicit "Dopasuj automatycznie" decision.
 *
 * What it cannot fix (a pitch below the product minimum, an ambiguous
 * installation mode, the H1 counter-batten detail) stays visible.
 */
export interface InstallationRepair {
  coverings: CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
  changed: boolean;
  changes: InstallationRepairChange[];
}

export type InstallationRepairChange =
  | { kind: 'covering-planes'; planeCount: number }
  | { kind: 'covering-stale-planes-removed'; planeCount: number }
  | { kind: 'battens-created-auto' }
  | { kind: 'battens-created-fixed-gauge'; gaugeMm: number }
  | { kind: 'battens-enabled' }
  | { kind: 'battens-whole-roof' }
  | { kind: 'counter-battens-whole-roof' }
  | { kind: 'membrane-whole-roof' };

function withoutScope<T extends { roofPlaneIds?: string[] }>(
  spec: T | undefined,
): T | undefined {
  if (!spec?.roofPlaneIds) return spec;
  const copy = { ...spec };
  delete copy.roofPlaneIds;
  return copy;
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function fitInstallationToRoof(args: {
  template: RoofTemplateSpec;
  coverings: readonly CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
}): InstallationRepair {
  const planes = roofPlaneIds(args.template);
  const changes: InstallationRepairChange[] = [];
  let coverings: CoveringAssignmentSpec[];
  if (args.coverings.length === 1) {
    const only = args.coverings[0]!;
    coverings = [{ ...only, roofPlaneIds: [...planes] }];
    if (!same(only.roofPlaneIds, planes))
      changes.push({ kind: 'covering-planes', planeCount: planes.length });
  } else {
    coverings = args.coverings
      .map((item) => ({
        ...item,
        roofPlaneIds: item.roofPlaneIds.filter((id) => planes.includes(id)),
      }))
      .filter((item) => item.roofPlaneIds.length > 0);
    const removed = args.coverings.reduce(
      (sum, item) =>
        sum + item.roofPlaneIds.filter((id) => !planes.includes(id)).length,
      0,
    );
    if (removed > 0)
      changes.push({
        kind: 'covering-stale-planes-removed',
        planeCount: removed,
      });
  }

  const primary = coverings.length === 1 ? coverings[0] : undefined;
  const capability = primary
    ? deriveCoveringSupportCapability(primary.product.technicalSpecSnapshot)
    : undefined;

  const existing = args.buildUp.battenLayout;
  let battenLayout = existing;
  if (capability?.requiresBattens || existing?.enabled) {
    if (!existing) {
      const fixed =
        !capability?.supportsAutoBattenGauge &&
        capability?.fixedSupportGaugeMm !== undefined
          ? capability.fixedSupportGaugeMm
          : undefined;
      battenLayout =
        fixed !== undefined
          ? { ...newBattenLayer(), mode: 'manual', gaugeMm: fixed }
          : newBattenLayer();
      changes.push(
        fixed !== undefined
          ? { kind: 'battens-created-fixed-gauge', gaugeMm: fixed }
          : { kind: 'battens-created-auto' },
      );
    } else {
      if (existing.roofPlaneIds) changes.push({ kind: 'battens-whole-roof' });
      if (!existing.enabled) changes.push({ kind: 'battens-enabled' });
      // The mode and a user-owned gauge are kept exactly as they were.
      battenLayout = { ...battenLayerForWholeRoof(existing), enabled: true };
    }
  }

  if (args.buildUp.counterBattens?.roofPlaneIds)
    changes.push({ kind: 'counter-battens-whole-roof' });
  if (args.buildUp.membrane?.roofPlaneIds)
    changes.push({ kind: 'membrane-whole-roof' });

  const buildUp: RoofBuildUp = {
    ...args.buildUp,
    ...(battenLayout ? { battenLayout } : {}),
    ...(args.buildUp.counterBattens
      ? { counterBattens: withoutScope(args.buildUp.counterBattens) }
      : {}),
    ...(args.buildUp.membrane
      ? { membrane: withoutScope(args.buildUp.membrane) }
      : {}),
  };
  const changed =
    !same(coverings, args.coverings) || !same(buildUp, args.buildUp);
  return { coverings, buildUp, changed, changes: changed ? changes : [] };
}

/**
 * V46 product flow: GEOMETRY → COVERING → AUTOMATIC BATTENS. The first time a
 * batten-supported covering appears in a project whose batten layer was
 * never configured, the layer is created in the same history entry, so the
 * user sees tiles laid on battens instead of an empty plane. A layer the
 * user has already configured (including switched off) is never touched.
 */
export function withBattensForNewCovering(
  buildUp: RoofBuildUp,
  previous: readonly CoveringAssignmentSpec[],
  next: readonly CoveringAssignmentSpec[],
  template: RoofTemplateSpec,
): RoofBuildUp {
  if (buildUp.battenLayout || next.length === 0 || previous.length > 0)
    return buildUp;
  const repair = fitInstallationToRoof({
    template,
    coverings: next,
    buildUp,
  });
  return repair.buildUp.battenLayout
    ? { ...buildUp, battenLayout: repair.buildUp.battenLayout }
    : buildUp;
}
