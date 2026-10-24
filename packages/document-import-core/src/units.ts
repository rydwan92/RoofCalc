import type {
  LengthUnit,
  NumericRoofField,
  RecognizedMeasurement,
  UnitBasis,
} from './model';
import { isAngleField } from './model';
import { LENGTH_UNIT_MM } from './tokens';

/**
 * Plausibility ranges for values read from a document — canonical mm, and
 * degrees for pitch. They are NOT RoofCalc's canonical validation (the
 * project start and `roofTemplateSchema` remain the only gate); they only
 * decide which unit an unlabelled number most likely uses and flag readings
 * that look wrong, e.g. "1240" read as millimetres for a building length.
 */
export const PLAUSIBLE_RANGES: Record<
  NumericRoofField,
  { min: number; max: number }
> = {
  buildingLength: { min: 2_000, max: 80_000 },
  buildingWidth: { min: 2_000, max: 40_000 },
  pitch: { min: 3, max: 75 },
  rightPitch: { min: 3, max: 75 },
  eave: { min: 0, max: 1_500 },
  spacing: { min: 300, max: 1_500 },
  rafterWidth: { min: 30, max: 300 },
  rafterDepth: { min: 80, max: 400 },
};

/** A written number agrees with a drawn length within this ratio. */
export const DRAWING_UNIT_AGREEMENT = 0.02;

/** Equal canonical values within this relative tolerance are the same value. */
export const SAME_VALUE_TOLERANCE = 0.005;

export function sameValue(a: number, b: number): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) <= scale * SAME_VALUE_TOLERANCE;
}

export function isPlausible(field: NumericRoofField, value: number): boolean {
  const range = PLAUSIBLE_RANGES[field];
  return value >= range.min && value <= range.max;
}

export function fieldQuantity(field: NumericRoofField): 'length' | 'angle' {
  return isAngleField(field) ? 'angle' : 'length';
}

export type ResolvedValue =
  | { status: 'resolved'; value: number; basis: UnitBasis }
  | { status: 'ambiguous' }
  | { status: 'unresolved' };

/** Which units make an unlabelled number plausible for a field. */
export function plausibleUnits(
  field: NumericRoofField,
  rawValue: number,
): LengthUnit[] {
  return (['mm', 'cm', 'm'] as const).filter((unit) =>
    isPlausible(field, rawValue * LENGTH_UNIT_MM[unit]),
  );
}

/**
 * Canonical value of a measurement *for a given field*. Order of authority:
 * the measurement's own unit (explicit or calibrated), then a unit the user
 * chose for the document, then a unit the document declares, then the one
 * unit that makes the number equal to the same line drawn at scale, and
 * only then the single unit under which the number is plausible.
 */
export function resolveMeasurementValue(
  measurement: RecognizedMeasurement,
  field: NumericRoofField,
  documentUnit?: { unit: LengthUnit; basis: 'document' | 'user' },
  /** The same dimension drawn at the stated scale, when one exists. */
  drawnReferenceMm?: number,
): ResolvedValue {
  if (fieldQuantity(field) !== measurement.quantity)
    return { status: 'unresolved' };
  if (measurement.quantity === 'angle')
    return measurement.valueDeg === undefined
      ? { status: 'unresolved' }
      : {
          status: 'resolved',
          value: measurement.valueDeg,
          basis: measurement.unitBasis ?? 'explicit',
        };
  if (measurement.valueMm !== undefined)
    return {
      status: 'resolved',
      value: measurement.valueMm,
      basis: measurement.unitBasis ?? 'explicit',
    };
  if (documentUnit)
    return {
      status: 'resolved',
      value: measurement.raw.value * LENGTH_UNIT_MM[documentUnit.unit],
      basis:
        documentUnit.basis === 'user' ? 'user-declared' : 'document-declared',
    };
  // The drawing decides between units when exactly one of them makes the
  // written number equal to the line drawn at scale.
  if (drawnReferenceMm !== undefined && drawnReferenceMm > 0) {
    const matching = (['mm', 'cm', 'm'] as const).filter(
      (unit) =>
        Math.abs(
          measurement.raw.value * LENGTH_UNIT_MM[unit] - drawnReferenceMm,
        ) /
          drawnReferenceMm <=
        DRAWING_UNIT_AGREEMENT,
    );
    if (matching.length === 1)
      return {
        status: 'resolved',
        value: measurement.raw.value * LENGTH_UNIT_MM[matching[0]!],
        basis: 'drawing-scale',
      };
  }
  const units = plausibleUnits(field, measurement.raw.value);
  if (units.length === 1)
    return {
      status: 'resolved',
      value: measurement.raw.value * LENGTH_UNIT_MM[units[0]!],
      basis: 'plausible-range',
    };
  return units.length > 1 ? { status: 'ambiguous' } : { status: 'unresolved' };
}
