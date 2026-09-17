import {
  deriveCoveringSupportCapability,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import { roofPlaneIds } from '@cieslacalc/roof-math';
import type { RoofBuildUp, RoofTemplateSpec } from '@cieslacalc/timber-model';
import { battenLayerForWholeRoof, newBattenLayer } from './build-up-defaults';

/**
 * V46 "Dopasuj pokrycie i łaty do dachu" — one explicit, undoable repair.
 *
 * It only changes *scope and ownership*, never product data or geometry:
 * - a single primary covering takes every plane of the current roof
 *   (several coverings are a deliberate user split and are only cleaned of
 *   planes that no longer exist);
 * - battens, counter-battens and membrane follow the whole roof;
 * - battens become AUTO when the covering data can derive a gauge, or take
 *   the sheet's fixed support gauge as a MANUAL value for modular sheet.
 *
 * What it cannot fix (a pitch below the product minimum, a product gauge
 * range that does not fit the rafter length) stays visible as an issue.
 */
export interface InstallationRepair {
  coverings: CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
  changed: boolean;
}

function withoutScope<T extends { roofPlaneIds?: string[] }>(
  spec: T | undefined,
): T | undefined {
  if (!spec?.roofPlaneIds) return spec;
  const copy = { ...spec };
  delete copy.roofPlaneIds;
  return copy;
}

export function fitInstallationToRoof(args: {
  template: RoofTemplateSpec;
  coverings: readonly CoveringAssignmentSpec[];
  buildUp: RoofBuildUp;
}): InstallationRepair {
  const planes = roofPlaneIds(args.template);
  const coverings =
    args.coverings.length === 1
      ? [{ ...args.coverings[0]!, roofPlaneIds: [...planes] }]
      : args.coverings
          .map((item) => ({
            ...item,
            roofPlaneIds: item.roofPlaneIds.filter((id) => planes.includes(id)),
          }))
          .filter((item) => item.roofPlaneIds.length > 0);

  const primary = coverings.length === 1 ? coverings[0] : undefined;
  const capability = primary
    ? deriveCoveringSupportCapability(primary.product.technicalSpecSnapshot)
    : undefined;

  let battenLayout = args.buildUp.battenLayout;
  if (capability?.requiresBattens || battenLayout?.enabled) {
    const base = battenLayerForWholeRoof(battenLayout ?? newBattenLayer());
    battenLayout = capability?.supportsAutoBattenGauge
      ? { ...base, enabled: true, mode: 'auto-from-covering' }
      : capability?.fixedSupportGaugeMm !== undefined
        ? {
            ...base,
            enabled: true,
            mode: 'manual',
            gaugeMm: capability.fixedSupportGaugeMm,
          }
        : { ...base, enabled: true };
  }

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
  return {
    coverings,
    buildUp,
    changed:
      JSON.stringify(coverings) !== JSON.stringify(args.coverings) ||
      JSON.stringify(buildUp) !== JSON.stringify(args.buildUp),
  };
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
