import type {
  AssemblySpec,
  CompoundEndCut,
  ResolvedEndCut,
  ResolvedJackRafterInstance,
  ResolvedJoint,
  ResolvedMemberPrototype,
  RoofFeature,
  RoofSkeleton,
  RoofTemplateSpec,
  SkeletonMember3D,
  SupportSpec,
} from '@cieslacalc/timber-model';
import type { resolveRoofTemplate } from '@cieslacalc/roof-math';

export type ResolvedRoofTemplate = ReturnType<typeof resolveRoofTemplate>;

export type WorkbenchSelectionContext =
  | { kind: 'roof' }
  | { kind: 'prototype'; prototype: ResolvedMemberPrototype }
  | {
      kind: 'instance';
      member: SkeletonMember3D;
      jack?: ResolvedJackRafterInstance;
    }
  | {
      kind: 'support';
      id: string;
      supportKind: 'wall-plate' | 'purlin' | 'ridge';
      support?: SupportSpec;
    }
  | { kind: 'roof-window'; feature: RoofFeature }
  | {
      kind: 'joint';
      jointKind: 'seat-notch';
      joint: ResolvedJoint;
    }
  | {
      kind: 'joint';
      jointKind: 'end-cut';
      cut: ResolvedEndCut;
    }
  | {
      kind: 'joint';
      jointKind: 'hip-end-cut';
      cut: CompoundEndCut;
    };

export function resolveWorkbenchSelectionContext(args: {
  selected: string;
  template: RoofTemplateSpec;
  spec: AssemblySpec;
  resolved: ResolvedRoofTemplate;
  skeleton: RoofSkeleton;
  features?: RoofFeature[];
}): WorkbenchSelectionContext {
  const { selected, spec, resolved, skeleton, features = [] } = args;
  if (selected === 'roof') return { kind: 'roof' };

  const feature = features.find((candidate) => candidate.id === selected);
  if (feature) return { kind: 'roof-window', feature };

  const prototype = resolved.memberPrototypes.find(
    (candidate) => candidate.id === selected,
  );
  if (prototype) return { kind: 'prototype', prototype };

  const member = skeleton.members.find(
    (candidate) => candidate.id === selected,
  );
  if (member) {
    const jack =
      'jackRafters' in resolved
        ? resolved.jackRafters.find(
            (candidate) => candidate.spec.id === selected,
          )
        : undefined;
    return { kind: 'instance', member, jack };
  }

  const joint = resolved.calculation.assembly.joints.find(
    (candidate) => candidate.id === selected,
  );
  if (joint) return { kind: 'joint', jointKind: 'seat-notch', joint };

  const cut = resolved.calculation.assembly.endCuts.find(
    (candidate) => candidate.id === selected,
  );
  if (cut) return { kind: 'joint', jointKind: 'end-cut', cut };

  if (
    'hipRafter' in resolved &&
    resolved.hipRafter.fabrication.ridgeCut.id === selected
  )
    return {
      kind: 'joint',
      jointKind: 'hip-end-cut',
      cut: resolved.hipRafter.fabrication.ridgeCut,
    };

  const support = spec.supports.find((candidate) => candidate.id === selected);
  if (support)
    return {
      kind: 'support',
      id: support.id,
      supportKind: support.kind,
      support,
    };
  if (selected === spec.ridge.id)
    return { kind: 'support', id: spec.ridge.id, supportKind: 'ridge' };

  return { kind: 'roof' };
}
