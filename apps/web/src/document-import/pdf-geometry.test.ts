import { describe, expect, it } from 'vitest';
import { DRAW_OPS, segmentsFromOperatorList } from './pdf-geometry';
import type { Matrix } from './pdf-text';

const CODES = { save: 10, restore: 11, transform: 12, constructPath: 91 };
/** pdf.js viewport at scale 1 for an 842 × 595 pt page: y flipped. */
const VIEWPORT: Matrix = [1, 0, 0, -1, 0, 595];

const path = (...data: number[]) => [20, [Float32Array.from(data)], null];

describe('pdf.js operator list → page segments', () => {
  it('reads lines and closes a sub-path into page space (y down)', () => {
    const segments = segmentsFromOperatorList(
      1,
      {
        fnArray: [91],
        argsArray: [
          path(
            DRAW_OPS.moveTo,
            60,
            150,
            DRAW_OPS.lineTo,
            160,
            150,
            DRAW_OPS.lineTo,
            160,
            250,
            DRAW_OPS.closePath,
          ),
        ],
      },
      CODES,
      VIEWPORT,
    );
    expect(segments).toEqual([
      { page: 1, from: { x: 60, y: 445 }, to: { x: 160, y: 445 } },
      { page: 1, from: { x: 160, y: 445 }, to: { x: 160, y: 345 } },
      { page: 1, from: { x: 160, y: 345 }, to: { x: 60, y: 445 } },
    ]);
  });

  it('applies cm transforms and restores them', () => {
    const segments = segmentsFromOperatorList(
      2,
      {
        fnArray: [10, 12, 91, 11, 91],
        argsArray: [
          null,
          [2, 0, 0, 2, 10, 0],
          path(DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 50, 0),
          null,
          path(DRAW_OPS.moveTo, 0, 0, DRAW_OPS.lineTo, 50, 0),
        ],
      },
      CODES,
      VIEWPORT,
    );
    expect(segments.map((item) => [item.from, item.to])).toEqual([
      [
        { x: 10, y: 595 },
        { x: 110, y: 595 },
      ],
      [
        { x: 0, y: 595 },
        { x: 50, y: 595 },
      ],
    ]);
  });

  it('skips curves without losing the current point', () => {
    const segments = segmentsFromOperatorList(
      1,
      {
        fnArray: [91],
        argsArray: [
          path(
            DRAW_OPS.moveTo,
            0,
            0,
            DRAW_OPS.curveTo,
            10,
            10,
            20,
            10,
            30,
            0,
            DRAW_OPS.lineTo,
            60,
            0,
          ),
        ],
      },
      CODES,
      [1, 0, 0, 1, 0, 0],
    );
    expect(segments).toEqual([
      { page: 1, from: { x: 30, y: 0 }, to: { x: 60, y: 0 } },
    ]);
  });

  it('respects the per-page segment limit', () => {
    const data: number[] = [DRAW_OPS.moveTo, 0, 0];
    for (let i = 1; i <= 10; i += 1) data.push(DRAW_OPS.lineTo, i, 0);
    expect(
      segmentsFromOperatorList(
        1,
        { fnArray: [91], argsArray: [path(...data)] },
        CODES,
        [1, 0, 0, 1, 0, 0],
        4,
      ),
    ).toHaveLength(4);
  });
});
