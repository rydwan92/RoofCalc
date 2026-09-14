import type { ResolvedRoofProject } from '@cieslacalc/calculator-core';
import type { RequiredPiece } from '@cieslacalc/procurement-core';
import type { RoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  resolveK1FabricationBlank,
  type K1FabricationBlankResolution,
} from '@cieslacalc/roof-math';

export type K1CuttingRequirement =
  | {
      status: 'resolved';
      blank: Extract<K1FabricationBlankResolution, { status: 'resolved' }>;
      stockClassId: string;
      requiredPieces: RequiredPiece[];
      excludedRafterCount: number;
    }
  | {
      status: 'unresolved';
      reason:
        | 'no-whole-k1-members'
        | 'incomplete-k1-section'
        | 'unmatched-k1-instances'
        | 'unmatched-fabrication-reference'
        | Extract<
            K1FabricationBlankResolution,
            { status: 'unresolved' }
          >['reason'];
    };

/** Application-only bridge. Schedule axes are used as an ID whitelist, never as lengths. */
export function createK1CuttingRequirement(
  resolved: ResolvedRoofProject,
  schedule: RoofMemberSchedule,
): K1CuttingRequirement {
  const prototype = resolved.memberPrototypes.find(
    (candidate) =>
      candidate.code === 'K1' && candidate.kind === 'common-rafter',
  );
  const allowedIds = new Set(prototype?.instanceIds ?? []);
  const wholeRows = schedule.timberRows.filter(
    (row) =>
      row.familyKey === 'K1' &&
      row.memberKind === 'rafter' &&
      row.prototypeId === prototype?.id,
  );
  const ids = wholeRows.flatMap((row) => row.sourceInstanceIds);
  if (!ids.length)
    return { status: 'unresolved', reason: 'no-whole-k1-members' };
  if (
    !prototype ||
    ids.some((id) => !allowedIds.has(id)) ||
    new Set(ids).size !== ids.length
  )
    return { status: 'unresolved', reason: 'unmatched-k1-instances' };

  const { widthMm, depthMm } = prototype.section;
  if (
    wholeRows.some(
      (row) =>
        row.section.completeness !== 'complete' ||
        row.section.widthMm !== widthMm ||
        row.section.depthMm !== depthMm,
    )
  )
    return { status: 'unresolved', reason: 'incomplete-k1-section' };

  const blank = resolveK1FabricationBlank(
    resolved.calculation.assembly,
    resolved.template.ridge.thicknessMm,
  );
  if (blank.status === 'unresolved') return blank;
  if (blank.finishedGeometryReference.memberPrototypeId !== prototype.id)
    return { status: 'unresolved', reason: 'unmatched-fabrication-reference' };
  if (blank.section.widthMm !== widthMm || blank.section.depthMm !== depthMm)
    return { status: 'unresolved', reason: 'incomplete-k1-section' };

  const stockClassId = JSON.stringify(['timber-section', widthMm, depthMm]);
  return {
    status: 'resolved',
    blank,
    stockClassId,
    requiredPieces: ids.sort().map((id) => ({
      id,
      stockClassId,
      requiredBlankLengthMm: blank.requiredBlankLengthMm,
      source: { referenceId: id },
    })),
    excludedRafterCount: allowedIds.size - ids.length,
  };
}
