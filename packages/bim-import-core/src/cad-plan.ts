import { DXF_UNIT_MM, type DxfDocument, type DxfUnit, type Vec2 } from './dxf';

/**
 * VNext-4 roof plan recognition from CAD geometry (DXF model space).
 *
 * It finds rectangular outlines, prefers the one that holds roof lines,
 * reads a uniform wall-to-eave offset from two nested outlines, tells a
 * gable (ridge across the full length) from a hip (diagonals from the
 * corners) and collects pitch candidates written in the drawing's texts.
 *
 * Everything is a PROPOSAL for the existing project start: values carry
 * their source, the unit may be inferred, and the user confirms before a
 * project exists. No roof geometry is created here (ADR-012 principle).
 */

export type CadLengthUnit = 'mm' | 'cm' | 'm';

export interface CadRectangle {
  /** Corners in millimetres, counter-clockwise. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  center: Vec2;
  /** Unit vector along the long side. */
  axis: Vec2;
  longMm: number;
  shortMm: number;
  layer: string;
}

export type CadRoofType = 'gable' | 'hip';

export type CadEvidence =
  | 'nested-outlines'
  | 'ridge-full-length'
  | 'ridge-shortened'
  | 'hip-diagonals'
  | 'hip-geometry-consistent'
  | 'dimension-matches-length'
  | 'dimension-matches-width'
  | 'roof-type-text'
  | 'pitch-text'
  | 'pitch-percent-converted';

export type CadWarning =
  | 'unit-inferred'
  | 'unit-assumed'
  | 'several-outlines'
  | 'single-outline-meaning'
  | 'roof-type-not-recognized'
  | 'pitch-not-found'
  | 'ridge-across-short-side';

export interface CadPitchCandidate {
  valueDeg: number;
  text: string;
  /** A word such as "kąt", "nachylenie", "spadek", "pitch" was next to it. */
  labelled: boolean;
}

export interface CadRoofLine {
  kind: 'ridge' | 'hip';
  from: Vec2;
  to: Vec2;
}

export type CadPlanAnalysis =
  | {
      status: 'supported';
      unit: { unit: CadLengthUnit; basis: 'declared' | 'inferred' | 'user' };
      /** All plausible outlines, best first; `outlineIndex` picks one. */
      outlines: CadRectangle[];
      outlineIndex: number;
      /** The outline the proposal uses as the roof's eave edge, if known. */
      eaveOutline?: CadRectangle;
      /** The outline the proposal uses as the walls, if known. */
      wallOutline?: CadRectangle;
      roofLines: CadRoofLine[];
      proposed: {
        roofType?: CadRoofType;
        buildingLengthMm: number;
        buildingWidthMm: number;
        eaveOverhangMm?: number;
        pitchDeg?: number;
      };
      pitchCandidates: CadPitchCandidate[];
      evidence: CadEvidence[];
      warnings: CadWarning[];
      /** Every line piece in mm, for the preview. */
      preview: { segments: [Vec2, Vec2][] };
    }
  | {
      status: 'unsupported';
      reason: 'no-rectangular-outline' | 'unit-unknown';
      /** Longest outline side in drawing units (to help the unit choice). */
      longestSide?: number;
    };

/** Plausible building (or eave) long side: 4–60 m. */
const PLAUSIBLE_LONG_MM = { min: 4_000, max: 60_000 } as const;
const MAX_RECTANGLES = 200;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: Vec2) => Math.hypot(a[0], a[1]);
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];

function dedupe(points: readonly Vec2[], tolerance: number): Vec2[] {
  const out: Vec2[] = [];
  for (const point of points) {
    const previous = out[out.length - 1];
    if (!previous || len(sub(point, previous)) > tolerance) out.push(point);
  }
  if (out.length > 1 && len(sub(out[0]!, out[out.length - 1]!)) <= tolerance)
    out.pop();
  return out;
}

/** Drops vertices that lie on the line through their neighbours. */
function dropCollinear(points: Vec2[]): Vec2[] {
  let changed = true;
  let current = points;
  while (changed && current.length > 3) {
    changed = false;
    for (let index = 0; index < current.length; index += 1) {
      const a = current[(index - 1 + current.length) % current.length]!;
      const b = current[index]!;
      const c = current[(index + 1) % current.length]!;
      const ab = sub(b, a),
        bc = sub(c, b);
      const cross = Math.abs(ab[0] * bc[1] - ab[1] * bc[0]);
      if (cross <= 1e-6 * len(ab) * len(bc)) {
        current = current.filter((_, i) => i !== index);
        changed = true;
        break;
      }
    }
  }
  return current;
}

function rectangleOf(
  loop: readonly Vec2[],
  layer: string,
  tolerance: number,
): CadRectangle | undefined {
  const points = dropCollinear(dedupe(loop, tolerance));
  if (points.length !== 4) return undefined;
  const edges = points.map((point, index) =>
    sub(points[(index + 1) % 4]!, point),
  );
  for (let index = 0; index < 4; index += 1) {
    const a = edges[index]!,
      b = edges[(index + 1) % 4]!;
    if (Math.abs(dot(a, b)) > 0.01 * len(a) * len(b)) return undefined;
  }
  const lengths = edges.map(len);
  if (Math.abs(lengths[0]! - lengths[2]!) > tolerance * 4) return undefined;
  if (Math.abs(lengths[1]! - lengths[3]!) > tolerance * 4) return undefined;
  const longIndex = lengths[0]! >= lengths[1]! ? 0 : 1;
  const longEdge = edges[longIndex]!;
  const axis = scale(longEdge, 1 / len(longEdge));
  // Canonical direction so parallel outlines compare equal.
  const canonical: Vec2 =
    axis[0] < -1e-9 || (Math.abs(axis[0]) <= 1e-9 && axis[1] < 0)
      ? [-axis[0], -axis[1]]
      : axis;
  const center: Vec2 = [
    (points[0]![0] + points[1]![0] + points[2]![0] + points[3]![0]) / 4,
    (points[0]![1] + points[1]![1] + points[2]![1] + points[3]![1]) / 4,
  ];
  // Counter-clockwise order.
  const area2 = points.reduce(
    (sum, point, index) =>
      sum +
      point[0] * points[(index + 1) % 4]![1] -
      points[(index + 1) % 4]![0] * point[1],
    0,
  );
  const ordered = (area2 < 0 ? [...points].reverse() : points) as [
    Vec2,
    Vec2,
    Vec2,
    Vec2,
  ];
  return {
    corners: ordered,
    center,
    axis: canonical,
    longMm: Math.max(lengths[0]!, lengths[1]!),
    shortMm: Math.min(lengths[0]!, lengths[1]!),
    layer,
  };
}

/** Chains loose LINE pieces into closed loops (degree-2 vertices only). */
function loopsFromLines(
  segments: readonly { from: Vec2; to: Vec2; layer: string }[],
  tolerance: number,
): { points: Vec2[]; layer: string }[] {
  const key = (point: Vec2) =>
    `${Math.round(point[0] / tolerance)}:${Math.round(point[1] / tolerance)}`;
  const byVertex = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const end of [segment.from, segment.to]) {
      const k = key(end);
      byVertex.set(k, [...(byVertex.get(k) ?? []), index]);
    }
  });
  const used = new Set<number>();
  const loops: { points: Vec2[]; layer: string }[] = [];
  for (let start = 0; start < segments.length; start += 1) {
    if (used.has(start)) continue;
    const startSegment = segments[start]!;
    const points: Vec2[] = [startSegment.from];
    let current = startSegment.to;
    let currentIndex = start;
    used.add(start);
    let closed = false;
    for (let guard = 0; guard < 64; guard += 1) {
      if (key(current) === key(startSegment.from)) {
        closed = true;
        break;
      }
      points.push(current);
      const next = (byVertex.get(key(current)) ?? []).filter(
        (index) => index !== currentIndex && !used.has(index),
      );
      if (next.length !== 1) break;
      const segment = segments[next[0]!]!;
      used.add(next[0]!);
      currentIndex = next[0]!;
      current = key(segment.from) === key(current) ? segment.to : segment.from;
    }
    if (closed && points.length >= 4)
      loops.push({ points, layer: startSegment.layer });
  }
  return loops;
}

function insideRectangle(point: Vec2, rect: CadRectangle, margin: number) {
  const local = toLocal(point, rect);
  return (
    Math.abs(local[0]) <= rect.longMm / 2 + margin &&
    Math.abs(local[1]) <= rect.shortMm / 2 + margin
  );
}

/** Coordinates along the long axis (u) and across it (v), centred. */
function toLocal(point: Vec2, rect: CadRectangle): Vec2 {
  const d = sub(point, rect.center);
  const normal: Vec2 = [-rect.axis[1], rect.axis[0]];
  return [dot(d, rect.axis), dot(d, normal)];
}

function nestedOffset(outer: CadRectangle, inner: CadRectangle) {
  if (Math.abs(Math.abs(dot(outer.axis, inner.axis)) - 1) > 1e-3)
    return undefined;
  if (len(sub(outer.center, inner.center)) > 0.01 * outer.shortMm)
    return undefined;
  const alongLong = (outer.longMm - inner.longMm) / 2;
  const alongShort = (outer.shortMm - inner.shortMm) / 2;
  if (alongLong <= 0 || alongShort <= 0) return undefined;
  if (Math.abs(alongLong - alongShort) > Math.max(20, 0.02 * alongLong))
    return undefined;
  const offset = (alongLong + alongShort) / 2;
  // An overhang beyond 2 m is not an eave of the same roof.
  return offset <= 2_000 ? offset : undefined;
}

const ANGLE_TOKEN =
  /(?:^|[^\d.,])(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:°|º|˚|st\b|stopni|deg)/gi;
const PERCENT_TOKEN = /(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g;
const PITCH_WORDS = /\b(?:k[aą]t|nachyl|spad|pochyl|pitch|slope|alfa|α)/i;
const HIP_WORDS = /kopertow|czterospadow|namiotow|\bhip\b|hipped/i;
const GABLE_WORDS = /dwuspadow|siod[lł]ow|\bgable\b/i;

export function pitchCandidatesFromTexts(texts: readonly { text: string }[]): {
  candidates: CadPitchCandidate[];
  percent: boolean;
} {
  const candidates: CadPitchCandidate[] = [];
  let percent = false;
  for (const { text } of texts) {
    const labelled = PITCH_WORDS.test(text);
    for (const match of text.matchAll(ANGLE_TOKEN)) {
      const value = Number(match[1]!.replace(',', '.'));
      if (value >= 3 && value <= 75)
        candidates.push({ valueDeg: value, text, labelled });
    }
    if (labelled)
      for (const match of text.matchAll(PERCENT_TOKEN)) {
        const slope = Number(match[1]!.replace(',', '.'));
        if (slope >= 5 && slope <= 400) {
          percent = true;
          candidates.push({
            valueDeg:
              Math.round(((Math.atan(slope / 100) * 180) / Math.PI) * 10) / 10,
            text,
            labelled,
          });
        }
      }
  }
  // Labelled first, then the most frequent value.
  const count = (value: number) =>
    candidates.filter((item) => item.valueDeg === value).length;
  candidates.sort(
    (a, b) =>
      Number(b.labelled) - Number(a.labelled) ||
      count(b.valueDeg) - count(a.valueDeg),
  );
  const unique = candidates.filter(
    (item, index) =>
      candidates.findIndex((other) => other.valueDeg === item.valueDeg) ===
      index,
  );
  return { candidates: unique.slice(0, 6), percent };
}

function inferUnit(longest: number): CadLengthUnit | undefined {
  const fits = (['mm', 'cm', 'm'] as const).filter((unit) => {
    const mm = longest * DXF_UNIT_MM[unit];
    return mm >= PLAUSIBLE_LONG_MM.min && mm <= PLAUSIBLE_LONG_MM.max;
  });
  return fits.length === 1 ? fits[0] : undefined;
}

/**
 * Recognises a roof plan from DXF model space. `options.unit` overrides an
 * undeclared or wrong unit; `options.outlineIndex` picks another outline.
 */
export function analyzeCadRoofPlan(
  document: DxfDocument,
  options: { unit?: CadLengthUnit; outlineIndex?: number } = {},
): CadPlanAnalysis {
  // Pieces in drawing units: lines plus every polyline edge.
  const rawSegments: { from: Vec2; to: Vec2; layer: string }[] = [
    ...document.lines,
  ];
  for (const polyline of document.polylines) {
    const pts = polyline.points;
    for (let index = 0; index + 1 < pts.length; index += 1)
      rawSegments.push({
        from: pts[index]!,
        to: pts[index + 1]!,
        layer: polyline.layer,
      });
    if (polyline.closed && pts.length > 2)
      rawSegments.push({
        from: pts[pts.length - 1]!,
        to: pts[0]!,
        layer: polyline.layer,
      });
  }
  const extent = rawSegments.reduce(
    (max, segment) =>
      Math.max(
        max,
        Math.abs(segment.from[0]),
        Math.abs(segment.from[1]),
        Math.abs(segment.to[0]),
        Math.abs(segment.to[1]),
      ),
    1,
  );
  const tolerance = Math.max(extent * 1e-7, 1e-6);

  // Rectangles in drawing units.
  const rawRects: CadRectangle[] = [];
  for (const polyline of document.polylines) {
    const closed =
      polyline.closed ||
      len(
        sub(polyline.points[0]!, polyline.points[polyline.points.length - 1]!),
      ) <= tolerance;
    if (!closed) continue;
    const rect = rectangleOf(polyline.points, polyline.layer, tolerance);
    if (rect) rawRects.push(rect);
    if (rawRects.length >= MAX_RECTANGLES) break;
  }
  for (const loop of loopsFromLines(document.lines, tolerance * 10)) {
    const rect = rectangleOf(loop.points, loop.layer, tolerance * 10);
    if (rect) rawRects.push(rect);
    if (rawRects.length >= MAX_RECTANGLES) break;
  }
  if (!rawRects.length)
    return { status: 'unsupported', reason: 'no-rectangular-outline' };

  const longest = Math.max(...rawRects.map((rect) => rect.longMm));
  const declared =
    document.unitDeclared && document.unit !== 'unitless'
      ? document.unit
      : undefined;
  const warnings: CadWarning[] = [];
  let unit: CadLengthUnit;
  let basis: 'declared' | 'inferred' | 'user';
  let factor: number;
  if (options.unit) {
    unit = options.unit;
    basis = 'user';
    factor = DXF_UNIT_MM[unit];
  } else if (declared) {
    factor = DXF_UNIT_MM[declared as Exclude<DxfUnit, 'unitless'>];
    unit =
      declared === 'mm' || declared === 'cm' || declared === 'm'
        ? declared
        : 'mm';
    basis = 'declared';
  } else {
    const inferred = inferUnit(longest);
    if (!inferred)
      return {
        status: 'unsupported',
        reason: 'unit-unknown',
        longestSide: longest,
      };
    unit = inferred;
    basis = 'inferred';
    factor = DXF_UNIT_MM[inferred];
    warnings.push('unit-inferred');
  }

  const toMm = (point: Vec2): Vec2 => [point[0] * factor, point[1] * factor];
  const segments = rawSegments.map(
    (segment) => [toMm(segment.from), toMm(segment.to)] as [Vec2, Vec2],
  );
  const rects = rawRects
    .map((rect) => ({
      ...rect,
      corners: rect.corners.map(toMm) as CadRectangle['corners'],
      center: toMm(rect.center),
      longMm: rect.longMm * factor,
      shortMm: rect.shortMm * factor,
    }))
    .filter(
      (rect) =>
        rect.longMm >= PLAUSIBLE_LONG_MM.min / 2 &&
        rect.longMm <= PLAUSIBLE_LONG_MM.max * 1.5,
    )
    // Identical outlines drawn twice (polyline + lines) count once.
    .filter(
      (rect, index, all) =>
        all.findIndex(
          (other) =>
            len(sub(other.center, rect.center)) < 1 &&
            Math.abs(other.longMm - rect.longMm) < 1 &&
            Math.abs(other.shortMm - rect.shortMm) < 1,
        ) === index,
    );
  if (!rects.length)
    return {
      status: 'unsupported',
      reason: 'no-rectangular-outline',
      longestSide: longest,
    };

  // Roof lines inside an outline make it the roof, not a title block.
  const roofLinesIn = (rect: CadRectangle) => {
    const lines: CadRoofLine[] = [];
    const cornerTol = Math.max(0.03 * rect.shortMm, 50);
    for (const [from, to] of segments) {
      const length = len(sub(to, from));
      if (length < 0.05 * rect.shortMm) continue;
      if (
        !insideRectangle(from, rect, cornerTol) ||
        !insideRectangle(to, rect, cornerTol)
      )
        continue;
      const a = toLocal(from, rect),
        b = toLocal(to, rect);
      const d = sub(b, a);
      const along = Math.abs(d[0]) / length;
      const midV = (a[1] + b[1]) / 2;
      // On the outline itself → not an interior roof line.
      // Both ends on the SAME side of the outline: a piece of the outline.
      const onEdge =
        (Math.abs(Math.abs(a[1]) - rect.shortMm / 2) < cornerTol &&
          Math.abs(Math.abs(b[1]) - rect.shortMm / 2) < cornerTol &&
          a[1] * b[1] > 0) ||
        (Math.abs(Math.abs(a[0]) - rect.longMm / 2) < cornerTol &&
          Math.abs(Math.abs(b[0]) - rect.longMm / 2) < cornerTol &&
          a[0] * b[0] > 0);
      if (onEdge) continue;
      if (along > 0.999 && Math.abs(midV) < 0.02 * rect.shortMm) {
        lines.push({ kind: 'ridge', from, to });
        continue;
      }
      const angle =
        (Math.atan2(Math.abs(d[1]), Math.abs(d[0])) * 180) / Math.PI;
      if (Math.abs(angle - 45) > 6) continue;
      const nearCorner = [a, b].some((end) =>
        rect.corners.some(
          (corner) => len(sub(toLocal(corner, rect), end)) < cornerTol * 2,
        ),
      );
      if (nearCorner) lines.push({ kind: 'hip', from, to });
    }
    return lines;
  };
  const scored = rects
    .map((rect) => ({ rect, lines: roofLinesIn(rect) }))
    .sort(
      (a, b) =>
        Number(b.lines.length > 0) - Number(a.lines.length > 0) ||
        b.rect.longMm * b.rect.shortMm - a.rect.longMm * a.rect.shortMm,
    );
  const outlineIndex = Math.min(
    Math.max(0, options.outlineIndex ?? 0),
    scored.length - 1,
  );
  const chosen = scored[outlineIndex]!;
  const evidence: CadEvidence[] = [];

  // A nested outline with a uniform offset: walls inside, eave outside.
  let eaveOutline: CadRectangle | undefined;
  let wallOutline: CadRectangle | undefined;
  let overhang: number | undefined;
  for (const candidate of rects) {
    if (candidate === chosen.rect) continue;
    const inner = nestedOffset(chosen.rect, candidate);
    if (inner !== undefined) {
      eaveOutline = chosen.rect;
      wallOutline = candidate;
      overhang = inner;
      break;
    }
    const outer = nestedOffset(candidate, chosen.rect);
    if (outer !== undefined) {
      eaveOutline = candidate;
      wallOutline = chosen.rect;
      overhang = outer;
      break;
    }
  }
  if (overhang !== undefined) evidence.push('nested-outlines');
  else warnings.push('single-outline-meaning');
  // Other outlines than the roof's own wall/eave pair: say a choice exists.
  if (
    scored.some(
      (item) =>
        item.rect !== chosen.rect &&
        item.rect !== eaveOutline &&
        item.rect !== wallOutline,
    )
  )
    warnings.push('several-outlines');

  // Roof lines: the chosen outline's, or the eave outline's when nested.
  const roofLines = eaveOutline
    ? roofLinesIn(eaveOutline).concat(
        wallOutline === chosen.rect ? [] : roofLinesIn(chosen.rect),
      )
    : chosen.lines;
  const uniqueLines = roofLines.filter(
    (line, index) =>
      roofLines.findIndex(
        (other) =>
          len(sub(other.from, line.from)) < 1 &&
          len(sub(other.to, line.to)) < 1,
      ) === index,
  );
  const reference = eaveOutline ?? chosen.rect;
  const ridges = uniqueLines.filter((line) => line.kind === 'ridge');
  const hips = uniqueLines.filter((line) => line.kind === 'hip');
  const ridgeLength = Math.max(
    0,
    ...ridges.map((line) => len(sub(line.to, line.from))),
  );
  let roofType: CadRoofType | undefined;
  if (hips.length >= 3) {
    roofType = 'hip';
    evidence.push('hip-diagonals');
    const expected = reference.longMm - reference.shortMm;
    if (
      (ridges.length &&
        Math.abs(ridgeLength - expected) < 0.03 * reference.longMm) ||
      (!ridges.length && expected < 0.03 * reference.longMm)
    )
      evidence.push('hip-geometry-consistent');
    if (ridges.length) evidence.push('ridge-shortened');
  } else if (ridges.length && ridgeLength >= 0.9 * reference.longMm) {
    roofType = 'gable';
    evidence.push('ridge-full-length');
  }
  // Written roof type, when the lines did not decide it.
  const typeText = document.texts.find(
    (text) => HIP_WORDS.test(text.text) || GABLE_WORDS.test(text.text),
  );
  if (!roofType && typeText) {
    roofType = HIP_WORDS.test(typeText.text) ? 'hip' : 'gable';
    evidence.push('roof-type-text');
  }
  if (!roofType) warnings.push('roof-type-not-recognized');

  // A ridge drawn across the short side would make the short side the
  // building length; RoofCalc's start keeps the ridge along the length.
  const crossRidge = segments.some(([from, to]) => {
    const a = toLocal(from, reference),
      b = toLocal(to, reference);
    const length = len(sub(b, a));
    return (
      length >= 0.9 * reference.shortMm &&
      Math.abs(b[1] - a[1]) / length > 0.999 &&
      Math.abs((a[0] + b[0]) / 2) < 0.02 * reference.longMm &&
      reference.longMm - reference.shortMm > 0.05 * reference.longMm
    );
  });
  if (crossRidge && roofType !== 'hip')
    warnings.push('ridge-across-short-side');

  const building = wallOutline ?? chosen.rect;
  for (const dimension of document.dimensions) {
    if (dimension.kind !== 'linear' || dimension.measurement === undefined)
      continue;
    const mm = dimension.measurement * factor;
    for (const outline of [building, eaveOutline].filter(
      Boolean,
    ) as CadRectangle[]) {
      if (Math.abs(mm - outline.longMm) <= 0.005 * outline.longMm)
        evidence.push('dimension-matches-length');
      if (Math.abs(mm - outline.shortMm) <= 0.005 * outline.shortMm)
        evidence.push('dimension-matches-width');
    }
  }

  const pitch = pitchCandidatesFromTexts(document.texts);
  if (pitch.candidates.length) {
    evidence.push('pitch-text');
    if (pitch.percent) evidence.push('pitch-percent-converted');
  } else warnings.push('pitch-not-found');

  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    status: 'supported',
    unit: { unit, basis },
    outlines: scored.map((item) => item.rect),
    outlineIndex,
    ...(eaveOutline ? { eaveOutline } : {}),
    ...(wallOutline ? { wallOutline } : {}),
    roofLines: uniqueLines,
    proposed: {
      ...(roofType ? { roofType } : {}),
      buildingLengthMm: round(building.longMm),
      buildingWidthMm: round(building.shortMm),
      ...(overhang !== undefined ? { eaveOverhangMm: round(overhang) } : {}),
      ...(pitch.candidates[0]
        ? { pitchDeg: pitch.candidates[0].valueDeg }
        : {}),
    },
    pitchCandidates: pitch.candidates,
    evidence: [...new Set(evidence)],
    warnings,
    preview: { segments: segments.slice(0, 20_000) },
  };
}
