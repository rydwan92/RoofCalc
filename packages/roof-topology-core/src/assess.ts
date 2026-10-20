import {
  distance,
  distanceToSegment,
  heightAt,
  insidePlan,
  maxDeviationFromPlane,
  polygonArea,
  TOLERANCE_MM,
} from './geometry';
import type {
  RoofEdge,
  RoofEdgeKind,
  RoofPlane,
  RoofSceneGraph,
  StructureTemplate,
} from './model';

/**
 * Checks that a roof graph is consistent and says how far RoofCalc can go
 * with it. Two separate answers, never merged:
 *
 *  - `geometry`: `complete` when every plane is a valid planar polygon,
 *    every boundary side is classified, every declared line kind matches
 *    the geometry (a valley really is concave) and every junction between
 *    structures is resolved; `partial` when something is merely unknown or
 *    unresolved; `invalid` when something contradicts itself.
 *  - `calculation`: `supported` only for one structure computed by today's
 *    gable/hip solver. A complete mono-pitch or L-shaped graph is still
 *    `not-supported` until its solver, covering, quantities and documents
 *    exist (VNext-7) — a correct drawing is not a calculated roof.
 */
export type RoofSceneIssueCode =
  | 'duplicate-id'
  | 'unknown-structure'
  | 'structure-without-planes'
  | 'plane-degenerate'
  | 'plane-not-planar'
  | 'plane-vertical'
  | 'edge-unknown-plane'
  | 'edge-plane-count'
  | 'edge-off-plane'
  | 'edge-kind-mismatch'
  | 'edge-kind-unknown'
  | 'boundary-unclassified'
  | 'opening-unknown-plane'
  | 'opening-off-plane'
  | 'connection-unknown-structure'
  | 'connection-unknown-edge'
  | 'connection-unresolved'
  | 'junction-unresolved'
  | 'entity-unresolved';

export interface RoofSceneIssue {
  code: RoofSceneIssueCode;
  /** `invalid` contradicts itself; `incomplete` is not yet established. */
  severity: 'invalid' | 'incomplete';
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
}

/** Templates today's solver computes end to end (surface → documents). */
const CALCULATED_TEMPLATES: ReadonlySet<StructureTemplate> = new Set([
  'gable',
  'hip',
]);

export function assessRoofScene(graph: RoofSceneGraph): RoofSceneAssessment {
  const issues: RoofSceneIssue[] = [];
  const add = (issue: RoofSceneIssue) => issues.push(issue);

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
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));

  for (const structure of graph.structures)
    if (!graph.planes.some((plane) => plane.structureId === structure.id))
      add({
        code: 'structure-without-planes',
        severity: 'incomplete',
        entityId: structure.id,
      });

  for (const plane of graph.planes) {
    if (!structureIds.has(plane.structureId))
      add({
        code: 'unknown-structure',
        severity: 'invalid',
        entityId: plane.id,
      });
    if (plane.polygon.length < 3 || polygonArea(plane.polygon) < 1) {
      add({
        code: 'plane-degenerate',
        severity: 'invalid',
        entityId: plane.id,
      });
      continue;
    }
    if (maxDeviationFromPlane(plane.polygon, plane.normal) > TOLERANCE_MM)
      add({
        code: 'plane-not-planar',
        severity: 'invalid',
        entityId: plane.id,
      });
    if (plane.pitchDeg >= 89.5)
      add({ code: 'plane-vertical', severity: 'invalid', entityId: plane.id });
  }

  for (const edge of graph.edges) {
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
    if (known.some((plane) => !onBoundary(edge, plane)))
      add({ code: 'edge-off-plane', severity: 'invalid', entityId: edge.id });
    if (edge.kind === 'unknown') {
      add({
        code: 'edge-kind-unknown',
        severity: 'incomplete',
        entityId: edge.id,
      });
      continue;
    }
    const expected = expectedKinds(edge, known);
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

  for (const plane of graph.planes) {
    if (plane.polygon.length < 3) continue;
    const own = graph.edges.filter((edge) => edge.planeIds.includes(plane.id));
    plane.polygon.forEach((a, index) => {
      const b = plane.polygon[(index + 1) % plane.polygon.length]!;
      const side = distance(a, b);
      if (side <= TOLERANCE_MM) return;
      const covered = own
        .filter(
          (edge) =>
            distanceToSegment(edge.from, a, b) <= TOLERANCE_MM &&
            distanceToSegment(edge.to, a, b) <= TOLERANCE_MM,
        )
        .reduce((sum, edge) => sum + distance(edge.from, edge.to), 0);
      if (covered < side - 2 * TOLERANCE_MM)
        add({
          code: 'boundary-unclassified',
          severity: 'incomplete',
          entityId: plane.id,
        });
    });
  }

  for (const opening of graph.openings) {
    const plane = planeById.get(opening.planeId);
    if (!plane) {
      add({
        code: 'opening-unknown-plane',
        severity: 'invalid',
        entityId: opening.id,
      });
      continue;
    }
    const off = opening.polygon.some((point) => {
      const z = heightAt(plane.polygon[0]!, plane.normal, point);
      return (
        z === undefined ||
        Math.abs(z - point.z) > TOLERANCE_MM ||
        !(
          insidePlan(point, plane.polygon) ||
          plane.polygon.some(
            (a, index) =>
              distanceToSegment(
                point,
                a,
                plane.polygon[(index + 1) % plane.polygon.length]!,
              ) <= TOLERANCE_MM,
          )
        )
      );
    });
    if (off)
      add({
        code: 'opening-off-plane',
        severity: 'invalid',
        entityId: opening.id,
      });
  }

  for (const connection of graph.connections) {
    if (connection.structureIds.some((id) => !structureIds.has(id)))
      add({
        code: 'connection-unknown-structure',
        severity: 'invalid',
        entityId: connection.id,
      });
    if (connection.edgeIds.some((id) => !edgeIds.has(id)))
      add({
        code: 'connection-unknown-edge',
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

  // Structures whose roofs overlap in plan need a resolved junction; until
  // then the overlap is exactly the part RoofCalc does not know.
  const structures = graph.structures.map((structure) => ({
    id: structure.id,
    box: planBox(
      graph.planes.filter((plane) => plane.structureId === structure.id),
    ),
  }));
  structures.forEach((a, index) =>
    structures.slice(index + 1).forEach((b) => {
      if (!a.box || !b.box || !boxesOverlap(a.box, b.box)) return;
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
    : issues.length
      ? 'partial'
      : 'complete';
  const limits = calculationLimits(graph, geometry);
  return {
    geometry,
    calculation: limits.length ? 'not-supported' : 'supported',
    limits,
    issues,
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

/** Both ends and the middle of the edge lie on the plane's boundary. */
function onBoundary(edge: RoofEdge, plane: RoofPlane): boolean {
  const middle = {
    x: (edge.from.x + edge.to.x) / 2,
    y: (edge.from.y + edge.to.y) / 2,
    z: (edge.from.z + edge.to.z) / 2,
  };
  return [edge.from, edge.to, middle].every((point) =>
    plane.polygon.some(
      (a, index) =>
        distanceToSegment(
          point,
          a,
          plane.polygon[(index + 1) % plane.polygon.length]!,
        ) <= TOLERANCE_MM,
    ),
  );
}

/**
 * The line kinds the geometry allows. One plane: an eave at its lowest
 * level, its top edge (a mono-pitch "kalenica" or a wall abutment), or a
 * sloped verge/abutment. Two planes: a horizontal ridge, or a sloped hip
 * (convex) or valley (concave).
 */
function expectedKinds(
  edge: RoofEdge,
  planes: readonly RoofPlane[],
): RoofEdgeKind[] | 'plane-count' | undefined {
  const horizontal = Math.abs(edge.to.z - edge.from.z) <= TOLERANCE_MM;
  if (planes.length === 1) {
    const plane = planes[0]!;
    if (!horizontal) return ['verge', 'abutment'];
    const levels = plane.polygon.map((point) => point.z);
    if (Math.abs(edge.from.z - Math.min(...levels)) <= TOLERANCE_MM)
      return ['eave', 'abutment'];
    if (Math.abs(edge.from.z - Math.max(...levels)) <= TOLERANCE_MM)
      return ['ridge', 'abutment'];
    return ['abutment'];
  }
  if (planes.length !== 2) return 'plane-count';
  const fold = foldOf(edge, planes[0]!, planes[1]!);
  if (!fold) return undefined;
  // A horizontal concave line is a valley too (a butterfly roof).
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
  a: RoofPlane,
  b: RoofPlane,
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
    .find((point) => insidePlan(point, a.polygon));
  if (!probe) return undefined;
  const own = heightAt(a.polygon[0]!, a.normal, probe);
  const other = heightAt(b.polygon[0]!, b.normal, probe);
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
