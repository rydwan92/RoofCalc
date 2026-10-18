import { analyzeDimensionChains, type DimensionChain } from './chains';
import {
  IMPORTED_ROOF_DRAFT_SCHEMA_VERSION,
  measurementValueSource,
  NUMERIC_ROOF_FIELDS,
  REQUIRED_ROOF_FIELDS,
  type Confidence,
  type DraftField,
  type DraftWarning,
  type EvidenceCode,
  type ImportedRoofDraftV1,
  type ImportRoofType,
  type ImportSource,
  type LengthUnit,
  type NumericRoofField,
  type RecognitionResult,
  type RecognizedMeasurement,
  type ValueSource,
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
  source: ValueSource;
  chainTotal: boolean;
}

function candidatesFor(
  field: NumericRoofField,
  measurements: readonly RecognizedMeasurement[],
  documentUnit: ImportedRoofDraftV1['documentUnit'],
  warnings: DraftWarning[],
  chainTotalIds: ReadonlySet<string>,
): Resolved[] {
  const resolved: Resolved[] = [];
  // The same dimension drawn at the stated scale (vector-geometry engine).
  const drawnReferenceMm = measurements.find(
    (measurement) =>
      measurement.mode === 'vector-geometry' && measurement.field === field,
  )?.valueMm;
  for (const measurement of measurements) {
    // Dimension-first: a length measured automatically off the drawing
    // cross-checks written dimensions and never fills a field itself.
    if (measurement.mode === 'vector-geometry') continue;
    const assigned = measurement.field === field;
    const unlabelledLength =
      measurement.field === undefined &&
      fieldQuantity(field) === 'length' &&
      (field === 'buildingLength' || field === 'buildingWidth');
    if (!assigned && !unlabelledLength) continue;
    const result = resolveMeasurementValue(
      measurement,
      field,
      documentUnit,
      drawnReferenceMm,
    );
    if (result.status === 'ambiguous' && assigned)
      warnings.push({
        code: 'unit-ambiguous',
        field,
        rawText: measurement.raw.text,
      });
    if (result.status !== 'resolved') continue;
    // Unlabelled numbers are offered only where they are plausible.
    if (!assigned && !isPlausible(field, result.value)) continue;
    resolved.push({
      measurement,
      value: result.value,
      basis: result.basis,
      source: measurementValueSource(measurement),
      chainTotal: chainTotalIds.has(measurement.id),
    });
  }
  return resolved.sort(
    (a, b) =>
      // Written beats scaled, whatever its label.
      Number(b.source === 'written') - Number(a.source === 'written') ||
      Number(b.measurement.field === field) -
        Number(a.measurement.field === field) ||
      Number(b.chainTotal) - Number(a.chainTotal) ||
      RANK[b.measurement.confidence] - RANK[a.measurement.confidence] ||
      b.measurement.evidence.length - a.measurement.evidence.length,
  );
}

function effectiveConfidence(resolved: Resolved): Confidence {
  // A value measured through a scale is never more than a stand-in.
  if (resolved.source === 'scaled') return 'low';
  // A unit guessed from a plausible range can never make a value certain.
  if (resolved.basis === 'plausible-range') return 'low';
  // A written number whose unit the drawing at scale independently confirms
  // gains one level: two separate sources agree.
  if (resolved.basis === 'drawing-scale')
    return resolved.measurement.confidence === 'low' ? 'medium' : 'high';
  // An unlabelled overall dimension that its written parts add up to is
  // more than a stray number: two written facts agree.
  if (resolved.chainTotal && resolved.measurement.confidence === 'low')
    return 'medium';
  return resolved.measurement.confidence;
}

/**
 * Building length and width from dimension chains when nothing labels
 * them: the largest overall dimension of each axis; the larger of the two
 * axes is the length. One axis alone suggests only the length.
 */
function chainSuggestions(
  chains: readonly DimensionChain[],
  lengthCandidates: readonly Resolved[],
  widthCandidates: readonly Resolved[],
): Partial<Record<NumericRoofField, string>> {
  const largest = (candidates: readonly Resolved[]) => {
    const byAxis = new Map<string, Resolved>();
    for (const chain of chains) {
      const total = candidates.find(
        (item) =>
          item.measurement.id === chain.totalMeasurementId &&
          item.source === 'written',
      );
      const current = byAxis.get(chain.axis);
      if (total && (!current || total.value > current.value))
        byAxis.set(chain.axis, total);
    }
    return [...byAxis.entries()].sort((a, b) => b[1].value - a[1].value);
  };
  const forLength = largest(lengthCandidates);
  const [first] = forLength;
  if (!first) return {};
  const suggestions: Partial<Record<NumericRoofField, string>> = {
    buildingLength: first[1].measurement.id,
  };
  const other = largest(widthCandidates).find(([axis]) => axis !== first[0]);
  if (other) suggestions.buildingWidth = other[1].measurement.id;
  return suggestions;
}

function deriveField(
  field: NumericRoofField,
  candidates: readonly Resolved[],
  decisions: ImportDecisions,
  suggestedId: string | undefined,
  warnings: DraftWarning[],
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
  const written = candidates.filter((item) => item.source === 'written');
  const labelled = written.filter((item) => item.measurement.field === field);
  const suggested = suggestedId
    ? written.find((item) => item.measurement.id === suggestedId)
    : undefined;
  // Dimension-first: a labelled written value, then an overall dimension
  // from a chain, then any written number; a scaled value only last.
  const best =
    chosen ?? labelled[0] ?? suggested ?? written[0] ?? candidates[0];
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
  if (best.source === 'scaled')
    warnings.push({ code: 'scaled-value-only', field });
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
  const recognized = input.results.flatMap((result) => result.measurements);
  // Dimension chains are a draft-level analysis over every written number,
  // whichever engine read it (text layer, OCR or the user's transcription).
  const { chains, mismatches } = analyzeDimensionChains(recognized);
  const chainTotalIds = new Set(
    chains.map((chain) => chain.totalMeasurementId),
  );
  const chainPartIds = new Set(
    chains.flatMap((chain) => chain.partMeasurementIds),
  );
  const measurements = recognized.map((measurement) => {
    const extra: EvidenceCode[] = [];
    if (chainTotalIds.has(measurement.id)) extra.push('chain-total');
    if (chainPartIds.has(measurement.id)) extra.push('chain-part');
    return extra.length
      ? { ...measurement, evidence: [...measurement.evidence, ...extra] }
      : measurement;
  });
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
  const warnings: DraftWarning[] = [
    ...input.results.flatMap((result) => result.warnings),
    ...mismatches,
  ];

  const candidates = Object.fromEntries(
    NUMERIC_ROOF_FIELDS.map((field) => [
      field,
      candidatesFor(field, measurements, documentUnit, warnings, chainTotalIds),
    ]),
  ) as Record<NumericRoofField, Resolved[]>;
  const suggestions = chainSuggestions(
    chains,
    candidates.buildingLength,
    candidates.buildingWidth,
  );
  const fields = Object.fromEntries(
    NUMERIC_ROOF_FIELDS.map((field) => [
      field,
      deriveField(
        field,
        candidates[field],
        decisions,
        suggestions[field],
        warnings,
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
    relations: [
      ...input.results.flatMap((result) => result.relations ?? []),
      ...chains,
    ],
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

/**
 * VNext-3: the readings that make a field a conflict — the selected one
 * first, then every other reading labelled for the same field with another
 * value — so the review can show them side by side and one click decides.
 * Empty when the field is not in conflict. Readings without a known unit
 * value are left to the "other readings" menu.
 */
export function conflictingReadings(
  draft: ImportedRoofDraftV1,
  field: NumericRoofField,
): RecognizedMeasurement[] {
  const state = draft.fields[field];
  if (state.status !== 'conflict' || state.value === undefined) return [];
  const byId = new Map(draft.measurements.map((item) => [item.id, item]));
  const selected = state.measurementId
    ? byId.get(state.measurementId)
    : undefined;
  if (!selected) return [];
  const valueOf = (item: RecognizedMeasurement) =>
    item.quantity === 'angle' ? item.valueDeg : item.valueMm;
  const seen = [state.value];
  const others: RecognizedMeasurement[] = [];
  for (const id of state.alternatives) {
    const item = byId.get(id);
    const value = item ? valueOf(item) : undefined;
    if (!item || item.field !== field || value === undefined) continue;
    if (seen.some((known) => sameValue(known, value))) continue;
    seen.push(value);
    others.push(item);
  }
  return [selected, ...others];
}
