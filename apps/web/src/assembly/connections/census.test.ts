import { beforeEach, describe, expect, it } from 'vitest';
import { deriveConnectionSchedule } from '@cieslacalc/connection-core';
import type { SkeletonMember3D } from '@cieslacalc/timber-model';
import { useAssembly } from '../store';
import { roofConnectionCensus } from './census';

beforeEach(() => useAssembly.getState().reset());

function member(
  kind: SkeletonMember3D['kind'],
  side: SkeletonMember3D['side'],
  index: number,
): SkeletonMember3D {
  return {
    id: `m:${kind}:${side}:${index}`,
    prototypeId: `p:${kind}`,
    selectionId: `s:${kind}:${side}:${index}`,
    kind,
    side,
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: 0, z: 1 },
    section: { widthMm: 80, depthMm: 180 },
  };
}

describe('roof connection census', () => {
  it('counts nodes from member kinds, never from IDs', () => {
    const { template, projectDocument } = useAssembly.getState();
    const members = [
      member('wall-plate', 'left', 0),
      member('wall-plate', 'right', 0),
      ...[0, 1, 2].map((i) => member('rafter', 'left', i)),
      ...[0, 1, 2].map((i) => member('rafter', 'right', i)),
      // One rafter interrupted by an opening: two segments, one header.
      member('rafter-segment', 'left', 0),
      member('rafter-segment', 'left', 1),
      member('opening-header', 'left', 0),
      member('purlin', 'left', 0),
      member('purlin', 'right', 0),
      ...[0, 1, 2].map((i) => member('collar-tie', 'center', i)),
    ];
    const census = roofConnectionCensus({
      template,
      members,
      buildUp: projectDocument.project.buildUp,
    });
    const count = Object.fromEntries(
      census.nodes.map((node) => [node.kind, node.count]),
    );
    expect(count).toMatchObject({
      'wall-plate-anchorage': 2,
      'rafter-wall-plate': 7, // 6 whole rafters + 1 split rafter
      'rafter-ridge': 7,
      'rafter-purlin': 7, // left: 4 rafter axes × 1 purlin, right: 3 × 1
      'collar-tie-rafter': 6,
      'opening-header-rafter': 2,
      'hip-rafter-ridge': 0,
    });
    expect(census.sections['common-rafter']).toEqual({
      widthMm: template.rafterSection.widthMm,
      depthMm: template.rafterSection.depthMm,
    });
  });

  it('reads the modelled ridge interface from the canonical ridge intent', () => {
    const state = useAssembly.getState();
    const census = roofConnectionCensus({
      template: {
        ...state.template,
        ridge: { ...state.template.ridge, connection: 'half-lap' },
      },
      members: [member('rafter', 'left', 0)],
      buildUp: {},
    });
    const rows = deriveConnectionSchedule(census);
    expect(rows.find((row) => row.kind === 'rafter-ridge')?.modelled).toEqual({
      type: 'ridge-half-lap',
      status: 'named',
    });
  });
});
