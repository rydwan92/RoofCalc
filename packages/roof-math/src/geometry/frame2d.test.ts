import { expect, it } from 'vitest';
import { memberToWorld, worldToMember } from './frame2d';

it.each([1, 30, 80])('round-trips local/world geometry at %s°', (angleDeg) => {
  const frame = { origin: { x: -500, y: -300 }, angleDeg };
  const point = { x: 5134.6521, y: 200 };
  const actual = worldToMember(memberToWorld(point, frame), frame);
  expect(actual.x).toBeCloseTo(point.x, 10);
  expect(actual.y).toBeCloseTo(point.y, 10);
});
it('uses a normal depth, not a vertical section thickness', () => {
  const frame = { origin: { x: 0, y: 0 }, angleDeg: 30 };
  const top = memberToWorld({ x: 0, y: 200 }, frame);
  expect(top.x).toBeCloseTo(-100, 10);
  expect(top.y).toBeCloseTo(173.205080756888, 10);
});
