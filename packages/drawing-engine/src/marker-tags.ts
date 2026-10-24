import type { Point } from './index';

export interface MarkerTagInput {
  id: string;
  /** Projected (screen) position of the datum. */
  at: Point;
}

export interface MarkerTag {
  id: string;
  /** The datum itself: a dot and the start of the leader. */
  anchor: Point;
  /** Centre of the tag that carries the label. */
  tag: Point;
}

export interface MarkerTagOptions {
  /** Square tag size in screen units. */
  size?: number;
  /** Clear space between two tags. */
  gap?: number;
  /** How far below its datum a tag hangs. */
  drop?: number;
}

/**
 * VNext-7C: datum tags that never cover each other. Each tag hangs `drop`
 * below its datum; tags whose rows overlap are pushed apart along x, and
 * every cluster of pushed tags is re-centred over its own datums, so a tag
 * stays as close to its point as the neighbours allow. Pure presentation:
 * the datums (and their order) come from the drawing model unchanged.
 */
export function layoutMarkerTags(
  markers: readonly MarkerTagInput[],
  { size = 20, gap = 4, drop = 22 }: MarkerTagOptions = {},
): MarkerTag[] {
  const step = size + gap;
  // A tag pushed to exactly one step may measure a hair under it in
  // floating point; without the tolerance it would be pushed forever.
  const EPSILON = 1e-6;
  const sameRow = (a: Point, b: Point) => Math.abs(a.y - b.y) < step;
  const sorted = [...markers].sort(
    (a, b) => a.at.x - b.at.x || a.at.y - b.at.y,
  );
  const tags: MarkerTag[] = [];
  for (const marker of sorted) {
    const tag = { x: marker.at.x, y: marker.at.y + drop };
    // Tags are placed left to right, so pushing right past each blocking
    // tag (repeated until free) never creates a new overlap behind it.
    let moved = true;
    while (moved) {
      moved = false;
      for (const placed of tags)
        if (
          sameRow(placed.tag, tag) &&
          Math.abs(placed.tag.x - tag.x) < step - EPSILON
        ) {
          tag.x = placed.tag.x + step;
          moved = true;
        }
    }
    tags.push({ id: marker.id, anchor: { ...marker.at }, tag });
  }

  // Re-centre each chain of touching tags over its datums, without moving
  // it into a tag on its left in the same row.
  let start = 0;
  while (start < tags.length) {
    let end = start;
    while (
      end + 1 < tags.length &&
      sameRow(tags[end]!.tag, tags[end + 1]!.tag) &&
      tags[end + 1]!.tag.x - tags[end]!.tag.x <= step + EPSILON
    )
      end += 1;
    const chain = new Set(tags.slice(start, end + 1));
    let shift = 0;
    for (const item of chain)
      shift += (item.tag.x - item.anchor.x) / chain.size;
    // Rows are not transitive when tags sit at many heights: every member
    // is checked against every other tag on its left.
    for (const item of chain)
      for (const other of tags)
        if (
          !chain.has(other) &&
          sameRow(other.tag, item.tag) &&
          other.tag.x <= item.tag.x
        )
          shift = Math.min(shift, item.tag.x - (other.tag.x + step));
    if (shift > 0) for (const item of chain) item.tag.x -= shift;
    start = end + 1;
  }
  return tags;
}
