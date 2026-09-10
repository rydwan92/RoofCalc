import { expect, it } from 'vitest';
import {
  datumDisplayLabel,
  layoutDimensionLanes,
  type DrawingDimension,
} from './index';
it('assigns separate lanes to overlapping label footprints and reuses disjoint lanes', () => {
  const d = (id: string, x: number): DrawingDimension => ({
    id,
    from: { x, y: 0 },
    to: { x: x + 20, y: 0 },
    valueMm: 20,
    kind: 'aligned',
    group: 'support',
    priority: 40,
  });
  const layouts = layoutDimensionLanes(
    [d('first', 0), d('second', 25), d('third', 400)],
    (p) => p,
    () => 100,
  );
  expect(layouts[0]!.lane).not.toEqual(layouts[1]!.lane);
  expect(layouts[0]!.lane).toEqual(layouts[2]!.lane);
  expect(layouts[1]!.layout.label.y).not.toBe(layouts[0]!.layout.label.y);
});
it('uses priority and generates labels independently of semantic IDs beyond Z', () => {
  expect([0, 1, 25, 26, 27, 701].map(datumDisplayLabel)).toEqual([
    'A',
    'B',
    'Z',
    'AA',
    'AB',
    'ZZ',
  ]);
  const primary: DrawingDimension = {
    id: 'total',
    from: { x: 0, y: 0 },
    to: { x: 1000, y: 0 },
    valueMm: 1000,
    kind: 'aligned',
    group: 'primary',
    priority: 100,
  };
  const joint = {
    ...primary,
    id: 'notch',
    group: 'joint' as const,
    priority: 30,
  };
  expect(
    layoutDimensionLanes(
      [joint, primary],
      (p) => p,
      () => 60,
    ).map((d) => d.dimension.id),
  ).toEqual(['total', 'notch']);
});
