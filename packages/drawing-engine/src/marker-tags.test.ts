import { describe, expect, it } from 'vitest';
import { layoutMarkerTags, type MarkerTag } from './marker-tags';

const tagsAt = (...xs: number[]) =>
  layoutMarkerTags(xs.map((x, i) => ({ id: `d${i}`, at: { x, y: 100 } })));
const xs = (tags: readonly MarkerTag[]) => tags.map((tag) => tag.tag.x);

function overlaps(tags: readonly MarkerTag[], size = 20) {
  for (const [i, a] of tags.entries())
    for (const b of tags.slice(i + 1))
      if (
        Math.abs(a.tag.x - b.tag.x) < size &&
        Math.abs(a.tag.y - b.tag.y) < size
      )
        return [a.id, b.id];
  return undefined;
}

describe('datum tags (VNext-7C)', () => {
  it('hangs a free tag straight below its datum', () => {
    expect(tagsAt(10, 200)).toEqual([
      { id: 'd0', anchor: { x: 10, y: 100 }, tag: { x: 10, y: 122 } },
      { id: 'd1', anchor: { x: 200, y: 100 }, tag: { x: 200, y: 122 } },
    ]);
  });

  it('spreads a cluster one tag apart, centred over its datums', () => {
    // Pushed to 100, 124, 148; the mean push (21) is taken back.
    expect(xs(tagsAt(100, 103, 106))).toEqual([79, 103, 127]);
  });

  it('never re-centres a cluster into the tag on its left', () => {
    // 30, 54, 78 would centre to 7, 31, 55 — but 0 is in the way.
    expect(xs(tagsAt(0, 30, 31, 32))).toEqual([0, 24, 48, 72]);
  });

  it('leaves tags in different rows where they are', () => {
    const tags = layoutMarkerTags([
      { id: 'low', at: { x: 50, y: 300 } },
      { id: 'high', at: { x: 52, y: 100 } },
    ]);
    expect(tags.map((tag) => tag.tag)).toEqual([
      { x: 50, y: 322 },
      { x: 52, y: 122 },
    ]);
  });

  it('keeps every tag clear of every other one', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 200; run += 1) {
      const markers = Array.from({ length: 2 + (run % 7) }, (_, i) => ({
        id: `m${i}`,
        at: { x: random() * 120, y: random() * 60 },
      }));
      expect(overlaps(layoutMarkerTags(markers))).toBeUndefined();
    }
  });
});
