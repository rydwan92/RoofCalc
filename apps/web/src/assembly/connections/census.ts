import {
  resolveRoofConnectionNodes,
  type ModelledInterface,
  type RoofConnectionCensus,
  type RoofNodeKind,
  type RoofNodeOccurrence,
  type RoofNodeProjection,
} from '@cieslacalc/connection-core';
import type {
  RoofBuildUp,
  RoofTemplateSpec,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';

/**
 * Web adapter: the resolved roof → the neutral census `connection-core`
 * schedules. VNext-3: every count comes from the geometric node projection
 * (where solved member axes actually meet), not from multiplying member
 * counts. Node kinds come from structured member kinds and project intents,
 * never from member IDs (ADR-007). Members are the accepted composition
 * (opening framing included, proposals excluded).
 */

export interface RoofConnectionModel {
  census: RoofConnectionCensus;
  projection: RoofNodeProjection;
}

export function roofConnectionModel(input: {
  template: RoofTemplateSpec;
  members: readonly SkeletonMember3D[];
  buildUp: RoofBuildUp;
}): RoofConnectionModel {
  const { template, members, buildUp } = input;
  // VNext-8: a mono-pitch roof has no ridge joint; its rafters end in a
  // plain top cut, and every bearing is a seat notch.
  const ridged = template.type === 'mono-pitch' ? undefined : template;
  const ridgeConnection = ridged?.ridge.connection ?? 'ridge-board';
  const projection = resolveRoofConnectionNodes({
    members,
    ridgeJoint: ridgeConnection === 'ridge-board' ? 'board' : 'paired',
  });
  const count = (kind: RoofNodeKind) =>
    projection.nodes.filter((item) => item.kind === kind).length;
  const axes = projection.axes.commonRafters + projection.axes.jackRafters;

  const seat: ModelledInterface | undefined =
    !ridged || ridged.wallPlate.joint.kind === 'seat-notch'
      ? { type: 'seat-notch', status: 'resolved' }
      : undefined;
  const ridge: ModelledInterface =
    ridgeConnection === 'ridge-board'
      ? { type: 'ridge-board-butt', status: 'resolved' }
      : ridgeConnection === 'direct-meeting'
        ? { type: 'rafters-direct-butt', status: 'resolved' }
        : { type: 'ridge-half-lap', status: 'named' };
  const jackConnection =
    template.type === 'hip' ? template.hipExecution?.jackConnection : undefined;

  const nodes: RoofNodeOccurrence[] = [
    {
      kind: 'wall-plate-anchorage',
      count: projection.wallPlates.count,
      // Anchors repeat at a spacing the roof model does not define.
      unit: 'member',
      extentMm: projection.wallPlates.lengthMm,
    },
    {
      kind: 'rafter-wall-plate',
      count: count('rafter-wall-plate'),
      ...(seat ? { modelled: seat } : {}),
    },
    {
      kind: 'jack-rafter-wall-plate',
      count: count('jack-rafter-wall-plate'),
      ...(seat ? { modelled: seat } : {}),
    },
    { kind: 'hip-rafter-wall-plate', count: count('hip-rafter-wall-plate') },
    {
      kind: 'rafter-purlin',
      count: count('rafter-purlin'),
      modelled: { type: 'seat-notch', status: 'resolved' },
    },
    // J1 fabrication reports purlin joinery as not resolved: no modelled
    // interface is claimed for jack–purlin or purlin–hip nodes.
    { kind: 'jack-rafter-purlin', count: count('jack-rafter-purlin') },
    { kind: 'purlin-hip-rafter', count: count('purlin-hip-rafter') },
    {
      kind: 'collar-tie-rafter',
      count: count('collar-tie-rafter'),
      modelled: { type: 'collar-lap', status: 'named' },
    },
    { kind: 'opening-header-rafter', count: count('opening-header-rafter') },
    {
      kind: 'interrupted-rafter-header',
      count: count('interrupted-rafter-header'),
    },
    {
      kind: 'jack-rafter-hip-rafter',
      count: count('jack-rafter-hip-rafter'),
      modelled: {
        type: 'hip-face-butt',
        status: jackConnection === 'hip-face-butt' ? 'resolved' : 'undecided',
      },
    },
    {
      kind: 'rafter-ridge',
      count: count('rafter-ridge'),
      ...(ridged ? { modelled: ridge } : {}),
    },
    {
      kind: 'hip-rafter-ridge',
      count: count('hip-rafter-ridge'),
      modelled: { type: 'hip-ridge-cheek-cut', status: 'resolved' },
    },
    ...(buildUp.counterBattens?.enabled
      ? [
          {
            kind: 'counter-batten-rafter' as const,
            count: axes,
            unit: 'axis' as const,
          },
        ]
      : []),
    ...(buildUp.battenLayout?.enabled
      ? [
          {
            kind: 'batten-counter-batten' as const,
            count: axes,
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
    'wall-plate':
      template.type === 'mono-pitch'
        ? {
            widthMm: template.lowSupport.widthMm,
            depthMm: template.lowSupport.heightMm,
          }
        : {
            widthMm: template.wallPlate.section.widthMm,
            depthMm: template.wallPlate.section.heightMm,
          },
  };
  if (template.type === 'hip')
    sections['hip-rafter'] = {
      widthMm: template.hipRafterSection.widthMm,
      depthMm: template.hipRafterSection.depthMm,
    };
  if (
    ridged &&
    ridged.ridge.thicknessMm > 0 &&
    ridged.ridge.depthMm !== undefined
  )
    sections['ridge-board'] = {
      widthMm: ridged.ridge.thicknessMm,
      depthMm: ridged.ridge.depthMm,
    };
  const purlin: { widthMm: number; heightMm: number } | undefined =
    template.type === 'mono-pitch'
      ? template.intermediateSupports[0]
      : template.type === 'asymmetric-gable'
        ? undefined
        : template.intermediateSupports[0]?.section;
  if (purlin)
    sections.purlin = { widthMm: purlin.widthMm, depthMm: purlin.heightMm };
  const collar =
    template.type === 'gable' ? template.structure?.collarTie : undefined;
  if (collar)
    sections['collar-tie'] = {
      widthMm: collar.section.widthMm,
      depthMm: collar.section.depthMm,
    };
  return { census: { nodes, sections }, projection };
}

export function roofConnectionCensus(
  input: Parameters<typeof roofConnectionModel>[0],
): RoofConnectionCensus {
  return roofConnectionModel(input).census;
}
