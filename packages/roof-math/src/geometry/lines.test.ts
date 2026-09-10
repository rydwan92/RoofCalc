import { describe, expect, it } from 'vitest';
import {
  intersectLines,
  normalVector,
  offsetLine,
  projectToLine,
  unitVector,
} from './lines';
describe('line geometry', () => {
  it('intersects arbitrarily scaled directions', () => {
    expect(
      intersectLines(
        { origin: { x: 0, y: 0 }, direction: { x: 20, y: 20 } },
        { origin: { x: 4, y: 0 }, direction: { x: 0, y: 0.2 } },
      ),
    ).toEqual({ x: 4, y: 4 });
  });
  it('offsets along a unit normal and projects perpendicular to a line', () => {
    const line = { origin: { x: 0, y: 0 }, direction: { x: 3, y: 4 } };
    expect(unitVector(line.direction)).toEqual({ x: 0.6, y: 0.8 });
    expect(normalVector(line.direction)).toEqual({ x: -0.8, y: 0.6 });
    expect(offsetLine(line, 10).origin).toEqual({ x: -8, y: 6 });
    const point = projectToLine({ x: -8, y: 6 }, line);
    expect(point.x).toBeCloseTo(0);
    expect(point.y).toBeCloseTo(0);
  });
  it('rejects parallel or undefined directions', () => {
    expect(() => unitVector({ x: 0, y: 0 })).toThrow();
    expect(() =>
      intersectLines(
        { origin: { x: 0, y: 0 }, direction: { x: 1, y: 1 } },
        { origin: { x: 0, y: 1 }, direction: { x: 2, y: 2 } },
      ),
    ).toThrow('parallel_lines');
  });
});
