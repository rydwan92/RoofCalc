import {
  DOCUMENT_IMPORT_LIMITS,
  type PageSegment,
} from '@cieslacalc/document-import-core';
import { multiplyMatrix, type Matrix } from './pdf-text';

/**
 * Pure conversion of a pdf.js operator list into straight line segments in
 * page space (top-left origin, points). Curves are skipped (an outline is
 * straight), transforms are tracked through save/restore/cm. Operator codes
 * are passed in so this module never imports pdf.js and stays unit tested.
 */

export interface OperatorCodes {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
}

/** pdf.js `DrawOPS` path codes inside a constructPath operator. */
export const DRAW_OPS = {
  moveTo: 0,
  lineTo: 1,
  curveTo: 2,
  quadraticCurveTo: 3,
  closePath: 4,
} as const;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function apply(matrix: Matrix, x: number, y: number) {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  };
}

function numbers(value: unknown): ArrayLike<number> | undefined {
  if (value instanceof Float32Array || value instanceof Float64Array)
    return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'number'))
    return value as number[];
  return undefined;
}

export function segmentsFromOperatorList(
  page: number,
  list: { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> },
  codes: OperatorCodes,
  viewportTransform: Matrix,
  limit: number = DOCUMENT_IMPORT_LIMITS.maxSegmentsPerPage,
): PageSegment[] {
  const segments: PageSegment[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;
  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index];
    if (fn === codes.save) stack.push(ctm);
    else if (fn === codes.restore) ctm = stack.pop() ?? IDENTITY;
    else if (fn === codes.transform && Array.isArray(args) && args.length >= 6)
      ctm = multiplyMatrix(ctm, args.slice(0, 6) as unknown as Matrix);
    else if (fn === codes.constructPath && Array.isArray(args)) {
      const data = Array.isArray(args[1]) ? numbers(args[1][0]) : undefined;
      if (!data) continue;
      const toPage = multiplyMatrix(viewportTransform, ctm);
      let current: { x: number; y: number } | undefined;
      let start: { x: number; y: number } | undefined;
      const push = (
        a: { x: number; y: number },
        b: { x: number; y: number },
      ) => {
        if (segments.length < limit && (a.x !== b.x || a.y !== b.y))
          segments.push({ page, from: a, to: b });
      };
      for (let i = 0; i < data.length;) {
        const op = data[i++];
        if (op === DRAW_OPS.moveTo) {
          current = apply(toPage, data[i]!, data[i + 1]!);
          start = current;
          i += 2;
        } else if (op === DRAW_OPS.lineTo) {
          const next = apply(toPage, data[i]!, data[i + 1]!);
          if (current) push(current, next);
          current = next;
          i += 2;
        } else if (op === DRAW_OPS.curveTo) {
          current = apply(toPage, data[i + 4]!, data[i + 5]!);
          i += 6;
        } else if (op === DRAW_OPS.quadraticCurveTo) {
          current = apply(toPage, data[i + 2]!, data[i + 3]!);
          i += 4;
        } else if (op === DRAW_OPS.closePath) {
          if (current && start) push(current, start);
          current = start;
        } else break; // Unknown code: stop rather than misread the path.
      }
    }
    if (segments.length >= limit) break;
  }
  return segments;
}
