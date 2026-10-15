import {
  IMPORTED_ROOF_DRAFT_SCHEMA_VERSION,
  NUMERIC_ROOF_FIELDS,
  REQUIRED_ROOF_FIELDS,
  type Confidence,
  type DraftField,
  type DraftWarning,
  type ImportedRoofDraftV1,
  type ImportRoofType,
  type ImportSource,
  type LengthUnit,
  type NumericRoofField,
  type RecognitionResult,
  type RecognizedMeasurement,
} from './model';
import {
  fieldQuantity,
  isPlausible,
  PLAUSIBLE_RANGES,
  resolveMeasurementValue,
  sameValue,
} from './units';

/**
 * The user's decisions during review. The draft is always *derived* from
 * engine results plus these decisions, so changing the document unit or
 * picking another candidate never loses what the user already typed.
 */
export interface ImportDecisions {
  documentUnit?: LengthUnit;
  roofType?: ImportRoofType;
  roofTypeConfirmed?: boolean;
  /** Field → chosen measurement id. */
  choices: Partial<Record<NumericRoofField, string>>;
  /** Field → value typed by the user (canonical mm, degrees for pitch). */
  entries: Partial<Record<NumericRoofField, number>>;
  /** Field → the value key that was confirmed (see `valueKey`). */
  confirmed: Partial<Record<NumericRoofField, string>>;
}

export const EMPTY_DECISIONS: ImportDecisions = {
  choices: {},
  entries: {},
  confirmed: {},
};

const RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

/** Identity of a displayed value; a confirmation is bound to it. */
export function valueKey(field: DraftField): string | undefined {
  if (field.value === undefined) return undefined;
  return field.status === 'user-entered'
    ? `entry:${field.value}`
    : `measurement:${field.measurementId}:${field.value}`;
}

interface Resolved {
  measurement: RecognizedMeasurement;
  value: number;
  basis: NonNullable<DraftField['unitBasis']>;
}

function candidatesFor(
  field: NumericRoofField,
  measurements: readonly RecognizedMeasurement[],
  documentUnit: ImportedRoofDraftV1['documentUnit'],
  warnings: DraftWarning[],
): Resolved[] {
  const resolved: Resolved[] = [];
  for (const measurement of measurements) {
    const assigned = measurement.field === field;
    const unlabelledLength =
      measurement.field === undefined &&
      fieldQuantity(field) === 'length' &&
      (field === 'buildingLength' || field === 'buildingWidth');
    if (!assigned && !unlabelledLength) continue;
    const result = resolveMeasurementValue(measurement, field, documentUnit);
    if (result.status === 'ambiguous' && assigned)
      warnings.push({
        code: 'unit-ambiguous',
        field,
        rawText: measurement.raw.text,
      });
    if (result.status !== 'resolved') continue;
    // Unlabelled numbers are offered only where they are plausible.
    if (!assigned && !isPlausible(field, result.value)) continue;
    resolved.push({ measurement, value: result.value, basis: result.basis });
  }
  return resolved.sort(
    (a, b) =>
      Number(b.measurement.field === field) -
        Number(a.measurement.field === field) ||
      RANK[b.measurement.confidence] - RANK[a.measurement.confidence] ||
      b.measurement.evidence.length - a.measurement.evidence.length,
  );
}

function effectiveConfidence(resolved: Resolved): Confidence {
  // A unit guessed from a plausible range can never make a value certain.
  if (resolved.basis === 'plausible-range') return 'low';
  return resolved.measurement.confidence;
}

function deriveField(
  field: NumericRoofField,
  candidates: readonly Resolved[],
  decisions: ImportDecisions,
): DraftField {
  const entry = decisions.entries[field];
  const alternatives = candidates.map((item) => item.measurement.id);
  if (entry !== undefined && Number.isFinite(entry))
    return {
      field,
      status: 'user-entered',
      value: entry,
      alternatives,
      requiresConfirmation: false,
      confirmed: true,
    };
  const chosenId = decisions.choices[field];
  const chosen = chosenId
    ? candidates.find((item) => item.measurement.id === chosenId)
    : undefined;
  const labelled = candidates.filter(
    (item) => item.measurement.field === field,
  );
  const best = chosen ?? labelled[0] ?? candidates[0];
  if (!best)
    return {
      field,
      status: 'missing',
      alternatives,
      requiresConfirmation: true,
      confirmed: false,
    };
  // Two labelled readings that disagree at the same confidence are a
  // conflict until the user picks one; a choice resolves it.
  const conflict =
    !chosen &&
    labelled.some(
      (other) =>
        other !== best &&
        RANK[other.measurement.confidence] ===
          RANK[best.measurement.confidence] &&
        !sameValue(other.value, best.value),
    );
  const confidence = effectiveConfidence(best);
  const draft: DraftField = {
    field,
    status: conflict ? 'conflict' : 'recognized',
    value: best.value,
    measurementId: best.measurement.id,
    alternatives: alternatives.filter((id) => id !== best.measurement.id),
    confidence,
    unitBasis: best.basis,
    // Only an explicitly labelled value with an explicit unit on the same
    // line skips the per-field check; it still passes the final review.
    requiresConfirmation: conflict || confidence !== 'high',
    confirmed: false,
  };
  const key = valueKey(draft);
  draft.confirmed = key !== undefined && decisions.confirmed[field] === key;
  return draft;
}

/**
 * Combines recognition results with the user's decisions into the versioned
 * intermediate model. Pure and deterministic: same input, same draft.
 */
export function deriveImportedRoofDraft(input: {
  source: ImportSource;
  results: readonly RecognitionResult[];
  decisions?: ImportDecisions;
}): ImportedRoofDraftV1 {
  const decisions = input.decisions ?? EMPTY_DECISIONS;
  const measurements = input.results.flatMap((result) => result.measurements);
  const declared = input.results.find(
    (result) => result.documentUnit,
  )?.documentUnit;
  const documentUnit: ImportedRoofDraftV1['documentUnit'] =
    decisions.documentUnit
      ? {
          unit: decisions.documentUnit,
          text: declared?.text ?? '',
          ...(declared?.region ? { region: declared.region } : {}),
          basis: 'user',
        }
      : declared
        ? { ...declared, basis: 'document' }
        : undefined;
  const warnings: DraftWarning[] = input.results.flatMap(
    (result) => result.warnings,
  );

  const fields = Object.fromEntries(
    NUMERIC_ROOF_FIELDS.map((field) => [
      field,
      deriveField(
        field,
        candidatesFor(field, measurements, documentUnit, warnings),
        decisions,
      ),
    ]),
  ) as Record<NumericRoofField, DraftField>;

  for (const field of NUMERIC_ROOF_FIELDS) {
    const state = fields[field];
    if (state.status === 'conflict')
      warnings.push({ code: 'conflicting-values', field });
    if (state.status === 'recognized' && state.unitBasis === 'plausible-range')
      warnings.push({ code: 'unit-inferred', field });
    if (state.value !== undefined && !isPlausible(field, state.value))
      warnings.push({
        code: 'value-outside-plausible-range',
        field,
        value: state.value,
        ...PLAUSIBLE_RANGES[field],
      });
  }

  const detected = input.results.find((result) => result.roofType)?.roofType;
  const roofTypeValue: ImportRoofType | undefined =
    decisions.roofType ??
    (detected && detected.value !== 'unsupported' ? detected.value : undefined);
  const roofType: ImportedRoofDraftV1['roofType'] = {
    ...(roofTypeValue ? { value: roofTypeValue } : {}),
    ...(detected ? { detected } : {}),
    requiresConfirmation: !decisions.roofType,
    confirmed: !!decisions.roofType || !!decisions.roofTypeConfirmed,
  };

  const length = fields.buildingLength.value;
  const width = fields.buildingWidth.value;
  if (length !== undefined && width !== undefined) {
    if (roofTypeValue === 'hip' && length < width)
      warnings.push({ code: 'hip-length-below-width' });
    else if (roofTypeValue !== 'hip' && width > length)
      warnings.push({ code: 'width-exceeds-length' });
  }

  const missing: ImportedRoofDraftV1['missing'] = [
    ...(roofTypeValue ? [] : ['roofType' as const]),
    ...REQUIRED_ROOF_FIELDS.filter(
      (field) => fields[field].value === undefined,
    ),
  ];

  return {
    schemaVersion: IMPORTED_ROOF_DRAFT_SCHEMA_VERSION,
    source: input.source,
    engines: input.results.map((result) => result.engine),
    ...(documentUnit ? { documentUnit } : {}),
    ...(() => {
      const scale = input.results.find((result) => result.scale)?.scale;
      return scale ? { scale } : {};
    })(),
    roofType,
    measurements,
    fields,
    points: input.results.flatMap((result) => result.points ?? []),
    segments: input.results.flatMap((result) => result.segments ?? []),
    relations: input.results.flatMap((result) => result.relations ?? []),
    warnings: dedupeWarnings(warnings),
    missing,
  };
}

function dedupeWarnings(warnings: readonly DraftWarning[]): DraftWarning[] {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = JSON.stringify(warning);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ---------------------------- decision helpers --------------------------- */

export function chooseMeasurement(
  decisions: ImportDecisions,
  field: NumericRoofField,
  measurementId: string,
): ImportDecisions {
  const entries = { ...decisions.entries };
  delete entries[field];
  return {
    ...decisions,
    choices: { ...decisions.choices, [field]: measurementId },
    entries,
  };
}

export function enterValue(
  decisions: ImportDecisions,
  field: NumericRoofField,
  value: number | undefined,
): ImportDecisions {
  const entries = { ...decisions.entries };
  if (value === undefined) delete entries[field];
  else entries[field] = value;
  return { ...decisions, entries };
}

export function confirmField(
  decisions: ImportDecisions,
  draft: ImportedRoofDraftV1,
  field: NumericRoofField,
): ImportDecisions {
  const key = valueKey(draft.fields[field]);
  if (!key) return decisions;
  return { ...decisions, confirmed: { ...decisions.confirmed, [field]: key } };
}
