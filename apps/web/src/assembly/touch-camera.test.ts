import { expect, it } from 'vitest';
import { pinchViewport, touchDragActivated } from './touch-camera';

const size = { width: 400, height: 500 };
const start = {
  first: { x: 100, y: 200 },
  second: { x: 300, y: 200 },
  viewport: { zoom: 1, panX: 0, panY: 0 },
};

it('zooms around the stationary touch midpoint', () => {
  expect(
    pinchViewport(start, { x: 50, y: 200 }, { x: 350, y: 200 }, size),
  ).toEqual({ zoom: 1.5, panX: 0, panY: 25 });
});

it('pans with two fingers without changing zoom', () => {
  expect(
    pinchViewport(start, { x: 130, y: 220 }, { x: 330, y: 220 }, size),
  ).toEqual({ zoom: 1, panX: 30, panY: 20 });
});

it('clamps degenerate and extreme gestures to finite camera values', () => {
  const zero = pinchViewport(
    { ...start, second: start.first },
    { x: 100, y: 200 },
    { x: 100, y: 200 },
    size,
  );
  const extreme = pinchViewport(
    start,
    { x: -10000, y: 0 },
    { x: 10000, y: 0 },
    size,
  );
  expect(Object.values(zero).every(Number.isFinite)).toBe(true);
  expect(Object.values(extreme).every(Number.isFinite)).toBe(true);
  expect(extreme.zoom).toBeLessThanOrEqual(3);
});

it('keeps a small touch movement as a tap and activates an edit past six pixels', () => {
  expect(touchDragActivated({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
  expect(touchDragActivated({ x: 0, y: 0 }, { x: 0, y: 6 })).toBe(false);
  expect(touchDragActivated({ x: 0, y: 0 }, { x: 7, y: 0 })).toBe(true);
});
