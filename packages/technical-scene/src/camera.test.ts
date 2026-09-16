import { describe, expect, it } from 'vitest';
import {
  EMPTY_SCENE_BOUNDS,
  SCENE_VIEW_PRESETS,
  boundsOfPoints,
  fitCamera,
  type SceneBounds,
  type SceneViewPreset,
} from './index';

/**
 * Camera framing must be derived from the scene's own bounds. A hard-coded
 * world distance would frame one building well and every other one badly.
 */

const SMALL = boundsOfPoints([
  { x: -2500, y: 0, z: 0 },
  { x: 2500, y: 6000, z: 2000 },
]);
const LARGE = boundsOfPoints([
  { x: -9000, y: 0, z: 0 },
  { x: 9000, y: 40000, z: 7000 },
]);

const distanceTo = (pose: ReturnType<typeof fitCamera>) =>
  Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );

describe('fitCamera', () => {
  it('always looks at the centre of the framed bounds', () => {
    for (const preset of SCENE_VIEW_PRESETS) {
      const pose = fitCamera({ bounds: SMALL, preset, aspect: 16 / 9 });
      expect(pose.target).toEqual(SMALL.center);
      expect(distanceTo(pose)).toBeCloseTo(pose.distanceMm, 6);
    }
  });

  it('scales with the model instead of using a world constant', () => {
    const small = fitCamera({
      bounds: SMALL,
      preset: 'isometric',
      aspect: 1.5,
    });
    const large = fitCamera({
      bounds: LARGE,
      preset: 'isometric',
      aspect: 1.5,
    });
    expect(large.distanceMm).toBeGreaterThan(small.distanceMm * 2);
    expect(large.orthographicHalfHeightMm).toBeGreaterThan(
      small.orthographicHalfHeightMm,
    );
  });

  it('frames by the projected extent, not by the bounding sphere', () => {
    // A long, low roof must not be framed as if it were a cube.
    const front = fitCamera({ bounds: LARGE, preset: 'front', aspect: 1.6 });
    const sphereDistance = LARGE.radiusMm / Math.sin((38 * Math.PI) / 180 / 2);
    expect(front.distanceMm).toBeLessThan(sphereDistance * 0.7);
    // Seen from the gable end the roof is 18 m wide and 7 m tall, so the
    // orthographic frustum follows those extents rather than the 41 m length.
    expect(front.orthographicHalfHeightMm).toBeLessThan(LARGE.radiusMm / 2);
  });

  it('keeps every corner of the model inside the frame in both projections', () => {
    const corners = (bounds: SceneBounds) => {
      const points: { x: number; y: number; z: number }[] = [];
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z])
            points.push({ x, y, z });
      return points;
    };
    for (const preset of SCENE_VIEW_PRESETS)
      for (const aspect of [0.6, 1, 2.4])
        for (const bounds of [SMALL, LARGE]) {
          const pose = fitCamera({ bounds, preset, aspect });
          const forward = {
            x: (pose.target.x - pose.position.x) / pose.distanceMm,
            y: (pose.target.y - pose.position.y) / pose.distanceMm,
            z: (pose.target.z - pose.position.z) / pose.distanceMm,
          };
          const cross = (a: typeof forward, b: typeof forward) => ({
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x,
          });
          const dot = (a: typeof forward, b: typeof forward) =>
            a.x * b.x + a.y * b.y + a.z * b.z;
          const length = (v: typeof forward) => Math.hypot(v.x, v.y, v.z);
          const unit = (v: typeof forward) => ({
            x: v.x / length(v),
            y: v.y / length(v),
            z: v.z / length(v),
          });
          const right = unit(cross(forward, pose.up));
          const up = unit(cross(right, forward));
          const tanVertical = Math.tan((38 * Math.PI) / 180 / 2);
          for (const corner of corners(bounds)) {
            const offset = {
              x: corner.x - pose.position.x,
              y: corner.y - pose.position.y,
              z: corner.z - pose.position.z,
            };
            const depth = dot(offset, forward);
            expect(depth).toBeGreaterThan(0);
            expect(Math.abs(dot(offset, up))).toBeLessThanOrEqual(
              depth * tanVertical + 1e-6,
            );
            expect(Math.abs(dot(offset, right))).toBeLessThanOrEqual(
              depth * tanVertical * aspect + 1e-6,
            );
            // Orthographic uses the same extents around the target.
            const fromTarget = {
              x: corner.x - pose.target.x,
              y: corner.y - pose.target.y,
              z: corner.z - pose.target.z,
            };
            expect(Math.abs(dot(fromTarget, up))).toBeLessThanOrEqual(
              pose.orthographicHalfHeightMm + 1e-6,
            );
            expect(Math.abs(dot(fromTarget, right))).toBeLessThanOrEqual(
              pose.orthographicHalfHeightMm * aspect + 1e-6,
            );
            expect(depth).toBeLessThan(pose.farMm);
          }
        }
  });

  it('produces finite, ordered clipping planes and orbit limits', () => {
    for (const preset of SCENE_VIEW_PRESETS) {
      const pose = fitCamera({ bounds: LARGE, preset, aspect: 1.6 });
      for (const value of [
        pose.position.x,
        pose.position.y,
        pose.position.z,
        pose.distanceMm,
        pose.nearMm,
        pose.farMm,
        pose.minDistanceMm,
        pose.maxDistanceMm,
      ])
        expect(Number.isFinite(value)).toBe(true);
      expect(pose.nearMm).toBeGreaterThan(0);
      expect(pose.farMm).toBeGreaterThan(pose.distanceMm);
      expect(pose.minDistanceMm).toBeGreaterThan(0);
      expect(pose.maxDistanceMm).toBeGreaterThan(pose.distanceMm);
    }
  });

  it('keeps each preset looking from its documented direction', () => {
    const direction = (preset: SceneViewPreset) => {
      const pose = fitCamera({ bounds: SMALL, preset, aspect: 1 });
      return {
        x: (pose.position.x - pose.target.x) / pose.distanceMm,
        y: (pose.position.y - pose.target.y) / pose.distanceMm,
        z: (pose.position.z - pose.target.z) / pose.distanceMm,
      };
    };
    expect(direction('top').z).toBeCloseTo(1, 9);
    expect(direction('front').y).toBeCloseTo(-1, 9);
    expect(direction('side').x).toBeCloseTo(1, 9);
    const iso = direction('isometric');
    expect(iso.z).toBeGreaterThan(0);
    expect(Math.abs(iso.x)).toBeGreaterThan(0.1);
    expect(Math.abs(iso.y)).toBeGreaterThan(0.1);
    // A top view needs a horizontal up vector or the camera is degenerate.
    expect(fitCamera({ bounds: SMALL, preset: 'top', aspect: 1 }).up).toEqual({
      x: 0,
      y: 1,
      z: 0,
    });
  });

  it('never divides by an empty or invalid bound', () => {
    const broken = {
      ...EMPTY_SCENE_BOUNDS,
      radiusMm: Number.NaN,
    } as unknown as SceneBounds;
    for (const bounds of [EMPTY_SCENE_BOUNDS, broken])
      for (const aspect of [Number.NaN, 0, -3, 1])
        expect(
          Number.isFinite(
            fitCamera({ bounds, preset: 'isometric', aspect }).distanceMm,
          ),
        ).toBe(true);
  });
});

describe('boundsOfPoints', () => {
  it('ignores non-finite points and falls back when nothing is left', () => {
    expect(boundsOfPoints([{ x: Number.NaN, y: 0, z: 0 }])).toEqual(
      EMPTY_SCENE_BOUNDS,
    );
    expect(boundsOfPoints([])).toEqual(EMPTY_SCENE_BOUNDS);
    expect(
      boundsOfPoints([
        { x: Number.NaN, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 100, y: 200, z: 300 },
      ]).max,
    ).toEqual({ x: 100, y: 200, z: 300 });
  });
});
