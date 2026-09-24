import { describe, expect, it } from 'vitest';
import { orderByPitchFit, pitchFit } from './pitch-fit';

describe('covering pitch fit', () => {
  it('compares the published minimum pitch with the roof pitch', () => {
    expect(pitchFit(12, 35)).toBe('fits');
    expect(pitchFit(35, 35)).toBe('fits');
    expect(pitchFit(35, 34.96)).toBe('fits');
    expect(pitchFit(40, 35)).toBe('too-flat');
    expect(pitchFit(undefined, 35)).toBe('unknown');
    expect(pitchFit(12, undefined)).toBe('unknown');
  });

  it('lists suitable products first without reordering within a group', () => {
    const items = [
      { id: 'steep', min: 45 },
      { id: 'a', min: 10 },
      { id: 'none', min: undefined },
      { id: 'b', min: 22 },
    ];
    expect(
      orderByPitchFit(items, (item) => item.min, 30).map((item) => item.id),
    ).toEqual(['a', 'b', 'none', 'steep']);
    expect(orderByPitchFit(items, (item) => item.min, undefined)).toEqual(
      items,
    );
  });
});
