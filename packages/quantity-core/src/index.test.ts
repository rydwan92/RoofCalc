import { describe, expect, it } from 'vitest';
import type {
  GableRoofSkeleton,
  RoofOpeningFramingSpec,
  RoofWindowFeature,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';
import {
  assemblyDefaults,
  composeRoofSkeleton,
  convertRoofTemplate,
  createOpeningFramingDraft,
  createRoofSkeleton,
  gableTemplateFromAssembly,
  resolveBattenLayout,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
} from '@cieslacalc/roof-math';
import { createRoofMemberSchedule, physicalAxisLengthMm } from './index';

const section = { widthMm: 80, depthMm: 200 };

function physicalMember(
  id: string,
  lengthMm: number,
  patch: Partial<SkeletonMember3D> = {},
): SkeletonMember3D {
  return {
    id,
    prototypeId: 'member:rafter-1',
    selectionId: id,
    kind: 'rafter',
    from: { x: 0, y: 0, z: 0 },
    to: { x: lengthMm, y: 0, z: 0 },
    section,
    side: 'left',
    ...patch,
  };
}

function skeleton(members: SkeletonMember3D[]): GableRoofSkeleton {
  return { ridgeHeightMm: 0, members };
}

const template = () =>
  gableTemplateFromAssembly(assemblyDefaults, {
    id: 'template:quantity-gable',
    buildingLengthMm: 8100,
    rafterSpacing: { mode: 'max-even-spacing', spacingMm: 1000 },
  });

const opening = (
  id = 'feature:roof-window-1',
  position = { uMm: 800, vMm: 1200 },
): RoofWindowFeature => ({
  id,
  kind: 'roof-window',
  roofPlaneId: 'roof-plane:left',
  widthMm: 780,
  heightMm: 1180,
  position,
});

it('keeps geometric covering pieces separate from timber and build-up quantities', () => {
  const report = createRoofMemberSchedule({
    skeleton: skeleton([physicalMember('instance:rafter-pair-1:left', 5000)]),
    covering: [
      {
        id: 'covering-quantity:main',
        coveringAssignmentId: 'covering:main',
        sourceRoofPlaneIds: ['roof-plane:right', 'roof-plane:left'],
        unit: 'piece',
        quantity: 286,
        fullPositions: 248,
        cutPositions: 38,
        basis: 'roof-tile-geometric-coverage-position-v1',
        productDisplay: { familyName: 'Manual tile' },
        netAreaMm2: 25_000_000,
        declaredQuantityRange: { minimum: 245, maximum: 268 },
        warningKeys: ['no-waste-breakage-accessories-or-offcut-reuse'],
      },
    ],
  });

  expect(report.coveringRows).toEqual([
    expect.objectContaining({
      category: 'covering-product',
      assignmentId: 'covering:main',
      quantity: 286,
      fullPositions: 248,
      cutPositions: 38,
      roofPlaneIds: ['roof-plane:left', 'roof-plane:right'],
      netAreaMm2: 25_000_000,
      declaredQuantityRange: { minimum: 245, maximum: 268 },
    }),
  ]);
  expect(report.coveringSummary.quantity).toBe(286);
  expect(report.timberSummary.quantity).toBe(1);
  expect(report.buildUpSummary.quantity).toBe(0);
});

function acceptedSpec(
  roof: ReturnType<typeof template>,
  feature: RoofWindowFeature,
): RoofOpeningFramingSpec {
  const base = createRoofSkeleton(roof);
  const draft = createOpeningFramingDraft(roof, feature.id);
  const proposal = resolveOpeningFraming({
    template: roof,
    skeleton: base,
    feature,
    framingSpec: draft,
  });
  if (!proposal.geometrySignature) throw new Error('resolved framing expected');
  return { ...draft, acceptedGeometrySignature: proposal.geometrySignature };
}

describe('quantity-core geometric member schedule', () => {
  it('calculates an exact finite 3D physical axis length', () => {
    expect(
      physicalAxisLengthMm(
        { x: 0, y: 0, z: 0 },
        { x: 3000, y: 4000, z: 12000 },
      ),
    ).toBe(13000);
    expect(() =>
      physicalAxisLengthMm({ x: 0, y: 0, z: 0 }, { x: Number.NaN, y: 0, z: 0 }),
    ).toThrow('invalid_member_axis');
    expect(() =>
      physicalAxisLengthMm({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    ).toThrow('invalid_member_axis');
  });

  it('groups equal K1 pieces while counting left and right as physical instances', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([
        physicalMember('K1-left', 5000),
        physicalMember('K1-right', 5000, { side: 'right' }),
      ]),
    });
    expect(report.timberRows).toHaveLength(1);
    expect(report.timberRows[0]).toMatchObject({
      familyKey: 'K1',
      quantity: 2,
      lengthMm: 5000,
      totalLengthMm: 10000,
      lengthBasis: 'axis-geometric',
    });
    expect(report.timberRows[0]!.sourceInstanceIds).toEqual([
      'K1-left',
      'K1-right',
    ]);
  });

  it('aggregates exact rectangular length and volume without intermediate rounding', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([
        physicalMember('a', 1234.56789),
        physicalMember('b', 2345.67891),
      ]),
    });
    expect(report.timberSummary.totalLengthMm).toBe(3580.2468);
    expect(report.timberSummary.totalVolumeMm3).toBeCloseTo(
      80 * 200 * 3580.2468,
      6,
    );
    expect(report.timberSummary.volumeStatus).toBe('complete');
  });

  it('does not group unequal values merely because display rounding would match', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([
        physicalMember('a', 4218.4),
        physicalMember('b', 4218.49),
        physicalMember('c', 4218.40000000001),
      ]),
    });
    expect(report.timberRows).toHaveLength(2);
    expect(report.timberRows.map((row) => row.quantity)).toEqual([2, 1]);
  });

  it('flags and excludes non-finite and zero axes without leaking NaN', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([
        physicalMember('valid', 1000),
        physicalMember('zero', 0),
        physicalMember('nan', 1000, {
          to: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
        }),
      ]),
    });
    expect(report.issues).toEqual([
      { sourceId: 'nan', code: 'invalid-axis' },
      { sourceId: 'zero', code: 'invalid-axis' },
    ]);
    expect(JSON.stringify(report)).not.toMatch(/NaN|Infinity/);
  });

  it('rejects a section declared complete when one dimension is missing', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([physicalMember('invalid-section', 1000)]),
      sectionOverrides: {
        'member:rafter-1': {
          widthMm: 80,
          completeness: 'complete',
        },
      },
    });
    expect(report.timberRows).toEqual([]);
    expect(report.issues).toEqual([
      { sourceId: 'invalid-section', code: 'invalid-section' },
    ]);
  });

  it('counts real gable wall plates and repeated purlin projections', () => {
    const roof = template();
    roof.intermediateSupports = [
      {
        id: 'support:purlin-1',
        kind: 'purlin',
        section: { widthMm: 140, heightMm: 200 },
        placement: { mode: 'horizontal-from-wall', xMm: 2100 },
        joint: { kind: 'seat-notch', control: 'seat', valueMm: 100 },
      },
    ];
    const report = createRoofMemberSchedule({
      skeleton: createRoofSkeleton(roof),
      sectionOverrides: {
        [roof.ridge.id]: {
          widthMm: roof.ridge.thicknessMm,
          completeness: 'partial',
        },
      },
    });
    expect(
      report.timberRows.find((row) => row.memberKind === 'wall-plate'),
    ).toMatchObject({ quantity: 2, familyKey: 'M' });
    expect(
      report.timberRows.find((row) => row.memberKind === 'purlin'),
    ).toMatchObject({ quantity: 2, familyKey: 'P1' });
  });

  it('counts all H1 instances and preserves varying J1 length groups', () => {
    const hip = convertRoofTemplate(template(), 'hip');
    hip.buildingLengthMm = 10000;
    const report = createRoofMemberSchedule({
      skeleton: createRoofSkeleton(hip),
      sectionOverrides: {
        [hip.ridge.id]: {
          widthMm: hip.ridge.thicknessMm,
          completeness: 'partial',
        },
      },
    });
    expect(
      report.timberRows.find((row) => row.memberKind === 'hip-rafter'),
    ).toMatchObject({ quantity: 4, familyKey: 'H1' });
    const jackRows = report.timberRows.filter(
      (row) => row.memberKind === 'jack-rafter',
    );
    expect(jackRows.length).toBeGreaterThan(1);
    expect(new Set(jackRows.map((row) => row.lengthMm)).size).toBe(
      jackRows.length,
    );
  });

  it('reports the ridge linear geometry but marks total volume as partial', () => {
    const roof = template();
    const report = createRoofMemberSchedule({
      skeleton: createRoofSkeleton(roof),
      sectionOverrides: {
        [roof.ridge.id]: {
          widthMm: roof.ridge.thicknessMm,
          completeness: 'partial',
        },
      },
    });
    const ridge = report.timberRows.find((row) => row.memberKind === 'ridge');
    expect(ridge).toMatchObject({ quantity: 1, volumeMm3: undefined });
    expect(ridge?.warningKeys).toContain('incomplete-section-volume-excluded');
    expect(report.timberSummary.volumeStatus).toBe('partial');
    expect(report.timberSummary.excludedVolumeQuantity).toBe(1);
  });

  it('includes ridge volume only when its full optional section is provided', () => {
    const roof = template();
    const report = createRoofMemberSchedule({
      skeleton: createRoofSkeleton(roof),
      sectionOverrides: {
        [roof.ridge.id]: {
          widthMm: roof.ridge.thicknessMm,
          depthMm: 220,
          completeness: 'complete',
        },
      },
    });
    const ridge = report.timberRows.find((row) => row.memberKind === 'ridge');

    expect(ridge?.section).toMatchObject({
      widthMm: roof.ridge.thicknessMm,
      depthMm: 220,
      completeness: 'complete',
    });
    expect(ridge?.volumeMm3).toBeDefined();
  });

  it('uses only accepted composed framing and restores the original schedule exactly', () => {
    const roof = template();
    const feature = opening();
    const base = createRoofSkeleton(roof);
    const before = createRoofMemberSchedule({ skeleton: base });
    const draft = createOpeningFramingDraft(roof, feature.id);
    const proposal = resolveOpeningFraming({
      template: roof,
      skeleton: base,
      feature,
      framingSpec: draft,
    });
    expect(createRoofMemberSchedule({ skeleton: base })).toEqual(before);
    const accepted = resolveOpeningFraming({
      template: roof,
      skeleton: base,
      feature,
      framingSpec: acceptedSpec(roof, feature),
    });
    const after = createRoofMemberSchedule({
      skeleton: composeRoofSkeleton(base, [accepted]),
    });
    expect(
      after.rows.some((row) =>
        row.sourceInstanceIds.includes(accepted.affectedMemberInstanceIds[0]!),
      ),
    ).toBe(false);
    expect(
      after.timberRows.filter((row) => row.memberKind === 'rafter-segment'),
    ).toHaveLength(2);
    expect(
      after.timberRows.filter((row) => row.memberKind === 'opening-header'),
    ).toHaveLength(2);
    expect(
      createRoofMemberSchedule({ skeleton: composeRoofSkeleton(base, []) }),
    ).toEqual(before);
    expect(proposal.framingSpecId).toBe(draft.id);
  });

  it('does not apply needs-review framing to quantities', () => {
    const roof = template();
    const feature = opening();
    const spec = acceptedSpec(roof, feature);
    const changed = { ...roof, buildingLengthMm: 9000 };
    const base = createRoofSkeleton(changed);
    const result = resolveOpeningFraming({
      template: changed,
      skeleton: base,
      feature,
      framingSpec: spec,
    });
    expect(result.reviewStatus).toBe('needs-review');
    expect(composeRoofSkeleton(base, [result])).toEqual(base);
  });

  it('supports two independent accepted openings with deterministic row IDs and order', () => {
    const roof = template();
    const base = createRoofSkeleton(roof);
    const first = opening();
    const second = opening('feature:roof-window-2', { uMm: 3500, vMm: 1200 });
    const projection = resolveOpeningFramingSet({
      template: roof,
      skeleton: base,
      features: [first, second],
      framingSpecs: [acceptedSpec(roof, first), acceptedSpec(roof, second)],
    });
    const one = createRoofMemberSchedule({
      skeleton: projection.composedSkeleton,
    });
    const two = createRoofMemberSchedule({
      skeleton: projection.composedSkeleton,
    });
    expect(one).toEqual(two);
    expect(one.timberRows.filter((row) => row.familyKey === 'O1')).not.toEqual(
      [],
    );
    expect(one.timberRows.filter((row) => row.familyKey === 'O2')).not.toEqual(
      [],
    );
    expect(new Set(one.rows.map((row) => row.id)).size).toBe(one.rows.length);
  });

  it('projects clipped batten rows as visible geometry, never stock pieces', () => {
    const roof = template();
    const layout = {
      enabled: true,
      battenHeightMm: 40,
      battenWidthMm: 60,
      gaugeMm: 350,
      eaveOffsetMm: 250,
    };
    const feature = opening();
    const unclipped = resolveBattenLayout({ template: roof, layout });
    const clipped = resolveBattenLayout({
      template: roof,
      layout,
      features: [feature],
    });
    const report = createRoofMemberSchedule({
      skeleton: skeleton([]),
      buildUp: clipped.battens.map((batten) => ({
        id: batten.id,
        familyKey: 'L',
        memberKind: 'batten',
        lengthMm: batten.usableLengthMm,
        section: { widthMm: 60, depthMm: 40 },
        segmentCount: batten.segments.length,
      })),
    });
    expect(report.buildUpSummary.quantity).toBe(clipped.battens.length);
    expect(report.buildUpSummary.totalLengthMm).toBe(clipped.totalLengthMm);
    expect(report.buildUpSummary.totalLengthMm).toBeLessThan(
      unclipped.totalLengthMm,
    );
    expect(
      report.buildUpRows.every((row) => row.lengthBasis === 'resolved-visible'),
    ).toBe(true);
  });

  it('keeps membrane area separate from counter-batten and batten lengths', () => {
    const report = createRoofMemberSchedule({
      skeleton: skeleton([]),
      buildUp: [
        {
          id: 'counter-batten:roof-plane:left:1',
          familyKey: 'KL',
          memberKind: 'counter-batten',
          lengthMm: 5200,
          section: { widthMm: 40, depthMm: 60 },
        },
        {
          id: 'batten:roof-plane:left:1',
          familyKey: 'L',
          memberKind: 'batten',
          lengthMm: 8100,
          section: { widthMm: 60, depthMm: 40 },
        },
      ],
      surfaceBuildUp: [
        {
          id: 'surface:roof-plane:left',
          familyKey: 'MEM',
          memberKind: 'membrane',
          roofPlaneId: 'roof-plane:left',
          areaMm2: 81_200_000,
        },
        {
          id: 'surface:roof-plane:right',
          familyKey: 'MEM',
          memberKind: 'membrane',
          roofPlaneId: 'roof-plane:right',
          areaMm2: 79_500_000,
        },
      ],
    });
    expect(report.buildUpRows.map((row) => row.memberKind)).toEqual([
      'counter-batten',
      'batten',
    ]);
    expect(report.surfaceBuildUpRows).toEqual([
      expect.objectContaining({
        memberKind: 'membrane',
        areaMm2: 160_700_000,
        basis: 'net-geometric',
      }),
    ]);
    expect(report.surfaceBuildUpSummary.areaMm2).toBe(160_700_000);
  });
});
