import { z } from 'zod';
import type { Point3D, RoofPlanePosition } from '@cieslacalc/timber-model';
import type { RoofPlaneBasis } from './roof-features';

/**
 * VNext-7A mono-pitch (pulpitowy) roof: SURFACE GEOMETRY ONLY.
 *
 * One planar roof between a low and a high bearing line, in the same frame
 * as the gable and hip solvers (`resolveRoofPlaneBasis`): millimetres, z up,
 * z = 0 on the low bearing line, overhangs measured horizontally. How the
 * reference plane sits on a rafter or a wall plate is deliberately not
 * defined yet, so this solver emits no rafters, cuts or supports
 * (docs/domain/MONO_PITCH_ROOF.md). It is not a `RoofTemplateSpec` and is
 * not stored in `RoofProjectDocumentV1`.
 */
export interface MonoPitchRoofSpec {
  type: 'mono-pitch';
  id: string;
  /** Along the eave, between the gable ends. */
  buildingLengthMm: number;
  /** Horizontal distance between the low and the high bearing line. */
  runMm: number;
  pitchDeg: number;
  /** Horizontal overhang below the low bearing line. */
  lowEaveOverhangMm: number;
  /** `free`: the roof ends in a top edge; `abutment`: it meets a higher wall. */
  topEdge: 'free' | 'abutment';
  /** Horizontal overhang beyond the high bearing line; 0 for an abutment. */
  highOverhangMm: number;
  /** Horizontal overhang beyond each gable end. */
  vergeOverhangMm: number;
  /** Elevation of the low bearing line above the project datum; default 0. */
  lowBearingElevationMm?: number;
}

const lengthMm = z.number().finite().min(1).max(100000);
const overhangMm = z.number().finite().min(0).max(10000);
const pitchDeg = z.number().finite().min(1).max(80);

export const monoPitchRoofSpecSchema: z.ZodType<MonoPitchRoofSpec> = z
  .object({
    type: z.literal('mono-pitch'),
    id: z.string().regex(/^template:[a-z][a-z0-9:-]*$/),
    buildingLengthMm: lengthMm,
    runMm: lengthMm,
    pitchDeg,
    lowEaveOverhangMm: overhangMm,
    topEdge: z.enum(['free', 'abutment']),
    highOverhangMm: overhangMm,
    vergeOverhangMm: overhangMm,
    lowBearingElevationMm: z
      .number()
      .finite()
      .min(-100000)
      .max(100000)
      .optional(),
  })
  .superRefine((spec, ctx) => {
    // An overhang beyond a wall the roof abuts would run into that wall.
    if (spec.topEdge === 'abutment' && spec.highOverhangMm > 0)
      ctx.addIssue({
        code: 'custom',
        path: ['highOverhangMm'],
        message: 'abutment_overhang',
      });
  }) as z.ZodType<MonoPitchRoofSpec>;

/**
 * What this solver answers. Everything but the surface is VNext-7B; a
 * consumer reports these parts as not supported instead of guessing.
 */
export const MONO_PITCH_SOLVER_SCOPE = {
  surfaceGeometry: 'supported',
  framing: 'not-supported',
  fabrication: 'not-supported',
  covering: 'not-supported',
  drainage: 'not-supported',
} as const;

/** Opaque (ADR-007): never parse; the line `kind` carries the meaning. */
export const MONO_PITCH_PLANE_ID = 'mono-pitch-plane:main';

export type MonoPitchRoofLineKind = 'eave' | 'ridge' | 'verge' | 'abutment';

export interface MonoPitchRoofLine {
  /** Opaque, deterministic. Never parse it. */
  id: string;
  kind: MonoPitchRoofLineKind;
  start: Point3D;
  end: Point3D;
  lengthMm: number;
  incidentPlaneIds: string[];
  /** Eave only: unit plan direction away from the roof (as roof-math eaves). */
  outwardPlan?: { x: number; y: number };
}

export interface MonoPitchRoofPlane {
  roofPlaneId: string;
  basis: RoofPlaneBasis;
  polygon: RoofPlanePosition[];
  worldPolygon: Point3D[];
  /** Along the eave. */
  widthMm: number;
  /** Eave to top edge, along the slope. */
  slopeLengthMm: number;
  grossAreaMm2: number;
  planAreaMm2: number;
}

export interface MonoPitchRoofGeometry {
  spec: MonoPitchRoofSpec;
  /** Low to high bearing line. */
  riseMm: number;
  bearingSlopeLengthMm: number;
  /** Above the project datum. */
  elevations: {
    lowBearingMm: number;
    highBearingMm: number;
    eaveMm: number;
    topMm: number;
  };
  planes: [MonoPitchRoofPlane];
  lines: MonoPitchRoofLine[];
  grossAreaMm2: number;
  planAreaMm2: number;
  scope: typeof MONO_PITCH_SOLVER_SCOPE;
}

const point = (x: number, y: number, z: number): Point3D => ({ x, y, z });

export function monoPitchRiseMm(runMm: number, pitchDegValue: number) {
  return (
    lengthMm.parse(runMm) *
    Math.tan((pitchDeg.parse(pitchDegValue) * Math.PI) / 180)
  );
}

/**
 * Pitch from two bearing elevations (wall heights): the exact inverse of
 * `rise = run · tan(pitch)`, so either form edits the one canonical pitch.
 */
export function monoPitchFromBearingElevations(input: {
  lowMm: number;
  highMm: number;
  runMm: number;
}): { pitchDeg: number; riseMm: number } {
  const run = lengthMm.parse(input.runMm);
  if (!Number.isFinite(input.lowMm) || !Number.isFinite(input.highMm))
    throw new RangeError('invalid_elevation');
  const riseMm = input.highMm - input.lowMm;
  if (riseMm <= 0) throw new RangeError('not_rising');
  const pitch = (Math.atan(riseMm / run) * 180) / Math.PI;
  if (!pitchDeg.safeParse(pitch).success)
    throw new RangeError('pitch_out_of_range');
  return { pitchDeg: pitch, riseMm };
}

export function resolveMonoPitchRoof(
  input: MonoPitchRoofSpec,
): MonoPitchRoofGeometry {
  const spec = monoPitchRoofSpecSchema.parse(input);
  const alpha = (spec.pitchDeg * Math.PI) / 180;
  const tan = Math.tan(alpha);
  const cos = Math.cos(alpha);
  const length = spec.buildingLengthMm;
  const run = spec.runMm;
  const low = spec.lowEaveOverhangMm;
  const high = spec.highOverhangMm;
  const verge = spec.vergeOverhangMm;
  const datum = spec.lowBearingElevationMm ?? 0;

  const eaveY = -low;
  const topY = run + high;
  const eaveZ = eaveY * tan;
  const topZ = topY * tan;
  const left = -verge;
  const right = length + verge;
  const corners = {
    eaveLeft: point(left, eaveY, eaveZ),
    eaveRight: point(right, eaveY, eaveZ),
    topRight: point(right, topY, topZ),
    topLeft: point(left, topY, topZ),
  };
  const widthMm = right - left;
  const planDepthMm = topY - eaveY;
  const slopeLengthMm = planDepthMm / cos;
  const basis: RoofPlaneBasis = {
    id: MONO_PITCH_PLANE_ID,
    origin: corners.eaveLeft,
    uAxis: point(1, 0, 0),
    vAxis: point(0, cos, Math.sin(alpha)),
    normal: point(0, -Math.sin(alpha), cos),
    polygon: [
      { uMm: 0, vMm: 0 },
      { uMm: widthMm, vMm: 0 },
      { uMm: widthMm, vMm: slopeLengthMm },
      { uMm: 0, vMm: slopeLengthMm },
    ],
  };
  const plane: MonoPitchRoofPlane = {
    roofPlaneId: MONO_PITCH_PLANE_ID,
    basis,
    polygon: basis.polygon.map((position) => ({ ...position })),
    worldPolygon: [
      corners.eaveLeft,
      corners.eaveRight,
      corners.topRight,
      corners.topLeft,
    ],
    widthMm,
    slopeLengthMm,
    grossAreaMm2: widthMm * slopeLengthMm,
    planAreaMm2: widthMm * planDepthMm,
  };
  const line = (
    id: string,
    kind: MonoPitchRoofLineKind,
    start: Point3D,
    end: Point3D,
  ): MonoPitchRoofLine => ({
    id,
    kind,
    start,
    end,
    lengthMm: Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z),
    incidentPlaneIds: [MONO_PITCH_PLANE_ID],
    ...(kind === 'eave' ? { outwardPlan: { x: 0, y: -1 } } : {}),
  });
  return {
    spec,
    riseMm: run * tan,
    bearingSlopeLengthMm: run / cos,
    elevations: {
      lowBearingMm: datum,
      highBearingMm: datum + run * tan,
      eaveMm: datum + eaveZ,
      topMm: datum + topZ,
    },
    planes: [plane],
    lines: [
      // The roof lies to the left walking an eave start → end (roof-math).
      line('mono-pitch-line:eave', 'eave', corners.eaveLeft, corners.eaveRight),
      line(
        'mono-pitch-line:top',
        spec.topEdge === 'abutment' ? 'abutment' : 'ridge',
        corners.topLeft,
        corners.topRight,
      ),
      line(
        'mono-pitch-line:verge-start',
        'verge',
        corners.eaveLeft,
        corners.topLeft,
      ),
      line(
        'mono-pitch-line:verge-end',
        'verge',
        corners.eaveRight,
        corners.topRight,
      ),
    ],
    grossAreaMm2: plane.grossAreaMm2,
    planAreaMm2: plane.planAreaMm2,
    scope: MONO_PITCH_SOLVER_SCOPE,
  };
}
