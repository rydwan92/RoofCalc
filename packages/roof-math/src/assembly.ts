import { z } from 'zod';
import type {
  AssemblySpec,
  Datum,
  FabricationPlan,
  Frame2D,
  Point2D,
  ResolvedAssembly,
  ResolvedJoint,
  Support2D,
  SupportSpec,
} from '@cieslacalc/timber-model';
import {
  workbenchDefaults,
  workbenchInputSchema,
  type WorkbenchInput,
} from './rafters/rafter-workbench';
import { calculateBirdsmouth } from './cuts/birdsmouth';
import { calculateRidgeCut } from './cuts/ridge-cut';
import { memberToWorld, worldToMember } from './geometry/frame2d';
import { intersectLines, offsetLine, type Line2D } from './geometry/lines';

const mm = (min: number, max: number) => z.number().finite().min(min).max(max);
const entityId = z.string().regex(/^[a-z][a-z0-9:-]*$/);
export const supportSpecSchema = z.object({
  id: z.string().regex(/^support:[a-z][a-z0-9:-]*$/),
  kind: z.enum(['wall-plate', 'purlin']),
  section: z.object({ widthMm: mm(1, 2000), heightMm: mm(1, 2000) }),
  placement: z.object({
    mode: z.literal('horizontal-from-wall'),
    xMm: mm(0, 100000),
  }),
  joint: z.object({
    kind: z.literal('seat-notch'),
    control: z.enum(['seat', 'depth']),
    valueMm: mm(0.001, 2000),
  }),
});
export function seatLength(support: SupportSpec, pitchDeg: number): number {
  return support.joint.control === 'seat'
    ? support.joint.valueMm
    : support.joint.valueMm / Math.sin((pitchDeg * Math.PI) / 180);
}
export const assemblySpecSchema: z.ZodType<AssemblySpec> = z
  .object({
    roof: z.object({
      runMm: mm(1, 100000),
      pitchDeg: mm(1, 80),
      overhangMm: mm(0, 10000),
    }),
    member: z.object({
      id: entityId,
      section: z.object({ widthMm: mm(1, 1000), depthMm: mm(1, 2000) }),
    }),
    supports: z.array(supportSpecSchema).min(1),
    ridge: z.object({
      id: entityId,
      thicknessMm: mm(0, 1000),
      depthMm: mm(1, 2000).optional(),
    }),
  })
  .superRefine((spec, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    const ids = [
      spec.member.id,
      spec.ridge.id,
      ...spec.supports.map((s) => s.id),
    ];
    if (new Set(ids).size !== ids.length) issue(['supports'], 'duplicate_id');
    const walls = spec.supports.filter((s) => s.kind === 'wall-plate');
    if (walls.length !== 1 || walls[0]?.placement.xMm !== 0)
      issue(['supports'], 'wall_origin');
    const face = spec.roof.runMm - spec.ridge.thicknessMm / 2;
    spec.supports.forEach((support, index) => {
      const seat = seatLength(support, spec.roof.pitchDeg);
      if (seat > support.section.widthMm + 1e-8)
        issue(['supports', index, 'joint', 'valueMm'], 'seat_exceeds_support');
      if (
        seat * Math.sin((spec.roof.pitchDeg * Math.PI) / 180) >=
        spec.member.section.depthMm
      )
        issue(['supports', index, 'joint', 'valueMm'], 'notch_consumes_depth');
      if (support.placement.xMm + support.section.widthMm >= face)
        issue(['supports', index, 'placement', 'xMm'], 'support_outside_span');
      spec.supports.forEach((other, j) => {
        if (j >= index) return;
        if (
          support.placement.xMm <
            other.placement.xMm + other.section.widthMm + 1 &&
          other.placement.xMm <
            support.placement.xMm + support.section.widthMm + 1
        )
          issue(['supports', index, 'placement', 'xMm'], 'supports_overlap');
      });
    });
  });

export function assemblyFromWorkbench(raw: WorkbenchInput): AssemblySpec {
  const input = workbenchInputSchema.parse(raw);
  return {
    roof: { ...input.geometry },
    member: { id: 'member:rafter-1', section: { ...input.timber } },
    supports: [
      {
        id: 'support:wall-plate-1',
        kind: 'wall-plate',
        section: { widthMm: input.wallPlate.widthMm, heightMm: 140 },
        placement: { mode: 'horizontal-from-wall', xMm: 0 },
        joint: {
          kind: 'seat-notch',
          control: 'seat',
          valueMm: input.wallPlate.seatLengthMm,
        },
      },
    ],
    ridge: { id: 'terminal:ridge-1', ...input.ridge },
  };
}
export const assemblyDefaults = assemblyFromWorkbench(workbenchDefaults);
export const jointIdFor = (supportId: string) => `joint:${supportId}`;
export const datumIdFor = (supportId: string, role: 'heel' | 'toe') =>
  `datum:${supportId.replace(/^support:/, '')}-${role}`;

/** Generic horizontal support contact: the seat plane passes through the lower-edge toe.
 * Both wall plate and purlin use this resolver. Geometry is returned in member coordinates. */
export function resolveSupportJoint(
  support: SupportSpec,
  memberId: string,
  frame: Frame2D,
  bottom: Line2D,
  top: Line2D,
  depthMm: number,
  referenceStationMm: number,
): { joint: ResolvedJoint; support: Support2D; datums: Datum[] } {
  const x = support.placement.xMm;
  const seat = seatLength(support, frame.angleDeg);
  const vertical = (atX: number): Line2D => ({
    origin: { x: atX, y: 0 },
    direction: { x: 0, y: 1 },
  });
  const toe = intersectLines(bottom, vertical(x + seat));
  const contact: Line2D = { origin: toe, direction: { x: 1, y: 0 } };
  const heelSeat = intersectLines(contact, vertical(x));
  const heelBottom = intersectLines(bottom, vertical(x));
  const local = (p: Point2D) => worldToMember(p, frame);
  const heelTop = local(intersectLines(top, vertical(x)));
  const toeTop = local(intersectLines(top, vertical(x + seat)));
  const notch = calculateBirdsmouth({
    pitchDeg: frame.angleDeg,
    seatLengthMm: seat,
    depthMm,
  });
  const heelDatumId = datumIdFor(support.id, 'heel'),
    toeDatumId = datumIdFor(support.id, 'toe');
  return {
    joint: {
      id: jointIdFor(support.id),
      kind: 'seat-notch',
      memberId,
      supportId: support.id,
      edge: 'bottom',
      removedProfile: [local(heelBottom), local(heelSeat), local(toe)],
      seatLine: [local(heelSeat), local(toe)],
      plumbLine: [local(heelBottom), local(heelSeat)],
      seatLengthMm: seat,
      normalDepthMm: notch.normalDepthMm,
      remainingDepthMm: notch.remainingDepthMm,
      removedDepthRatio: notch.removedDepthRatio,
      seatAngleToMemberDeg: frame.angleDeg,
      plumbAngleToMemberDeg: 90 - frame.angleDeg,
      heelDatumId,
      toeDatumId,
      stationMm: heelTop.x - referenceStationMm,
    },
    support: {
      id: support.id,
      kind: support.kind,
      visualExtentOnly: false,
      topReference: [heelSeat, { x: x + support.section.widthMm, y: toe.y }],
      worldProfile: [
        heelSeat,
        { x: x + support.section.widthMm, y: toe.y },
        { x: x + support.section.widthMm, y: toe.y - support.section.heightMm },
        { x, y: toe.y - support.section.heightMm },
      ],
    },
    datums: [
      {
        id: heelDatumId,
        entityId: support.id,
        semanticRole: 'support-heel',
        edge: 'top',
        localPoint: heelTop,
      },
      {
        id: toeDatumId,
        entityId: support.id,
        semanticRole: 'support-toe',
        edge: 'top',
        localPoint: toeTop,
      },
    ],
  };
}

export function resolveAssembly(raw: AssemblySpec): ResolvedAssembly {
  const spec = assemblySpecSchema.parse(raw);
  const { runMm, pitchDeg, overhangMm } = spec.roof;
  const { depthMm } = spec.member.section;
  const wall = spec.supports.find((s) => s.kind === 'wall-plate')!;
  const theta = (pitchDeg * Math.PI) / 180;
  const direction = { x: Math.cos(theta), y: Math.sin(theta) };
  const bottom: Line2D = {
    origin: { x: seatLength(wall, pitchDeg), y: 0 },
    direction,
  };
  const top = offsetLine(bottom, depthMm);
  const atX = (line: Line2D, x: number) =>
    intersectLines(line, { origin: { x, y: 0 }, direction: { x: 0, y: 1 } });
  const frame: Frame2D = {
    origin: atX(bottom, -overhangMm),
    angleDeg: pitchDeg,
  };
  const local = (p: Point2D) => worldToMember(p, frame);
  const ridge = calculateRidgeCut({
    runMm,
    pitchDeg,
    depthMm,
    thicknessMm: spec.ridge.thicknessMm,
  });
  const aBottom = { x: 0, y: 0 },
    aTop = local(atX(top, -overhangMm));
  const dBottom = local(atX(bottom, ridge.nearFaceXmm)),
    dTop = local(atX(top, ridge.nearFaceXmm));
  const resolved = [...spec.supports]
    .sort((a, b) => a.placement.xMm - b.placement.xMm)
    .map((s) =>
      resolveSupportJoint(
        s,
        spec.member.id,
        frame,
        bottom,
        top,
        depthMm,
        aTop.x,
      ),
    );
  const datums: Datum[] = [
    {
      id: 'datum:eave-top',
      entityId: spec.member.id,
      semanticRole: 'member-start',
      edge: 'top',
      localPoint: aTop,
    },
    ...resolved.flatMap((r) => r.datums),
    {
      id: 'datum:ridge-face',
      entityId: spec.ridge.id,
      semanticRole: 'member-end',
      edge: 'top',
      localPoint: dTop,
    },
  ];
  const lowerProfile = resolved.flatMap((r) => r.joint.removedProfile);
  const profile =
    overhangMm === 0 ? lowerProfile.slice(1) : [aBottom, ...lowerProfile];
  const ridgeBottom = memberToWorld(dBottom, frame),
    ridgeTop = memberToWorld(dTop, frame);
  return {
    member: {
      id: spec.member.id,
      section: spec.member.section,
      frame,
      datums,
      referenceLengthMm: dTop.x - aTop.x,
      minimumStockLengthMm: dTop.x,
      stockProfile: [aBottom, { x: dTop.x, y: 0 }, dTop, { x: 0, y: depthMm }],
      profile: [...profile, dBottom, dTop, aTop],
    },
    joints: resolved.map((r) => r.joint),
    supports: [
      ...resolved.map((r) => r.support),
      {
        id: spec.ridge.id,
        kind: 'ridge',
        visualExtentOnly: true,
        topReference: [ridgeBottom, ridgeTop],
        worldProfile:
          spec.ridge.thicknessMm === 0
            ? []
            : [
                { x: ridgeBottom.x, y: ridgeBottom.y - 70 },
                {
                  x: ridgeBottom.x + spec.ridge.thicknessMm,
                  y: ridgeBottom.y - 70,
                },
                { x: ridgeTop.x + spec.ridge.thicknessMm, y: ridgeTop.y },
                ridgeTop,
              ],
      },
    ],
    endCuts: [
      {
        id: 'cut:eave',
        kind: 'end-cut',
        end: 'eave',
        edge: 'top',
        line: [overhangMm === 0 ? lowerProfile[1]! : aBottom, aTop],
        angleToMemberDeg: ridge.angleToMemberDeg,
        fromDatumId: 'datum:eave-top',
        stationMm: 0,
      },
      {
        id: 'cut:ridge',
        kind: 'end-cut',
        end: 'ridge',
        edge: 'top',
        supportId: spec.ridge.id,
        line: [dBottom, dTop],
        angleToMemberDeg: ridge.angleToMemberDeg,
        fromDatumId: 'datum:eave-top',
        stationMm: dTop.x - aTop.x,
      },
    ],
  };
}

export function createFabricationPlan(
  assembly: ResolvedAssembly,
): FabricationPlan {
  const { member, joints, endCuts } = assembly;
  const reference = member.datums[0]!;
  const lookup = new Map(member.datums.map((d) => [d.id, d]));
  const steps: FabricationPlan['steps'] = joints.flatMap((j) => [
    {
      action: 'mark-plumb' as const,
      operationId: j.id,
      from: reference.id,
      target: j.heelDatumId,
      edge: 'top' as const,
      distanceMm: j.stationMm,
      angleDeg: j.plumbAngleToMemberDeg,
    },
    {
      action: 'mark-seat' as const,
      operationId: j.id,
      from: reference.id,
      target: j.toeDatumId,
      edge: 'top' as const,
      distanceMm:
        lookup.get(j.toeDatumId)!.localPoint.x - reference.localPoint.x,
      angleDeg: j.seatAngleToMemberDeg,
      seatLengthMm: j.seatLengthMm,
    },
    {
      action: 'check-depth' as const,
      operationId: j.id,
      normalDepthMm: j.normalDepthMm,
      remainingDepthMm: j.remainingDepthMm,
    },
  ]);
  const ridge = endCuts.find((c) => c.end === 'ridge')!;
  steps.push({
    action: 'mark-plumb',
    operationId: ridge.id,
    from: reference.id,
    target: 'datum:ridge-face',
    edge: 'top',
    distanceMm: ridge.stationMm,
    angleDeg: ridge.angleToMemberDeg,
  });
  return {
    memberId: member.id,
    section: member.section,
    minimumStockLengthMm: member.minimumStockLengthMm,
    referenceLengthMm: member.referenceLengthMm,
    referenceDatumId: reference.id,
    datums: member.datums,
    joints,
    endCuts,
    steps,
    stations: member.datums.slice(1).map((datum, index) => {
      const from = member.datums[index]!;
      return {
        id: `${from.id}/${datum.id}`,
        from: from.id,
        to: datum.id,
        edge: 'top',
        distanceMm: datum.localPoint.x - from.localPoint.x,
      };
    }),
  };
}

/** The common pipeline used by every editor and template. */
export function calculateAssembly(spec: AssemblySpec) {
  const assembly = resolveAssembly(spec);
  return { assembly, plan: createFabricationPlan(assembly) };
}

export function purlinRange(
  spec: AssemblySpec,
  widthMm: number,
): { min: number; max: number } {
  const wall = spec.supports.find((s) => s.kind === 'wall-plate')!;
  return {
    min: wall.placement.xMm + wall.section.widthMm + 1,
    max: spec.roof.runMm - spec.ridge.thicknessMm / 2 - widthMm - 1,
  };
}
/** Legal left-face intervals for a purlin, excluding existing intermediate supports. */
export function purlinPlacementSegments(
  spec: AssemblySpec,
  widthMm: number,
  excludeSupportId?: string,
): { min: number; max: number }[] {
  const range = purlinRange(spec, widthMm);
  const supports = spec.supports
    .filter(
      (support) => support.kind === 'purlin' && support.id !== excludeSupportId,
    )
    .sort((a, b) => a.placement.xMm - b.placement.xMm);
  const segments: { min: number; max: number }[] = [];
  let cursor = range.min;
  for (const support of supports) {
    const beforeSupport = Math.min(
      range.max,
      support.placement.xMm - widthMm - 1,
    );
    if (beforeSupport >= cursor)
      segments.push({ min: cursor, max: beforeSupport });
    cursor = Math.max(
      cursor,
      support.placement.xMm + support.section.widthMm + 1,
    );
  }
  if (cursor <= range.max) segments.push({ min: cursor, max: range.max });
  return segments;
}
/** Clamps an interaction-only purlin move to the nearest legal free segment. */
export function clampPurlinPlacement(
  spec: AssemblySpec,
  supportId: string,
  proposedMm: number,
): number {
  const support = spec.supports.find(
    (candidate) => candidate.id === supportId && candidate.kind === 'purlin',
  );
  if (!support || !Number.isFinite(proposedMm))
    throw new RangeError('invalid_purlin_placement');
  const segments = purlinPlacementSegments(
    spec,
    support.section.widthMm,
    supportId,
  );
  if (!segments.length) throw new RangeError('no_purlin_space');
  return segments
    .map((segment) => Math.max(segment.min, Math.min(segment.max, proposedMm)))
    .reduce((closest, candidate) =>
      Math.abs(candidate - proposedMm) < Math.abs(closest - proposedMm)
        ? candidate
        : closest,
    );
}

export interface PurlinDistributionRequest {
  supportIds: readonly string[];
  mode: 'equal-gaps';
}

export interface PurlinDistributionProposal {
  mode: 'equal-gaps';
  rangeStartMm: number;
  rangeEndMm: number;
  positions: ReadonlyArray<{ supportId: string; xMm: number }>;
}

/**
 * Produces geometric, equal-clear-gap positions for the existing intermediate
 * supports. It preserves stable P-number order and never selects a position
 * on either legal boundary.
 */
export function distributePurlins(
  spec: AssemblySpec,
  request: PurlinDistributionRequest,
): PurlinDistributionProposal {
  assemblySpecSchema.parse(spec);
  const requestedIds = new Set(request.supportIds);
  if (!requestedIds.size || requestedIds.size !== request.supportIds.length)
    throw new RangeError('invalid_purlin_distribution');
  const purlins = spec.supports
    .filter(
      (support): support is SupportSpec =>
        support.kind === 'purlin' && requestedIds.has(support.id),
    )
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (purlins.length !== requestedIds.size)
    throw new RangeError('invalid_purlin_distribution');

  const wall = spec.supports.find((support) => support.kind === 'wall-plate')!;
  const rangeStartMm = wall.placement.xMm + wall.section.widthMm + 1;
  const rangeEndMm = spec.roof.runMm - spec.ridge.thicknessMm / 2 - 1;
  const totalPurlinWidthMm = purlins.reduce(
    (sum, support) => sum + support.section.widthMm,
    0,
  );
  const remainingClearSpaceMm = rangeEndMm - rangeStartMm - totalPurlinWidthMm;
  if (remainingClearSpaceMm <= 0)
    throw new RangeError('no_purlin_distribution_space');
  const gapMm = remainingClearSpaceMm / (purlins.length + 1);
  let cursorMm = rangeStartMm + gapMm;
  const positions = purlins.map((support) => {
    const position = { supportId: support.id, xMm: cursorMm };
    cursorMm += support.section.widthMm + gapMm;
    return position;
  });
  return { mode: request.mode, rangeStartMm, rangeEndMm, positions };
}

/** UI and templates share sequential, non-overlapping intermediate supports. */
export function addPurlin(spec: AssemblySpec): AssemblySpec {
  assemblySpecSchema.parse(spec);
  const widthMm = 140,
    segments = purlinPlacementSegments(spec, widthMm);
  if (!segments.length) throw new RangeError('no_purlin_space');
  const range = segments.reduce((largest, segment) =>
    segment.max - segment.min > largest.max - largest.min ? segment : largest,
  );
  const wall = spec.supports.find((s) => s.kind === 'wall-plate')!;
  const seat = Math.min(90, seatLength(wall, spec.roof.pitchDeg));
  const existingNumbers = spec.supports.flatMap((support) => {
    const match = /^support:purlin-(\d+)$/.exec(support.id);
    return match ? [Number(match[1])] : [];
  });
  const nextNumber = Math.max(0, ...existingNumbers) + 1;
  const next: AssemblySpec = {
    ...spec,
    supports: [
      ...spec.supports,
      {
        id: `support:purlin-${nextNumber}`,
        kind: 'purlin',
        section: { widthMm, heightMm: 180 },
        placement: {
          mode: 'horizontal-from-wall',
          xMm: (range.min + range.max) / 2,
        },
        joint: { kind: 'seat-notch', control: 'seat', valueMm: seat },
      },
    ],
  };
  return assemblySpecSchema.parse(next);
}
