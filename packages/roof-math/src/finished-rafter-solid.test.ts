import { describe, expect, it } from 'vitest';
import type { Point2D, Point3D } from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import {
  finishedRafterPoint,
  resolveFinishedRafterSolid,
  type FinishedRafterSolid,
} from './finished-rafter-solid';
import { gableTemplateFromAssembly } from './gable-roof';
import { createRoofSkeleton, resolveRoofTemplate } from './roof-template';

/**
 * The finished K1 solid is pure geometry derived from already-resolved
 * fabrication facts. These tests exist so the Three.js renderer never has to
 * calculate any of it — and so the anchor between the 2D profile and the 3D
 * skeleton axis is proved rather than assumed.
 */

function fixture(overrides: { pitchDeg?: number; overhangMm?: number } = {}) {
  const template = gableTemplateFromAssembly(
    {
      ...assemblyDefaults,
      roof: {
        ...assemblyDefaults.roof,
        ...(overrides.pitchDeg ? { pitchDeg: overrides.pitchDeg } : {}),
        ...(overrides.overhangMm !== undefined
          ? { overhangMm: overrides.overhangMm }
          : {}),
      },
    },
    {
      id: 'template:finished-k1',
      buildingLengthMm: 8000,
      rafterSpacing: { mode: 'max-even-spacing', spacingMm: 800 },
    },
  );
  const resolved = resolveRoofTemplate(template);
  const skeleton = createRoofSkeleton(template);
  const members = skeleton.members.filter((member) => member.kind === 'rafter');
  return { template, resolved, members };
}

function solidFor(
  side: 'left' | 'right',
  overrides: { pitchDeg?: number; overhangMm?: number } = {},
) {
  const { template, resolved, members } = fixture(overrides);
  const member = members.find((candidate) => candidate.side === side)!;
  const result = resolveFinishedRafterSolid({
    assembly: resolved.calculation.assembly,
    member,
    pitchDeg: template.pitchDeg,
  });
  if (result.status !== 'resolved')
    throw new Error(`expected a resolved solid, got ${result.reason}`);
  return { solid: result.solid, member, template };
}

const distance = (a: Point3D, b: Point3D) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Perpendicular distance from a point to the infinite line through a,b. */
function distanceToLine(point: Point3D, a: Point3D, b: Point3D) {
  const axis = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const length = Math.hypot(axis.x, axis.y, axis.z);
  const offset = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z };
  const cross = {
    x: offset.y * axis.z - offset.z * axis.y,
    y: offset.z * axis.x - offset.x * axis.z,
    z: offset.x * axis.y - offset.y * axis.x,
  };
  return Math.hypot(cross.x, cross.y, cross.z) / length;
}

function localBounds(profile: readonly Point2D[]) {
  return {
    minX: Math.min(...profile.map((point) => point.x)),
    maxX: Math.max(...profile.map((point) => point.x)),
    minY: Math.min(...profile.map((point) => point.y)),
    maxY: Math.max(...profile.map((point) => point.y)),
  };
}

describe('finished K1 solid placement', () => {
  it('places the roof-plane reference line exactly on the skeleton axis', () => {
    // The whole anchor rule stands or falls here: the member-local line
    // y = seat normal depth must coincide with the resolved 3D axis.
    for (const side of ['left', 'right'] as const)
      for (const pitchDeg of [12, 35, 52, 68])
        for (const overhangMm of [0, 500, 1200]) {
          const { solid, member } = solidFor(side, { pitchDeg, overhangMm });
          expect(solid.profile.length).toBeGreaterThan(3);
          const memberLength = distance(member.from, member.to);
          for (const station of [0, memberLength / 2, memberLength]) {
            const onAxis = finishedRafterPoint(
              solid,
              {
                x:
                  station +
                  seatDepth(solid) * Math.tan((pitchDeg * Math.PI) / 180),
                y: seatDepth(solid),
              },
              0,
            );
            expect(distanceToLine(onAxis, member.from, member.to)).toBeLessThan(
              1e-6,
            );
          }
          // And the axis start is exactly the member's own `from` point.
          const start = finishedRafterPoint(
            solid,
            {
              x: seatDepth(solid) * Math.tan((pitchDeg * Math.PI) / 180),
              y: seatDepth(solid),
            },
            0,
          );
          expect(distance(start, member.from)).toBeLessThan(1e-6);
        }
  });

  it('occupies the same timber as the reference prism', () => {
    const { solid, member } = solidFor('left');
    const bounds = localBounds(solid.stockProfile);
    // Section depth and width come from the member, never from the drawing.
    expect(bounds.maxY - bounds.minY).toBeCloseTo(member.section.depthMm, 9);
    expect(solid.section).toEqual(member.section);
    // The stock blank is at least as long as the finished member.
    const finished = localBounds(solid.profile);
    expect(bounds.maxX).toBeGreaterThanOrEqual(finished.maxX - 1e-9);
  });

  it('is finite everywhere across the full width', () => {
    const { solid } = solidFor('right', { pitchDeg: 52 });
    for (const local of solid.profile)
      for (const offset of [
        -solid.section.widthMm / 2,
        0,
        solid.section.widthMm / 2,
      ]) {
        const point = finishedRafterPoint(solid, local, offset);
        expect([point.x, point.y, point.z].every(Number.isFinite)).toBe(true);
      }
  });

  it('keeps an orthonormal right-handed member frame', () => {
    const { solid } = solidFor('left', { pitchDeg: 27 });
    const { along, width, up } = solid.frame;
    const dot = (a: Point3D, b: Point3D) => a.x * b.x + a.y * b.y + a.z * b.z;
    for (const vector of [along, width, up])
      expect(Math.hypot(vector.x, vector.y, vector.z)).toBeCloseTo(1, 9);
    expect(dot(along, width)).toBeCloseTo(0, 9);
    expect(dot(along, up)).toBeCloseTo(0, 9);
    expect(dot(width, up)).toBeCloseTo(0, 9);
    // `up` really points from the bottom edge toward the top edge.
    expect(up.z).toBeGreaterThan(0);
  });
});

describe('finished K1 solid content', () => {
  it('carries the resolved birdsmouth and both end cuts, not a rectangle', () => {
    const { solid } = solidFor('left');
    expect(solid.profile.length).toBeGreaterThan(solid.stockProfile.length);
    expect(solid.stockProfile).toHaveLength(4);
    const seat = solid.regions.filter((region) => region.kind === 'seat-notch');
    expect(seat).toHaveLength(1);
    expect(seat[0]!.max.y).toBeGreaterThan(seat[0]!.min.y);
    expect(seat[0]!.max.x).toBeGreaterThan(seat[0]!.min.x);
    expect(
      solid.regions.filter((region) => region.kind === 'end-cut').length,
    ).toBeGreaterThan(0);
    expect(solid.operationIds).toEqual([...solid.operationIds].sort());
    expect(new Set(solid.operationIds).size).toBe(solid.operationIds.length);
  });

  it('shows a smaller finished section where the notch was removed', () => {
    const { solid } = solidFor('left');
    const notch = solid.regions.find((region) => region.kind === 'seat-notch')!;
    const midX = (notch.min.x + notch.max.x) / 2;
    // At the notch the finished outline rises above the bottom edge, so the
    // remaining depth there is genuinely less than the full section.
    const bottomAtNotch = Math.min(
      ...solid.profile
        .filter((point) => Math.abs(point.x - midX) < notch.max.x - notch.min.x)
        .map((point) => point.y),
    );
    expect(notch.max.y).toBeGreaterThan(bottomAtNotch);
    expect(notch.max.y).toBeLessThan(solid.section.depthMm);
  });

  it('is deterministic and never mutates the resolved assembly', () => {
    const { resolved, members, template } = fixture();
    const member = members.find((candidate) => candidate.side === 'left')!;
    const before = JSON.stringify(resolved.calculation.assembly.member.profile);
    const first = resolveFinishedRafterSolid({
      assembly: resolved.calculation.assembly,
      member,
      pitchDeg: template.pitchDeg,
    });
    const second = resolveFinishedRafterSolid({
      assembly: resolved.calculation.assembly,
      member,
      pitchDeg: template.pitchDeg,
    });
    expect(first).toEqual(second);
    expect(JSON.stringify(resolved.calculation.assembly.member.profile)).toBe(
      before,
    );
  });
});

describe('finished K1 solid refuses to guess', () => {
  it('stays unresolved without a seat reference', () => {
    const { resolved, members, template } = fixture();
    const member = members.find((candidate) => candidate.side === 'left')!;
    const result = resolveFinishedRafterSolid({
      assembly: { ...resolved.calculation.assembly, joints: [] },
      member,
      pitchDeg: template.pitchDeg,
    });
    expect(result).toEqual({
      status: 'unresolved',
      reason: 'no-seat-reference',
    });
  });

  it('stays unresolved for a degenerate axis or profile', () => {
    const { resolved, members, template } = fixture();
    const member = members.find((candidate) => candidate.side === 'left')!;
    expect(
      resolveFinishedRafterSolid({
        assembly: resolved.calculation.assembly,
        member: { ...member, to: { ...member.from } },
        pitchDeg: template.pitchDeg,
      }),
    ).toEqual({ status: 'unresolved', reason: 'invalid-axis' });
    expect(
      resolveFinishedRafterSolid({
        assembly: {
          ...resolved.calculation.assembly,
          member: { ...resolved.calculation.assembly.member, profile: [] },
        },
        member,
        pitchDeg: template.pitchDeg,
      }),
    ).toEqual({ status: 'unresolved', reason: 'invalid-profile' });
  });
});

/** The seat notch's resolved normal depth — the anchor the placement uses. */
function seatDepth(solid: FinishedRafterSolid) {
  const notch = solid.regions.find((region) => region.kind === 'seat-notch')!;
  return notch.max.y;
}
