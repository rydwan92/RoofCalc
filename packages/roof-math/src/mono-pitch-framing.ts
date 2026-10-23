import { z } from 'zod';
import {
  counterBattenRowsOnPlane,
  summarizeCounterBattens,
  type CounterBattenLayoutResult,
} from './counter-battens';
import type {
  AssemblySpec,
  CounterBattenLayoutSpec,
  FabricationPlan,
  RafterSpacingSpec,
  ResolvedAssembly,
  ResolvedMemberPrototype,
  ResolvedRafterSpacing,
  RoofSkeleton,
  SkeletonMember3D,
  TimberSection,
} from '@cieslacalc/timber-model';
import {
  createFabricationPlan,
  resolveAssemblyGeometry,
  seatLength,
} from './assembly';
import { rafterSpacingSchema, resolveRafterSpacing } from './gable-roof';
import {
  monoPitchRoofSpecSchema,
  resolveMonoPitchRoof,
  type MonoPitchRoofGeometry,
  type MonoPitchRoofSpec,
} from './mono-pitch-roof';

/**
 * VNext-7B mono-pitch FRAMING: common rafters on a low and a high support,
 * resolved by the same rafter solver as the gable and hip roofs
 * (`resolveAssemblyGeometry`, upper end `top`) — no second geometry engine.
 *
 * Frame (docs/domain/MONO_PITCH_ROOF.md §8): x = 0 at the outer face of the
 * low plate, `runMm` to the outer face of the high support (the face of the
 * higher wall for an abutment). Each birdsmouth's heel sits on its
 * support's downslope face; the roof reference plane of the surface
 * passes through the heel–seat corner of the low plate, as for a gable.
 */
export interface MonoPitchSupportSpec {
  /** `ledger`: a plate fixed to the face of a higher wall (abutment only). */
  kind: 'wall-plate' | 'ledger';
  widthMm: number;
  heightMm: number;
  /** Horizontal seat of the birdsmouth on this support. */
  seatMm: number;
}

export interface MonoPitchFramingSpec {
  roof: MonoPitchRoofSpec;
  rafter: { section: TimberSection; spacing: RafterSpacingSpec };
  lowSupport: MonoPitchSupportSpec;
  highSupport: MonoPitchSupportSpec;
}

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);
const supportSchema = z.object({
  kind: z.enum(['wall-plate', 'ledger']),
  widthMm: mm(1, 2000),
  heightMm: mm(1, 2000),
  seatMm: mm(0.001, 2000),
});

export const monoPitchFramingSpecSchema: z.ZodType<MonoPitchFramingSpec> = z
  .object({
    roof: monoPitchRoofSpecSchema,
    rafter: z.object({
      section: z.object({ widthMm: mm(1, 1000), depthMm: mm(1, 2000) }),
      spacing: rafterSpacingSchema,
    }),
    lowSupport: supportSchema,
    highSupport: supportSchema,
  })
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const sin = Math.sin((spec.roof.pitchDeg * Math.PI) / 180);
    if (spec.lowSupport.kind !== 'wall-plate')
      issue(['lowSupport', 'kind'], 'low_support_is_wall_plate');
    // An abutment ends against a higher wall: the rafters bear on a ledger
    // fixed to that wall; a free top edge rests on the high wall's plate.
    if (spec.roof.topEdge === 'abutment' && spec.highSupport.kind !== 'ledger')
      issue(['highSupport', 'kind'], 'abutment_needs_ledger');
    if (spec.roof.topEdge === 'free' && spec.highSupport.kind === 'ledger')
      issue(['highSupport', 'kind'], 'ledger_needs_abutment');
    for (const key of ['lowSupport', 'highSupport'] as const) {
      const support = spec[key];
      if (support.seatMm > support.widthMm + 1e-8)
        issue([key, 'seatMm'], 'seat_exceeds_support');
      if (support.seatMm * sin >= spec.rafter.section.depthMm)
        issue([key, 'seatMm'], 'notch_consumes_depth');
    }
    if (
      spec.lowSupport.widthMm + 1 >
      spec.roof.runMm - spec.highSupport.widthMm
    )
      issue(['highSupport', 'widthMm'], 'supports_overlap');
  }) as z.ZodType<MonoPitchFramingSpec>;

/** What the framing solver answers; anything else is reported, not guessed. */
export const MONO_PITCH_FRAMING_SCOPE = {
  surfaceGeometry: 'supported',
  framing: 'supported',
  fabrication: 'supported',
  intermediateSupports: 'not-supported',
  covering: 'not-supported',
  drainage: 'not-supported',
  structuralCheck: 'not-checked',
} as const;

/** Opaque IDs (ADR-007); meaning travels in structured fields. */
export const MONO_PITCH_RAFTER_ID = 'member:mono-rafter';
const LOW_SUPPORT_ID = 'support:mono-low';
const HIGH_SUPPORT_ID = 'support:mono-high';
const TOP_END_ID = 'terminal:mono-top';

export interface MonoPitchFraming {
  spec: MonoPitchFramingSpec;
  surface: MonoPitchRoofGeometry;
  calculation: { assembly: ResolvedAssembly; plan: FabricationPlan };
  rafterSpacing: ResolvedRafterSpacing;
  memberPrototypes: ResolvedMemberPrototype[];
  /** Plate tops above the project datum (the low plate top is the datum). */
  plates: {
    lowTopMm: number;
    highTopMm: number;
    /** What the high wall must rise above the low one, plate top to top. */
    differenceMm: number;
  };
  /** Horizontal x of the rafter's top plumb end in the frame. */
  topEndXmm: number;
  supportIds: { low: string; high: string };
  scope: typeof MONO_PITCH_FRAMING_SCOPE;
}

/** The single rafter as the shared solver's input. */
export function monoPitchRafterAssembly(spec: MonoPitchFramingSpec): {
  assembly: AssemblySpec;
  topEndXmm: number;
} {
  const { roof } = spec;
  const topEndXmm = roof.runMm + roof.highOverhangMm;
  const support = (
    id: string,
    plate: MonoPitchSupportSpec,
    xMm: number,
  ): AssemblySpec['supports'][number] => ({
    id,
    // A ledger is a plate fixed to a wall: the same seat contact.
    kind: 'wall-plate',
    section: { widthMm: plate.widthMm, heightMm: plate.heightMm },
    placement: { mode: 'horizontal-from-wall', xMm },
    joint: { kind: 'seat-notch', control: 'seat', valueMm: plate.seatMm },
  });
  return {
    topEndXmm,
    assembly: {
      roof: {
        runMm: topEndXmm,
        pitchDeg: roof.pitchDeg,
        overhangMm: roof.lowEaveOverhangMm,
      },
      member: { id: MONO_PITCH_RAFTER_ID, section: spec.rafter.section },
      supports: [
        support(LOW_SUPPORT_ID, spec.lowSupport, 0),
        support(
          HIGH_SUPPORT_ID,
          spec.highSupport,
          roof.runMm - spec.highSupport.widthMm,
        ),
      ],
      // No ridge: a zero-thickness terminal gives the plain plumb end.
      ridge: { id: TOP_END_ID, thicknessMm: 0 },
    },
  };
}

/**
 * Pitch from the two plate tops (wall heights): the exact inverse of
 * `differenceMm` for the given supports.
 */
export function monoPitchFromPlateTops(input: {
  lowTopMm: number;
  highTopMm: number;
  runMm: number;
  lowSeatMm: number;
  highSeatMm: number;
  highSupportWidthMm: number;
}): number {
  const horizontal =
    input.runMm - input.highSupportWidthMm + input.highSeatMm - input.lowSeatMm;
  const rise = input.highTopMm - input.lowTopMm;
  if (!(horizontal > 0)) throw new RangeError('supports_overlap');
  if (!(rise > 0)) throw new RangeError('not_rising');
  const pitch = (Math.atan(rise / horizontal) * 180) / Math.PI;
  if (pitch < 1 || pitch > 80) throw new RangeError('pitch_out_of_range');
  return pitch;
}

export function resolveMonoPitchFraming(
  input: MonoPitchFramingSpec,
): MonoPitchFraming {
  const spec = monoPitchFramingSpecSchema.parse(input);
  const surface = resolveMonoPitchRoof(spec.roof);
  const { assembly: assemblySpec, topEndXmm } = monoPitchRafterAssembly(spec);
  const assembly = resolveAssemblyGeometry(assemblySpec, 'top');
  const plan = createFabricationPlan(assembly);
  const rafterSpacing = resolveRafterSpacing(
    spec.roof.buildingLengthMm,
    spec.rafter.spacing,
  );
  // One rafter per station (a gable has a left and a right one).
  const instanceIds = rafterSpacing.stations.map(
    (station) => `${station.id}:mono`,
  );
  const tan = Math.tan((spec.roof.pitchDeg * Math.PI) / 180);
  const [low, high] = assemblySpec.supports;
  // Each seat is horizontal through its toe on the rafter's lower edge.
  const lowSeat = seatLength(low!, spec.roof.pitchDeg);
  const toeRise =
    (high!.placement.xMm + seatLength(high!, spec.roof.pitchDeg) - lowSeat) *
    tan;
  const datum = spec.roof.lowBearingElevationMm ?? 0;
  return {
    spec,
    surface,
    calculation: { assembly, plan },
    rafterSpacing,
    memberPrototypes: [
      {
        id: MONO_PITCH_RAFTER_ID,
        code: 'K1',
        kind: 'common-rafter',
        section: spec.rafter.section,
        instanceIds,
        count: instanceIds.length,
        lengthRangeMm: {
          min: plan.minimumStockLengthMm,
          max: plan.minimumStockLengthMm,
        },
        fabricationMode: 'shared',
      },
    ],
    plates: {
      lowTopMm: datum,
      highTopMm: datum + toeRise,
      differenceMm: toeRise,
    },
    topEndXmm,
    supportIds: { low: LOW_SUPPORT_ID, high: HIGH_SUPPORT_ID },
    scope: MONO_PITCH_FRAMING_SCOPE,
  };
}

/**
 * VNext-7B-2: the mono-pitch roof in world XYZ for the timber schedule, the
 * 3D scene and counter-battens — the same conventions as the gable skeleton
 * (`createGableRoofSkeletonFromResolved`): x across the span from the low
 * plate's outer face, y along the building, z up; plates as lines along the
 * building at their outer face and seat level; rafters as lines on the roof
 * reference plane between the eave and the top plumb end. Explanatory
 * reference geometry — fabrication stays in the 2D rafter solution.
 */
export function createMonoPitchSkeleton(
  framing: MonoPitchFraming,
): RoofSkeleton {
  const { roof } = framing.spec;
  const tan = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const length = roof.buildingLengthMm;
  const eaveX = -roof.lowEaveOverhangMm;
  const plate = (
    id: string,
    support: MonoPitchSupportSpec,
    x: number,
    z: number,
    side: SkeletonMember3D['side'],
  ): SkeletonMember3D => ({
    id,
    prototypeId: id,
    selectionId: id,
    kind: 'wall-plate',
    from: { x, y: 0, z },
    to: { x, y: length, z },
    section: { widthMm: support.widthMm, depthMm: support.heightMm },
    side,
  });
  const [prototype] = framing.memberPrototypes;
  const members: SkeletonMember3D[] = [
    plate(framing.supportIds.low, framing.spec.lowSupport, 0, 0, 'left'),
    plate(
      framing.supportIds.high,
      framing.spec.highSupport,
      roof.runMm,
      framing.plates.differenceMm,
      'right',
    ),
    ...framing.rafterSpacing.stations.map((station, index) => ({
      id: prototype!.instanceIds[index]!,
      prototypeId: prototype!.id,
      selectionId: prototype!.instanceIds[index]!,
      kind: 'rafter' as const,
      from: { x: eaveX, y: station.alongBuildingMm, z: eaveX * tan },
      to: {
        x: framing.topEndXmm,
        y: station.alongBuildingMm,
        z: framing.topEndXmm * tan,
      },
      section: prototype!.section,
      side: 'center' as const,
      stationMm: station.alongBuildingMm,
    })),
  ];
  return {
    // The highest point of the reference plane: the rafters' top ends.
    ridgeHeightMm: framing.topEndXmm * tan,
    members,
    guides: [
      {
        id: 'guide:roof-plane-mono',
        kind: 'roof-plane',
        points: framing.surface.planes[0].worldPolygon.map((p) => ({ ...p })),
      },
    ],
  };
}

/**
 * VNext-7B-2: counter-battens along the mono-pitch rafters through the one
 * per-plane rule (`counterBattenRowsOnPlane`) and the one summary.
 */
export function resolveMonoPitchCounterBattens(
  framing: MonoPitchFraming,
  skeleton: RoofSkeleton,
  layout: CounterBattenLayoutSpec,
): CounterBattenLayoutResult {
  if (!layout.enabled)
    return { ...summarizeCounterBattens([], []), status: 'disabled' };
  if (
    !(Number.isFinite(layout.widthMm) && layout.widthMm > 0) ||
    !(Number.isFinite(layout.heightMm) && layout.heightMm > 0)
  )
    return summarizeCounterBattens(
      [],
      [{ code: 'invalid-counter-batten-section' }],
    );
  const [plane] = framing.surface.planes;
  const unknown = (layout.roofPlaneIds ?? []).filter(
    (id) => id !== plane.roofPlaneId,
  );
  if (layout.roofPlaneIds && !layout.roofPlaneIds.includes(plane.roofPlaneId))
    return summarizeCounterBattens(
      [],
      unknown.map((roofPlaneId) => ({
        code: 'unknown-roof-plane' as const,
        roofPlaneId,
      })),
    );
  const { rows, issues } = counterBattenRowsOnPlane({
    roofPlaneId: plane.roofPlaneId,
    basis: plane.basis,
    rafterSide: 'center',
    skeleton,
    layout,
  });
  return summarizeCounterBattens(rows, [
    ...issues,
    ...unknown.map((roofPlaneId) => ({
      code: 'unknown-roof-plane' as const,
      roofPlaneId,
    })),
  ]);
}
