import {
  measurementValueSource,
  type DraftRelation,
  type DraftWarning,
  type PageBox,
  type RecognizedMeasurement,
} from './model';
import { writtenDecimals } from './tokens';

/**
 * Dimension chains (łańcuchy wymiarowe). A building plan dimensions each
 * wall twice: a chain of part dimensions (openings, piers, offsets) and,
 * one row further out, the overall dimension. The parts must add up to the
 * total. Because both are *written* numbers in the same unit, that check is
 * free of units and of the drawing scale — exactly the evidence a scan or a
 * resized print can still give. A chain therefore
 *
 * - confirms that the numbers were read correctly (OCR or a typo breaks it),
 * - identifies overall dimensions, the natural building length and width,
 * - flags a near miss as a probable misread instead of guessing.
 *
 * Geometry is used only to group numbers into rows and to find the total
 * centred over its parts; no length is ever measured off the page.
 */

export type ChainAxis = 'horizontal' | 'vertical';
export type DimensionChain = Extract<
  DraftRelation,
  { kind: 'dimension-chain' }
>;
export type DimensionChainMismatch = Extract<
  DraftWarning,
  { code: 'dimension-chain-mismatch' }
>;

export const DIMENSION_CHAIN_RULES = {
  /** Two numbers share a row when their centres differ by less than this many text heights. */
  rowTolerance: 0.6,
  /** A total sits within this many text heights of its row of parts. */
  maxRowDistance: 20,
  /** A total is centred over its parts within this share of their span. */
  centreTolerance: 0.25,
  /** A full row within this ratio of a centred total is a probable misread. */
  mismatchRatio: 0.05,
  /** Rows longer than this are not dimension chains (tables, lists). */
  maxRowItems: 24,
} as const;

interface Item {
  measurement: RecognizedMeasurement;
  page: number;
  axis: ChainAxis;
  /** Centre along the dimension line, start and end of the text. */
  along: number;
  start: number;
  end: number;
  /** Centre across the dimension line and the text thickness. */
  across: number;
  thickness: number;
  value: number;
  unit: string;
  decimals: number;
}

function axisOf(box: PageBox): ChainAxis {
  // Vertical dimension text is set rotated; its box is tall and narrow.
  return box.height > box.width * 1.5 ? 'vertical' : 'horizontal';
}

function itemOf(measurement: RecognizedMeasurement): Item | undefined {
  if (measurement.quantity !== 'length' || !measurement.region)
    return undefined;
  if (measurementValueSource(measurement) !== 'written') return undefined;
  // A "12,40 × 9,60" pair or a timber section is not a chain member.
  if (
    measurement.evidence.includes('dimension-pair') ||
    measurement.evidence.includes('section-pair')
  )
    return undefined;
  const { box, page } = measurement.region;
  if (!(measurement.raw.value > 0) || box.width <= 0 || box.height <= 0)
    return undefined;
  const axis = axisOf(box);
  const horizontal = axis === 'horizontal';
  return {
    measurement,
    page,
    axis,
    along: horizontal ? box.x + box.width / 2 : box.y + box.height / 2,
    start: horizontal ? box.x : box.y,
    end: horizontal ? box.x + box.width : box.y + box.height,
    across: horizontal ? box.y + box.height / 2 : box.x + box.width / 2,
    thickness: horizontal ? box.height : box.width,
    value: measurement.raw.value,
    unit: measurement.raw.unit ?? '',
    decimals: writtenDecimals(measurement.raw.text),
  };
}

function rowsOf(items: readonly Item[]): Item[][] {
  const rows: Item[][] = [];
  const ordered = [...items].sort(
    (a, b) =>
      a.page - b.page ||
      a.axis.localeCompare(b.axis) ||
      a.across - b.across ||
      a.along - b.along,
  );
  for (const item of ordered) {
    const row = rows.find(
      (candidate) =>
        candidate[0]!.page === item.page &&
        candidate[0]!.axis === item.axis &&
        candidate.some(
          (member) =>
            Math.abs(member.across - item.across) <=
            Math.min(member.thickness, item.thickness) *
              DIMENSION_CHAIN_RULES.rowTolerance,
        ),
    );
    if (row) row.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.along - b.along);
  return rows;
}

/** Equal as written: within the rounding of the written digits. */
function writtenEqual(sum: number, parts: readonly Item[], total: Item) {
  const decimals = Math.max(total.decimals, ...parts.map((p) => p.decimals));
  const halfUlp = 0.5 * 10 ** -decimals;
  const tolerance = Math.max(halfUlp * (parts.length + 1), total.value * 5e-4);
  return Math.abs(sum - total.value) <= tolerance + 1e-9;
}

function isCentredOver(total: Item, parts: readonly Item[]) {
  const start = parts[0]!.start;
  const end = parts[parts.length - 1]!.end;
  const span = end - start;
  if (span <= 0) return false;
  const centre = (start + end) / 2;
  return (
    Math.abs(total.along - centre) <=
    span * DIMENSION_CHAIN_RULES.centreTolerance
  );
}

function nearRow(total: Item, parts: readonly Item[]) {
  const across = parts[0]!.across;
  const thickness = Math.max(total.thickness, parts[0]!.thickness);
  const distance = Math.abs(total.across - across);
  return (
    distance > thickness * DIMENSION_CHAIN_RULES.rowTolerance &&
    distance <= thickness * DIMENSION_CHAIN_RULES.maxRowDistance
  );
}

/**
 * Finds every written overall dimension whose parts — a contiguous run of
 * a parallel row with the same written unit — add up to it, plus near
 * misses. Pure and deterministic.
 */
export function analyzeDimensionChains(
  measurements: readonly RecognizedMeasurement[],
): { chains: DimensionChain[]; mismatches: DimensionChainMismatch[] } {
  const seen = new Set<string>();
  const items = measurements.flatMap((measurement) => {
    if (seen.has(measurement.id)) return [];
    seen.add(measurement.id);
    const item = itemOf(measurement);
    return item ? [item] : [];
  });
  const rows = rowsOf(items).filter(
    (row) => row.length <= DIMENSION_CHAIN_RULES.maxRowItems,
  );
  const chains: DimensionChain[] = [];
  const mismatches: DimensionChainMismatch[] = [];
  const usedTotals = new Set<string>();

  for (const row of rows) {
    if (row.length < 2) continue;
    // Every contiguous run of at least two parts, longest first.
    const runs: Item[][] = [];
    for (let length = row.length; length >= 2; length -= 1)
      for (let from = 0; from + length <= row.length; from += 1) {
        const run = row.slice(from, from + length);
        if (run.every((part) => part.unit === run[0]!.unit)) runs.push(run);
      }
    const totals = items.filter(
      (candidate) =>
        candidate.page === row[0]!.page &&
        candidate.axis === row[0]!.axis &&
        !row.includes(candidate),
    );
    for (const run of runs) {
      const sum = run.reduce((total, part) => total + part.value, 0);
      const total = totals.find(
        (candidate) =>
          !usedTotals.has(candidate.measurement.id) &&
          candidate.unit === run[0]!.unit &&
          nearRow(candidate, run) &&
          isCentredOver(candidate, run) &&
          writtenEqual(sum, run, candidate),
      );
      if (!total) continue;
      usedTotals.add(total.measurement.id);
      chains.push({
        kind: 'dimension-chain',
        axis: row[0]!.axis,
        totalMeasurementId: total.measurement.id,
        partMeasurementIds: run.map((part) => part.measurement.id),
        sum: Number(sum.toFixed(6)),
      });
    }
    // A whole row that nearly matches a centred total: a probable misread.
    const sum = row.reduce((total, part) => total + part.value, 0);
    const near = totals.find(
      (candidate) =>
        !usedTotals.has(candidate.measurement.id) &&
        candidate.unit === row[0]!.unit &&
        nearRow(candidate, row) &&
        isCentredOver(candidate, row) &&
        !writtenEqual(sum, row, candidate) &&
        Math.abs(sum - candidate.value) / candidate.value <=
          DIMENSION_CHAIN_RULES.mismatchRatio,
    );
    if (near)
      mismatches.push({
        code: 'dimension-chain-mismatch',
        totalMeasurementId: near.measurement.id,
        partMeasurementIds: row.map((part) => part.measurement.id),
        sum: Number(sum.toFixed(6)),
        total: near.value,
      });
  }
  return { chains, mismatches };
}
