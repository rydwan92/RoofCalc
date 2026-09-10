import { expect, it } from 'vitest';
import {
  boundsFromPoints,
  clipPolygon,
  fitDrawing,
  layoutDimension,
  createTimberPrismFaces,
  projectAxonometric,
  projectTimberPrismFaces,
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

it('projects roof world axes into a stable axonometric plane', () => {
  expect(projectAxonometric({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0 });
  expect(projectAxonometric({ x: 1000, y: 0, z: 0 }).x).toBeGreaterThan(0);
  expect(projectAxonometric({ x: 0, y: 1000, z: 0 }).x).toBeLessThan(0);
  expect(projectAxonometric({ x: 0, y: 0, z: 1000 }).y).toBe(1000);
  expect(() => projectAxonometric({ x: NaN, y: 0, z: 0 })).toThrow(
    'invalid_projection',
  );
});

it('derives deterministic projected solid faces from a timber axis and section', () => {
  const faces = createTimberPrismFaces(
    {
      from: { x: -2000, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 1400 },
    },
    { widthMm: 80, depthMm: 200 },
    'along-roof',
  );
  expect(faces.map((face) => face.id)).toEqual([
    'bottom',
    'side-a',
    'side-b',
    'top',
    'start',
    'end',
  ]);
  expect(
    faces
      .flatMap((face) => face.points)
      .every((point) => Number.isFinite(point.x)),
  ).toBe(true);
  const projected = projectTimberPrismFaces(faces);
  expect(projected).toHaveLength(6);
  expect(projected.map((face) => face.id)).toEqual(
    projectTimberPrismFaces(faces).map((face) => face.id),
  );
  expect(
    boundsFromPoints(projected.flatMap((face) => face.projected)),
  ).toMatchObject({
    minX: expect.any(Number),
    maxY: expect.any(Number),
  });
  expect(() =>
    createTimberPrismFaces(
      { from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } },
      { widthMm: 80, depthMm: 200 },
      'along-roof',
    ),
  ).toThrow('invalid_prism_axis');
});

it('keeps a real rectangular section around a diagonal hip axis', () => {
  const start = createTimberPrismFaces(
    {
      from: { x: -4000, y: 0, z: 0 },
      to: { x: 0, y: 4000, z: 2800 },
    },
    { widthMm: 100, depthMm: 240 },
    'along-roof',
  ).find((face) => face.id === 'start')!;
  const distance = (
    a: (typeof start.points)[number],
    b: (typeof start.points)[number],
  ) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  expect(distance(start.points[0], start.points[1])).toBeCloseTo(240, 10);
  expect(distance(start.points[1], start.points[2])).toBeCloseTo(100, 10);
});
