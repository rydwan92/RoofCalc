import { engineRef, TEXT_LAYER_ENGINE } from './engines';
import { DOCUMENT_IMPORT_LIMITS } from './ingestion';
import {
  IMPORT_ROOF_TYPES,
  type Confidence,
  type DetectedRoofType,
  type DocumentUnitStatement,
  type DraftWarning,
  type EvidenceCode,
  isAngleField,
  type NumericRoofField,
  type PageBox,
  type PageUnit,
  type RecognitionResult,
  type RecognizedMeasurement,
  type RoofTypeStatement,
  type ScaleStatement,
  type SourceRegion,
} from './model';
import {
  LENGTH_UNIT_MM,
  percentSlopeToDegrees,
  scanMeasurementTokens,
  toSuperscriptDigits,
  type MeasurementToken,
} from './tokens';
import {
  LABEL_PATTERNS,
  matchDocumentUnit,
  normalizeForMatching,
  ROOF_TYPE_PATTERNS,
  type LabelPattern,
} from './vocabulary';

/**
 * Deterministic text-layer recognition. Input is the positioned text a PDF
 * already contains (a parser adapter extracts it); output is a
 * `RecognitionResult` whose every value points at the page region it came
 * from. No OCR, no inference beyond the documented rules below.
 */

export interface TextLayerItem {
  text: string;
  /** Page space, origin top-left, y down. */
  box: PageBox;
  /** Text direction in degrees; rotated dimension text stays on its own. */
  rotationDeg?: number;
}

export interface TextLayerPage {
  page: number;
  width: number;
  height: number;
  unit: PageUnit;
  items: TextLayerItem[];
}

interface Span {
  start: number;
  end: number;
  box: PageBox;
}

export interface AssembledLine {
  page: number;
  index: number;
  text: string;
  box: PageBox;
  rotated: boolean;
  spans: Span[];
}

function union(boxes: readonly PageBox[]): PageBox {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const centerY = (box: PageBox) => box.y + box.height / 2;
const isRotated = (item: TextLayerItem) => {
  const angle = Math.abs((item.rotationDeg ?? 0) % 180);
  return angle > 10 && angle < 170;
};

function buildLine(
  page: number,
  index: number,
  items: readonly TextLayerItem[],
  rotated: boolean,
): AssembledLine {
  const ordered = rotated
    ? [...items]
    : [...items].sort((a, b) => a.box.x - b.box.x);
  let text = '';
  const spans: Span[] = [];
  ordered.forEach((item, position) => {
    const previous = ordered[position - 1];
    if (previous) {
      const gap = item.box.x - (previous.box.x + previous.box.width);
      const height = Math.min(item.box.height, previous.box.height) || 1;
      if (
        gap > height * 0.2 &&
        !text.endsWith(' ') &&
        !item.text.startsWith(' ')
      )
        text += ' ';
    }
    const start = text.length;
    text += item.text;
    spans.push({ start, end: text.length, box: item.box });
  });
  return {
    page,
    index,
    text,
    box: union(ordered.map((item) => item.box)),
    rotated,
    spans,
  };
}

/**
 * A raised, smaller one- or two-digit item right after a number is a
 * superscript fraction ("38" + raised "5" = 38,5 cm on Polish architectural
 * drawings). A PDF stores it as a separate text item; it is written back
 * onto its number as superscript digits so the token scanner reads one
 * value instead of "38" and a stray "5" (or "385").
 */
function mergeRaisedDigits(items: readonly TextLayerItem[]): TextLayerItem[] {
  const merged = [...items];
  const absorbed = new Set<TextLayerItem>();
  for (const item of items) {
    if (isRotated(item) || !/^\d{1,2}$/.test(item.text.trim())) continue;
    const index = merged.findIndex((base) => {
      if (base === item || absorbed.has(base) || isRotated(base)) return false;
      if (!/\d$/.test(base.text.trimEnd())) return false;
      const height = base.box.height;
      const gap = item.box.x - (base.box.x + base.box.width);
      return (
        item.box.height < height * 0.8 &&
        gap >= -height * 0.2 &&
        gap <= height * 0.3 &&
        centerY(item.box) < centerY(base.box) - height * 0.1 &&
        item.box.y + item.box.height > base.box.y - height * 0.2
      );
    });
    if (index < 0) continue;
    const base = merged[index]!;
    merged[index] = {
      ...base,
      text: base.text.trimEnd() + toSuperscriptDigits(item.text.trim()),
      box: union([base.box, item.box]),
    };
    absorbed.add(item);
  }
  return merged.filter((item) => !absorbed.has(item));
}

/**
 * Groups positioned text items into reading lines: items whose vertical
 * centres agree within half the smaller text height share a line and are
 * ordered left to right. Rotated items (vertical dimension text) form their
 * own lines.
 */
export function assembleLines(page: TextLayerPage): AssembledLine[] {
  const items = mergeRaisedDigits(
    page.items
      .filter((item) => item.text.trim().length > 0)
      .slice(0, DOCUMENT_IMPORT_LIMITS.maxTextItemsPerPage),
  );
  const horizontal = items
    .filter((item) => !isRotated(item))
    .sort((a, b) => centerY(a.box) - centerY(b.box) || a.box.x - b.box.x);
  const groups: TextLayerItem[][] = [];
  for (const item of horizontal) {
    const target = groups
      .slice(-3)
      .find((group) =>
        group.some(
          (member) =>
            Math.abs(centerY(member.box) - centerY(item.box)) <=
            Math.min(member.box.height, item.box.height) * 0.5,
        ),
      );
    if (target) target.push(item);
    else groups.push([item]);
  }
  const lines = groups.map((group, index) =>
    buildLine(page.page, index, group, false),
  );
  for (const item of items.filter(isRotated))
    lines.push(buildLine(page.page, lines.length, [item], true));
  return lines;
}

/** Page region of characters [start, end) of an assembled line. */
export function regionOfRange(
  line: AssembledLine,
  start: number,
  end: number,
): SourceRegion {
  const boxes = line.spans.flatMap((span) => {
    if (span.end <= start || span.start >= end) return [];
    if (line.rotated) return [span.box];
    const length = Math.max(span.end - span.start, 1);
    const from = (Math.max(start, span.start) - span.start) / length;
    const to = (Math.min(end, span.end) - span.start) / length;
    return [
      {
        x: span.box.x + span.box.width * from,
        y: span.box.y,
        width: span.box.width * Math.max(to - from, 0),
        height: span.box.height,
      },
    ];
  });
  return { page: line.page, box: boxes.length ? union(boxes) : line.box };
}

interface LabelMatch {
  label: LabelPattern;
  start: number;
  end: number;
}

function findLabels(normalized: string): LabelMatch[] {
  const matches: LabelMatch[] = [];
  for (const label of LABEL_PATTERNS)
    for (const match of normalized.matchAll(label.pattern))
      matches.push({
        label,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
      });
  // Longest, then explicit, label wins an overlap: "rozstaw krokwi" is a
  // spacing label, not a rafter-section label for its "krokwi".
  matches.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - b.start - (a.end - a.start) ||
      (a.label.strength === 'explicit' ? -1 : 1),
  );
  const accepted: LabelMatch[] = [];
  for (const match of matches) {
    const overlaps = accepted.some(
      (other) => match.start < other.end && other.start < match.end,
    );
    if (!overlaps) accepted.push(match);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

type Wanted = 'length' | 'angle' | 'pair';
function wantedTokens(label: LabelPattern): Wanted[] {
  if (label.target.kind !== 'field') return ['pair'];
  return isAngleField(label.target.field) ? ['angle', 'length'] : ['length'];
}

function tokenFits(token: MeasurementToken, wanted: readonly Wanted[]) {
  if (token.kind === 'percent') return wanted.includes('angle');
  if (token.kind === 'length')
    // A unitless number after a pitch label is read as degrees; a length
    // with an explicit unit is never a pitch.
    return (
      wanted.includes('length') && !(wanted.includes('angle') && token.unit)
    );
  return wanted.includes(token.kind as Wanted);
}

function level(confidence: number): Confidence {
  return confidence >= 2 ? 'high' : confidence === 1 ? 'medium' : 'low';
}

interface Context {
  measurements: RecognizedMeasurement[];
  usedTokens: Set<string>;
}

const MAX_LABEL_GAP = 40;
const TIGHT_LABEL_GAP = 3;

interface Candidate {
  line: AssembledLine;
  token: MeasurementToken;
  sameLine: boolean;
}

/** First fitting token after a label in its line, or in the line below. */
function findValue(
  label: LabelMatch,
  line: AssembledLine,
  tokens: readonly MeasurementToken[],
  regionEnd: number,
  below: readonly { line: AssembledLine; tokens: MeasurementToken[] }[],
): Candidate | undefined {
  const wanted = wantedTokens(label.label);
  const gap = label.label.tight ? TIGHT_LABEL_GAP : MAX_LABEL_GAP;
  const sameLine = tokens.find(
    (token) =>
      token.start >= label.end &&
      token.start < regionEnd &&
      token.start - label.end <= gap &&
      tokenFits(token, wanted),
  );
  if (sameLine) return { line, token: sameLine, sameLine: true };
  if (label.label.tight) return undefined;
  const labelBox = regionOfRange(line, label.start, label.end).box;
  for (const next of below) {
    const vertical = next.line.box.y - (labelBox.y + labelBox.height);
    if (vertical < -labelBox.height * 0.25) continue;
    if (vertical > labelBox.height * 2) break;
    const overlaps =
      next.line.box.x < labelBox.x + labelBox.width * 2 &&
      next.line.box.x + next.line.box.width > labelBox.x;
    if (!overlaps) continue;
    const token = next.tokens.find((candidate) => tokenFits(candidate, wanted));
    if (token) return { line: next.line, token, sameLine: false };
  }
  return undefined;
}

function tokenKey(line: AssembledLine, token: MeasurementToken) {
  return `${line.page}:${line.index}:${token.start}`;
}

function measurementId(
  line: AssembledLine,
  token: MeasurementToken,
  suffix: string,
) {
  return `${TEXT_LAYER_ENGINE.id}:p${line.page}:l${line.index}:c${token.start}:${suffix}`;
}

function push(
  context: Context,
  measurement: Omit<RecognizedMeasurement, 'engineId' | 'mode'>,
) {
  context.measurements.push({
    ...measurement,
    engineId: TEXT_LAYER_ENGINE.id,
    mode: TEXT_LAYER_ENGINE.mode,
  });
}

function labelled(
  context: Context,
  label: LabelMatch,
  labelLine: AssembledLine,
  candidate: Candidate,
) {
  const { token, line } = candidate;
  const region = regionOfRange(line, token.start, token.end);
  const labelInfo = {
    text: labelLine.text.slice(label.start, label.end),
    region: regionOfRange(labelLine, label.start, label.end),
  };
  const evidence: EvidenceCode[] = [
    label.label.strength === 'explicit' ? 'explicit-label' : 'generic-label',
    candidate.sameLine ? 'same-line' : 'nearby',
  ];
  let score =
    2 -
    (label.label.strength === 'generic' ? 1 : 0) -
    (candidate.sameLine ? 0 : 1);
  context.usedTokens.add(tokenKey(line, token));
  const target = label.label.target;

  if (target.kind === 'field' && isAngleField(target.field)) {
    let valueDeg: number;
    let unit: 'deg' | 'percent' | undefined;
    if (token.kind === 'angle') {
      valueDeg = token.degrees;
      unit = 'deg';
      evidence.push('explicit-unit');
    } else if (token.kind === 'percent') {
      valueDeg = percentSlopeToDegrees(token.percent);
      unit = 'percent';
      evidence.push('explicit-unit', 'percent-slope-converted');
    } else if (token.kind === 'length') {
      valueDeg = token.value;
      score -= 1;
    } else return;
    if (!(valueDeg > 0 && valueDeg < 90)) return;
    push(context, {
      id: measurementId(line, token, target.field),
      field: target.field,
      quantity: 'angle',
      raw: {
        text: token.text,
        value: token.kind === 'percent' ? token.percent : valueDeg,
        unit,
      },
      valueDeg,
      unitBasis: 'explicit',
      region,
      label: labelInfo,
      confidence: level(score),
      evidence,
    });
    return;
  }

  if (target.kind === 'field' && token.kind === 'length') {
    if (!token.unit) score -= 1;
    else evidence.push('explicit-unit');
    push(context, {
      id: measurementId(line, token, target.field),
      field: target.field,
      quantity: 'length',
      raw: { text: token.text, value: token.value, unit: token.unit },
      ...(token.unit
        ? {
            valueMm: token.value * LENGTH_UNIT_MM[token.unit],
            unitBasis: 'explicit' as const,
          }
        : {}),
      region,
      label: labelInfo,
      confidence: level(score),
      evidence,
    });
    return;
  }

  if (token.kind !== 'pair') return;
  if (!token.unit) score -= 1;
  else evidence.push('explicit-unit');
  let fields: [NumericRoofField, number][];
  if (target.kind === 'dimensions') {
    // "Wymiary budynku 12,40 × 9,60 m": the longer side is read as the
    // building length (along the ridge). That is an assumption, so the
    // value is never better than medium and always needs confirmation.
    evidence.push('dimension-pair');
    score = Math.min(score, 1);
    const longer = Math.max(token.first, token.second);
    const shorter = Math.min(token.first, token.second);
    fields = [
      ['buildingLength', longer],
      ['buildingWidth', shorter],
    ];
  } else {
    evidence.push('section-pair');
    // Timber is written width × depth ("8×18"); a reversed pair is read
    // with the larger number as the depth and confirmed by the user.
    if (token.first > token.second) score = Math.min(score, 1);
    fields = [
      ['rafterWidth', Math.min(token.first, token.second)],
      ['rafterDepth', Math.max(token.first, token.second)],
    ];
  }
  for (const [field, value] of fields)
    push(context, {
      id: measurementId(line, token, field),
      field,
      quantity: 'length',
      raw: { text: token.text, value, unit: token.unit },
      ...(token.unit
        ? {
            valueMm: value * LENGTH_UNIT_MM[token.unit],
            unitBasis: 'explicit' as const,
          }
        : {}),
      region,
      label: labelInfo,
      confidence: level(score),
      evidence: [...evidence],
    });
}

type LengthToken = Extract<MeasurementToken, { kind: 'length' }>;

/** Text items further apart than this many text heights are separate groups. */
const GROUP_GAP_HEIGHTS = 4;

/**
 * Character ranges of a line split at large horizontal gaps, so a row of
 * dimension numbers is not merged with an unrelated title block that
 * happens to sit at the same height.
 */
function spatialGroups(line: AssembledLine): { start: number; end: number }[] {
  if (line.rotated || line.spans.length < 2)
    return [{ start: 0, end: line.text.length }];
  const groups: { start: number; end: number }[] = [];
  let start = 0;
  line.spans.forEach((span, index) => {
    const previous = line.spans[index - 1];
    if (!previous) return;
    const gap = span.box.x - (previous.box.x + previous.box.width);
    const height = Math.min(span.box.height, previous.box.height) || 1;
    if (gap > height * GROUP_GAP_HEIGHTS) {
      groups.push({ start, end: previous.end });
      start = span.start;
    }
  });
  groups.push({ start, end: line.text.length });
  return groups;
}

/**
 * Dimension values standing alone: a line, or a spatial group of a line,
 * that contains nothing but lengths — "1240", "12,40 m", or a dimension row
 * "320 600 320" written along a dimension line.
 */
function dimensionRows(
  line: AssembledLine,
  tokens: readonly MeasurementToken[],
): LengthToken[][] {
  return spatialGroups(line).flatMap(({ start, end }) => {
    const inside = tokens.filter(
      (token) => token.start >= start && token.end <= end,
    );
    if (inside.length === 0 || inside.some((token) => token.kind !== 'length'))
      return [];
    let rest = line.text.slice(start, end);
    for (const token of [...inside].reverse())
      rest = rest.slice(0, token.start - start) + rest.slice(token.end - start);
    return rest.replace(/[\s()[\]\-–—=:;,.]/g, '').length === 0
      ? [inside as LengthToken[]]
      : [];
  });
}

export interface TextLayerOptions {
  /** Pages the adapter could not read (counted, reported). */
  totalPages?: number;
}

/** The deterministic text-layer engine. */
export function recognizeTextLayer(
  pages: readonly TextLayerPage[],
  options: TextLayerOptions = {},
): RecognitionResult {
  const context: Context = { measurements: [], usedTokens: new Set() };
  const warnings: DraftWarning[] = [];
  let documentUnit: DocumentUnitStatement | undefined;
  let scale: ScaleStatement | undefined;
  const roofTypes: RoofTypeStatement[] = [];
  const angles: { line: AssembledLine; token: MeasurementToken }[] = [];
  const total = options.totalPages ?? pages.length;
  if (total > pages.length)
    warnings.push({
      code: 'page-limit-reached',
      processed: pages.length,
      total,
    });

  const textPages = pages.filter((page) =>
    page.items.some((item) => item.text.trim()),
  );
  if (pages.length > 0 && textPages.length === 0)
    warnings.push({ code: 'no-text-layer' });

  for (const page of pages) {
    if (page.items.length > DOCUMENT_IMPORT_LIMITS.maxTextItemsPerPage)
      warnings.push({ code: 'text-limit-reached', page: page.page });
    const lines = assembleLines(page)
      .map((line) => ({ line, tokens: scanMeasurementTokens(line.text) }))
      .sort(
        (a, b) => a.line.box.y - b.line.box.y || a.line.box.x - b.line.box.x,
      );
    lines.forEach(({ line, tokens }, position) => {
      const normalized = normalizeForMatching(line.text);
      if (!documentUnit) {
        const unit = matchDocumentUnit(normalized);
        if (unit)
          documentUnit = {
            unit: unit.unit,
            text: line.text.slice(unit.start, unit.end),
            region: regionOfRange(line, unit.start, unit.end),
          };
      }
      // VNext-9B: one span names one roof — "dwuspadowy niesymetryczny" is
      // an asymmetric gable, not also a gable. Patterns are ordered from the
      // most specific; a later match inside an earlier one is dropped.
      const spans: { start: number; end: number }[] = [];
      for (const roof of ROOF_TYPE_PATTERNS) {
        const match = roof.pattern.exec(normalized);
        if (!match) continue;
        const start = match.index;
        const end = start + match[0].length;
        if (spans.some((span) => start < span.end && span.start < end))
          continue;
        spans.push({ start, end });
        roofTypes.push({
          value: roof.value,
          text: line.text.slice(start, end),
          region: regionOfRange(line, start, end),
        });
      }
      const scaleToken = tokens.find((token) => token.kind === 'scale');
      if (!scale && scaleToken?.kind === 'scale')
        scale = {
          denominator: scaleToken.denominator,
          text: scaleToken.text,
          region: regionOfRange(line, scaleToken.start, scaleToken.end),
        };

      const labels = findLabels(normalized);
      const below = lines.slice(position + 1, position + 4);
      labels.forEach((label, index) => {
        const regionEnd = labels[index + 1]?.start ?? line.text.length;
        const candidate = findValue(label, line, tokens, regionEnd, below);
        if (
          candidate &&
          !context.usedTokens.has(tokenKey(candidate.line, candidate.token))
        )
          labelled(context, label, line, candidate);
      });
      for (const token of tokens)
        if (
          token.kind === 'angle' &&
          !context.usedTokens.has(tokenKey(line, token))
        )
          angles.push({ line, token });
    });
    // Standalone dimension values become unlabelled candidates only after
    // labels had the first claim on every token of the page. Several in one
    // row are a dimension row — the parts of a possible dimension chain.
    for (const { line, tokens } of lines)
      for (const row of dimensionRows(line, tokens))
        for (const token of row) {
          if (context.usedTokens.has(tokenKey(line, token))) continue;
          context.usedTokens.add(tokenKey(line, token));
          const evidence: EvidenceCode[] = ['unlabelled'];
          if (row.length > 1) evidence.push('dimension-row');
          if (token.unit) evidence.push('explicit-unit');
          push(context, {
            id: measurementId(line, token, 'candidate'),
            quantity: 'length',
            raw: { text: token.text, value: token.value, unit: token.unit },
            ...(token.unit
              ? {
                  valueMm: token.value * LENGTH_UNIT_MM[token.unit],
                  unitBasis: 'explicit' as const,
                }
              : {}),
            region: regionOfRange(line, token.start, token.end),
            confidence: 'low',
            evidence,
          });
        }
  }

  // A document with one distinct unlabelled angle and no labelled pitch:
  // offered as a low-confidence pitch candidate, never accepted silently.
  const labelledPitch = context.measurements.some(
    (measurement) => measurement.field === 'pitch',
  );
  const distinct = [
    ...new Set(
      angles.map(({ token }) => (token.kind === 'angle' ? token.degrees : 0)),
    ),
  ];
  const [only] = angles;
  if (
    !labelledPitch &&
    distinct.length === 1 &&
    only?.token.kind === 'angle' &&
    only.token.degrees > 0 &&
    only.token.degrees < 90
  )
    push(context, {
      id: measurementId(only.line, only.token, 'pitch'),
      field: 'pitch',
      quantity: 'angle',
      raw: { text: only.token.text, value: only.token.degrees, unit: 'deg' },
      valueDeg: only.token.degrees,
      unitBasis: 'explicit',
      region: regionOfRange(only.line, only.token.start, only.token.end),
      confidence: 'low',
      evidence: ['only-angle-in-document', 'explicit-unit'],
    });

  return {
    engine: engineRef(TEXT_LAYER_ENGINE),
    measurements: context.measurements,
    ...(documentUnit ? { documentUnit } : {}),
    ...(scale ? { scale } : {}),
    ...(() => {
      const roofType = chooseRoofType(roofTypes);
      return roofType ? { roofType } : {};
    })(),
    warnings: [
      ...warnings,
      ...roofTypes
        .filter((statement) => statement.value === 'unsupported')
        .slice(0, 1)
        .map((statement) => ({
          code: 'unsupported-roof-type' as const,
          text: statement.text,
          ...(statement.region ? { region: statement.region } : {}),
        })),
    ],
  };
}

/**
 * The supported roof type the document names most often. A tie between
 * supported types, or only unsupported names, gives no supported value.
 */
function chooseRoofType(
  statements: readonly RoofTypeStatement[],
): RoofTypeStatement | undefined {
  const count = (value: DetectedRoofType) =>
    statements.filter((statement) => statement.value === value).length;
  const ranked = IMPORT_ROOF_TYPES.map((value) => ({
    value,
    count: count(value),
  })).sort((a, b) => b.count - a.count);
  const [first, second] = ranked;
  if (!first?.count)
    return statements.find((statement) => statement.value === 'unsupported');
  if (second && second.count === first.count) return undefined;
  return statements.find((statement) => statement.value === first.value);
}
