import { expect, it } from 'vitest';
import {
  createSpacingDimensionPresentation,
  visiblePriorityLabelIds,
} from './dimension-presentation';

const stations = (values: number[]) =>
  values.map((alongBuildingMm, index) => ({
    id: `station:${index}`,
    alongBuildingMm,
  }));

it('groups equal working bays into one exact representative dimension', () => {
  expect(
    createSpacingDimensionPresentation(
      stations(Array.from({ length: 20 }, (_, index) => index * 774.7)),
      'working',
    ),
  ).toMatchObject([
    {
      count: 19,
      spacingMm: 774.7,
      fromStationIndex: 0,
      toStationIndex: 19,
      representative: true,
    },
  ]);
});

it('keeps a different end bay and exposes individual bays only in full mode', () => {
  const input = stations([0, 800, 1600, 2400, 2720]);
  expect(createSpacingDimensionPresentation(input, 'minimal')).toEqual([]);
  expect(createSpacingDimensionPresentation(input, 'working')).toMatchObject([
    { count: 3, spacingMm: 800, fromStationIndex: 0, toStationIndex: 3 },
    { count: 1, spacingMm: 320, fromStationIndex: 3, toStationIndex: 4 },
  ]);
  expect(createSpacingDimensionPresentation(input, 'full')).toHaveLength(4);
});

it('retains protected labels and suppresses lower-priority overlaps', () => {
  const visible = visiblePriorityLabelIds([
    {
      id: 'family',
      priority: 1,
      bounds: { x: 0, y: 0, width: 50, height: 20 },
    },
    {
      id: 'dimension',
      priority: 3,
      bounds: { x: 10, y: 0, width: 50, height: 20 },
    },
    {
      id: 'warning',
      priority: 5,
      protected: true,
      bounds: { x: 20, y: 0, width: 50, height: 20 },
    },
  ]);
  expect([...visible]).toEqual(['warning']);
});
