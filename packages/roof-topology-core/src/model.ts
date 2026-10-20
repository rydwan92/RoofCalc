/**
 * VNext-6 / ADR-015 — the renderer-neutral roof topology graph.
 *
 * One contract for every roof shape: planes (real 3D polygons with their
 * own frame, normal and pitch), the lines where they end or meet, openings
 * in them, the structures they belong to and the connections between
 * structures. A gable and a hip from today's solver, a mono-pitch roof, an
 * asymmetric gable and an L-shaped roof with a valley are all instances of
 * the same graph — there is no `if (roof.type === …)` in a consumer.
 *
 * What this is NOT:
 *  - not a solver: it computes no rafter, no cut and no covering, and it
 *    never derives a plane from another plane. Planes arrive from a solver
 *    (roof-math today), from a recognised drawing or from a hand-checked
 *    fixture; the graph records, measures and checks them.
 *  - not persisted: `RoofProjectDocumentV1` stays the canonical document.
 *    The graph is derived (ADR-002); its persistence is the V2 migration
 *    described in ADR-015, not implemented here.
 *  - not a structural or fabrication claim: `geometry: 'complete'` means the
 *    surfaces close consistently, nothing more. Whether RoofCalc calculates
 *    the roof end to end is reported separately (`calculation`).
 *
 * Coordinates: world millimetres, right-handed, x/y horizontal (plan), z up.
 * IDs are opaque (ADR-007): nothing reads meaning from an ID; the solver's
 * own reference travels in `source.ref`.
 */

export const ROOF_SCENE_CONTRACT_VERSION = 1 as const;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * How far an entity got: read off a drawing, proposed by a rule, confirmed
 * by the user, or computed by a solver from confirmed input.
 */
export type RecognitionStage =
  'recognized' | 'proposed' | 'confirmed' | 'computed';

export interface SceneSource {
  kind: 'solver' | 'document' | 'cad' | 'ifc' | 'user' | 'fixture';
  /** Opaque reference into that source (a roof-math plane ID, a DXF handle). */
  ref?: string;
  stage: RecognitionStage;
}

/** `unresolved` = known to exist, geometry not established. */
export type EntityStatus = 'resolved' | 'partial' | 'unresolved';

/** Roof families a local solver may have used for one structure. */
export type StructureTemplate =
  'gable' | 'hip' | 'mono-pitch' | 'asymmetric-gable' | 'unknown';

export interface RoofStructureNode {
  id: string;
  /** Display only. */
  name?: string;
  /**
   * How the structure's local solver frame was placed in the world
   * (ADR-008). Planes and edges below are already in world coordinates.
   */
  transform: { translation: Vec3; rotationAboutVerticalDeg: number };
  template: StructureTemplate;
  status: EntityStatus;
  source: SceneSource;
}

export interface RoofPlaneFrame {
  /** Lowest vertex of the polygon. */
  origin: Vec3;
  /** Horizontal unit vector in the plane (along the eave). */
  u: Vec3;
  /** Unit vector in the plane pointing up the slope. */
  v: Vec3;
}

export interface RoofPlane {
  id: string;
  structureId: string;
  /** Closed planar polygon, world mm. Vertex order is the source's. */
  polygon: Vec3[];
  frame: RoofPlaneFrame;
  /** Upward unit normal. */
  normal: Vec3;
  /** Angle between the plane and the horizontal, degrees. */
  pitchDeg: number;
  status: EntityStatus;
  source: SceneSource;
}

export type RoofEdgeKind =
  'eave' | 'ridge' | 'hip' | 'valley' | 'verge' | 'abutment' | 'unknown';

export const ROOF_EDGE_KINDS = [
  'eave',
  'ridge',
  'hip',
  'valley',
  'verge',
  'abutment',
  'unknown',
] as const satisfies readonly RoofEdgeKind[];

export interface RoofEdge {
  id: string;
  kind: RoofEdgeKind;
  from: Vec3;
  to: Vec3;
  /** One plane (eave, verge, abutment) or two (ridge, hip, valley). */
  planeIds: string[];
  status: EntityStatus;
  source: SceneSource;
}

export interface RoofOpening {
  id: string;
  planeId: string;
  kind: 'roof-window' | 'chimney' | 'dormer' | 'unknown';
  /** World mm, on the plane. */
  polygon: Vec3[];
  status: EntityStatus;
  source: SceneSource;
}

/** Two structures meeting. Lives above both, never inside one (ADR-008). */
export interface RoofStructureConnection {
  id: string;
  structureIds: [string, string];
  kind: 'roof-to-roof' | 'roof-to-wall' | 'unknown';
  /** Edges that realise the junction (valleys, abutments) once solved. */
  edgeIds: string[];
  status: EntityStatus;
  source: SceneSource;
}

export interface RoofSceneGraph {
  contractVersion: typeof ROOF_SCENE_CONTRACT_VERSION;
  structures: RoofStructureNode[];
  planes: RoofPlane[];
  edges: RoofEdge[];
  openings: RoofOpening[];
  connections: RoofStructureConnection[];
}
