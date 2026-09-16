import {
  EMPTY_SCENE_BOUNDS,
  type SceneBounds,
  type ScenePoint3,
  type SceneVector3,
} from './scene';

/**
 * Pure camera framing for a Z-up technical scene.
 *
 * Every distance is derived from the scene's own bounds, so no world constant
 * is hard-coded and a 6 m garage and a 30 m hall frame identically well. The
 * renderer applies the result; it computes none of it.
 */

export type SceneViewPreset = 'isometric' | 'top' | 'front' | 'side';

export type SceneProjection = 'perspective' | 'orthographic';

/** Unit direction from the target toward the camera, per preset. Z is up. */
const PRESET_DIRECTION: Record<SceneViewPreset, SceneVector3> = {
  // A technical three-quarter view at roughly 30° elevation: transverse,
  // longitudinal and vertical extents all stay readable, and no member hides
  // exactly behind another.
  isometric: { x: 1, y: -1, z: 0.8 },
  top: { x: 0, y: 0, z: 1 },
  // Looking at the gable end: the roof triangle and the K1 pitch read directly.
  front: { x: 0, y: -1, z: 0 },
  // Looking along the transverse axis: the ridge line and spacing read directly.
  side: { x: 1, y: 0, z: 0 },
};

/** Camera up hint per preset; a top view needs a horizontal up axis. */
const PRESET_UP: Record<SceneViewPreset, SceneVector3> = {
  isometric: { x: 0, y: 0, z: 1 },
  top: { x: 0, y: 1, z: 0 },
  front: { x: 0, y: 0, z: 1 },
  side: { x: 0, y: 0, z: 1 },
};

function normalize(vector: SceneVector3): SceneVector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length <= 1e-9) return { x: 0, y: 0, z: 1 };
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(a: SceneVector3, b: SceneVector3): SceneVector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: SceneVector3, b: SceneVector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export interface SceneCameraPose {
  position: ScenePoint3;
  target: ScenePoint3;
  up: SceneVector3;
  /** Distance from target to camera, in millimetres. */
  distanceMm: number;
  /** Half-height of the orthographic frustum, in millimetres. */
  orthographicHalfHeightMm: number;
  /** Safe clipping planes derived from the framed extent. */
  nearMm: number;
  farMm: number;
  /** Orbit distance limits, so the camera can never get lost. */
  minDistanceMm: number;
  maxDistanceMm: number;
}

export interface FitCameraOptions {
  bounds: SceneBounds;
  preset: SceneViewPreset;
  /** Viewport aspect ratio (width / height). */
  aspect: number;
  /** Vertical field of view in degrees, for the perspective camera. */
  fovDeg?: number;
  /** Extra framing room around the model. 1 = tight. */
  paddingFactor?: number;
}

/** The eight corners of an axis-aligned box. */
function boundsCorners(bounds: SceneBounds): ScenePoint3[] {
  const corners: ScenePoint3[] = [];
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) corners.push({ x, y, z });
  return corners;
}

/**
 * Frames the whole of `bounds` from the preset direction.
 *
 * The model is fitted by its **projected** extent in the camera's own frame,
 * not by its bounding sphere: a long, low roof would otherwise be framed as if
 * it were a cube and waste most of the viewport. Perspective and orthographic
 * are fitted from the same extents, so switching projection keeps roughly the
 * same framing.
 */
export function fitCamera(options: FitCameraOptions): SceneCameraPose {
  const bounds =
    Number.isFinite(options.bounds.radiusMm) &&
    options.bounds.radiusMm > 0 &&
    [
      options.bounds.min.x,
      options.bounds.min.y,
      options.bounds.min.z,
      options.bounds.max.x,
      options.bounds.max.y,
      options.bounds.max.z,
    ].every(Number.isFinite)
      ? options.bounds
      : EMPTY_SCENE_BOUNDS;
  const aspect =
    Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1;
  const fovDeg =
    Number.isFinite(options.fovDeg ?? Number.NaN) &&
    (options.fovDeg ?? 0) > 1 &&
    (options.fovDeg ?? 0) < 120
      ? options.fovDeg!
      : 38;
  const padding =
    Number.isFinite(options.paddingFactor ?? Number.NaN) &&
    (options.paddingFactor ?? 0) >= 1
      ? options.paddingFactor!
      : 1.2;

  const direction = normalize(PRESET_DIRECTION[options.preset]);
  const upHint = PRESET_UP[options.preset];
  let right = cross(upHint, direction);
  if (Math.hypot(right.x, right.y, right.z) <= 1e-6)
    right = cross({ x: 1, y: 0, z: 0 }, direction);
  right = normalize(right);
  const cameraUp = normalize(cross(direction, right));

  const target = { ...bounds.center };
  const fovRad = (fovDeg * Math.PI) / 180;
  const tanVertical = Math.tan(fovRad / 2);
  const tanHorizontal = tanVertical * aspect;

  let halfWidthMm = 0;
  let halfHeightMm = 0;
  let requiredDistanceMm = 0;
  let nearestDepthMm = Number.POSITIVE_INFINITY;
  for (const corner of boundsCorners(bounds)) {
    const offset = {
      x: corner.x - target.x,
      y: corner.y - target.y,
      z: corner.z - target.z,
    };
    const width = Math.abs(dot(offset, right)) * padding;
    const height = Math.abs(dot(offset, cameraUp)) * padding;
    // Depth toward the camera: a near corner needs the camera pushed further
    // back than a far one to stay inside the frustum.
    const depth = dot(offset, direction);
    halfWidthMm = Math.max(halfWidthMm, width);
    halfHeightMm = Math.max(halfHeightMm, height);
    nearestDepthMm = Math.min(nearestDepthMm, depth);
    requiredDistanceMm = Math.max(
      requiredDistanceMm,
      depth + height / tanVertical,
      depth + width / tanHorizontal,
    );
  }
  const distanceMm = Math.max(requiredDistanceMm, 1);
  const orthographicHalfHeightMm = Math.max(
    halfHeightMm,
    halfWidthMm / aspect,
    1,
  );
  const depthSpanMm = Math.max(bounds.radiusMm * 2, 1);
  return {
    target,
    up: { ...upHint },
    position: {
      x: target.x + direction.x * distanceMm,
      y: target.y + direction.y * distanceMm,
      z: target.z + direction.z * distanceMm,
    },
    distanceMm,
    orthographicHalfHeightMm,
    nearMm: Math.max(distanceMm / 1000, 1),
    farMm: distanceMm + depthSpanMm * 4 - Math.min(nearestDepthMm, 0),
    minDistanceMm: Math.max(bounds.radiusMm / 40, 1),
    maxDistanceMm: distanceMm * 6,
  };
}

export const SCENE_VIEW_PRESETS: readonly SceneViewPreset[] = [
  'isometric',
  'top',
  'front',
  'side',
];
