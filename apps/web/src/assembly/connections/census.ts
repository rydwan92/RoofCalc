import type {
  ModelledInterface,
  RoofConnectionCensus,
  RoofNodeOccurrence,
} from '@cieslacalc/connection-core';
import type {
  RoofBuildUp,
  RoofTemplateSpec,
  SkeletonMember3D,
  SkeletonMemberKind,
} from '@cieslacalc/timber-model';

/**
 * Web adapter: the resolved roof → the neutral census `connection-core`
 * schedules. Node kinds come from structured member kinds and project
 * intents, never from member IDs (ADR-007). Counts are occurrences in the
 * accepted composition (opening framing included, proposals excluded).
 */

function countKinds(members: readonly SkeletonMember3D[]) {
  const counts = new Map<SkeletonMemberKind, number>();
  for (const member of members)
    counts.set(member.kind, (counts.get(member.kind) ?? 0) + 1);
  return (kind: SkeletonMemberKind) => counts.get(kind) ?? 0;
}

/** Rafter axes: whole common rafters plus rafters split by an opening. */
function rafterAxes(members: readonly SkeletonMember3D[]): number {
  const count = countKinds(members);
  // An opening splits one common rafter into a lower and an upper segment.
  return count('rafter') + Math.floor(count('rafter-segment') / 2);
}

/** Rafter–purlin crossings, side by side: each rafter crosses its side's purlins. */
function purlinCrossings(members: readonly SkeletonMember3D[]): number {
  const purlins = members.filter((member) => member.kind === 'purlin');
  if (!purlins.length) return 0;
  let crossings = 0;
  const sides = new Set(purlins.map((purlin) => purlin.side));
  for (const side of sides) {
    const onSide = purlins.filter((purlin) => purlin.side === side).length;
    crossings +=
      onSide * rafterAxes(members.filter((member) => member.side === side));
  }
  return crossings;
}

export function roofConnectionCensus(input: {
  template: RoofTemplateSpec;
  members: readonly SkeletonMember3D[];
  buildUp: RoofBuildUp;
}): RoofConnectionCensus {
  const { template, members, buildUp } = input;
  const count = countKinds(members);
  const axes = rafterAxes(members);
  const hips = count('hip-rafter');
  const jacks = count('jack-rafter');
  const seat: ModelledInterface | undefined =
    template.wallPlate.joint.kind === 'seat-notch'
      ? { type: 'seat-notch', status: 'resolved' }
      : undefined;
  const ridgeConnection = template.ridge.connection ?? 'ridge-board';
  const ridge: ModelledInterface =
    ridgeConnection === 'ridge-board'
      ? { type: 'ridge-board-butt', status: 'resolved' }
      : ridgeConnection === 'direct-meeting'
        ? { type: 'rafters-direct-butt', status: 'resolved' }
        : { type: 'ridge-half-lap', status: 'named' };
  const jackConnection =
    template.type === 'hip' ? template.hipExecution?.jackConnection : undefined;

  const nodes: RoofNodeOccurrence[] = [
    { kind: 'wall-plate-anchorage', count: count('wall-plate') },
    {
      kind: 'rafter-wall-plate',
      count: axes,
      ...(seat ? { modelled: seat } : {}),
    },
    {
      kind: 'jack-rafter-wall-plate',
      count: jacks,
      ...(seat ? { modelled: seat } : {}),
    },
    { kind: 'hip-rafter-wall-plate', count: hips },
    {
      kind: 'rafter-purlin',
      count: purlinCrossings(members),
      modelled: { type: 'seat-notch', status: 'resolved' },
    },
    {
      kind: 'collar-tie-rafter',
      count: count('collar-tie') * 2,
      modelled: { type: 'collar-lap', status: 'named' },
    },
    { kind: 'opening-header-rafter', count: count('opening-header') * 2 },
    {
      kind: 'jack-rafter-hip-rafter',
      count: jacks,
      modelled: {
        type: 'hip-face-butt',
        status: jackConnection === 'hip-face-butt' ? 'resolved' : 'undecided',
      },
    },
    { kind: 'rafter-ridge', count: axes, modelled: ridge },
    {
      kind: 'hip-rafter-ridge',
      count: hips,
      modelled: { type: 'hip-ridge-cheek-cut', status: 'resolved' },
    },
    ...(buildUp.counterBattens?.enabled
      ? [
          {
            kind: 'counter-batten-rafter' as const,
            count: axes + jacks,
            unit: 'axis' as const,
          },
        ]
      : []),
    ...(buildUp.battenLayout?.enabled
      ? [
          {
            kind: 'batten-counter-batten' as const,
            count: axes + jacks,
            unit: 'axis' as const,
          },
        ]
      : []),
  ];

  const sections: RoofConnectionCensus['sections'] = {
    'common-rafter': {
      widthMm: template.rafterSection.widthMm,
      depthMm: template.rafterSection.depthMm,
    },
    'jack-rafter': {
      widthMm: template.rafterSection.widthMm,
      depthMm: template.rafterSection.depthMm,
    },
    'wall-plate': {
      widthMm: template.wallPlate.section.widthMm,
      depthMm: template.wallPlate.section.heightMm,
    },
  };
  if (template.type === 'hip')
    sections['hip-rafter'] = {
      widthMm: template.hipRafterSection.widthMm,
      depthMm: template.hipRafterSection.depthMm,
    };
  if (template.ridge.thicknessMm > 0 && template.ridge.depthMm !== undefined)
    sections['ridge-board'] = {
      widthMm: template.ridge.thicknessMm,
      depthMm: template.ridge.depthMm,
    };
  const purlin = template.intermediateSupports[0];
  if (purlin)
    sections.purlin = {
      widthMm: purlin.section.widthMm,
      depthMm: purlin.section.heightMm,
    };
  const collar =
    template.type === 'gable' ? template.structure?.collarTie : undefined;
  if (collar)
    sections['collar-tie'] = {
      widthMm: collar.section.widthMm,
      depthMm: collar.section.depthMm,
    };
  return { nodes, sections };
}
