/**
 * Renderer-neutral technical scene contract (V38).
 *
 * This module knows nothing about React, the DOM, WebGL or Three.js. It
 * describes already-resolved technical facts in canonical millimetres so that
 * any renderer — the existing 2D axonometric canvas, the V38 Three.js
 * viewport, or a future one — draws the same roof.
 *
 * No renderer type (`Vector3`, `Matrix4`, `BufferGeometry`, …) may appear in
 * this contract, and no geometry may be *derived* here that a solver already
 * owns. The adapter copies resolved facts; it never recalculates them.
 */

/**
 * The one frozen scene coordinate convention for V38.
 *
 * It is exactly the resolved roof coordinate system already produced by
 * `roof-math` — no axis swap, no unit change, no re-centring. A renderer that
 * needs a different convention applies its own camera/up configuration; the
 * scene never bends to it.
 */
export interface SceneCoordinateSystem {
  unit: 'mm';
  handedness: 'right';
  upAxis: 'z';
  /** What each axis physically means on the building. */
  axes: {
    /** Transverse: across the span. 0 lies on the ridge/centre line. */
    x: 'transverse';
    /** Longitudinal: along the building, 0 at the reference gable/front wall. */
    y: 'longitudinal';
    /** Vertical: up. 0 lies at the wall-plate reference level. */
    z: 'vertical';
  };
}

export const SCENE_COORDINATE_SYSTEM: SceneCoordinateSystem = {
  unit: 'mm',
  handedness: 'right',
  upAxis: 'z',
  axes: { x: 'transverse', y: 'longitudinal', z: 'vertical' },
};

export interface ScenePoint3 {
  x: number;
  y: number;
  z: number;
}

/** A unit direction in scene coordinates. */
export type SceneVector3 = ScenePoint3;

/**
 * A real rectangular timber solid.
 *
 * `axis` is the resolved member axis copied verbatim from the domain model;
 * the box is centred on it and never lengthened, shortened or padded. The
 * basis is orthonormal and right-handed in the order (width, along, depth),
 * matching `createTimberPrismBasis` in `drawing-engine`, so the 2D faces and
 * the 3D solid describe the same physical timber.
 */
export interface SceneOrientedBox {
  kind: 'oriented-box';
  center: ScenePoint3;
  basis: { width: SceneVector3; along: SceneVector3; depth: SceneVector3 };
  /** Full extents along the local axes, in millimetres. */
  size: { widthMm: number; alongMm: number; depthMm: number };
  axis: { from: ScenePoint3; to: ScenePoint3 };
}

/** A planar reference polygon, such as a roof plane. Presentation context only. */
export interface ScenePolygon {
  kind: 'polygon';
  points: ScenePoint3[];
}

/** A reference line. Reserved for future axes and fabrication markers. */
export interface SceneLine {
  kind: 'line';
  from: ScenePoint3;
  to: ScenePoint3;
}

/**
 * A closed profile extruded across a member's width (V39).
 *
 * This is how a *finished* timber is carried: the profile already has its
 * resolved notches and end cuts taken out of it by the solver, so a renderer
 * only has to triangulate and extrude a polygon. No boolean operation is
 * implied, requested or permitted here.
 *
 * `profile` is in the member's own plane — `x` along the axis, `y` from the
 * bottom edge — and `origin`/`basis` place local `(0, 0)` in the scene.
 */
export interface SceneExtrudedProfile {
  kind: 'extruded-profile';
  profile: { x: number; y: number }[];
  thicknessMm: number;
  origin: ScenePoint3;
  basis: { along: SceneVector3; width: SceneVector3; up: SceneVector3 };
}

export type SceneGeometry =
  SceneOrientedBox | ScenePolygon | SceneLine | SceneExtrudedProfile;

export type SceneEntityKind =
  'timber-member' | 'roof-plane' | 'counter-batten' | 'unresolved-boundary';

/**
 * The semantic family a renderer colours and filters by. It mirrors the
 * structured member vocabulary of `timber-model`; it is never recovered by
 * parsing an ID or a display code.
 */
export type SceneSemanticGroup =
  | 'common-rafter'
  | 'hip-rafter'
  | 'jack-rafter'
  | 'collar-tie'
  | 'wall-plate'
  | 'purlin'
  | 'ridge'
  | 'opening-framing'
  | 'roof-plane'
  /** V39 build-up context: a resolved counter-batten run. */
  | 'counter-batten'
  /** V39: a hip boundary still waiting for an execution decision. */
  | 'unresolved-hip-boundary';

/**
 * How physically complete the drawn solid is.
 *
 * `reference` means the solid follows the resolved structural/reference axis
 * and section, but the finished connection detail (hip face deductions,
 * jack-to-hip finished faces, backing/drop, notches and end cuts) is not
 * modelled. It must never be presented as an exact finished joint.
 */
export type SceneGeometryStatus = 'reference' | 'finished';

/**
 * Named, renderer-neutral truthfulness limits disclosed with an entity.
 *
 * - `no-cut-solids` — resolved end cuts and notches exist in the fabrication
 *   model but are not subtracted from this solid.
 * - `compound-connection-not-resolved` — the finished hip/jack connection
 *   face (deductions, backing/drop, compound cut solid) is not modelled.
 */
export type SceneGeometryLimitation =
  | 'no-cut-solids'
  | 'compound-connection-not-resolved'
  /** V39: a hip boundary detail is not chosen, so nothing is drawn solid. */
  | 'hip-boundary-detail-not-selected';

/**
 * The canonical identity behind a scene entity.
 *
 * These are opaque strings copied from the domain model. Nothing downstream
 * may parse them; selection works by equality against the same identities the
 * 2D workbench already uses (ADR-007).
 */
export interface SceneSourceRef {
  kind:
    'skeleton-member' | 'roof-plane' | 'counter-batten-row' | 'hip-boundary';
  /** Stable physical placement identity of a skeleton member. */
  memberId?: string;
  /** The identity the workbench selection actually carries. */
  selectionId?: string;
  /** Shared fabrication/source definition identity. */
  prototypeId?: string;
  /** Roof-plane identity, for plane context entities. */
  roofPlaneId?: string;
  /** V39: the resolved counter-batten row this entity draws. */
  counterBattenRowId?: string;
}

/**
 * Presentation metadata. A display code such as K1 is generated, never
 * identity, and a renderer must not map it back to a domain decision.
 */
export interface SceneEntityLabel {
  /** Generated family code shown to the user, e.g. `K1`. */
  familyCode?: string;
  /** Translation key for the human family name. */
  nameKey: string;
}

export interface TechnicalSceneEntity {
  /** Scene-local identity minted by the adapter. Unique inside one scene. */
  id: string;
  kind: SceneEntityKind;
  semanticGroup: SceneSemanticGroup;
  label: SceneEntityLabel;
  geometry: SceneGeometry;
  selectable: boolean;
  sourceRef: SceneSourceRef;
  geometryStatus: SceneGeometryStatus;
  /** What this solid deliberately does not yet represent. */
  limitations: SceneGeometryLimitation[];
  /** Real section, when the entity is a physical timber member. */
  section?: { widthMm: number; depthMm: number };
  /** Resolved axis length in millimetres, for physical members. */
  lengthMm?: number;
}

export interface SceneBounds {
  min: ScenePoint3;
  max: ScenePoint3;
  center: ScenePoint3;
  size: ScenePoint3;
  /** Radius of the bounding sphere around `center`, in millimetres. */
  radiusMm: number;
  /** False when the scene carried no geometry and a safe fallback was used. */
  empty: boolean;
}

export interface TechnicalScene {
  coordinateSystem: SceneCoordinateSystem;
  bounds: SceneBounds;
  entities: TechnicalSceneEntity[];
}

/** A 1 m cube around the origin, so an empty scene still frames safely. */
const FALLBACK_HALF_MM = 500;

export const EMPTY_SCENE_BOUNDS: SceneBounds = {
  min: { x: -FALLBACK_HALF_MM, y: -FALLBACK_HALF_MM, z: -FALLBACK_HALF_MM },
  max: { x: FALLBACK_HALF_MM, y: FALLBACK_HALF_MM, z: FALLBACK_HALF_MM },
  center: { x: 0, y: 0, z: 0 },
  size: {
    x: FALLBACK_HALF_MM * 2,
    y: FALLBACK_HALF_MM * 2,
    z: FALLBACK_HALF_MM * 2,
  },
  radiusMm: Math.hypot(FALLBACK_HALF_MM, FALLBACK_HALF_MM, FALLBACK_HALF_MM),
  empty: true,
};

/** Every corner of an entity's geometry, in scene coordinates. */
export function sceneGeometryCorners(geometry: SceneGeometry): ScenePoint3[] {
  if (geometry.kind === 'line') return [geometry.from, geometry.to];
  if (geometry.kind === 'polygon') return geometry.points;
  if (geometry.kind === 'extruded-profile') {
    const { origin, basis, profile, thicknessMm } = geometry;
    return profile.flatMap((point) =>
      [-thicknessMm / 2, thicknessMm / 2].map((offset) => ({
        x:
          origin.x +
          basis.along.x * point.x +
          basis.up.x * point.y +
          basis.width.x * offset,
        y:
          origin.y +
          basis.along.y * point.x +
          basis.up.y * point.y +
          basis.width.y * offset,
        z:
          origin.z +
          basis.along.z * point.x +
          basis.up.z * point.y +
          basis.width.z * offset,
      })),
    );
  }
  const { center, basis, size } = geometry;
  const corners: ScenePoint3[] = [];
  for (const widthSign of [-1, 1] as const)
    for (const alongSign of [-1, 1] as const)
      for (const depthSign of [-1, 1] as const)
        corners.push({
          x:
            center.x +
            (basis.width.x * size.widthMm * widthSign) / 2 +
            (basis.along.x * size.alongMm * alongSign) / 2 +
            (basis.depth.x * size.depthMm * depthSign) / 2,
          y:
            center.y +
            (basis.width.y * size.widthMm * widthSign) / 2 +
            (basis.along.y * size.alongMm * alongSign) / 2 +
            (basis.depth.y * size.depthMm * depthSign) / 2,
          z:
            center.z +
            (basis.width.z * size.widthMm * widthSign) / 2 +
            (basis.along.z * size.alongMm * alongSign) / 2 +
            (basis.depth.z * size.depthMm * depthSign) / 2,
        });
  return corners;
}

/** Axis-aligned bounds containing every corner of every entity. */
export function sceneBoundsOf(
  entities: readonly TechnicalSceneEntity[],
): SceneBounds {
  const points = entities.flatMap((entity) =>
    sceneGeometryCorners(entity.geometry),
  );
  return boundsOfPoints(points);
}

export function boundsOfPoints(points: readonly ScenePoint3[]): SceneBounds {
  const finite = points.filter((point) =>
    [point.x, point.y, point.z].every(Number.isFinite),
  );
  if (finite.length === 0) return EMPTY_SCENE_BOUNDS;
  const min = {
    x: Math.min(...finite.map((point) => point.x)),
    y: Math.min(...finite.map((point) => point.y)),
    z: Math.min(...finite.map((point) => point.z)),
  };
  const max = {
    x: Math.max(...finite.map((point) => point.x)),
    y: Math.max(...finite.map((point) => point.y)),
    z: Math.max(...finite.map((point) => point.z)),
  };
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  const radiusMm = Math.max(1, Math.hypot(size.x, size.y, size.z) / 2);
  return { min, max, center, size, radiusMm, empty: false };
}

/** Bounds of one subset, used by "fit selected" without mutating selection. */
export function boundsOfEntities(
  entities: readonly TechnicalSceneEntity[],
): SceneBounds {
  return sceneBoundsOf(entities);
}
