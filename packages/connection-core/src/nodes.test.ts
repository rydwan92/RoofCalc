import { describe, expect, it } from 'vitest';
import type { Point3D, SkeletonMember3D } from '@cieslacalc/timber-model';
import { nodesOfKind, resolveRoofConnectionNodes } from './nodes';

/** Hand-built axes: geometry decides, the IDs are deliberately misleading. */
function member(
  kind: SkeletonMember3D['kind'],
  id: string,
  from: Point3D,
  to: Point3D,
  extra: Partial<SkeletonMember3D> = {},
): SkeletonMember3D {
  return {
    id,
    prototypeId: `p:${kind}`,
    selectionId: id,
    kind,
    from,
    to,
    section: { widthMm: 80, depthMm: 200 },
    side: 'left',
    ...extra,
  };
}

const plate = member(
  'wall-plate',
  'rafter-looking-id',
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 10000, z: 0 },
);
const rafterAt = (y: number, dz = 0, id = `r:${y}`) =>
  member('rafter', id, { x: -500, y, z: -350 + dz }, { x: 4000, y, z: 2800 });
const ridge = member(
  'ridge',
  'ridge',
  { x: 4000, y: 0, z: 2800 },
  { x: 4000, y: 10000, z: 2800 },
  { section: { widthMm: 40, depthMm: 200 }, side: 'center' },
);

describe('roof connection node projection', () => {
  it('creates a node only where axes meet, within 1 mm', () => {
    // The rafter line passes the plate at x = 0 exactly when z(0) = 0.
    const exact = rafterAt(600);
    const nodes = resolveRoofConnectionNodes({
      members: [plate, exact],
      ridgeJoint: 'board',
    }).nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      kind: 'rafter-wall-plate',
      contact: 'crossing',
      location: { x: 0, y: 600, z: 0 },
    });
    expect(nodes[0]!.members.map((item) => item.role)).toEqual([
      'common-rafter',
      'wall-plate',
    ]);
    // A rafter 5 mm above the plate does not bear on it.
    const lifted = rafterAt(1200, 5 * (4500 / 4000));
    expect(
      resolveRoofConnectionNodes({
        members: [plate, lifted],
        ridgeJoint: 'board',
      }).nodes,
    ).toEqual([]);
  });

  it('never infers a node from sharing a roof side', () => {
    // Same side, same kinds, but the rafter stops short of the plate.
    const short = member(
      'rafter',
      'r:short',
      { x: 1000, y: 600, z: 787.5 },
      { x: 4000, y: 600, z: 2800 },
    );
    expect(
      resolveRoofConnectionNodes({
        members: [plate, short],
        ridgeJoint: 'board',
      }).nodes,
    ).toEqual([]);
  });

  it('reaches an end that stops at the face of the member it meets', () => {
    const trimmer = member(
      'rafter',
      'trimmer',
      { x: 0, y: 1000, z: 0 },
      { x: 4000, y: 1000, z: 2800 },
    );
    // A header ending at the trimmer face: 40 mm (half of 80) from its axis.
    const header = member(
      'opening-header',
      'header',
      { x: 2000, y: 1040, z: 1400 },
      { x: 2000, y: 2000, z: 1400 },
    );
    const nodes = nodesOfKind(
      resolveRoofConnectionNodes({
        members: [trimmer, header],
        ridgeJoint: 'board',
      }),
      'opening-header-rafter',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.location).toEqual({ x: 2000, y: 1040, z: 1400 });
    // 45 mm away is beyond the face: no node.
    const gap = { ...header, from: { ...header.from, y: 1046 } };
    expect(
      nodesOfKind(
        resolveRoofConnectionNodes({
          members: [trimmer, gap],
          ridgeJoint: 'board',
        }),
        'opening-header-rafter',
      ),
    ).toEqual([]);
  });

  it('does not treat coinciding ends as bearing', () => {
    const purlin = member(
      'purlin',
      'purlin',
      { x: 1000, y: 1000, z: 700 },
      { x: 1000, y: 9000, z: 700 },
    );
    const jackEndingThere = member(
      'jack-rafter',
      'jack',
      { x: 1000, y: -500, z: -350 },
      { x: 1000, y: 1000, z: 700 },
    );
    const jackOver = member(
      'jack-rafter',
      'jack-over',
      { x: -500, y: 2000, z: -350 },
      { x: 2000, y: 2000, z: 1400 },
    );
    const nodes = nodesOfKind(
      resolveRoofConnectionNodes({
        members: [purlin, jackEndingThere, jackOver],
        ridgeJoint: 'board',
      }),
      'jack-rafter-purlin',
    );
    expect(nodes.map((node) => node.members[0]!.id)).toEqual(['jack-over']);
  });

  it('joins opposite rafters once per pair when they meet each other', () => {
    const left = member(
      'rafter',
      'left',
      { x: 0, y: 600, z: 0 },
      { x: 4000, y: 600, z: 2800 },
    );
    const right = member(
      'rafter',
      'right',
      { x: 8000, y: 600, z: 0 },
      { x: 4000, y: 600, z: 2800 },
      { side: 'right' },
    );
    const paired = resolveRoofConnectionNodes({
      members: [left, right, ridge],
      ridgeJoint: 'paired',
    });
    expect(nodesOfKind(paired, 'rafter-ridge')).toHaveLength(1);
    expect(nodesOfKind(paired, 'rafter-ridge')[0]!.members).toHaveLength(3);
    const board = resolveRoofConnectionNodes({
      members: [left, right, ridge],
      ridgeJoint: 'board',
    });
    expect(nodesOfKind(board, 'rafter-ridge')).toHaveLength(2);
  });

  it('reports an apex without a ridge instead of inventing its nodes', () => {
    const projection = resolveRoofConnectionNodes({
      members: [rafterAt(600)],
      ridgeJoint: 'board',
    });
    expect(nodesOfKind(projection, 'rafter-ridge')).toEqual([]);
    expect(projection.limitations).toEqual(['apex-without-ridge']);
  });

  it('counts an interrupted rafter as one axis through its provenance', () => {
    const lower = member(
      'rafter-segment',
      'segment-a',
      { x: -500, y: 600, z: -350 },
      { x: 1000, y: 600, z: 700 },
      { sourceMemberId: 'r:600', openingRole: 'lower' },
    );
    const upper = member(
      'rafter-segment',
      'segment-b',
      { x: 2500, y: 600, z: 1750 },
      { x: 4000, y: 600, z: 2800 },
      { sourceMemberId: 'r:600', openingRole: 'upper' },
    );
    const projection = resolveRoofConnectionNodes({
      members: [lower, upper, rafterAt(1200), ridge, plate],
      ridgeJoint: 'board',
    });
    expect(projection.axes.commonRafters).toBe(2);
    // The lower piece bears on the plate, the upper one reaches the ridge.
    expect(
      nodesOfKind(projection, 'rafter-wall-plate').map(
        (node) => node.members[0]!.id,
      ),
    ).toEqual(['r:1200', 'segment-a']);
    expect(
      nodesOfKind(projection, 'rafter-ridge').map(
        (node) => node.members[0]!.id,
      ),
    ).toEqual(['r:1200', 'segment-b']);
  });

  it('is deterministic: same members, same nodes, unique IDs', () => {
    const members = [
      plate,
      ridge,
      ...[600, 1200, 1800].map((y) => rafterAt(y)),
    ];
    const a = resolveRoofConnectionNodes({ members, ridgeJoint: 'board' });
    const b = resolveRoofConnectionNodes({
      members: [...members].reverse(),
      ridgeJoint: 'board',
    });
    expect(b.nodes).toEqual(a.nodes);
    expect(new Set(a.nodes.map((node) => node.id)).size).toBe(a.nodes.length);
    expect(a.wallPlates).toEqual({ count: 1, lengthMm: 10000 });
  });
});
