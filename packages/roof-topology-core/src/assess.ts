import {
  distance,
  distanceToSegment,
  dot,
  heightAt,
  insidePlan,
  length,
  maxDeviationFromPlane,
  pitchOf,
  polygonArea,
  polygonsOverlap,
  polygonWithin,
  selfIntersects,
  sub,
  TOLERANCE_MM,
  upwardNormal,
  withoutRepeatedVertices,
} from './geometry';
import {
  ROOF_SCENE_CONTRACT_VERSION,
  type RoofEdge,
  type RoofEdgeKind,
  type RoofPlane,
  type RoofSceneGraph,
  type StructureTemplate,
  type Vec3,
} from './model';

/**
 * Checks that a roof graph is consistent and says how far RoofCalc can go
 * with it. Two separate answers, never merged:
 *
 *  - `geometry`: `complete` when every plane is a valid planar polygon,
 *    every boundary side is covered exactly once by classified lines, every
 *    declared line kind matches the geometry (a valley really is concave)
 *    and every overlap between structures is a resolved junction; `partial`
 *    when something is merely unknown or unresolved; `invalid` when
 *    something contradicts itself.
 *  - `calculation`: `supported` only for one structure computed by today's
 *    gable/hip solver. A complete mono-pitch or L-shaped graph is still
 *    `not-supported` until its solver, covering, quantities and documents
 *    exist — a correct drawing is not a calculated roof.
 *
 * VNext-6.1 hardening (audit): boundary coverage is an interval union per
 * side (duplicates no longer hide gaps, overlaps are reported), outlines are
 * checked for self-intersection, stored frames/normals/pitches for
 * consistency, openings along every side (concave planes) and against each
 * other, and structure overlap by the planes' real plan outlines instead of
 * bounding boxes. These checks are diagnostics and gates; they never
 * change a solver result.
 */
export type RoofSceneIssueCode =
  | 'contract-version'
  | 'duplicate-id'
  | 'unknown-structure'
  | 'structure-without-planes'
  | 'plane-degenerate'
  | 'plane-repeated-vertex'
  | 'plane-self-intersecting'
  | 'plane-not-planar'
  | 'plane-vertical'
  | 'plane-frame-mismatch'
  | 'edge-unknown-plane'
  | 'edge-plane-repeated'
  | 'edge-degenerate'
  | 'edge-plane-count'
  | 'edge-off-plane'
  | 'edge-kind-mismatch'
  | 'edge-kind-unknown'
  | 'edge-overlap'
  | 'boundary-unclassified'
  | 'opening-unknown-plane'
  | 'opening-off-plane'
  | 'openings-overlap'
  | 'connection-unknown-structure'
  | 'connection-unknown-edge'
  | 'connection-edge-foreign'
  | 'connection-unresolved'
  | 'junction-unresolved'
  | 'entity-unresolved';

export interface RoofSceneIssue {
  code: RoofSceneIssueCode;
  /**
   * `invalid` contradicts itself; `incomplete` is not yet established;
   * `note` was normalised and does not change the result.
   */
  severity: 'invalid' | 'incomplete' | 'note';
  entityId: string;
  /** For `edge-kind-mismatch`: what the geometry says. */
  expected?: RoofEdgeKind[];
}

export type CalculationLimit =
  | { code: 'geometry-not-complete' }
  | { code: 'no-structure' }
  | { code: 'several-structures'; count: number }
  | { code: 'structure-connection'; connectionId: string }
  | {
      code: 'template-not-calculated';
      structureId: string;
      template: StructureTemplate;
    }
  | { code: 'not-from-solver'; structureId: string };

export interface RoofSceneAssessment {
  geometry: 'complete' | 'partial' | 'invalid';
  calculation: 'supported' | 'not-supported';
  limits: CalculationLimit[];
  issues: RoofSceneIssue[];
  /** The tolerances every check above used, stated with the result. */
  tolerances: { lengthMm: number; angleDeg: number };
}

/** Templates today's solver computes end to end (surface → documents). */
const CALCULATED_TEMPLATES: ReadonlySet<StructureTemplate> = new Set([
  'gable',
  'hip',
]);
/** Stored normal/pitch may differ from the polygon's by at most this. */
const ANGLE_TOLERANCE_DEG = 0.5;

export function assessRoofScene(graph: RoofSceneGraph): RoofSceneAssessment {
  const issues: RoofSceneIssue[] = [];
  const add = (issue: RoofSceneIssue) => issues.push(issue);

  if (graph.contractVersion !== ROOF_SCENE_CONTRACT_VERSION)
    add({ code: 'contract-version', severity: 'invalid', entityId: 'graph' });

  const seen = new Set<string>();
  for (const entity of [
    ...graph.structures,
    ...graph.planes,
    ...graph.edges,
    ...graph.openings,
    ...graph.connections,
  ]) {
    if (seen.has(entity.id))
      add({ code: 'duplicate-id', severity: 'invalid', entityId: entity.id });
    seen.add(entity.id);
    if (entity.status !== 'resolved')
      add({
        code: 'entity-unresolved',
        severity: 'incomplete',
        entityId: entity.id,
      });
  }

  const structureIds = new Set(graph.structures.map((item) => item.id));
  const planeById = new Map(graph.planes.map((plane) => [plane.id, plane]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  for (const structure of graph.structures)
    if (!graph.planes.some((plane) => plane.structureId === structure.id))
      add({
        code: 'structure-without-planes',
        severity: 'incomplete',
        entityId: structure.id,
      });

  /** Planes whose outline is usable for the edge and opening checks. */
  const outline = new Map<string, Vec3[]>();
  for (const plane of graph.planes) {
    if (!structureIds.has(plane.structureId))
      add({
        code: 'unknown-structure',
        severity: 'invalid',
        entityId: plane.id,
      });
    const polygon = withoutRepeatedVertices(plane.polygon);
    if (polygon.length !== plane.polygon.length)
      add({
        code: 'plane-repeated-vertex',
        severity: 'note',
        entityId: plane.id,
      });
    // A crossed outline first: its lobes can cancel to a zero area.
    if (polygon.length >= 4 && selfIntersects(polygon)) {
      add({
        code: 'plane-self-intersecting',
        severity: 'invalid',
        entityId: plane.id,
      });
      continue;
    }
    if (polygon.length < 3 || polygonArea(polygon) < 1) {
      add({
        code: 'plane-degenerate',
        severity: 'invalid',
        entityId: plane.id,
      });
      continue;
    }
    const normal = upwardNormal(polygon);
    if (maxDeviationFromPlane(polygon, normal) > TOLERANCE_MM)
      add({
        code: 'plane-not-planar',
        severity: 'invalid',
        entityId: plane.id,
      });
    if (pitchOf(normal) >= 89.5) {
      add({ code: 'plane-vertical', severity: 'invalid', entityId: plane.id });
      continue;
    }
    if (!frameConsistent(plane, normal))
      add({
        code: 'plane-frame-mismatch',
        severity: 'invalid',
        entityId: plane.id,
      });
    outline.set(plane.id, polygon);
  }

  for (const edge of graph.edges) {
    if (new Set(edge.planeIds).size !== edge.planeIds.length)
      add({
        code: 'edge-plane-repeated',
        severity: 'invalid',
        entityId: edge.id,
      });
    if (distance(edge.from, edge.to) <= TOLERANCE_MM) {
      add({ code: 'edge-degenerate', severity: 'invalid', entityId: edge.id });
      continue;
    }
    const planes = edge.planeIds.map((id) => planeById.get(id));
    if (planes.some((plane) => !plane)) {
      add({
        code: 'edge-unknown-plane',
        severity: 'invalid',
        entityId: edge.id,
      });
      continue;
    }
    const known = planes as RoofPlane[];
    if (
      known.some((plane) => {
        const polygon = outline.get(plane.id);
        return polygon && !onBoundary(edge, polygon);
      })
    )
      add({ code: 'edge-off-plane', severity: 'invalid', entityId: edge.id });
    if (edge.kind === 'unknown') {
      add({
        code: 'edge-kind-unknown',
        severity: 'incomplete',
        entityId: edge.id,
      });
      continue;
    }
    const expected = expectedKinds(edge, known, outline);
    if (expected === 'plane-count')
      add({
        code: 'edge-plane-count',
        severity: 'invalid',
        entityId: edge.id,
      });
    else if (expected && !expected.includes(edge.kind))
      add({
        code: 'edge-kind-mismatch',
        severity: 'invalid',
        entityId: edge.id,
        expected,
      });
  }

  // Every side of every plane: covered by lines once, without gaps.
  for (const plane of graph.planes) {
    const polygon = outline.get(plane.id);
    if (!polygon) continue;
    const own = graph.edges.filter(
      (edge) =>
        edge.planeIds.includes(plane.id) &&
        distance(edge.from, edge.to) > TOLERANCE_MM,
    );
    let gap = false;
    let overlap = false;
    polygon.forEach((a, index) => {
      const coverage = sideCoverage(
        a,
        polygon[(index + 1) % polygon.length]!,
        own,
      );
      gap ||= coverage.gap;
      overlap ||= coverage.overlap;
    });
    if (overlap)
      add({ code: 'edge-overlap', severity: 'invalid', entityId: plane.id });
    if (gap)
      add({
        code: 'boundary-unclassified',
        severity: 'incomplete',
        entityId: plane.id,
      });
  }

  const openingsOn = new Map<string, Vec3[][]>();
  for (const opening of graph.openings) {
    const plane = planeById.get(opening.planeId);
    const polygon = plane ? outline.get(plane.id) : undefined;
    if (!plane) {
      add({
        code: 'opening-unknown-plane',
        severity: 'invalid',
        entityId: opening.id,
      });
      continue;
    }
    if (!polygon) continue;
    const ownPolygon = withoutRepeatedVertices(opening.polygon);
    const normal = upwardNormal(polygon);
    const onSurface = ownPolygon.every((point) => {
      const z = heightAt(polygon[0]!, normal, point);
      return z !== undefined && Math.abs(z - point.z) <= TOLERANCE_MM;
    });
    // Every side, not only the corners: a concave plane's notch can lie
    // between two corners that are both on the plane.
    if (
      ownPolygon.length < 3 ||
      !onSurface ||
      !polygonWithin(ownPolygon, polygon)
    ) {
      add({
        code: 'opening-off-plane',
        severity: 'invalid',
        entityId: opening.id,
      });
      continue;
    }
    const others = openingsOn.get(plane.id) ?? [];
    if (others.some((other) => polygonsOverlap(other, ownPolygon)))
      add({
        code: 'openings-overlap',
        severity: 'incomplete',
        entityId: opening.id,
      });
    openingsOn.set(plane.id, [...others, ownPolygon]);
  }

  for (const connection of graph.connections) {
    if (connection.structureIds.some((id) => !structureIds.has(id)))
      add({
        code: 'connection-unknown-structure',
        severity: 'invalid',
        entityId: connection.id,
      });
    if (connection.edgeIds.some((id) => !edgeById.has(id)))
      add({
        code: 'connection-unknown-edge',
        severity: 'invalid',
        entityId: connection.id,
      });
    // A junction line must join a plane of each connected structure.
    const foreign = connection.edgeIds.some((id) => {
      const edge = edgeById.get(id);
      if (!edge) return false;
      const owners = new Set(
        edge.planeIds.map((planeId) => planeById.get(planeId)?.structureId),
      );
      return !connection.structureIds.every((structureId) =>
        owners.has(structureId),
      );
    });
    if (foreign)
      add({
        code: 'connection-edge-foreign',
        severity: 'invalid',
        entityId: connection.id,
      });
    if (connection.status !== 'resolved' || !connection.edgeIds.length)
      add({
        code: 'connection-unresolved',
        severity: 'incomplete',
        entityId: connection.id,
      });
  }

  // Structures whose roofs share plan AREA need a resolved junction; until
  // then the overlap is exactly the part RoofCalc does not know. Bounding
  // boxes only pre-filter: an L with a building in its notch overlaps by
  // box, not by roof.
  const structures = graph.structures.map((structure) => {
    const planes = graph.planes.filter(
      (plane) => plane.structureId === structure.id && outline.has(plane.id),
    );
    return { id: structure.id, planes, box: planBox(planes) };
  });
  structures.forEach((a, index) =>
    structures.slice(index + 1).forEach((b) => {
      if (!a.box || !b.box || !boxesOverlap(a.box, b.box)) return;
      const overlapping = a.planes.some((pa) =>
        b.planes.some((pb) =>
          polygonsOverlap(outline.get(pa.id)!, outline.get(pb.id)!),
        ),
      );
      if (!overlapping) return;
      const joined = graph.connections.some(
        (connection) =>
          connection.status === 'resolved' &&
          connection.structureIds.includes(a.id) &&
          connection.structureIds.includes(b.id),
      );
      if (!joined)
        add({
          code: 'junction-unresolved',
          severity: 'incomplete',
          entityId: `${a.id}|${b.id}`,
        });
    }),
  );

  const geometry = issues.some((issue) => issue.severity === 'invalid')
    ? 'invalid'
    : issues.some((issue) => issue.severity === 'incomplete')
      ? 'partial'
      : 'complete';
  const limits = calculationLimits(graph, geometry);
  return {
    geometry,
    calculation: limits.length ? 'not-supported' : 'supported',
    limits,
    issues,
    tolerances: { lengthMm: TOLERANCE_MM, angleDeg: ANGLE_TOLERANCE_DEG },
  };
}

function calculationLimits(
  graph: RoofSceneGraph,
  geometry: RoofSceneAssessment['geometry'],
): CalculationLimit[] {
  const limits: CalculationLimit[] = [];
  if (geometry !== 'complete') limits.push({ code: 'geometry-not-complete' });
  if (!graph.structures.length) limits.push({ code: 'no-structure' });
  if (graph.structures.length > 1)
    limits.push({
      code: 'several-structures',
      count: graph.structures.length,
    });
  for (const connection of graph.connections)
    limits.push({ code: 'structure-connection', connectionId: connection.id });
  for (const structure of graph.structures) {
    if (!CALCULATED_TEMPLATES.has(structure.template))
      limits.push({
        code: 'template-not-calculated',
        structureId: structure.id,
        template: structure.template,
      });
    if (structure.source.kind !== 'solver')
      limits.push({ code: 'not-from-solver', structureId: structure.id });
  }
  return limits;
}

/** Stored normal, pitch and frame agree with the polygon itself. */
function frameConsistent(plane: RoofPlane, normal: Vec3): boolean {
  const cosTolerance = Math.cos((ANGLE_TOLERANCE_DEG * Math.PI) / 180);
  if (dot(plane.normal, normal) < cosTolerance) return false;
  if (Math.abs(plane.pitchDeg - pitchOf(normal)) > ANGLE_TOLERANCE_DEG)
    return false;
  const { u, v } = plane.frame;
  const unit = (vector: Vec3) => Math.abs(length(vector) - 1) <= 1e-6;
  return (
    unit(u) &&
    unit(v) &&
    Math.abs(dot(u, normal)) <= 1e-6 &&
    Math.abs(dot(v, normal)) <= 1e-6 &&
    Math.abs(dot(u, v)) <= 1e-6 &&
    Math.abs(u.z) <= 1e-6 &&
    v.z >= -1e-9
  );
}

/** Both ends and the middle of the edge lie on the plane's boundary. */
function onBoundary(edge: RoofEdge, polygon: readonly Vec3[]): boolean {
  const middle = {
    x: (edge.from.x + edge.to.x) / 2,
    y: (edge.from.y + edge.to.y) / 2,
    z: (edge.from.z + edge.to.z) / 2,
  };
  return [edge.from, edge.to, middle].every((point) =>
    polygon.some(
      (a, index) =>
        distanceToSegment(point, a, polygon[(index + 1) % polygon.length]!) <=
        TOLERANCE_MM,
    ),
  );
}

/**
 * How the lines lying on one side cover it: the union of their intervals
 * along the side. A gap longer than the tolerance is unclassified boundary;
 * two lines covering the same stretch count a physical line twice.
 */
function sideCoverage(
  a: Vec3,
  b: Vec3,
  edges: readonly RoofEdge[],
): { gap: boolean; overlap: boolean } {
  const side = distance(a, b);
  if (side <= TOLERANCE_MM) return { gap: false, overlap: false };
  const direction = sub(b, a);
  const along = (point: Vec3) =>
    Math.min(side, Math.max(0, dot(sub(point, a), direction) / side));
  const intervals = edges
    .filter(
      (edge) =>
        distanceToSegment(edge.from, a, b) <= TOLERANCE_MM &&
        distanceToSegment(edge.to, a, b) <= TOLERANCE_MM,
    )
    .map((edge) => {
      const s = along(edge.from);
      const e = along(edge.to);
      return [Math.min(s, e), Math.max(s, e)] as const;
    })
    .sort((x, y) => x[0] - y[0]);
  let reach = 0;
  let gap = false;
  let overlap = false;
  for (const [start, end] of intervals) {
    if (start > reach + TOLERANCE_MM) gap = true;
    if (start < reach - TOLERANCE_MM) overlap = true;
    reach = Math.max(reach, end);
  }
  if (reach < side - TOLERANCE_MM) gap = true;
  return { gap, overlap };
}

/**
 * The line kinds the geometry allows. One plane: an eave at its lowest
 * level, its top edge (a mono-pitch "kalenica" or a wall abutment), or a
 * sloped verge/abutment. Two planes: a ridge (convex) or a valley (concave,
 * a butterfly roof) when horizontal, a hip or a valley when sloped.
 */
function expectedKinds(
  edge: RoofEdge,
  planes: readonly RoofPlane[],
  outline: ReadonlyMap<string, Vec3[]>,
): RoofEdgeKind[] | 'plane-count' | undefined {
  const horizontal = Math.abs(edge.to.z - edge.from.z) <= TOLERANCE_MM;
  if (planes.length === 1) {
    const polygon = outline.get(planes[0]!.id);
    if (!polygon) return undefined;
    if (!horizontal) return ['verge', 'abutment'];
    const levels = polygon.map((point) => point.z);
    if (Math.abs(edge.from.z - Math.min(...levels)) <= TOLERANCE_MM)
      return ['eave', 'abutment'];
    if (Math.abs(edge.from.z - Math.max(...levels)) <= TOLERANCE_MM)
      return ['ridge', 'abutment'];
    return ['abutment'];
  }
  if (planes.length !== 2) return 'plane-count';
  const a = outline.get(planes[0]!.id);
  const b = outline.get(planes[1]!.id);
  if (!a || !b) return undefined;
  const fold = foldOf(edge, a, b);
  if (!fold) return undefined;
  if (horizontal) return fold === 'convex' ? ['ridge'] : ['valley'];
  return fold === 'convex' ? ['hip'] : ['valley'];
}

/**
 * Convex when, just inside plane A beside the edge, A lies below plane B's
 * extension (a hip or a ridge); concave when above it (a valley). Uses a
 * point next to the edge rather than a centroid, so a notched plane — the
 * main roof of an L — is judged correctly.
 */
function foldOf(
  edge: RoofEdge,
  a: readonly Vec3[],
  b: readonly Vec3[],
): 'convex' | 'concave' | undefined {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const planLength = Math.hypot(dx, dy);
  if (planLength <= TOLERANCE_MM) return undefined;
  const step = Math.min(50, planLength * 0.05);
  const middle = {
    x: (edge.from.x + edge.to.x) / 2,
    y: (edge.from.y + edge.to.y) / 2,
  };
  const normal = { x: -dy / planLength, y: dx / planLength };
  const probe = [1, -1]
    .map((sign) => ({
      x: middle.x + normal.x * step * sign,
      y: middle.y + normal.y * step * sign,
    }))
    .find((point) => insidePlan(point, a));
  if (!probe) return undefined;
  const own = heightAt(a[0]!, upwardNormal(a), probe);
  const other = heightAt(b[0]!, upwardNormal(b), probe);
  if (own === undefined || other === undefined) return undefined;
  if (Math.abs(own - other) <= TOLERANCE_MM * 0.01) return undefined;
  return own < other ? 'convex' : 'concave';
}

interface PlanBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function planBox(planes: readonly RoofPlane[]): PlanBox | undefined {
  const points = planes.flatMap((plane) => plane.polygon);
  if (!points.length) return undefined;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function boxesOverlap(a: PlanBox, b: PlanBox): boolean {
  const width = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const depth = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  return width > TOLERANCE_MM && depth > TOLERANCE_MM;
}
