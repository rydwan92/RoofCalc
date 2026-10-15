import {
  DOCUMENT_IMPORT_LIMITS,
  type TextLayerItem,
} from '@cieslacalc/document-import-core';

/**
 * Pure conversion of pdf.js text content into the positioned text the
 * document-import core reads. Kept free of the pdf.js import so it is unit
 * tested in Node and the parser stays a lazily loaded browser chunk.
 */

export type Matrix = readonly [number, number, number, number, number, number];

/** pdf.js `TextItem` fields this adapter relies on. */
export interface PdfTextItemLike {
  str: string;
  transform: readonly number[];
  width: number;
}

/** Same composition as pdf.js `Util.transform(m1, m2)`. */
export function multiplyMatrix(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function asMatrix(values: readonly number[]): Matrix | undefined {
  if (values.length < 6 || values.some((value) => !Number.isFinite(value)))
    return undefined;
  return [
    values[0]!,
    values[1]!,
    values[2]!,
    values[3]!,
    values[4]!,
    values[5]!,
  ];
}

/**
 * Text items in viewport space (origin top-left, y down). The box covers the
 * glyph run from its baseline to one font height above it, for any
 * rotation; the rotation is kept so vertical dimension text stays separate.
 */
export function textItemsFromPdf(
  items: readonly unknown[],
  viewportTransform: Matrix,
): TextLayerItem[] {
  const viewportScale = Math.hypot(viewportTransform[0], viewportTransform[1]);
  const result: TextLayerItem[] = [];
  for (const item of items.slice(
    0,
    DOCUMENT_IMPORT_LIMITS.maxTextItemsPerPage,
  )) {
    if (
      !item ||
      typeof item !== 'object' ||
      !('str' in item) ||
      typeof item.str !== 'string' ||
      !item.str.trim() ||
      !('transform' in item) ||
      !Array.isArray(item.transform)
    )
      continue;
    const own = asMatrix(item.transform as number[]);
    if (!own) continue;
    const tx = multiplyMatrix(viewportTransform, own);
    const run = Math.hypot(tx[0], tx[1]);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (!(run > 0) || !(fontHeight > 0)) continue;
    const width =
      'width' in item && typeof item.width === 'number' && item.width > 0
        ? item.width * viewportScale
        : item.str.length * fontHeight * 0.5;
    const direction = { x: tx[0] / run, y: tx[1] / run };
    const origin = { x: tx[4], y: tx[5] };
    const end = {
      x: origin.x + direction.x * width,
      y: origin.y + direction.y * width,
    };
    const corners = [origin, end].flatMap((point) => [
      point,
      { x: point.x + tx[2], y: point.y + tx[3] },
    ]);
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const rotationDeg = (Math.atan2(tx[1], tx[0]) * 180) / Math.PI;
    result.push({
      text: item.str,
      box: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
      ...(Math.abs(rotationDeg) > 0.5 ? { rotationDeg } : {}),
    });
  }
  return result;
}
