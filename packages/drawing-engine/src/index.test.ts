import { expect, it } from 'vitest';
import {
  boundsFromPoints,
  clipPolygon,
  fitDrawing,
  layoutDimension,
} from './index';

it.each([2500, 13000])('fits %s mm without changing proportions', (length) => {
  const { project } = fitDrawing(
    { minX: -500, maxX: length, minY: -500, maxY: length },
    { width: 800, height: 480, padding: 80 },
  );
  const a = project({ x: -500, y: -500 });
  const b = project({ x: length, y: length });
  expect(b.x - a.x).toBeCloseTo(a.y - b.y, 10);
  expect(a.x).toBeGreaterThanOrEqual(80);
  expect(b.y).toBeGreaterThanOrEqual(80);
});
it('rejects empty or impossible viewports', () => {
  expect(() =>
    fitDrawing(
      { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      { width: 800, height: 400, padding: 50 },
    ),
  ).toThrow();
});

it('clips a polygon to a detail viewport without distorting the polygon', () => {
  const clipped = clipPolygon(
    [
      { x: -10, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 20 },
      { x: -10, y: 20 },
    ],
    { minX: 0, maxX: 10, minY: 0, maxY: 10 },
  );
  expect(clipped.length).toBe(4);
  expect(boundsFromPoints(clipped)).toEqual({
    minX: 0,
    maxX: 10,
    minY: 0,
    maxY: 10,
  });
});
it('places collapsed manufacturing dimensions without dividing by zero', () => {
  const dimension = layoutDimension(
    {
      id: 'A-B',
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 },
      kind: 'aligned',
      valueMm: 0,
    },
    (p) => p,
  );
  expect(Object.values(dimension.label).every(Number.isFinite)).toBe(true);
  expect(dimension.rotationDeg).toBe(0);
});
