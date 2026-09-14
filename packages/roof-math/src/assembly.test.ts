import { describe, expect, it } from 'vitest';
import type { Point2D } from '@cieslacalc/timber-model';
import {
  addPurlin,
  assemblyDefaults,
  assemblyFromWorkbench,
  assemblySpecSchema,
  clampPurlinPlacement,
  calculateAssembly,
  distributePurlins,
  purlinPlacementSegments,
  purlinRange,
} from './assembly';
import {
  calculateRafterWorkbench,
  workbenchDefaults,
} from './rafters/rafter-workbench';
import { memberToWorld, worldToMember } from './geometry/frame2d';

const area = (points: Point2D[]) =>
  Math.abs(
    points.reduce((sum, a, i) => {
      const b = points[(i + 1) % points.length]!;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2,
  );
describe('shared assembly solver', () => {
  it.each([1, 30, 35, 80])(
    'preserves the version 2 contract at %s degrees',
    (pitchDeg) => {
      const input = structuredClone(workbenchDefaults);
      input.geometry.pitchDeg = pitchDeg;
      const old = calculateRafterWorkbench(input),
        next = calculateAssembly(assemblyFromWorkbench(input));
      expect(next.plan.minimumStockLengthMm).toBeCloseTo(
        old.member.minimumStockLengthMm,
        8,
      );
      expect(next.plan.referenceLengthMm).toBeCloseTo(
        old.member.referenceLengthMm,
        8,
      );
      next.assembly.member.profile.forEach((p, i) => {
        expect(p.x).toBeCloseTo(old.member.profile[i]!.x, 8);
        expect(p.y).toBeCloseTo(old.member.profile[i]!.y, 8);
      });
      expect(next.assembly.joints[0]!.normalDepthMm).toBeCloseTo(
        old.notch.normalDepthMm,
        10,
      );
    },
  );
  it('has a hand-calculated two-support reference at 30 degrees', () => {
    const spec = addPurlin(assemblyDefaults);
    spec.roof.pitchDeg = 30;
    const purlin = spec.supports[1]!;
    purlin.placement.xMm = 2000;
    const { assembly, plan } = calculateAssembly(spec),
      joint = assembly.joints[1]!;
    expect(joint.normalDepthMm).toBeCloseTo(45, 10);
    expect(joint.remainingDepthMm).toBeCloseTo(155, 10);
    expect(joint.stationMm).toBeCloseTo(2500 / Math.sqrt(0.75), 9);
    const contact = assembly.supports[1]!.topReference;
    expect(contact[0].x).toBe(2000);
    expect(contact[0].y).toBeCloseTo(1990 / Math.sqrt(3), 9);
    expect(contact[1].y).toBeCloseTo(contact[0].y, 10);
    expect(plan.steps).toHaveLength(7);
  });
  it('movement updates the joint, datums and station chain without moving the wall notch or stock ends', () => {
    const spec = addPurlin(assemblyDefaults),
      before = calculateAssembly(spec);
    spec.supports[1]!.placement.xMm += 250.125;
    const after = calculateAssembly(spec);
    expect(after.assembly.joints[0]).toEqual(before.assembly.joints[0]);
    expect(
      after.assembly.joints[1]!.stationMm -
        before.assembly.joints[1]!.stationMm,
    ).toBeCloseTo(250.125 / Math.cos((35 * Math.PI) / 180), 8);
    expect(after.assembly.member.profile).not.toEqual(
      before.assembly.member.profile,
    );
    expect(after.plan.stations).not.toEqual(before.plan.stations);
    expect(after.plan.minimumStockLengthMm).toEqual(
      before.plan.minimumStockLengthMm,
    );
    expect(after.plan.datums.map((d) => d.id)).toEqual(
      before.plan.datums.map((d) => d.id),
    );
  });
  it('removes the actual notch triangles from the retained polygon', () => {
    const spec = addPurlin(assemblyDefaults),
      { assembly } = calculateAssembly(spec);
    const { member } = assembly;
    const uncutArea = member.referenceLengthMm * member.section.depthMm;
    const removed = assembly.joints.reduce(
      (sum, j) => sum + area(j.removedProfile),
      0,
    );
    expect(uncutArea - area(member.profile)).toBeCloseTo(removed, 6);
    assembly.joints.forEach((j) => {
      const support = assembly.supports.find((s) => s.id === j.supportId)!;
      const heel = memberToWorld(j.seatLine[0], member.frame),
        toe = memberToWorld(j.seatLine[1], member.frame);
      expect(heel.y).toBeCloseTo(toe.y, 8);
      expect(toe.x - heel.x).toBeCloseTo(j.seatLengthMm, 8);
      expect(heel.y).toBeCloseTo(support.topReference[0].y, 8);
    });
  });
  it('resolves a third support with stable semantic IDs and ordered fabrication without a new calculator', () => {
    const spec = addPurlin(assemblyDefaults);
    spec.supports[1]!.placement.xMm = 1000;
    spec.supports.push({
      ...structuredClone(spec.supports[1]!),
      id: 'support:purlin-2',
      placement: { mode: 'horizontal-from-wall', xMm: 3000 },
    });
    spec.supports.reverse();
    const { plan } = calculateAssembly(spec);
    expect(plan.datums.map((d) => d.id)).toEqual([
      'datum:eave-top',
      'datum:wall-plate-1-heel',
      'datum:wall-plate-1-toe',
      'datum:purlin-1-heel',
      'datum:purlin-1-toe',
      'datum:purlin-2-heel',
      'datum:purlin-2-toe',
      'datum:ridge-face',
    ]);
    expect(plan.joints.map((j) => j.stationMm)).toEqual(
      [...plan.joints.map((j) => j.stationMm)].sort((a, b) => a - b),
    );
    expect(
      plan.stations.reduce((sum, station) => sum + station.distanceMm, 0),
    ).toBeCloseTo(plan.referenceLengthMm, 9);
    expect(
      plan.steps.flatMap((s) =>
        s.action === 'mark-plumb' ? [s.distanceMm] : [],
      ),
    ).toEqual([...plan.joints.map((j) => j.stationMm), plan.referenceLengthMm]);
  });
  it('depth-controlled seats resolve identically to seat-controlled joints', () => {
    const spec = addPurlin(assemblyDefaults);
    const before = calculateAssembly(spec);
    spec.supports[1]!.joint = {
      kind: 'seat-notch',
      control: 'depth',
      valueMm: before.assembly.joints[1]!.normalDepthMm,
    };
    const after = calculateAssembly(spec);
    expect(after.assembly.joints[1]!.seatLengthMm).toBeCloseTo(90, 10);
    expect(after.plan.joints[1]!.stationMm).toEqual(
      before.plan.joints[1]!.stationMm,
    );
  });
  it.each([-1, 0, 140, 3900, Infinity, NaN])(
    'rejects invalid intermediate support position %s',
    (xMm) => {
      const spec = addPurlin(assemblyDefaults);
      spec.supports[1]!.placement.xMm = xMm;
      expect(assemblySpecSchema.safeParse(spec).success).toBe(false);
    },
  );
  it('accepts documented endpoints and rejects overlaps, duplicate IDs, missing walls and full-depth cuts', () => {
    const spec = addPurlin(assemblyDefaults),
      range = purlinRange(spec, 140);
    for (const xMm of [range.min, range.max]) {
      spec.supports[1]!.placement.xMm = xMm;
      expect(assemblySpecSchema.safeParse(spec).success).toBe(true);
    }
    spec.supports[1]!.id = spec.supports[0]!.id;
    expect(assemblySpecSchema.safeParse(spec).success).toBe(false);
    const missing = structuredClone(spec);
    missing.supports = [];
    expect(assemblySpecSchema.safeParse(missing).success).toBe(false);
    const full = addPurlin(assemblyDefaults);
    full.supports[1]!.joint = {
      kind: 'seat-notch',
      control: 'depth',
      valueMm: 200,
    };
    expect(assemblySpecSchema.safeParse(full).success).toBe(false);
  });
  it('supports zero overhang/ridge and deterministic pure round trips', () => {
    const spec = structuredClone(assemblyDefaults);
    spec.roof.overhangMm = 0;
    spec.ridge.thicknessMm = 0;
    const frozen = JSON.stringify(spec),
      result = calculateAssembly(spec);
    expect(JSON.stringify(spec)).toBe(frozen);
    expect(calculateAssembly(spec)).toEqual(result);
    for (const p of result.assembly.member.profile) {
      const q = worldToMember(
        memberToWorld(p, result.assembly.member.frame),
        result.assembly.member.frame,
      );
      expect(q.x).toBeCloseTo(p.x, 8);
      expect(q.y).toBeCloseTo(p.y, 8);
    }
    expect(result.assembly.endCuts[0]!.line[0]).toEqual(
      result.assembly.joints[0]!.seatLine[0],
    );
    expect(result.assembly.supports.at(-1)!.worldProfile).toEqual([]);
  });
  it('allocates multiple sequential purlins in free segments with ordered fabrication joints', () => {
    const one = addPurlin(assemblyDefaults);
    const two = addPurlin(one);
    const three = addPurlin(two);
    expect(
      assemblyDefaults.supports.filter((support) => support.kind === 'purlin'),
    ).toHaveLength(0);
    expect(
      one.supports.filter((support) => support.kind === 'purlin'),
    ).toHaveLength(1);
    expect(
      two.supports.filter((support) => support.kind === 'purlin'),
    ).toHaveLength(2);
    expect(
      three.supports.filter((support) => support.kind === 'purlin'),
    ).toHaveLength(3);
    expect(three.supports.map((support) => support.id)).toEqual([
      'support:wall-plate-1',
      'support:purlin-1',
      'support:purlin-2',
      'support:purlin-3',
    ]);
    const purlins = three.supports.filter(
      (support) => support.kind === 'purlin',
    );
    expect(
      purlinPlacementSegments(three, 140).every((segment) =>
        purlins.every(
          (support) =>
            segment.max <= support.placement.xMm - 141 ||
            segment.min >= support.placement.xMm + support.section.widthMm + 1,
        ),
      ),
    ).toBe(true);
    expect(assemblySpecSchema.safeParse(three).success).toBe(true);
    const { plan } = calculateAssembly(three);
    expect(plan.joints).toHaveLength(4);
    expect(plan.joints.map((joint) => joint.stationMm)).toEqual(
      [...plan.joints.map((joint) => joint.stationMm)].sort((a, b) => a - b),
    );
    const purlin = three.supports.find(
      (support) => support.id === 'support:purlin-2',
    )!;
    const clamped = clampPurlinPlacement(three, purlin.id, 2000);
    expect(clamped).not.toBe(2000);
    const moved = structuredClone(three);
    moved.supports.find((support) => support.id === purlin.id)!.placement.xMm =
      clamped;
    expect(assemblySpecSchema.safeParse(moved).success).toBe(true);
  });
  it('does not add a purlin when there is no free segment', () => {
    const short = structuredClone(assemblyDefaults);
    short.roof.runMm = 200;
    expect(() => addPurlin(short)).toThrow('no_purlin_space');
  });

  it.each([1, 2, 3])(
    'distributes %s existing purlin(s) with equal geometric clear gaps',
    (count) => {
      let spec = structuredClone(assemblyDefaults);
      for (let index = 0; index < count; index += 1) spec = addPurlin(spec);
      const purlins = spec.supports.filter(
        (support) => support.kind === 'purlin',
      );
      const proposal = distributePurlins(spec, {
        supportIds: purlins.map((support) => support.id),
        mode: 'equal-gaps',
      });
      const positions = proposal.positions.map((position) => position.xMm);
      expect(proposal.positions.map((position) => position.supportId)).toEqual(
        purlins.map((support) => support.id),
      );
      expect(positions[0]).toBeGreaterThan(proposal.rangeStartMm);
      expect(positions.at(-1)! + purlins.at(-1)!.section.widthMm).toBeLessThan(
        proposal.rangeEndMm,
      );
      const gaps = [
        positions[0]! - proposal.rangeStartMm,
        ...purlins
          .slice(1)
          .map(
            (support, index) =>
              positions[index + 1]! -
              (positions[index]! + support.section.widthMm),
          ),
        proposal.rangeEndMm -
          (positions.at(-1)! + purlins.at(-1)!.section.widthMm),
      ];
      gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0]!, 10));
    },
  );

  it('rejects incomplete, duplicate, and impossible purlin distribution requests', () => {
    const spec = addPurlin(assemblyDefaults);
    expect(() =>
      distributePurlins(spec, {
        supportIds: ['support:purlin-1', 'support:purlin-1'],
        mode: 'equal-gaps',
      }),
    ).toThrow('invalid_purlin_distribution');
    expect(() =>
      distributePurlins(spec, {
        supportIds: ['support:not-real'],
        mode: 'equal-gaps',
      }),
    ).toThrow('invalid_purlin_distribution');
    const short = structuredClone(spec);
    short.roof.runMm = 302;
    short.supports[1]!.placement.xMm = 141;
    expect(() =>
      distributePurlins(short, {
        supportIds: ['support:purlin-1'],
        mode: 'equal-gaps',
      }),
    ).toThrow('no_purlin_distribution_space');
  });
});
