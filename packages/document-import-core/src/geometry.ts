import { PDF_POINT_MM } from './calibration';
import { engineRef, VECTOR_GEOMETRY_ENGINE } from './engines';
import type {
  DraftRelation,
  DraftSegment,
  DraftWarning,
  NumericRoofField,
  PageBox,
  PageUnit,
  RecognitionResult,
  RecognizedMeasurement,
  ScaleStatement,
} from './model';

/**
 * Geometry candidate extraction from vector drawings (VNext). A PDF exported
 * from CAD contains the outline as real lines. With the drawing scale the
 * document states (1:n), a line length in page points is a real length, so
 * the drawing can independently confirm — or contradict — a written
 * dimension, and resolve the unit of a number written without one.
 *
 * Deliberately conservative: only a closed, axis-aligned rectangle is an
 * outline candidate, page frames are ignored, and a drawn length is never
 * better than `medium` confidence on its own.
 */

export interface PageSegment {
  page: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface OutlineCandidate {
  page: number;
  box: PageBox;
}

export const GEOMETRY_TOLERANCES = {
  /** Lines closer than this (page units) meet; ~0.7 mm on paper. */
  joinPt: 2,
  /** Shortest side considered a building outline (page units). */
  minSidePt: 30,
  /** A rectangle covering more of the page than this is a frame. */
  maxPageCoverage: 0.7,
  /** Written vs drawn length agreement for a cross-check (relative). */
  scaleAgreement: 0.02,
  /** Longest lines examined per page; bounds the pairwise search. */
  maxLinesPerAxis: 160,
} as const;

interface AxisLine {
  /** Fixed coordinate (y for horizontal, x for vertical). */
  at: number;
  start: number;
  end: number;
}

function axisLines(
  segments: readonly PageSegment[],
  horizontal: boolean,
): AxisLine[] {
  const tol = GEOMETRY_TOLERANCES.joinPt;
  const lines: AxisLine[] = [];
  for (const segment of segments) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const along = horizontal ? Math.abs(dx) : Math.abs(dy);
    const across = horizontal ? Math.abs(dy) : Math.abs(dx);
    if (along < GEOMETRY_TOLERANCES.minSidePt || across > tol) continue;
    const a = horizontal ? segment.from.x : segment.from.y;
    const b = horizontal ? segment.to.x : segment.to.y;
    const at = horizontal
      ? (segment.from.y + segment.to.y) / 2
      : (segment.from.x + segment.to.x) / 2;
    lines.push({ at, start: Math.min(a, b), end: Math.max(a, b) });
  }
  // Merge collinear pieces of one drawn line (polylines, split strokes).
  lines.sort((p, q) => p.at - q.at || p.start - q.start);
  const merged: AxisLine[] = [];
  for (const line of lines) {
    const last = merged.at(-1);
    if (
      last &&
      Math.abs(last.at - line.at) <= tol &&
      line.start <= last.end + tol
    )
      last.end = Math.max(last.end, line.end);
    else merged.push({ ...line });
  }
  return merged
    .sort((p, q) => q.end - q.start - (p.end - p.start))
    .slice(0, GEOMETRY_TOLERANCES.maxLinesPerAxis);
}

const near = (a: number, b: number) =>
  Math.abs(a - b) <= GEOMETRY_TOLERANCES.joinPt;

function spans(line: AxisLine, from: number, to: number) {
  const tol = GEOMETRY_TOLERANCES.joinPt;
  return line.start <= from + tol && line.end >= to - tol;
}

/**
 * Closed axis-aligned rectangles formed by drawn lines, largest first,
 * excluding page frames. Each side must be drawn along its full length.
 */
export function findOutlineCandidates(
  page: { page: number; width: number; height: number },
  segments: readonly PageSegment[],
): OutlineCandidate[] {
  const own = segments.filter((segment) => segment.page === page.page);
  const horizontal = axisLines(own, true);
  const vertical = axisLines(own, false);
  const candidates: OutlineCandidate[] = [];
  for (let i = 0; i < horizontal.length; i += 1)
    for (let j = 0; j < horizontal.length; j += 1) {
      const top = horizontal[i]!;
      const bottom = horizontal[j]!;
      if (bottom.at - top.at < GEOMETRY_TOLERANCES.minSidePt) continue;
      const left = Math.max(top.start, bottom.start);
      const right = Math.min(top.end, bottom.end);
      if (right - left < GEOMETRY_TOLERANCES.minSidePt) continue;
      // Both horizontals must end at the same corners.
      if (!near(top.start, bottom.start) || !near(top.end, bottom.end))
        continue;
      const hasLeft = vertical.some(
        (line) => near(line.at, left) && spans(line, top.at, bottom.at),
      );
      const hasRight = vertical.some(
        (line) => near(line.at, right) && spans(line, top.at, bottom.at),
      );
      if (!hasLeft || !hasRight) continue;
      const box = {
        x: left,
        y: top.at,
        width: right - left,
        height: bottom.at - top.at,
      };
      if (
        box.width * box.height >
        page.width * page.height * GEOMETRY_TOLERANCES.maxPageCoverage
      )
        continue;
      candidates.push({ page: page.page, box });
    }
  // Largest first; a rectangle inside an accepted one is a subdivision
  // (a ridge line splitting the outline, a room), not another building.
  const tol = GEOMETRY_TOLERANCES.joinPt;
  const inside = (inner: PageBox, outer: PageBox) =>
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.width <= outer.x + outer.width + tol &&
    inner.y + inner.height <= outer.y + outer.height + tol;
  const accepted: OutlineCandidate[] = [];
  for (const candidate of candidates.sort(
    (a, b) => b.box.width * b.box.height - a.box.width * a.box.height,
  ))
    if (!accepted.some((other) => inside(candidate.box, other.box)))
      accepted.push(candidate);
  return accepted;
}

export interface VectorGeometryInput {
  pages: readonly {
    page: number;
    width: number;
    height: number;
    unit: PageUnit;
    segments: readonly PageSegment[];
  }[];
  scale?: ScaleStatement;
  /** Written measurements to cross-check (usually the text-layer result). */
  written: readonly RecognizedMeasurement[];
}

function relativeDeviation(value: number, reference: number): number {
  return reference > 0 ? Math.abs(value - reference) / reference : Infinity;
}

/**
 * The vector-geometry engine: the largest outline candidate, its sides as
 * drawn lengths at the stated scale, and a cross-check against every written
 * building length/width that has an explicit unit.
 */
export function recognizeVectorGeometry(
  input: VectorGeometryInput,
): RecognitionResult {
  const engine = engineRef(VECTOR_GEOMETRY_ENGINE);
  const empty: RecognitionResult = { engine, measurements: [], warnings: [] };
  let found: { outline: OutlineCandidate; unit: PageUnit } | undefined;
  for (const page of input.pages) {
    const [outline] = findOutlineCandidates(page, page.segments);
    if (outline) {
      found = { outline, unit: page.unit };
      break;
    }
  }
  if (!found) return empty;
  const { outline } = found;
  const { x, y, width, height } = outline.box;
  const segments: DraftSegment[] = [
    ['top', [x, y], [x + width, y]],
    ['right', [x + width, y], [x + width, y + height]],
    ['bottom', [x, y + height], [x + width, y + height]],
    ['left', [x, y], [x, y + height]],
  ].map(([side, from, to]) => ({
    id: `${engine.id}:p${outline.page}:outline:${side as string}`,
    page: outline.page,
    from: { x: (from as number[])[0]!, y: (from as number[])[1]! },
    to: { x: (to as number[])[0]!, y: (to as number[])[1]! },
    role: 'outline' as const,
  }));
  const relations: DraftRelation[] = [
    { kind: 'outline', segmentIds: segments.map((segment) => segment.id) },
  ];
  // Without a stated scale on a vector page the outline is shown, but no
  // length is claimed: page points are not real millimetres.
  if (!input.scale || found.unit !== 'pt')
    return { ...empty, segments, relations };

  const mmPerUnit = PDF_POINT_MM * input.scale.denominator;
  const horizontalLonger = width >= height;
  const sides: Record<
    'buildingLength' | 'buildingWidth',
    { lengthPt: number; segment: DraftSegment }
  > = {
    buildingLength: {
      lengthPt: Math.max(width, height),
      segment: horizontalLonger ? segments[0]! : segments[3]!,
    },
    buildingWidth: {
      lengthPt: Math.min(width, height),
      segment: horizontalLonger ? segments[3]! : segments[0]!,
    },
  };
  const measurements: RecognizedMeasurement[] = [];
  const warnings: DraftWarning[] = [];
  for (const field of ['buildingLength', 'buildingWidth'] as const) {
    const { lengthPt, segment } = sides[field];
    const drawnMm = Math.round(lengthPt * mmPerUnit);
    const minX = Math.min(segment.from.x, segment.to.x);
    const minY = Math.min(segment.from.y, segment.to.y);
    const id = `${engine.id}:p${outline.page}:${field}`;
    measurements.push({
      id,
      field,
      quantity: 'length',
      raw: { text: `${drawnMm} mm`, value: drawnMm, unit: 'mm' },
      valueMm: drawnMm,
      unitBasis: 'drawing-scale',
      region: {
        page: outline.page,
        box: {
          x: minX,
          y: minY,
          width: Math.abs(segment.to.x - segment.from.x),
          height: Math.abs(segment.to.y - segment.from.y),
        },
      },
      // The longer side read as the building length is an assumption, and
      // a drawing can be out of scale: never more than medium on its own.
      confidence: 'medium',
      evidence: ['drawn-at-scale'],
      engineId: engine.id,
      mode: engine.mode,
    });
    relations.push({
      kind: 'measures',
      measurementId: id,
      segmentId: segment.id,
    });
    for (const written of input.written) {
      if (written.field !== field || written.valueMm === undefined) continue;
      const deviationRatio = relativeDeviation(written.valueMm, drawnMm);
      relations.push({
        kind: 'scale-cross-check',
        measurementId: written.id,
        segmentId: segment.id,
        documentMm: written.valueMm,
        drawnMm,
        deviationRatio,
      });
      if (deviationRatio > GEOMETRY_TOLERANCES.scaleAgreement)
        warnings.push({
          code: 'scale-mismatch',
          field: field as NumericRoofField,
          documentMm: written.valueMm,
          drawnMm,
        });
    }
  }
  return { engine, measurements, segments, relations, warnings };
}
