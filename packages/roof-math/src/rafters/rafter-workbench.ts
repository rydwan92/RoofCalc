import { z } from 'zod';
import type {
  DatumPoint,
  EndCut,
  FabricationInstruction,
  MarkingStation,
  Point2D,
  SeatNotch,
  Support2D,
  TimberMember2D,
} from '@cieslacalc/timber-model';
import { commonRafterInputSchema } from './common-rafter';
import { calculateBirdsmouth } from '../cuts/birdsmouth';
import { calculateRidgeCut } from '../cuts/ridge-cut';
import { worldToMember } from '../geometry/frame2d';

export const workbenchInputSchema = z
  .object({
    geometry: commonRafterInputSchema.extend({
      runMm: z.number().finite().min(1).max(100000),
    }),
    timber: z.object({
      widthMm: z.number().finite().min(1).max(1000),
      depthMm: z.number().finite().min(1).max(2000),
    }),
    wallPlate: z.object({
      widthMm: z.number().finite().min(1).max(2000),
      seatLengthMm: z.number().finite().min(1).max(2000),
    }),
    ridge: z.object({ thicknessMm: z.number().finite().min(0).max(1000) }),
  })
  .superRefine((input, ctx) => {
    const issue = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (input.wallPlate.seatLengthMm > input.wallPlate.widthMm)
      issue(['wallPlate', 'seatLengthMm'], 'seat_exceeds_plate');
    if (
      input.wallPlate.seatLengthMm *
        Math.sin((input.geometry.pitchDeg * Math.PI) / 180) >=
      input.timber.depthMm
    )
      issue(['wallPlate', 'seatLengthMm'], 'notch_consumes_depth');
    const face = input.geometry.runMm - input.ridge.thicknessMm / 2;
    if (face <= input.wallPlate.widthMm)
      issue(['geometry', 'runMm'], 'ridge_overlaps_plate');
  });
export type WorkbenchInput = z.infer<typeof workbenchInputSchema>;
export const workbenchDefaults: WorkbenchInput = {
  geometry: { runMm: 4000, pitchDeg: 35, overhangMm: 500 },
  timber: { widthMm: 80, depthMm: 200 },
  wallPlate: { widthMm: 140, seatLengthMm: 100 },
  ridge: { thicknessMm: 40 },
};

/** v2 contract: lower edge y=(x-seat)*tan(pitch). User-approved 2026-09-09. */
export function calculateRafterWorkbench(raw: WorkbenchInput) {
  const input = workbenchInputSchema.parse(raw);
  const { runMm, pitchDeg, overhangMm } = input.geometry;
  const { depthMm } = input.timber;
  const seat = input.wallPlate.seatLengthMm;
  const theta = (pitchDeg * Math.PI) / 180;
  const cosine = Math.cos(theta),
    tangent = Math.tan(theta);
  const notch = calculateBirdsmouth({ pitchDeg, seatLengthMm: seat, depthMm });
  const ridge = calculateRidgeCut({
    runMm,
    pitchDeg,
    depthMm,
    thicknessMm: input.ridge.thicknessMm,
  });
  const lowerAt = (x: number) => (x - seat) * tangent;
  const upperAt = (x: number) => lowerAt(x) + depthMm / cosine;
  const frame = {
    origin: { x: -overhangMm, y: lowerAt(-overhangMm) },
    angleDeg: pitchDeg,
  };
  const local = (point: Point2D) => worldToMember(point, frame);
  const onBottom = (x: number): Point2D => ({
    x: (x + overhangMm) / cosine,
    y: 0,
  });
  const onTop = (x: number): Point2D => ({
    x: (x + overhangMm) / cosine + depthMm * tangent,
    y: depthMm,
  });
  const aBottom = onBottom(-overhangMm),
    aTop = onTop(-overhangMm);
  const heelBottom = onBottom(0),
    heelSeat = local({ x: 0, y: 0 });
  const toe = onBottom(seat),
    dBottom = onBottom(ridge.nearFaceXmm),
    dTop = onTop(ridge.nearFaceXmm);
  const datums: DatumPoint[] = [
    { id: 'A', edge: 'top', point: aTop, meaning: 'eave-end' },
    { id: 'B', edge: 'top', point: onTop(0), meaning: 'heel-plumb' },
    { id: 'C', edge: 'top', point: onTop(seat), meaning: 'seat-toe-reference' },
    { id: 'D', edge: 'top', point: dTop, meaning: 'ridge-end' },
  ];
  const referenceLengthMm = (ridge.nearFaceXmm + overhangMm) / cosine;
  const member: TimberMember2D = {
    id: 'rafter',
    section: input.timber,
    frame,
    referenceLengthMm,
    minimumStockLengthMm: dTop.x,
    stockProfile: [
      { x: 0, y: 0 },
      { x: dTop.x, y: 0 },
      dTop,
      { x: 0, y: depthMm },
    ],
    // Actual retained material. The seat and heel form a concavity, not an overlay.
    profile:
      overhangMm === 0
        ? [heelSeat, toe, dBottom, dTop, aTop]
        : [aBottom, heelBottom, heelSeat, toe, dBottom, dTop, aTop],
    datums,
  };
  const seatNotch: SeatNotch = {
    kind: 'seat-notch',
    id: 'birdsmouth',
    supportId: 'wall-plate',
    edge: 'bottom',
    removedProfile: [heelBottom, heelSeat, toe],
    seatLine: [heelSeat, toe],
    plumbLine: [heelBottom, heelSeat],
    seatLengthMm: seat,
    normalDepthMm: notch.normalDepthMm,
    remainingDepthMm: notch.remainingDepthMm,
    removedDepthRatio: notch.removedDepthRatio,
    seatAngleToMemberDeg: pitchDeg,
    plumbAngleToMemberDeg: 90 - pitchDeg,
  };
  const ridgeEnd: EndCut = {
    kind: 'end-cut',
    id: 'ridge-cut',
    supportId: 'ridge',
    end: 'ridge',
    edge: 'top',
    line: [dBottom, dTop],
    angleToMemberDeg: ridge.angleToMemberDeg,
    stationFromAmm: referenceLengthMm,
  };
  const eaveEnd: EndCut = {
    kind: 'end-cut',
    id: 'eave-cut',
    end: 'eave',
    edge: 'top',
    line: [overhangMm === 0 ? heelSeat : aBottom, aTop],
    angleToMemberDeg: ridge.angleToMemberDeg,
    stationFromAmm: 0,
  };
  // Support depth is a schematic visual extent, not an extra engineering input.
  const plate: Support2D = {
    id: 'wall-plate',
    kind: 'wall-plate',
    visualExtentOnly: true,
    worldProfile: [
      { x: 0, y: 0 },
      { x: input.wallPlate.widthMm, y: 0 },
      { x: input.wallPlate.widthMm, y: -140 },
      { x: 0, y: -140 },
    ],
    topReference: [
      { x: 0, y: 0 },
      { x: input.wallPlate.widthMm, y: 0 },
    ],
  };
  const ridgeSupport: Support2D = {
    id: 'ridge',
    kind: 'ridge',
    visualExtentOnly: true,
    worldProfile:
      input.ridge.thicknessMm === 0
        ? []
        : [
            { x: ridge.nearFaceXmm, y: lowerAt(ridge.nearFaceXmm) - 70 },
            {
              x: ridge.nearFaceXmm + input.ridge.thicknessMm,
              y: lowerAt(ridge.nearFaceXmm) - 70,
            },
            {
              x: ridge.nearFaceXmm + input.ridge.thicknessMm,
              y: upperAt(ridge.nearFaceXmm),
            },
            { x: ridge.nearFaceXmm, y: upperAt(ridge.nearFaceXmm) },
          ],
    topReference: [
      { x: runMm, y: lowerAt(ridge.nearFaceXmm) - 90 },
      { x: runMm, y: upperAt(ridge.nearFaceXmm) + 90 },
    ],
  };
  const stations: MarkingStation[] = [
    {
      id: 'A-B',
      from: 'A',
      to: 'B',
      edge: 'top',
      distanceMm: overhangMm / cosine,
    },
    { id: 'B-C', from: 'B', to: 'C', edge: 'top', distanceMm: seat / cosine },
    {
      id: 'C-D',
      from: 'C',
      to: 'D',
      edge: 'top',
      distanceMm: (ridge.nearFaceXmm - seat) / cosine,
    },
    {
      id: 'A-D',
      from: 'A',
      to: 'D',
      edge: 'top',
      distanceMm: referenceLengthMm,
    },
  ];
  const instructions: FabricationInstruction[] = [
    {
      id: 'mark-heel',
      operationId: 'birdsmouth',
      action: 'mark-plumb',
      from: 'A',
      target: 'B',
      edge: 'top',
      stationMm: overhangMm / cosine,
      angleDeg: 90 - pitchDeg,
    },
    {
      id: 'mark-toe',
      operationId: 'birdsmouth',
      action: 'mark-seat',
      from: 'A',
      target: 'C',
      edge: 'top',
      stationMm: (overhangMm + seat) / cosine,
      angleDeg: pitchDeg,
      seatLengthMm: seat,
    },
    {
      id: 'mark-ridge',
      operationId: 'ridge-cut',
      action: 'mark-plumb',
      from: 'A',
      target: 'D',
      edge: 'top',
      stationMm: referenceLengthMm,
      angleDeg: 90 - pitchDeg,
    },
  ];
  return {
    member,
    notch,
    ridge,
    seatNotch,
    ridgeEnd,
    operations: [eaveEnd, seatNotch, ridgeEnd],
    supports: [plate, ridgeSupport],
    stations,
    instructions,
    ridgeTopElevationMm: upperAt(ridge.nearFaceXmm),
    heelOffsetMm: notch.verticalRiseAcrossSeatMm,
  };
}
export type RafterWorkbenchResult = ReturnType<typeof calculateRafterWorkbench>;
