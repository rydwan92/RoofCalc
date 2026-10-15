import { engineRef, TEXT_LAYER_ENGINE } from './engines';
import { DOCUMENT_IMPORT_LIMITS } from './ingestion';
import type {
  Confidence,
  DetectedRoofType,
  DocumentUnitStatement,
  DraftWarning,
  EvidenceCode,
  NumericRoofField,
  PageBox,
  PageUnit,
  RecognitionResult,
  RecognizedMeasurement,
  RoofTypeStatement,
  ScaleStatement,
  SourceRegion,
} from './model';
import {
  LENGTH_UNIT_MM,
  percentSlopeToDegrees,
  scanMeasurementTokens,
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
 * Groups positioned text items into reading lines: items whose vertical
 * centres agree within half the smaller text height share a line and are
 * ordered left to right. Rotated items (vertical dimension text) form their
 * own lines.
 */
export function assembleLines(page: TextLayerPage): AssembledLine[] {
  const items = page.items
    .filter((item) => item.text.trim().length > 0)
    .slice(0, DOCUMENT_IMPORT_LIMITS.maxTextItemsPerPage);
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
  return label.target.field === 'pitch' ? ['angle', 'length'] : ['length'];
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

  if (target.kind === 'field' && target.field === 'pitch') {
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
      id: measurementId(line, token, 'pitch'),
      field: 'pitch',
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

/** A line that is only a dimension value, e.g. "1240" or "12,40 m". */
function standaloneLength(
  line: AssembledLine,
  tokens: readonly MeasurementToken[],
): Extract<MeasurementToken, { kind: 'length' }> | undefined {
  if (tokens.length !== 1) return undefined;
  const [token] = tokens;
  if (token?.kind !== 'length') return undefined;
  const rest = (line.text.slice(0, token.start) + line.text.slice(token.end))
    .replace(/[\s()[\]\-–—=:;,.]/g, '')
    .trim();
  return rest.length === 0 ? token : undefined;
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
      for (const roof of ROOF_TYPE_PATTERNS) {
        const match = roof.pattern.exec(normalized);
        if (match)
          roofTypes.push({
            value: roof.value,
            text: line.text.slice(match.index, match.index + match[0].length),
            region: regionOfRange(
              line,
              match.index,
              match.index + match[0].length,
            ),
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
    // labels had the first claim on every token of the page.
    for (const { line, tokens } of lines) {
      const token = standaloneLength(line, tokens);
      if (!token || context.usedTokens.has(tokenKey(line, token))) continue;
      context.usedTokens.add(tokenKey(line, token));
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
        evidence: token.unit ? ['unlabelled', 'explicit-unit'] : ['unlabelled'],
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
 * gable and hip, or only unsupported names, gives no supported value.
 */
function chooseRoofType(
  statements: readonly RoofTypeStatement[],
): RoofTypeStatement | undefined {
  const count = (value: DetectedRoofType) =>
    statements.filter((statement) => statement.value === value).length;
  const gable = count('gable');
  const hip = count('hip');
  if (gable === 0 && hip === 0)
    return statements.find((statement) => statement.value === 'unsupported');
  if (gable === hip) return undefined;
  const winner = gable > hip ? 'gable' : 'hip';
  return statements.find((statement) => statement.value === winner);
}
