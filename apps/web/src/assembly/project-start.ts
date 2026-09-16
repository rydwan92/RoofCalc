import {
  clampCollarTieHeightMm,
  convertRoofTemplate,
  maxCollarTieHeightMm,
  roofTemplateSchema,
} from '@cieslacalc/roof-math';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import type {
  RidgeConnectionType,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import { workbenchProjectResolver } from './workbench-project';

export interface ProjectStartValues {
  roofType: RoofTemplateSpec['type'];
  buildingLengthMm: number;
  buildingWidthMm: number;
  pitchDeg: number;
  eaveOverhangMm: number;
  rafterSpacingMm: number;
  /** V37 construction step; absent keeps the base template value. */
  rafterWidthMm?: number;
  rafterDepthMm?: number;
  structureSystem?: 'rafter' | 'rafter-collar-tie';
  ridgeConnection?: RidgeConnectionType;
}

export function projectStartValuesFromTemplate(
  template: RoofTemplateSpec,
): ProjectStartValues {
  return {
    roofType: template.type,
    buildingLengthMm: template.buildingLengthMm,
    buildingWidthMm: template.halfRunMm * 2,
    pitchDeg: template.pitchDeg,
    eaveOverhangMm: template.eaveOverhangMm,
    rafterSpacingMm: template.rafterSpacing.spacingMm,
    rafterWidthMm: template.rafterSection.widthMm,
    rafterDepthMm: template.rafterSection.depthMm,
    structureSystem:
      template.type === 'gable'
        ? (template.structure?.system ?? 'rafter')
        : 'rafter',
    ridgeConnection: template.ridge.connection ?? 'ridge-board',
  };
}

/**
 * Maps friendly building dimensions onto the one existing canonical roof
 * template. Building width is never persisted separately from halfRunMm.
 */
export function createProjectStartTemplate(
  values: ProjectStartValues,
  base: RoofTemplateSpec,
): RoofTemplateSpec {
  const converted = convertRoofTemplate(base, values.roofType);
  const halfRunMm = values.buildingWidthMm / 2;
  const next = {
    ...converted,
    buildingLengthMm: values.buildingLengthMm,
    halfRunMm,
    pitchDeg: values.pitchDeg,
    eaveOverhangMm: values.eaveOverhangMm,
    rafterSpacing: {
      ...converted.rafterSpacing,
      spacingMm: values.rafterSpacingMm,
    },
    rafterSection: {
      widthMm: values.rafterWidthMm ?? converted.rafterSection.widthMm,
      depthMm: values.rafterDepthMm ?? converted.rafterSection.depthMm,
    },
    ridge: {
      ...converted.ridge,
      // Write intent only when it changes the effective value, so an
      // unchanged hand-off produces exactly the same canonical document.
      ...(values.ridgeConnection &&
      values.ridgeConnection !== (converted.ridge.connection ?? 'ridge-board')
        ? { connection: values.ridgeConnection }
        : {}),
    },
  } as RoofTemplateSpec;
  if (
    next.type === 'gable' &&
    values.structureSystem &&
    values.structureSystem !== (next.structure?.system ?? 'rafter')
  ) {
    next.structure =
      values.structureSystem === 'rafter-collar-tie'
        ? {
            system: 'rafter-collar-tie',
            collarTie: {
              heightAboveWallPlateMm: clampCollarTieHeightMm(
                halfRunMm,
                values.pitchDeg,
                next.structure?.collarTie?.heightAboveWallPlateMm ??
                  maxCollarTieHeightMm(halfRunMm, values.pitchDeg) / 2,
              ),
              section: next.structure?.collarTie?.section ?? {
                widthMm: 100,
                depthMm: 38,
              },
            },
          }
        : { system: 'rafter' };
  }
  return roofTemplateSchema.parse(next);
}

export type ProjectStartField =
  | 'buildingLength'
  | 'buildingWidth'
  | 'pitch'
  | 'eave'
  | 'spacing'
  | 'rafterWidth'
  | 'rafterDepth';

export interface ProjectStartIssue {
  field: ProjectStartField;
  code:
    'required' | 'range' | 'hip-length-below-width' | 'spacing-exceeds-length';
  min?: number;
  max?: number;
}

type DraftNumbers = Partial<Record<ProjectStartField, number | null>> & {
  roofType: RoofTemplateSpec['type'];
};

/** Canonical schema ranges (roof-math), expressed per field in millimetres. */
export const PROJECT_START_LIMITS: Record<
  ProjectStartField,
  { min: number; max: number }
> = {
  buildingLength: { min: 1, max: 100_000 },
  buildingWidth: { min: 2, max: 200_000 },
  pitch: { min: 1, max: 80 },
  eave: { min: 0, max: 10_000 },
  spacing: { min: 1, max: 100_000 },
  rafterWidth: { min: 1, max: 1000 },
  rafterDepth: { min: 1, max: 2000 },
};

/**
 * Field-specific guidance instead of one generic "invalid" message. Pure and
 * unit-agnostic (canonical mm / degrees); the view formats the numbers.
 */
export function validateProjectStart(
  draft: DraftNumbers,
  fields: readonly ProjectStartField[],
): ProjectStartIssue[] {
  const issues: ProjectStartIssue[] = [];
  for (const field of fields) {
    const value = draft[field];
    if (value === null || value === undefined) {
      issues.push({ field, code: 'required' });
      continue;
    }
    const { min, max } = PROJECT_START_LIMITS[field];
    if (value < min || value > max)
      issues.push({ field, code: 'range', min, max });
  }
  const length = draft.buildingLength;
  const width = draft.buildingWidth;
  if (
    draft.roofType === 'hip' &&
    fields.includes('buildingLength') &&
    typeof length === 'number' &&
    typeof width === 'number' &&
    length < width &&
    !issues.some((issue) => issue.field === 'buildingLength')
  )
    issues.push({ field: 'buildingLength', code: 'hip-length-below-width' });
  const spacing = draft.spacing;
  if (
    fields.includes('spacing') &&
    typeof spacing === 'number' &&
    typeof length === 'number' &&
    spacing > length &&
    !issues.some((issue) => issue.field === 'spacing')
  )
    issues.push({ field: 'spacing', code: 'spacing-exceeds-length' });
  return issues;
}

export type ReadinessState = 'ready' | 'limited' | 'unavailable';
export interface ProjectStartReadiness {
  geometry: ReadinessState;
  construction: ReadinessState;
  k1Cutting: ReadinessState;
  /** Explicit limitation the user must know before entering the project. */
  notes: Array<
    'half-lap-unmodelled' | 'collar-tie-gable-only' | 'geometry-invalid'
  >;
}

/**
 * Final-step readiness from the same resolver, schedule and K1 adapter the
 * workbench uses — no preview-only rules. Never claims structural safety.
 */
export function deriveProjectStartReadiness(
  template: RoofTemplateSpec,
): ProjectStartReadiness {
  try {
    const projection = workbenchProjectResolver.resolve(template);
    const schedule = createRoofMemberSchedule({
      skeleton: projection.skeleton,
    });
    const k1 = createK1CuttingRequirement(projection.resolved, schedule);
    const notes: ProjectStartReadiness['notes'] = [];
    if (template.ridge.connection === 'half-lap')
      notes.push('half-lap-unmodelled');
    return {
      geometry: projection.skeleton.members.length ? 'ready' : 'unavailable',
      construction: schedule.timberRows.length ? 'ready' : 'limited',
      k1Cutting: k1.status === 'resolved' ? 'ready' : 'unavailable',
      notes,
    };
  } catch {
    return {
      geometry: 'unavailable',
      construction: 'unavailable',
      k1Cutting: 'unavailable',
      notes: ['geometry-invalid'],
    };
  }
}
