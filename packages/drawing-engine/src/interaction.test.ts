import { describe, expect, it } from 'vitest';
import { fitDrawing, screenToWorld, snapPosition } from './index';
describe('canonical drag coordinates', () => {
  it.each([0.5, 1, 2.5])(
    'round-trips screen/world coordinates at scale %s including offsets and rotated matrices',
    (scale) => {
      const fit = fitDrawing(
        { minX: -500, maxX: 4000, minY: -400, maxY: 3000 },
        { width: 800, height: 600, padding: 80 },
      );
      const matrix = { a: scale, b: 0.2, c: -0.1, d: scale, e: 240, f: -130 };
      const point = { x: 2100.123, y: 1400 },
        svg = fit.project(point);
      const screen = {
        x: matrix.a * svg.x + matrix.c * svg.y + matrix.e,
        y: matrix.b * svg.x + matrix.d * svg.y + matrix.f,
      };
      const recovered = screenToWorld(screen, matrix, fit.unproject);
      expect(recovered.x).toBeCloseTo(point.x, 9);
      expect(recovered.y).toBeCloseTo(point.y, 9);
    },
  );
  it('snaps to a zoom-dependent grid and prefers close references inside the legal interval', () => {
    const range = { min: 141, max: 3839 };
    expect(snapPosition(1234.1, range, 1).valueMm).toBe(1234);
    expect(snapPosition(1234.1, range, 4).valueMm).toBe(1235);
    expect(snapPosition(1234.1, range, 12).valueMm).toBe(1230);
    expect(snapPosition(1999, range, 4, [2000]).valueMm).toBe(2000);
    expect(snapPosition(-100, range, 4).valueMm).toBe(141);
    expect(snapPosition(10000, range, 4).valueMm).toBe(3839);
  });
  it('rejects invalid ranges and singular screen transforms', () => {
    expect(() => snapPosition(0, { min: 100, max: 0 }, 1)).toThrow();
    expect(() =>
      screenToWorld(
        { x: 0, y: 0 },
        { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 },
        (p) => p,
      ),
    ).toThrow();
  });
});
