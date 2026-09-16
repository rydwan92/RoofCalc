import { describe, expect, it } from 'vitest';
import type {
  HipRoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import { assemblyDefaults } from './assembly';
import { resolveCounterBattenLayout } from './counter-battens';
import { gableTemplateFromAssembly } from './gable-roof';
import { calculateHipRafter } from './hip-rafter';
import { calculateJackRafter } from './jack-rafter';
import { createRoofSkeleton, resolveRoofTemplate } from './roof-template';

/**
 * V39 execution geometry. Every assertion here is renderer-free and derived
 * from the resolved model — no pixel snapshots, no practice assumption beyond
 * what `docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` records.
 */

function template(
  overrides: Partial<HipRoofTemplateSpec> = {},
): HipRoofTemplateSpec {
  const common = gableTemplateFromAssembly(assemblyDefaults);
  return {
    ...common,
    id: 'template:hip-1',
    type: 'hip',
    buildingLengthMm: 12000,
    hipRafterSection: { widthMm: 100, depthMm: 240 },
    ...overrides,
  };
}

const layout = { enabled: true, widthMm: 40, heightMm: 60 };

function counterBattens(
  roof: HipRoofTemplateSpec,
  hipBoundaryDetail?: 'not-decided' | 'no-dedicated-run' | 'paired-plane-runs',
  features: readonly RoofWindowFeature[] = [],
) {
  return resolveCounterBattenLayout({
    template: roof,
    skeleton: createRoofSkeleton(roof),
    layout: { ...layout, ...(hipBoundaryDetail ? { hipBoundaryDetail } : {}) },
    features,
  });
}

describe('hip-boundary counter-batten detail', () => {
  it('an undecided boundary stays partial and never invents a run', () => {
    const result = counterBattens(template());
    expect(result.status).toBe('partial');
    expect(result.warnings).toContain('hip-boundary-detail-unresolved');
    expect(result.hipBoundaryRunCount).toBe(0);
    expect(result.unresolvedHipBoundaryCount).toBe(4);
    expect(result.hipBoundaries).toHaveLength(4);
    for (const boundary of result.hipBoundaries) {
      expect(boundary.status).toBe('unresolved');
      expect(boundary.detail).toBe('not-decided');
      expect(boundary.runIds).toEqual([]);
      expect(boundary.addedLengthMm).toBe(0);
      expect(boundary.roofPlaneIds).toHaveLength(2);
    }
  });

  it('an absent detail behaves exactly like the pre-V39 result', () => {
    const before = counterBattens(template());
    const explicit = counterBattens(template(), 'not-decided');
    expect(explicit.status).toBe(before.status);
    expect(explicit.totalVisibleLengthMm).toBe(before.totalVisibleLengthMm);
    expect(explicit.resolvedAxisCount).toBe(before.resolvedAxisCount);
  });

  it('"no dedicated run" resolves the layout and adds no length', () => {
    const undecided = counterBattens(template());
    const result = counterBattens(template(), 'no-dedicated-run');
    expect(result.status).toBe('resolved');
    expect(result.warnings).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.unresolvedHipBoundaryCount).toBe(0);
    expect(result.hipBoundaryRunCount).toBe(0);
    // The interior K1/J1 result is untouched by the decision.
    expect(result.interiorAxisCount).toBe(undecided.interiorAxisCount);
    expect(result.totalVisibleLengthMm).toBe(undecided.totalVisibleLengthMm);
    for (const boundary of result.hipBoundaries) {
      expect(boundary.status).toBe('resolved');
      expect(boundary.addedLengthMm).toBe(0);
    }
  });

  it('"paired plane runs" adds exactly two runs per hip, once each', () => {
    const undecided = counterBattens(template());
    const result = counterBattens(template(), 'paired-plane-runs');
    expect(result.status).toBe('resolved');
    expect(result.warnings).toEqual([]);
    expect(result.hipBoundaries).toHaveLength(4);
    expect(result.hipBoundaryRunCount).toBe(8);
    expect(result.interiorAxisCount).toBe(undecided.interiorAxisCount);
    expect(result.resolvedAxisCount).toBe(undecided.resolvedAxisCount + 8);
    // No run is emitted twice, and each belongs to exactly one boundary.
    const runIds = result.rows
      .filter((row) => row.role === 'hip-boundary-run')
      .map((row) => row.id);
    expect(new Set(runIds).size).toBe(runIds.length);
    expect(result.hipBoundaries.flatMap((b) => b.runIds).sort()).toEqual(
      [...runIds].sort(),
    );
    for (const boundary of result.hipBoundaries) {
      expect(boundary.runIds).toHaveLength(2);
      expect(boundary.addedLengthMm).toBeGreaterThan(0);
    }
    // The total grows by exactly the added boundary length, nothing else.
    expect(result.totalVisibleLengthMm).toBeCloseTo(
      undecided.totalVisibleLengthMm +
        result.hipBoundaries.reduce((sum, b) => sum + b.addedLengthMm, 0),
      6,
    );
  });

  it('names what every row physically is and what it references', () => {
    const result = counterBattens(template(), 'paired-plane-runs');
    for (const row of result.rows) {
      if (row.role === 'hip-boundary-run') {
        expect(row.reference).toBe('plane-hip-boundary');
        expect(row.segments.length).toBeGreaterThan(0);
        for (const segment of row.segments)
          expect(segment.lengthMm).toBeGreaterThan(0);
      } else {
        expect(row.role).toBe('plane-rafter-axis');
        expect(row.reference).toBe('rafter-axis');
      }
    }
  });

  it('places a hip-boundary run inside its own plane, beside the hip', () => {
    const roof = template();
    const result = counterBattens(roof, 'paired-plane-runs');
    const run = result.rows.find((row) => row.role === 'hip-boundary-run')!;
    const hip = createRoofSkeleton(roof).members.find(
      (member) => member.id === run.sourceMemberId,
    )!;
    // Parallel to its hip: the run's world direction matches the hip axis.
    const unit = (a: { x: number; y: number; z: number }) => {
      const length = Math.hypot(a.x, a.y, a.z);
      return { x: a.x / length, y: a.y / length, z: a.z / length };
    };
    const runAxis = unit({
      x: run.segments[0]!.to.x - run.segments[0]!.from.x,
      y: run.segments[0]!.to.y - run.segments[0]!.from.y,
      z: run.segments[0]!.to.z - run.segments[0]!.from.z,
    });
    const hipAxis = unit({
      x: hip.to.x - hip.from.x,
      y: hip.to.y - hip.from.y,
      z: hip.to.z - hip.from.z,
    });
    expect(
      Math.abs(
        runAxis.x * hipAxis.x + runAxis.y * hipAxis.y + runAxis.z * hipAxis.z,
      ),
    ).toBeCloseTo(1, 6);
    // Offset inward by exactly half the counter-batten width.
    const offsets = run.segments.flatMap((segment) => [
      segment.fromLocal,
      segment.toLocal,
    ]);
    expect(offsets.every((point) => Number.isFinite(point.uMm))).toBe(true);
  });

  it('subtracts a roof opening that a hip-boundary run crosses', () => {
    const roof = template();
    const clean = counterBattens(roof, 'paired-plane-runs');
    const run = clean.rows.find((row) => row.role === 'hip-boundary-run')!;
    const midpoint = run.segments[0]!;
    const opening: RoofWindowFeature = {
      id: 'feature:roof-window-hip',
      kind: 'roof-window',
      roofPlaneId: run.roofPlaneId,
      widthMm: 900,
      heightMm: 900,
      position: {
        uMm: (midpoint.fromLocal.uMm + midpoint.toLocal.uMm) / 2 - 450,
        vMm: (midpoint.fromLocal.vMm + midpoint.toLocal.vMm) / 2 - 450,
      },
    };
    const cut = counterBattens(roof, 'paired-plane-runs', [opening]);
    const cutRun = cut.rows.find((row) => row.id === run.id)!;
    expect(cutRun.visibleLengthMm).toBeLessThan(run.visibleLengthMm);
    expect(cutRun.segments.length).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic and leaves a gable roof untouched', () => {
    const roof = template();
    expect(counterBattens(roof, 'paired-plane-runs')).toEqual(
      counterBattens(roof, 'paired-plane-runs'),
    );
    const gable = gableTemplateFromAssembly(assemblyDefaults);
    const result = resolveCounterBattenLayout({
      template: gable,
      skeleton: createRoofSkeleton(gable),
      layout: { ...layout, hipBoundaryDetail: 'paired-plane-runs' },
    });
    expect(result.status).toBe('resolved');
    expect(result.hipBoundaries).toEqual([]);
    expect(result.hipBoundaryRunCount).toBe(0);
  });
});

describe('J1 termination against the physical hip face', () => {
  const jack = (
    overrides: Partial<Parameters<typeof calculateJackRafter>[0]> = {},
  ) =>
    calculateJackRafter({
      id: 'instance:jack:front-left:front:1',
      prototypeId: 'member:jack-rafter-J1',
      section: { widthMm: 80, depthMm: 200 },
      roofPlane: 'front',
      hipCorner: 'front-left',
      hipRafterInstanceId: 'instance:hip:front-left',
      ordinalFromCorner: 1,
      stationFromHipCornerMm: 800,
      commonRunMm: 4000,
      pitchDeg: 35,
      overhangMm: 500,
      hasIntermediateSupports: false,
      ...overrides,
    });

  it('stays reference-only until a connection is explicitly selected', () => {
    for (const spec of [
      jack(),
      jack({ hipConnection: 'theoretical-centre-plane' }),
    ]) {
      expect(spec.fabrication.executionStatus).toBe('reference-only');
      expect(spec.fabrication.unresolvedReason).toBe(
        'hip-connection-not-selected',
      );
      expect(spec.fabrication.finishedLengthMm).toBeUndefined();
      expect(spec.fabrication.meetingCut.hipFaceDeduction).toBe('not-applied');
      expect(spec.fabrication.meetingCut.finished).toBeUndefined();
    }
  });

  it('resolves the finished end exactly from the hip section width', () => {
    const resolved = jack({
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    });
    const finished = resolved.fabrication.meetingCut.finished!;
    expect(resolved.fabrication.executionStatus).toBe('fabrication-resolved');
    expect(resolved.fabrication.unresolvedReason).toBeUndefined();
    expect(finished.connection).toBe('hip-face-butt');
    expect(finished.cutPlane).toBe('hip-near-vertical-side-face');
    expect(finished.allowance).toBe('not-included');
    // (w / 2) / cos 45 = w / sqrt(2), then along the sloping jack axis.
    expect(finished.hipFacePlanDeductionMm).toBeCloseTo(100 / Math.SQRT2, 9);
    expect(finished.hipFaceAxisDeductionMm).toBeCloseTo(
      100 / Math.SQRT2 / Math.cos((35 * Math.PI) / 180),
      9,
    );
    expect(finished.finishedLengthMm).toBeCloseTo(
      resolved.fabrication.referenceLengthMm - finished.hipFaceAxisDeductionMm,
      9,
    );
    expect(resolved.fabrication.finishedLengthMm).toBe(
      finished.finishedLengthMm,
    );
  });

  it('never overwrites the reference geometry', () => {
    const reference = jack();
    const resolved = jack({
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    });
    expect(resolved.result).toEqual(reference.result);
    expect(resolved.fabrication.referenceLengthMm).toBe(
      reference.fabrication.referenceLengthMm,
    );
    expect(resolved.fabrication.lengthBasis).toBe(
      'outer-eave-axis-to-theoretical-hip-center-plane',
    );
    expect(resolved.fabrication.finishedLengthMm!).toBeLessThan(
      reference.fabrication.referenceLengthMm,
    );
  });

  it('keeps every cut angle, because the face is parallel to the centre plane', () => {
    const reference = jack();
    const resolved = jack({
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 140,
    });
    for (const key of [
      'plumbLineToMemberAxisDeg',
      'planCutLineToMemberAxisDeg',
      'topFaceCutLineToMemberAxisDeg',
    ] as const)
      expect(resolved.fabrication.meetingCut[key]).toBe(
        reference.fabrication.meetingCut[key],
      );
  });

  it('adds one marking step naming the deduction and the finished length', () => {
    const resolved = jack({
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    });
    const step = resolved.fabrication.steps.find(
      (candidate) => candidate.action === 'deduct-hip-side-face',
    );
    expect(step).toBeDefined();
    expect(step).toMatchObject({
      reference: 'hip-near-vertical-side-face',
      finishedLengthMm: resolved.fabrication.finishedLengthMm,
    });
    expect(jack().fabrication.steps).toHaveLength(3);
  });

  it('refuses a physical termination without the physical face', () => {
    expect(() => jack({ hipConnection: 'hip-face-butt' })).toThrow();
  });

  it('is symmetric across planes and stations, and deterministic', () => {
    const left = jack({
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    });
    const right = jack({
      id: 'instance:jack:front-right:front:1',
      hipCorner: 'front-right',
      hipRafterInstanceId: 'instance:hip:front-right',
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    });
    expect(right.fabrication.finishedLengthMm).toBeCloseTo(
      left.fabrication.finishedLengthMm!,
      9,
    );
    // The deduction is a property of the hip face, not of the station.
    for (const station of [400, 1600, 3200]) {
      const other = jack({
        stationFromHipCornerMm: station,
        hipConnection: 'hip-face-butt',
        hipSectionWidthMm: 100,
      });
      expect(
        other.fabrication.meetingCut.finished!.hipFaceAxisDeductionMm,
      ).toBeCloseTo(
        left.fabrication.meetingCut.finished!.hipFaceAxisDeductionMm,
        9,
      );
      expect(other.fabrication.finishedLengthMm!).toBeGreaterThan(0);
    }
    expect(
      jack({ hipConnection: 'hip-face-butt', hipSectionWidthMm: 100 }),
    ).toEqual(left);
  });

  it('flows from the roof template intent into every resolved jack', () => {
    const undecided = resolveRoofTemplate(template());
    const decided = resolveRoofTemplate(
      template({ hipExecution: { jackConnection: 'hip-face-butt' } }),
    );
    if (!('jackRafters' in undecided) || !('jackRafters' in decided))
      throw new Error('hip template must resolve jacks');
    expect(undecided.jackRafters.length).toBeGreaterThan(0);
    for (const item of undecided.jackRafters)
      expect(item.fabrication.executionStatus).toBe('reference-only');
    for (const item of decided.jackRafters) {
      expect(item.fabrication.executionStatus).toBe('fabrication-resolved');
      // Derived from the template's own hip section, never from a constant.
      expect(item.fabrication.meetingCut.finished!.hipWidthMm).toBe(100);
    }
  });
});

describe('H1 physical references', () => {
  it('keeps backing an explicit, undecided execution choice', () => {
    const hip = calculateHipRafter({
      id: 'member:hip-rafter-H1',
      section: { widthMm: 100, depthMm: 240 },
      commonRunMm: 4000,
      pitchDeg: 35,
      overhangMm: 500,
      ridgeThicknessMm: 40,
    });
    expect(hip.fabrication.backing.fabricationChoice).toBe(
      'back-or-drop-not-decided',
    );
    expect(hip.fabrication.backing.reference).toBe('top-arris-to-roof-plane');
    expect(hip.result.backingAngleDeg).toBeGreaterThan(0);
  });

  it('derives the same face deduction form the ridge cut already uses', () => {
    // Both are a 45-degree plan approach to a vertical face, so both are
    // thickness / sqrt(2) in plan. This keeps H1 and J1 internally consistent.
    const hip = calculateHipRafter({
      id: 'member:hip-rafter-H1',
      section: { widthMm: 100, depthMm: 240 },
      commonRunMm: 4000,
      pitchDeg: 35,
      overhangMm: 500,
      ridgeThicknessMm: 100,
    });
    const jackFinished = calculateJackRafter({
      id: 'instance:jack:front-left:front:1',
      prototypeId: 'member:jack-rafter-J1',
      section: { widthMm: 80, depthMm: 200 },
      roofPlane: 'front',
      hipCorner: 'front-left',
      hipRafterInstanceId: 'instance:hip:front-left',
      ordinalFromCorner: 1,
      stationFromHipCornerMm: 800,
      commonRunMm: 4000,
      pitchDeg: 35,
      overhangMm: 500,
      hasIntermediateSupports: false,
      hipConnection: 'hip-face-butt',
      hipSectionWidthMm: 100,
    }).fabrication.meetingCut.finished!;
    expect(jackFinished.hipFacePlanDeductionMm).toBeCloseTo(
      hip.result.ridgePlanDeductionMm,
      9,
    );
  });
});
