import { expect, it } from 'vitest';
import { measureDistance3d } from './measurement';

it('measures exact canonical 3D distance without screen coordinates', () => {
  const result = measureDistance3d(
    { id: 'A', label: 'A', point: { x: 0, y: 0, z: 0 } },
    { id: 'B', label: 'B', point: { x: 300, y: 400, z: 1200 } },
  );
  expect(result.distanceMm).toBe(1300);
  expect(result).not.toHaveProperty('pixelDistance');
});

it('rejects non-finite geometry and allows a finite zero measurement', () => {
  const point = { id: 'A', label: 'A', point: { x: 1, y: 2, z: 3 } };
  expect(measureDistance3d(point, point).distanceMm).toBe(0);
  expect(() =>
    measureDistance3d(point, {
      id: 'bad',
      label: 'bad',
      point: { x: Number.NaN, y: 0, z: 0 },
    }),
  ).toThrow('invalid_measurement_point');
});
