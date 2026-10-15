import {
  NUMERIC_ROOF_FIELDS,
  REQUIRED_ROOF_FIELDS,
  type ImportedRoofDraftV1,
  type ImportRoofType,
  type NumericRoofField,
} from './model';

/**
 * The same parameter names as the web app's `ProjectStartValues`, so the
 * existing `createProjectStartTemplate` maps an import exactly like the
 * Creator and the IFC import. This package defines no roof geometry.
 */
export interface RoofStartParameters {
  roofType: ImportRoofType;
  buildingLengthMm: number;
  buildingWidthMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacingMm: number;
  rafterWidthMm: number;
  rafterDepthMm: number;
}

export const START_PARAMETER_OF: Record<
  NumericRoofField,
  Exclude<keyof RoofStartParameters, 'roofType'>
> = {
  buildingLength: 'buildingLengthMm',
  buildingWidth: 'buildingWidthMm',
  pitch: 'pitchDeg',
  eave: 'eaveOverhangMm',
  spacing: 'rafterSpacingMm',
  rafterWidth: 'rafterWidthMm',
  rafterDepth: 'rafterDepthMm',
};

export type ValueProvenance = 'document' | 'user' | 'roofcalc-default';

export type ImportBlocker =
  | { code: 'roof-type-missing' }
  | { code: 'roof-type-unsupported'; text: string }
  | { code: 'roof-type-unconfirmed' }
  | { code: 'value-missing'; field: NumericRoofField }
  | { code: 'value-unconfirmed'; field: NumericRoofField }
  | { code: 'value-conflict'; field: NumericRoofField }
  | { code: 'value-not-positive'; field: NumericRoofField };

export type ImportMapping =
  | {
      status: 'ready';
      values: RoofStartParameters;
      provenance: Record<NumericRoofField, ValueProvenance>;
    }
  | { status: 'blocked'; blockers: ImportBlocker[] };

/**
 * Turns a reviewed draft into project-start parameters, or explains exactly
 * why it cannot yet. Optional parameters the document does not state fall
 * back to the caller's RoofCalc defaults and are labelled as such; nothing
 * uncertain becomes a construction value without confirmation.
 */
export function mapDraftToRoofStart(
  draft: ImportedRoofDraftV1,
  defaults: Omit<RoofStartParameters, 'roofType'>,
): ImportMapping {
  const blockers: ImportBlocker[] = [];
  const roofType = draft.roofType.value;
  if (!roofType) {
    if (draft.roofType.detected?.value === 'unsupported')
      blockers.push({
        code: 'roof-type-unsupported',
        text: draft.roofType.detected.text,
      });
    else blockers.push({ code: 'roof-type-missing' });
  } else if (draft.roofType.requiresConfirmation && !draft.roofType.confirmed)
    blockers.push({ code: 'roof-type-unconfirmed' });

  const values = { ...defaults };
  const provenance = {} as Record<NumericRoofField, ValueProvenance>;
  for (const field of NUMERIC_ROOF_FIELDS) {
    const state = draft.fields[field];
    const key = START_PARAMETER_OF[field];
    if (state.value === undefined) {
      if (REQUIRED_ROOF_FIELDS.includes(field))
        blockers.push({ code: 'value-missing', field });
      provenance[field] = 'roofcalc-default';
      continue;
    }
    if (state.status === 'conflict')
      blockers.push({ code: 'value-conflict', field });
    else if (state.requiresConfirmation && !state.confirmed)
      blockers.push({ code: 'value-unconfirmed', field });
    if (!(state.value > 0) && field !== 'eave')
      blockers.push({ code: 'value-not-positive', field });
    values[key] = state.value;
    provenance[field] = state.status === 'user-entered' ? 'user' : 'document';
  }
  if (blockers.length || !roofType) return { status: 'blocked', blockers };
  return { status: 'ready', values: { roofType, ...values }, provenance };
}
