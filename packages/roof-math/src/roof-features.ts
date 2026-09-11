import type {
  BattenLayoutSpec,
  Point3D,
  RoofFeature,
  RoofPlanePosition,
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMember3D,
} from '@cieslacalc/timber-model';

export interface RoofPlaneBasis {
  id: string;
  origin: Point3D;
  uAxis: Point3D;
  vAxis: Point3D;
  normal: Point3D;
  polygon: RoofPlanePosition[];
}

export interface FeatureCollision {
  featureId: string;
  memberInstanceId: string;
  memberPrototypeId?: string;
  type: 'intersects';
}

export interface BattenSegment {
  fromUMm: number;
  toUMm: number;
}

export interface ResolvedBatten {
  id: string;
  roofPlaneId: string;
  stationMm: number;
  usableLengthMm: number;
  segments: BattenSegment[];
}

export interface BattenLayoutResult {
  battens: ResolvedBatten[];
  totalLengthMm: number;
}

const EPSILON = 1e-6;
const point = (x: number, y: number, z: number): Point3D => ({ x, y, z });
const subtract = (a: Point3D, b: Point3D) => point(a.x - b.x, a.y - b.y, a.z - b.z);
const dot = (a: Point3D, b: Point3D) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Point3D, b: Point3D) =>
  point(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const length = (value: Point3D) => Math.hypot(value.x, value.y, value.z);
const unit = (value: Point3D) => {
  const valueLength = length(value);
  if (!Number.isFinite(valueLength) || valueLength < EPSILON)
    throw new RangeError('invalid_roof_plane_axis');
  return point(value.x / valueLength, value.y / valueLength, value.z / valueLength);
};

function createBasis(id: string, origin: Point3D, uEnd: Point3D, vEnd: Point3D): RoofPlaneBasis {
  const uAxis = unit(subtract(uEnd, origin));
  const vAxis = unit(subtract(vEnd, origin));
  return { id, origin, uAxis, vAxis, normal: unit(cross(uAxis, vAxis)), polygon: [] };
}

export function projectPlaneWorldToLocal(basis: RoofPlaneBasis, world: Point3D): RoofPlanePosition {
  const offset = subtract(world, basis.origin);
  return { uMm: dot(offset, basis.uAxis), vMm: dot(offset, basis.vAxis) };
}

export function projectPlaneLocalToWorld(basis: RoofPlaneBasis, local: RoofPlanePosition): Point3D {
  return point(
    basis.origin.x + basis.uAxis.x * local.uMm + basis.vAxis.x * local.vMm,
    basis.origin.y + basis.uAxis.y * local.uMm + basis.vAxis.y * local.vMm,
    basis.origin.z + basis.uAxis.z * local.uMm + basis.vAxis.z * local.vMm,
  );
}

function withPolygon(basis: RoofPlaneBasis, points: Point3D[]): RoofPlaneBasis {
  return { ...basis, polygon: points.map((world) => projectPlaneWorldToLocal(basis, world)) };
}

/** Resolves local axes for all supported planes. u is eave-parallel and v is uphill. */
export function resolveRoofPlaneBasis(template: RoofTemplateSpec, roofPlaneId: string): RoofPlaneBasis {
  const r = template.halfRunMm;
  const e = template.eaveOverhangMm;
  const rise = r * Math.tan((template.pitchDeg * Math.PI) / 180);
  const eaveZ = -e * Math.tan((template.pitchDeg * Math.PI) / 180);
  const lengthMm = template.buildingLengthMm;
  const eaveX = r + e;
  if (template.type === 'gable') {
    const left = roofPlaneId === 'roof-plane:left';
    if (!left && roofPlaneId !== 'roof-plane:right') throw new RangeError('unknown_roof_plane');
    const origin = point(left ? -eaveX : eaveX, 0, eaveZ);
    const ridge = point(0, 0, rise);
    const farEave = point(origin.x, lengthMm, eaveZ);
    return withPolygon(createBasis(roofPlaneId, origin, farEave, ridge), [
      origin, farEave, point(0, lengthMm, rise), ridge,
    ]);
  }
  const corners = {
    'front-left': point(-eaveX, -e, eaveZ),
    'front-right': point(eaveX, -e, eaveZ),
    'rear-left': point(-eaveX, lengthMm + e, eaveZ),
    'rear-right': point(eaveX, lengthMm + e, eaveZ),
  };
  const frontApex = point(0, r, rise);
  const rearApex = point(0, lengthMm - r, rise);
  const planes: Record<string, Point3D[]> = {
    'roof-plane:left': [corners['front-left'], corners['rear-left'], rearApex, frontApex],
    'roof-plane:right': [corners['front-right'], corners['rear-right'], rearApex, frontApex],
    'roof-plane:front': [corners['front-left'], corners['front-right'], frontApex],
    'roof-plane:rear': [corners['rear-left'], corners['rear-right'], rearApex],
  };
  const plane = planes[roofPlaneId];
  if (!plane) throw new RangeError('unknown_roof_plane');
  const uphillReference: Record<string, Point3D> = {
    'roof-plane:left': point(0, -e, rise),
    'roof-plane:right': point(0, -e, rise),
    'roof-plane:front': point(-eaveX, r, rise),
    'roof-plane:rear': point(-eaveX, lengthMm - r, rise),
  };
  return withPolygon(
    createBasis(roofPlaneId, plane[0]!, plane[1]!, uphillReference[roofPlaneId]!),
    plane,
  );
}

function intervalsAtV(polygon: readonly RoofPlanePosition[], vMm: number): BattenSegment[] {
  const hits: number[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if ((a.vMm <= vMm && b.vMm > vMm) || (b.vMm <= vMm && a.vMm > vMm)) {
      hits.push(a.uMm + ((vMm - a.vMm) * (b.uMm - a.uMm)) / (b.vMm - a.vMm));
    }
  }
  return hits.sort((a, b) => a - b).reduce<BattenSegment[]>((intervals, value, index) => {
    if (index % 2 === 0) intervals.push({ fromUMm: value, toUMm: value });
    else intervals.at(-1)!.toUMm = value;
    return intervals;
  }, []);
}

function clampValue(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function clampRoofWindow(template: RoofTemplateSpec, feature: RoofWindowFeature): RoofWindowFeature {
  if (!(feature.widthMm > 0 && feature.heightMm > 0)) throw new RangeError('invalid_roof_window_size');
  const basis = resolveRoofPlaneBasis(template, feature.roofPlaneId);
  const minV = Math.min(...basis.polygon.map((item) => item.vMm));
  const maxV = Math.max(...basis.polygon.map((item) => item.vMm));
  if (feature.heightMm > maxV - minV) throw new RangeError('roof_window_too_tall');
  const vMm = clampValue(feature.position.vMm, minV, maxV - feature.heightMm);
  const bottom = intervalsAtV(basis.polygon, vMm)[0];
  const top = intervalsAtV(basis.polygon, vMm + feature.heightMm)[0];
  if (!bottom || !top) throw new RangeError('roof_window_outside_plane');
  const minU = Math.max(bottom.fromUMm, top.fromUMm);
  const maxU = Math.min(bottom.toUMm, top.toUMm) - feature.widthMm;
  if (maxU < minU) throw new RangeError('roof_window_too_wide');
  return { ...feature, position: { uMm: clampValue(feature.position.uMm, minU, maxU), vMm } };
}

export function createDefaultRoofWindow(template: RoofTemplateSpec, roofPlaneId = 'roof-plane:left'): RoofWindowFeature {
  const basis = resolveRoofPlaneBasis(template, roofPlaneId);
  const minV = Math.min(...basis.polygon.map((item) => item.vMm));
  const maxV = Math.max(...basis.polygon.map((item) => item.vMm));
  const window: RoofWindowFeature = {
    id: 'feature:roof-window-1', kind: 'roof-window', roofPlaneId,
    widthMm: 780, heightMm: 1180,
    position: { uMm: 0, vMm: minV + (maxV - minV - 1180) / 2 },
    clearanceMm: 0,
  };
  const middle = intervalsAtV(basis.polygon, window.position.vMm + window.heightMm / 2)[0]!;
  return clampRoofWindow(template, { ...window, position: { ...window.position, uMm: (middle.fromUMm + middle.toUMm - window.widthMm) / 2 } });
}

function segmentIntersectsRect(a: RoofPlanePosition, b: RoofPlanePosition, window: RoofWindowFeature): boolean {
  const minU = window.position.uMm, maxU = minU + window.widthMm;
  const minV = window.position.vMm, maxV = minV + window.heightMm;
  let start = 0, end = 1;
  for (const [p, q] of [
    [-(b.uMm - a.uMm), a.uMm - minU], [b.uMm - a.uMm, maxU - a.uMm],
    [-(b.vMm - a.vMm), a.vMm - minV], [b.vMm - a.vMm, maxV - a.vMm],
  ] as const) {
    if (Math.abs(p) < EPSILON) { if (q < 0) return false; }
    else { const ratio = q / p; if (p < 0) start = Math.max(start, ratio); else end = Math.min(end, ratio); }
  }
  return start <= end;
}

export function resolveRoofFeatureCollisions(args: { template: RoofTemplateSpec; skeleton: RoofSkeleton; feature: RoofFeature }): FeatureCollision[] {
  if (args.feature.kind !== 'roof-window') return [];
  const basis = resolveRoofPlaneBasis(args.template, args.feature.roofPlaneId);
  return args.skeleton.members.filter((member) => {
    if (!['rafter', 'hip-rafter', 'jack-rafter'].includes(member.kind)) return false;
    const fromOffset = subtract(member.from, basis.origin);
    const toOffset = subtract(member.to, basis.origin);
    if (Math.max(Math.abs(dot(fromOffset, basis.normal)), Math.abs(dot(toOffset, basis.normal))) > member.section.widthMm / 2 + 1) return false;
    return segmentIntersectsRect(projectPlaneWorldToLocal(basis, member.from), projectPlaneWorldToLocal(basis, member.to), args.feature);
  }).map((member) => ({ featureId: args.feature.id, memberInstanceId: member.id, memberPrototypeId: member.prototypeId, type: 'intersects' as const }));
}

export function placeRoofWindowBetweenRafters(args: { template: RoofTemplateSpec; skeleton: RoofSkeleton; feature: RoofWindowFeature }): { feature: RoofWindowFeature; memberInstanceIds: [string, string] } | undefined {
  const basis = resolveRoofPlaneBasis(args.template, args.feature.roofPlaneId);
  const clearance = args.feature.clearanceMm ?? 0;
  const rafters = args.skeleton.members.filter((member) => ['rafter', 'jack-rafter'].includes(member.kind)).filter((member) => {
    const offset = subtract(member.from, basis.origin);
    return Math.abs(dot(offset, basis.normal)) <= member.section.widthMm / 2 + 1;
  }).map((member) => ({ member, uMm: (projectPlaneWorldToLocal(basis, member.from).uMm + projectPlaneWorldToLocal(basis, member.to).uMm) / 2 })).sort((a, b) => a.uMm - b.uMm);
  const candidates = rafters.slice(1).map((right, index) => ({ left: rafters[index]!, right })).filter(({ left, right }) => right.uMm - left.uMm >= args.feature.widthMm + clearance * 2);
  const nearest = candidates.sort((a, b) => Math.abs((a.left.uMm + a.right.uMm) / 2 - args.feature.position.uMm) - Math.abs((b.left.uMm + b.right.uMm) / 2 - args.feature.position.uMm))[0];
  if (!nearest) return undefined;
  const feature = clampRoofWindow(args.template, { ...args.feature, position: { ...args.feature.position, uMm: (nearest.left.uMm + nearest.right.uMm - args.feature.widthMm) / 2 } });
  return { feature, memberInstanceIds: [nearest.left.member.id, nearest.right.member.id] };
}

function subtractIntervals(source: BattenSegment[], holes: BattenSegment[]) {
  return holes.reduce((segments, hole) => segments.flatMap((segment) => {
    if (hole.toUMm <= segment.fromUMm || hole.fromUMm >= segment.toUMm) return [segment];
    return [
      ...(hole.fromUMm > segment.fromUMm ? [{ fromUMm: segment.fromUMm, toUMm: hole.fromUMm }] : []),
      ...(hole.toUMm < segment.toUMm ? [{ fromUMm: hole.toUMm, toUMm: segment.toUMm }] : []),
    ];
  }), source);
}

export function resolveBattenLayout(args: { template: RoofTemplateSpec; layout: BattenLayoutSpec; features?: RoofFeature[] }): BattenLayoutResult {
  if (!args.layout.enabled) return { battens: [], totalLengthMm: 0 };
  if (!(args.layout.gaugeMm > 0)) throw new RangeError('invalid_batten_gauge');
  const planeIds = args.layout.roofPlaneIds ?? (args.template.type === 'gable' ? ['roof-plane:left', 'roof-plane:right'] : ['roof-plane:left', 'roof-plane:right', 'roof-plane:front', 'roof-plane:rear']);
  const battens = planeIds.flatMap((roofPlaneId) => {
    const basis = resolveRoofPlaneBasis(args.template, roofPlaneId);
    const minV = Math.min(...basis.polygon.map((item) => item.vMm));
    const maxV = Math.max(...basis.polygon.map((item) => item.vMm)) - (args.layout.ridgeOffsetMm ?? 0);
    const windows = (args.features ?? []).filter((feature): feature is RoofWindowFeature => feature.kind === 'roof-window' && feature.roofPlaneId === roofPlaneId);
    const rows: ResolvedBatten[] = [];
    for (let stationMm = minV + args.layout.eaveOffsetMm, index = 1; stationMm <= maxV + EPSILON; stationMm += args.layout.gaugeMm, index += 1) {
      const segments = subtractIntervals(intervalsAtV(basis.polygon, stationMm), windows.filter((window) => stationMm >= window.position.vMm && stationMm <= window.position.vMm + window.heightMm).map((window) => ({ fromUMm: window.position.uMm, toUMm: window.position.uMm + window.widthMm })));
      rows.push({ id: `batten:${roofPlaneId}:${index}`, roofPlaneId, stationMm, segments, usableLengthMm: segments.reduce((total, segment) => total + segment.toUMm - segment.fromUMm, 0) });
    }
    return rows;
  });
  return { battens, totalLengthMm: battens.reduce((total, batten) => total + batten.usableLengthMm, 0) };
}