import type {
  Point3D,
  RoofFeature,
  RoofPlanePosition,
  RoofTemplateSpec,
  RoofWindowFeature,
  SkeletonMemberSide,
} from '@cieslacalc/timber-model';
import {
  projectPlaneLocalToWorld,
  resolveRoofPlaneBasis,
} from './roof-features';

const EPSILON = 1e-7;

export type RoofSurfaceIssueCode =
  | 'invalid-opening'
  | 'opening-outside-plane'
  | 'opening-clipped-to-plane'
  | 'unknown-roof-plane';

export interface RoofSurfaceIssue {
  code: RoofSurfaceIssueCode;
  featureId: string;
  roofPlaneId: string;
}

export interface ResolvedRoofSurfacePlane {
  roofPlaneId: string;
  grossAreaMm2: number;
  openingAreaMm2: number;
  netAreaMm2: number;
  slopeLengthsMm: number[];
  eaveLengthMm: number;
  ridgeBoundaryLengthMm: number;
  hipBoundaryLengthMm: number;
  polygon: RoofPlanePosition[];
  worldPolygon: Point3D[];
  openingPolygons: { featureId: string; polygon: RoofPlanePosition[] }[];
  issues: RoofSurfaceIssue[];
}

export interface RoofSurfaceGeometryResult {
  status: 'resolved' | 'invalid';
  planes: ResolvedRoofSurfacePlane[];
  grossAreaMm2: number;
  openingAreaMm2: number;
  netAreaMm2: number;
  issues: RoofSurfaceIssue[];
}

export function roofPlaneIds(template: RoofTemplateSpec): string[] {
  return template.type === 'gable'
    ? ['roof-plane:left', 'roof-plane:right']
    : [
        'roof-plane:left',
        'roof-plane:right',
        'roof-plane:front',
        'roof-plane:rear',
      ];
}

/**
 * Template-owned lookup from a roof-plane ID to the member side facing it.
 * `roof-math` generates these IDs, so it is the only module allowed to
 * interpret them. Consumers must call this instead of parsing the ID string,
 * and must handle `undefined` rather than assuming a default side (ADR-007).
 */
export function roofPlaneSide(
  template: RoofTemplateSpec,
  roofPlaneId: string,
): SkeletonMemberSide | undefined {
  if (!roofPlaneIds(template).includes(roofPlaneId)) return undefined;
  const sides: Record<string, SkeletonMemberSide> = {
    'roof-plane:left': 'left',
    'roof-plane:right': 'right',
    'roof-plane:front': 'front',
    'roof-plane:rear': 'rear',
  };
  return sides[roofPlaneId];
}

function polygonArea(polygon: readonly RoofPlanePosition[]) {
  if (polygon.length < 3) return 0;
  return (
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return sum + point.uMm * next.vMm - next.uMm * point.vMm;
      }, 0),
    ) / 2
  );
}

type Boundary = {
  inside: (point: RoofPlanePosition) => boolean;
  intersect: (
    from: RoofPlanePosition,
    to: RoofPlanePosition,
  ) => RoofPlanePosition;
};

function clipBoundary(
  polygon: readonly RoofPlanePosition[],
  boundary: Boundary,
) {
  const result: RoofPlanePosition[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]!;
    const to = polygon[(index + 1) % polygon.length]!;
    const fromInside = boundary.inside(from);
    const toInside = boundary.inside(to);
    if (fromInside && toInside) result.push(to);
    else if (fromInside) result.push(boundary.intersect(from, to));
    else if (toInside) {
      result.push(boundary.intersect(from, to));
      result.push(to);
    }
  }
  return result;
}

function clipPolygonToRectangle(
  polygon: readonly RoofPlanePosition[],
  rectangle: { minU: number; maxU: number; minV: number; maxV: number },
) {
  const interpolateU = (
    uMm: number,
    from: RoofPlanePosition,
    to: RoofPlanePosition,
  ) => ({
    uMm,
    vMm:
      from.vMm + ((uMm - from.uMm) * (to.vMm - from.vMm)) / (to.uMm - from.uMm),
  });
  const interpolateV = (
    vMm: number,
    from: RoofPlanePosition,
    to: RoofPlanePosition,
  ) => ({
    uMm:
      from.uMm + ((vMm - from.vMm) * (to.uMm - from.uMm)) / (to.vMm - from.vMm),
    vMm,
  });
  return [
    {
      inside: (point: RoofPlanePosition) => point.uMm >= rectangle.minU,
      intersect: (from: RoofPlanePosition, to: RoofPlanePosition) =>
        interpolateU(rectangle.minU, from, to),
    },
    {
      inside: (point: RoofPlanePosition) => point.uMm <= rectangle.maxU,
      intersect: (from: RoofPlanePosition, to: RoofPlanePosition) =>
        interpolateU(rectangle.maxU, from, to),
    },
    {
      inside: (point: RoofPlanePosition) => point.vMm >= rectangle.minV,
      intersect: (from: RoofPlanePosition, to: RoofPlanePosition) =>
        interpolateV(rectangle.minV, from, to),
    },
    {
      inside: (point: RoofPlanePosition) => point.vMm <= rectangle.maxV,
      intersect: (from: RoofPlanePosition, to: RoofPlanePosition) =>
        interpolateV(rectangle.maxV, from, to),
    },
  ].reduce<RoofPlanePosition[]>(
    (current, boundary) =>
      current.length ? clipBoundary(current, boundary) : [],
    [...polygon],
  );
}

function rectangle(feature: RoofWindowFeature) {
  return {
    minU: feature.position.uMm,
    maxU: feature.position.uMm + feature.widthMm,
    minV: feature.position.vMm,
    maxV: feature.position.vMm + feature.heightMm,
  };
}

/**
 * Exact union area of axis-aligned openings clipped to the roof-plane polygon.
 * Rectangle boundaries create disjoint cells, so overlaps are counted once and
 * runtime stays polynomial as a project gains openings.
 */
function openingUnionArea(
  planePolygon: readonly RoofPlanePosition[],
  openings: readonly RoofWindowFeature[],
) {
  const rectangles = openings.map(rectangle);
  const uBreaks = [
    ...new Set(rectangles.flatMap((item) => [item.minU, item.maxU])),
  ].sort((a, b) => a - b);
  const vBreaks = [
    ...new Set(rectangles.flatMap((item) => [item.minV, item.maxV])),
  ].sort((a, b) => a - b);
  let area = 0;
  for (let uIndex = 0; uIndex < uBreaks.length - 1; uIndex += 1) {
    const minU = uBreaks[uIndex]!;
    const maxU = uBreaks[uIndex + 1]!;
    for (let vIndex = 0; vIndex < vBreaks.length - 1; vIndex += 1) {
      const minV = vBreaks[vIndex]!;
      const maxV = vBreaks[vIndex + 1]!;
      const midpoint = { uMm: (minU + maxU) / 2, vMm: (minV + maxV) / 2 };
      const covered = rectangles.some(
        (item) =>
          midpoint.uMm >= item.minU &&
          midpoint.uMm <= item.maxU &&
          midpoint.vMm >= item.minV &&
          midpoint.vMm <= item.maxV,
      );
      if (covered)
        area += polygonArea(
          clipPolygonToRectangle(planePolygon, { minU, maxU, minV, maxV }),
        );
    }
  }
  return Math.max(0, area);
}

function finiteOpening(feature: RoofWindowFeature) {
  return (
    feature.widthMm > 0 &&
    feature.heightMm > 0 &&
    [
      feature.widthMm,
      feature.heightMm,
      feature.position.uMm,
      feature.position.vMm,
    ].every(Number.isFinite)
  );
}

function boundaryMetrics(template: RoofTemplateSpec, roofPlaneId: string) {
  const slopeLength =
    (template.halfRunMm + template.eaveOverhangMm) /
    Math.cos((template.pitchDeg * Math.PI) / 180);
  if (template.type === 'gable')
    return {
      slopeLengthsMm: [slopeLength],
      eaveLengthMm: template.buildingLengthMm,
      ridgeBoundaryLengthMm: template.buildingLengthMm,
      hipBoundaryLengthMm: 0,
    };
  const longPlane =
    roofPlaneId === 'roof-plane:left' || roofPlaneId === 'roof-plane:right';
  const hipBoundary =
    (template.halfRunMm + template.eaveOverhangMm) *
    Math.sqrt(2 + Math.tan((template.pitchDeg * Math.PI) / 180) ** 2);
  return {
    slopeLengthsMm: [slopeLength],
    eaveLengthMm: longPlane
      ? template.buildingLengthMm + template.eaveOverhangMm * 2
      : (template.halfRunMm + template.eaveOverhangMm) * 2,
    ridgeBoundaryLengthMm: longPlane
      ? Math.max(0, template.buildingLengthMm - template.halfRunMm * 2)
      : 0,
    hipBoundaryLengthMm: hipBoundary * 2,
  };
}

export function resolveRoofSurfaceGeometry(args: {
  template: RoofTemplateSpec;
  features?: readonly RoofFeature[];
}): RoofSurfaceGeometryResult {
  const allIssues: RoofSurfaceIssue[] = [];
  const knownIds = new Set(roofPlaneIds(args.template));
  for (const feature of args.features ?? []) {
    if (!knownIds.has(feature.roofPlaneId))
      allIssues.push({
        code: 'unknown-roof-plane',
        featureId: feature.id,
        roofPlaneId: feature.roofPlaneId,
      });
  }
  const planes = roofPlaneIds(args.template).map((roofPlaneId) => {
    const basis = resolveRoofPlaneBasis(args.template, roofPlaneId);
    const issues: RoofSurfaceIssue[] = [];
    const openings = (args.features ?? []).filter(
      (feature): feature is RoofWindowFeature =>
        feature.kind === 'roof-window' && feature.roofPlaneId === roofPlaneId,
    );
    const validOpenings = openings.filter((feature) => {
      if (finiteOpening(feature)) return true;
      issues.push({
        code: 'invalid-opening',
        featureId: feature.id,
        roofPlaneId,
      });
      return false;
    });
    const openingPolygons = validOpenings.flatMap((feature) => {
      const clipped = clipPolygonToRectangle(basis.polygon, rectangle(feature));
      const clippedArea = polygonArea(clipped);
      if (clippedArea <= EPSILON) {
        issues.push({
          code: 'opening-outside-plane',
          featureId: feature.id,
          roofPlaneId,
        });
        return [];
      }
      if (Math.abs(clippedArea - feature.widthMm * feature.heightMm) > EPSILON)
        issues.push({
          code: 'opening-clipped-to-plane',
          featureId: feature.id,
          roofPlaneId,
        });
      return [{ featureId: feature.id, polygon: clipped }];
    });
    const grossAreaMm2 = polygonArea(basis.polygon);
    const openingAreaMm2 = openingUnionArea(basis.polygon, validOpenings);
    const plane = {
      roofPlaneId,
      grossAreaMm2,
      openingAreaMm2,
      netAreaMm2: Math.max(0, grossAreaMm2 - openingAreaMm2),
      ...boundaryMetrics(args.template, roofPlaneId),
      polygon: basis.polygon,
      worldPolygon: basis.polygon.map((point) =>
        projectPlaneLocalToWorld(basis, point),
      ),
      openingPolygons,
      issues,
    };
    allIssues.push(...issues);
    return plane;
  });
  return {
    status: allIssues.some((issue) =>
      [
        'invalid-opening',
        'opening-outside-plane',
        'unknown-roof-plane',
      ].includes(issue.code),
    )
      ? 'invalid'
      : 'resolved',
    planes,
    grossAreaMm2: planes.reduce((sum, plane) => sum + plane.grossAreaMm2, 0),
    openingAreaMm2: planes.reduce(
      (sum, plane) => sum + plane.openingAreaMm2,
      0,
    ),
    netAreaMm2: planes.reduce((sum, plane) => sum + plane.netAreaMm2, 0),
    issues: allIssues.sort(
      (a, b) =>
        a.roofPlaneId.localeCompare(b.roofPlaneId) ||
        a.featureId.localeCompare(b.featureId) ||
        a.code.localeCompare(b.code),
    ),
  };
}
