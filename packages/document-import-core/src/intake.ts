import {
  measurementValueSource,
  NUMERIC_ROOF_FIELDS,
  REQUIRED_ROOF_FIELDS,
  type Confidence,
  type DraftWarning,
  type FieldStatus,
  type ImportedRoofDraftV1,
  type NumericRoofField,
  type RecognitionMode,
  type SourceRegion,
  type UnitBasis,
  type ValueSource,
} from './model';

/**
 * VNext-6 intake summary: one honest count of what the document gave and
 * ONE next step, so the review never asks the user to inspect every field
 * in turn. It reads a derived draft and decides nothing: a value is
 * "recognised" only when it needs no further confirmation.
 */
export type IntakeItemKey = NumericRoofField | 'roofType';

export type IntakeItemState =
  /** Read with enough certainty that only the final review remains. */
  | 'recognized'
  /** Read and confirmed by the user. */
  | 'confirmed'
  /** Typed by the user. */
  | 'entered'
  /** Read, but uncertain: the user must confirm the exact value. */
  | 'to-confirm'
  /** Two written readings disagree: the user must pick one. */
  | 'conflict'
  /** Required and absent. */
  | 'missing'
  /** Optional and absent: a labelled RoofCalc default will be used. */
  | 'defaulted'
  /** The document names a roof RoofCalc does not calculate. */
  | 'unsupported';

export interface IntakeItem {
  key: IntakeItemKey;
  state: IntakeItemState;
  required: boolean;
  /** Page of the reading behind the value, when there is one. */
  page?: number;
}

export type IntakeNextStep =
  | { kind: 'unsupported-roof'; text: string }
  | { kind: 'choose-roof-type' }
  | { kind: 'confirm-roof-type' }
  | { kind: 'resolve-conflict'; field: NumericRoofField }
  | { kind: 'enter-value'; field: NumericRoofField }
  | { kind: 'confirm-value'; field: NumericRoofField }
  | { kind: 'final-review' }
  | { kind: 'create' };

export interface IntakeSummary {
  items: IntakeItem[];
  counts: {
    /** Recognised, confirmed or entered: nothing left to do but the review. */
    settled: number;
    toConfirm: number;
    missing: number;
    defaulted: number;
    unsupported: number;
    total: number;
  };
  next: IntakeNextStep;
}

const SETTLED: ReadonlySet<IntakeItemState> = new Set([
  'recognized',
  'confirmed',
  'entered',
]);

export function summarizeIntake(
  draft: ImportedRoofDraftV1,
  options: { reviewed: boolean },
): IntakeSummary {
  const byId = new Map(draft.measurements.map((item) => [item.id, item]));
  const roof = draft.roofType;
  const roofState: IntakeItemState = !roof.value
    ? roof.detected?.value === 'unsupported'
      ? 'unsupported'
      : 'missing'
    : roof.requiresConfirmation && !roof.confirmed
      ? 'to-confirm'
      : 'confirmed';
  const items: IntakeItem[] = [
    {
      key: 'roofType',
      state: roofState,
      required: true,
      ...(roof.detected?.region ? { page: roof.detected.region.page } : {}),
    },
  ];
  for (const field of NUMERIC_ROOF_FIELDS) {
    const state = draft.fields[field];
    const required = REQUIRED_ROOF_FIELDS.includes(field);
    const page = state.measurementId
      ? byId.get(state.measurementId)?.region?.page
      : undefined;
    items.push({
      key: field,
      state: fieldState(state.status, state, required),
      required,
      ...(page !== undefined && state.status !== 'user-entered'
        ? { page }
        : {}),
    });
  }
  const count = (states: readonly IntakeItemState[]) =>
    items.filter((item) => states.includes(item.state)).length;
  return {
    items,
    counts: {
      settled: items.filter((item) => SETTLED.has(item.state)).length,
      toConfirm: count(['to-confirm', 'conflict']),
      missing: count(['missing']),
      defaulted: count(['defaulted']),
      unsupported: count(['unsupported']),
      total: items.length,
    },
    next: nextStep(draft, items, options.reviewed),
  };
}

function fieldState(
  status: FieldStatus,
  state: ImportedRoofDraftV1['fields'][NumericRoofField],
  required: boolean,
): IntakeItemState {
  if (status === 'conflict') return 'conflict';
  if (status === 'user-entered') return 'entered';
  if (state.value === undefined) return required ? 'missing' : 'defaulted';
  if (state.requiresConfirmation && !state.confirmed) return 'to-confirm';
  return state.confirmed ? 'confirmed' : 'recognized';
}

/**
 * The order a careful person would work in: what blocks the roof at all,
 * then disagreements, then gaps, then uncertain values (required before
 * optional), then the final review.
 */
function nextStep(
  draft: ImportedRoofDraftV1,
  items: readonly IntakeItem[],
  reviewed: boolean,
): IntakeNextStep {
  const roof = items[0]!;
  if (roof.state === 'unsupported')
    return {
      kind: 'unsupported-roof',
      text: draft.roofType.detected?.text ?? '',
    };
  if (roof.state === 'missing') return { kind: 'choose-roof-type' };
  const fields = items.slice(1) as (IntakeItem & { key: NumericRoofField })[];
  const first = (state: IntakeItemState, required?: boolean) =>
    fields.find(
      (item) =>
        item.state === state &&
        (required === undefined || item.required === required),
    )?.key;
  const conflict = first('conflict', true) ?? first('conflict');
  if (conflict) return { kind: 'resolve-conflict', field: conflict };
  const missing = first('missing');
  if (missing) return { kind: 'enter-value', field: missing };
  if (roof.state === 'to-confirm') return { kind: 'confirm-roof-type' };
  const confirm = first('to-confirm', true) ?? first('to-confirm');
  if (confirm) return { kind: 'confirm-value', field: confirm };
  return reviewed ? { kind: 'create' } : { kind: 'final-review' };
}

/* ------------------------------------------------------------------------ */

/**
 * Everything known about where a field's value came from: the document
 * (by content fingerprint), the page and region, the engine, the unit basis,
 * the certainty level, the other readings and the warnings that name the
 * field. Presentation reads this; it never re-derives a source.
 */
export interface FieldProvenance {
  field: NumericRoofField;
  status: FieldStatus;
  value?: number;
  documentFingerprint?: string;
  page?: number;
  region?: SourceRegion;
  engine?: { id: string; mode: RecognitionMode };
  valueSource?: ValueSource;
  raw?: string;
  label?: string;
  unitBasis?: UnitBasis;
  confidence?: Confidence;
  alternatives: { id: string; page?: number; raw: string; value?: number }[];
  warnings: DraftWarning[];
}

export function fieldProvenance(
  draft: ImportedRoofDraftV1,
  field: NumericRoofField,
): FieldProvenance {
  const state = draft.fields[field];
  const byId = new Map(draft.measurements.map((item) => [item.id, item]));
  const measurement =
    state.status !== 'user-entered' && state.measurementId
      ? byId.get(state.measurementId)
      : undefined;
  return {
    field,
    status: state.status,
    ...(state.value !== undefined ? { value: state.value } : {}),
    ...(draft.source.fingerprint
      ? { documentFingerprint: draft.source.fingerprint }
      : {}),
    ...(measurement?.region
      ? { page: measurement.region.page, region: measurement.region }
      : {}),
    ...(measurement
      ? {
          engine: { id: measurement.engineId, mode: measurement.mode },
          valueSource: measurementValueSource(measurement),
          raw: measurement.raw.text,
          ...(measurement.label ? { label: measurement.label.text } : {}),
        }
      : {}),
    ...(state.unitBasis ? { unitBasis: state.unitBasis } : {}),
    ...(state.confidence ? { confidence: state.confidence } : {}),
    alternatives: state.alternatives.flatMap((id) => {
      const item = byId.get(id);
      if (!item) return [];
      const value = item.quantity === 'angle' ? item.valueDeg : item.valueMm;
      return [
        {
          id,
          raw: item.raw.text,
          ...(item.region ? { page: item.region.page } : {}),
          ...(value !== undefined ? { value } : {}),
        },
      ];
    }),
    warnings: draft.warnings.filter(
      (warning) => 'field' in warning && warning.field === field,
    ),
  };
}
