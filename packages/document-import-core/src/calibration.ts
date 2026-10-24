import { engineRef, MANUAL_UNDERLAY_ENGINE } from './engines';
import type {
  DraftPoint,
  DraftSegment,
  NumericRoofField,
  PageUnit,
  RecognitionResult,
  RecognizedMeasurement,
} from './model';
import { isAngleField } from './model';

/**
 * Manual mode: the user marks points on the document underlay. A scale is
 * established either from two points and a known real length, or — for a
 * vector PDF page — from the drawing scale the document states (1:n). Every
 * measured value is then a `manual` measurement with its own segment, so the
 * review can show exactly what was measured.
 */

export interface PagePoint {
  page: number;
  x: number;
  y: number;
}

export interface ScaleCalibration {
  page: number;
  /** Real millimetres per page unit. */
  mmPerUnit: number;
  source: 'two-points' | 'drawing-scale';
  from?: PagePoint;
  to?: PagePoint;
  knownLengthMm?: number;
  scaleDenominator?: number;
}

/** Below this on-page distance a click pair cannot define a reliable scale. */
export const MIN_CALIBRATION_DISTANCE = 20;

/** PDF user space is 1/72 inch per unit. */
export const PDF_POINT_MM = 25.4 / 72;

export function pageDistance(a: PagePoint, b: PagePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export type CalibrationResult =
  | { status: 'ok'; calibration: ScaleCalibration }
  | {
      status: 'rejected';
      reason: 'different-pages' | 'points-too-close' | 'invalid-length';
    };

export function calibrateFromPoints(
  from: PagePoint,
  to: PagePoint,
  knownLengthMm: number,
): CalibrationResult {
  if (from.page !== to.page)
    return { status: 'rejected', reason: 'different-pages' };
  if (!Number.isFinite(knownLengthMm) || knownLengthMm <= 0)
    return { status: 'rejected', reason: 'invalid-length' };
  const distance = pageDistance(from, to);
  if (distance < MIN_CALIBRATION_DISTANCE)
    return { status: 'rejected', reason: 'points-too-close' };
  return {
    status: 'ok',
    calibration: {
      page: from.page,
      mmPerUnit: knownLengthMm / distance,
      source: 'two-points',
      from,
      to,
      knownLengthMm,
    },
  };
}

/**
 * A stated drawing scale applies only to a vector PDF page, whose units are
 * physical points. A raster image has no physical size, so it always needs
 * a two-point calibration.
 */
export function calibrateFromDrawingScale(
  page: number,
  pageUnit: PageUnit,
  denominator: number,
): ScaleCalibration | undefined {
  if (pageUnit !== 'pt' || !Number.isFinite(denominator) || denominator < 1)
    return undefined;
  return {
    page,
    mmPerUnit: PDF_POINT_MM * denominator,
    source: 'drawing-scale',
    scaleDenominator: denominator,
  };
}

export function measureMm(
  from: PagePoint,
  to: PagePoint,
  calibration: ScaleCalibration,
): number | undefined {
  if (from.page !== calibration.page || to.page !== calibration.page)
    return undefined;
  return pageDistance(from, to) * calibration.mmPerUnit;
}

export interface ManualMeasurementInput {
  id: string;
  field: NumericRoofField;
  from: PagePoint;
  to: PagePoint;
}

/**
 * Manual measurements as a recognition result. Pitch cannot be measured on
 * a plan view, so only length fields are accepted here; values are rounded
 * to whole millimetres to avoid presenting click noise as precision.
 */
export function manualMeasurementResult(
  calibration: ScaleCalibration,
  inputs: readonly ManualMeasurementInput[],
): RecognitionResult {
  const points: DraftPoint[] = [];
  const segments: DraftSegment[] = [];
  const measurements: RecognizedMeasurement[] = [];
  const relations: NonNullable<RecognitionResult['relations']> = [];
  if (calibration.from && calibration.to) {
    points.push(
      { id: 'calibration:from', ...calibration.from },
      { id: 'calibration:to', ...calibration.to },
    );
    segments.push({
      id: 'calibration',
      page: calibration.page,
      from: { x: calibration.from.x, y: calibration.from.y },
      to: { x: calibration.to.x, y: calibration.to.y },
      role: 'calibration',
    });
  }
  for (const input of inputs) {
    if (isAngleField(input.field)) continue;
    const valueMm = measureMm(input.from, input.to, calibration);
    if (valueMm === undefined) continue;
    const rounded = Math.round(valueMm);
    const segmentId = `${input.id}:segment`;
    segments.push({
      id: segmentId,
      page: calibration.page,
      from: { x: input.from.x, y: input.from.y },
      to: { x: input.to.x, y: input.to.y },
      role: 'measurement',
    });
    const minX = Math.min(input.from.x, input.to.x);
    const minY = Math.min(input.from.y, input.to.y);
    measurements.push({
      id: input.id,
      field: input.field,
      quantity: 'length',
      raw: { text: `${rounded} mm`, value: rounded, unit: 'mm' },
      valueMm: rounded,
      unitBasis: 'calibrated',
      region: {
        page: calibration.page,
        box: {
          x: minX,
          y: minY,
          width: Math.abs(input.to.x - input.from.x),
          height: Math.abs(input.to.y - input.from.y),
        },
      },
      // A click on an underlay through a scale is honest evidence but never
      // exact, and prints are often resized: a scaled value stays low.
      confidence: 'low',
      evidence: ['manual-measurement'],
      engineId: MANUAL_UNDERLAY_ENGINE.id,
      mode: 'manual',
    });
    relations.push({ kind: 'measures', measurementId: input.id, segmentId });
  }
  return {
    engine: engineRef(MANUAL_UNDERLAY_ENGINE),
    measurements,
    points,
    segments,
    relations,
    warnings: [],
  };
}
