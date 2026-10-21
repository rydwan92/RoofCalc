import type {
  JourneyAction,
  JourneyStage,
  JourneyStageKey,
  ProjectJourney,
} from './project-journey';
import type {
  DocumentReadinessState,
  ProjectReadiness,
  ReadinessDocumentKind,
} from './project-readiness';
import type { ProjectStartValues } from './project-start';

/**
 * VNext-6 PROJECT PREPARATION — the compact "Przygotowanie projektu" card.
 *
 * Five groups a roofer recognises (structure and dimensions; covering and
 * layers; drainage and flashings; materials and costing; documents) and
 * ONE next step. It decides nothing: every state comes from the V53
 * journey and V47 readiness that the workbench already derives, plus what
 * an import reported about where each start value came from. No geometry,
 * no quantity and no price is computed here.
 */

/** Start values an import can supply; names match the project start. */
export type IntakeValueKey =
  | 'buildingLength'
  | 'buildingWidth'
  | 'pitch'
  | 'eave'
  | 'spacing'
  | 'rafterWidth'
  | 'rafterDepth';

export const INTAKE_VALUE_KEYS: readonly IntakeValueKey[] = [
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
];

export type IntakeValueSource = 'document' | 'user' | 'roofcalc-default';

/**
 * What an import gave the new project. Persisted only as the minimal
 * import-evidence sidecar (`projects/import-evidence.ts`): never the file,
 * never its text — just where each start value came from (ADR-012).
 */
export interface ImportIntakeReport {
  source: 'pdf' | 'image' | 'dxf' | 'ifc';
  fileName: string;
  /** Content fingerprint computed on the device, when the importer has one. */
  fingerprint?: string;
  values: Partial<Record<IntakeValueKey, IntakeValueSource>>;
  pagesRead?: number;
  pagesSkipped?: number;
  /** Time the device spent reading the document, ms. */
  readMs?: number;
}

/** Values that are construction-relevant and were NOT read or typed. */
export function intakeDefaults(report: ImportIntakeReport): IntakeValueKey[] {
  return INTAKE_VALUE_KEYS.filter(
    (key) => report.values[key] === 'roofcalc-default',
  );
}

/** The project-start values of a roof, keyed like an intake report. */
export function intakeValuesFromStart(
  values: ProjectStartValues,
): Partial<Record<IntakeValueKey, number>> {
  return {
    buildingLength: values.buildingLengthMm,
    buildingWidth: values.buildingWidthMm,
    pitch: values.pitchDeg,
    eave: values.eaveOverhangMm,
    spacing: values.rafterSpacingMm,
    ...(values.rafterWidthMm !== undefined
      ? { rafterWidth: values.rafterWidthMm }
      : {}),
    ...(values.rafterDepthMm !== undefined
      ? { rafterDepth: values.rafterDepthMm }
      : {}),
  };
}

/* ------------------------------------------------------------------------ */
/* VNext-6.1 review of the RoofCalc defaults an import left in the project.  */
/* Opening the editor is NOT a confirmation: only the explicit "Potwierdzam" */
/* records the exact values; a confirmation applies to those values only.   */
/* ------------------------------------------------------------------------ */

export interface IntakeReviewState {
  /** The user opened the editor for these values at least once. */
  opened: boolean;
  /** Field → the exact value the user confirmed. */
  confirmed: Partial<Record<IntakeValueKey, number>>;
}

export type IntakeFieldReviewState =
  /** Still the RoofCalc default nobody confirmed. */
  | 'needs-review'
  /** The user confirmed exactly this value. */
  | 'confirmed'
  /** The user set another value — their own decision now. */
  | 'changed';

export interface IntakeReview {
  status: 'needs-review' | 'reviewing' | 'reviewed';
  fields: {
    key: IntakeValueKey;
    value: number;
    state: IntakeFieldReviewState;
  }[];
  pending: IntakeValueKey[];
}

const SAME = 1e-6;
const same = (a: number, b: number) => Math.abs(a - b) <= SAME;

export function deriveIntakeReview(input: {
  report: ImportIntakeReport;
  /** The values the project was created with (at import). */
  startValues: Partial<Record<IntakeValueKey, number>>;
  /** The values the project has now. */
  currentValues: Partial<Record<IntakeValueKey, number>>;
  state: IntakeReviewState;
}): IntakeReview | undefined {
  const defaults = intakeDefaults(input.report);
  if (!defaults.length) return undefined;
  const fields = defaults.flatMap((key) => {
    const value = input.currentValues[key] ?? input.startValues[key];
    if (value === undefined) return [];
    const start = input.startValues[key];
    const confirmed = input.state.confirmed[key];
    const state: IntakeFieldReviewState =
      start !== undefined && !same(start, value)
        ? 'changed'
        : confirmed !== undefined && same(confirmed, value)
          ? 'confirmed'
          : 'needs-review';
    return [{ key, value, state }];
  });
  const pending = fields
    .filter((field) => field.state === 'needs-review')
    .map((field) => field.key);
  return {
    status: !pending.length
      ? 'reviewed'
      : input.state.opened
        ? 'reviewing'
        : 'needs-review',
    fields,
    pending,
  };
}

/** The explicit confirmation: records exactly the values shown. */
export function confirmIntakeDefaults(
  state: IntakeReviewState,
  review: IntakeReview,
): IntakeReviewState {
  const confirmed = { ...state.confirmed };
  for (const field of review.fields)
    if (field.state === 'needs-review') confirmed[field.key] = field.value;
  return { ...state, confirmed };
}

/* ------------------------------------------------------------------------ */

export type PreparationGroupKey =
  'structure' | 'covering' | 'roof-system' | 'materials' | 'documents';

/**
 * `done` nothing to do · `check` something to confirm or decide · `todo` a
 * required step is missing or broken · `partial` some of it is available
 * now (documents) · `waiting` depends on an earlier group · `optional`
 * may be skipped.
 */
export type PreparationState =
  'done' | 'check' | 'todo' | 'partial' | 'waiting' | 'optional';

export interface PreparationGroup {
  key: PreparationGroupKey;
  state: PreparationState;
  /** Opens the existing editor for this group. */
  action: JourneyAction;
  /** Open decisions counted by the journey. */
  open: number;
  /** Ready-made summary from the journey (e.g. roof type and size). */
  summary?: string;
  waitingFor?: PreparationGroupKey;
  /** Structure: start values the document did not give are unconfirmed. */
  defaultsToCheck?: true;
  /** Documents: how many of the required ones can be produced now. */
  available?: { ready: number; total: number };
}

export interface PreparationDocument {
  kind: ReadinessDocumentKind;
  state: DocumentReadinessState;
}

export type PreparationNextReason =
  /** Open the editor to look at the RoofCalc defaults. */
  | 'intake-defaults'
  /** Already looked: confirm (or change) them explicitly. */
  | 'intake-confirm'
  | 'journey';

export interface ProjectPreparation {
  groups: PreparationGroup[];
  next?: {
    group: PreparationGroupKey;
    action: JourneyAction;
    reason: PreparationNextReason;
  };
  done: number;
  /** Start values from the document / typed / RoofCalc defaults. */
  intake?: {
    fromDocument: IntakeValueKey[];
    entered: IntakeValueKey[];
    defaults: IntakeValueKey[];
    review?: IntakeReview;
  };
  documents: PreparationDocument[];
  prices?: { priced: number; missing: number };
}

const GROUP_OF: Record<JourneyStageKey, PreparationGroupKey> = {
  geometry: 'structure',
  construction: 'structure',
  covering: 'covering',
  layers: 'covering',
  'roof-system': 'roof-system',
  materials: 'materials',
  cost: 'materials',
  documents: 'documents',
};

const STAGE_STATE: Record<JourneyStage['state'], PreparationState> = {
  ready: 'done',
  'in-progress': 'check',
  decision: 'check',
  fix: 'todo',
  optional: 'optional',
  waiting: 'waiting',
  'not-applicable': 'done',
};

/**
 * The group's main stage decides, unless a later stage of the same group
 * needs attention (layers after covering, cost after materials). An
 * optional or waiting later stage never changes the group.
 */
function groupState(stages: readonly JourneyStage[]): PreparationState {
  const [main, ...rest] = stages;
  if (!main) return 'optional';
  const own = STAGE_STATE[main.state];
  if (own === 'waiting' || own === 'optional' || own === 'todo') return own;
  const later = rest.map((stage) => STAGE_STATE[stage.state]);
  if (later.includes('todo')) return 'todo';
  if (later.includes('check')) return 'check';
  return own;
}

export function deriveProjectPreparation(input: {
  journey: ProjectJourney;
  readiness: ProjectReadiness;
  intake?: ImportIntakeReport;
  /** VNext-6.1: the review of the defaults that import left behind. */
  review?: IntakeReview;
  cost?: { started: boolean; priced: number; missing: number };
}): ProjectPreparation {
  const { journey, readiness } = input;
  const order: PreparationGroupKey[] = [
    'structure',
    'covering',
    'roof-system',
    'materials',
    'documents',
  ];
  const review = input.intake ? input.review : undefined;
  const defaultsPending = !!review && review.status !== 'reviewed';
  const groups = order.map((key): PreparationGroup => {
    const stages = journey.stages.filter(
      (stage) => GROUP_OF[stage.key] === key,
    );
    let state = groupState(stages);
    const main = stages[0];
    const unfinished =
      stages.find((stage) => stage.state === 'fix') ??
      stages.find(
        (stage) => stage.state === 'decision' || stage.state === 'in-progress',
      );
    let action: JourneyAction = {
      action: (unfinished ?? main)?.action ?? 'open-documents',
      ...((unfinished ?? main)?.focus
        ? { focus: (unfinished ?? main)!.focus! }
        : {}),
    };
    const defaultsToCheck =
      key === 'structure' && defaultsPending && state === 'done';
    if (defaultsToCheck) {
      state = 'check';
      action = { action: 'review-structure' };
    }
    // Documents: what can be produced NOW decides, not the whole journey.
    // The execution package and the material list are the required ones;
    // a cost estimate exists only once costing was started.
    let available: PreparationGroup['available'];
    if (key === 'documents') {
      const required = (['execution', 'materials'] as const).map(
        (kind) => readiness.documents[kind].state,
      );
      const ready = required.filter(
        (value) => value === 'ready' || value === 'warning',
      ).length;
      available = { ready, total: required.length };
      if (ready === required.length && state === 'done') state = 'done';
      else if (ready > 0) state = 'partial';
      else if (state !== 'waiting') state = 'todo';
    }
    const waiting = main?.waitingFor ? GROUP_OF[main.waitingFor] : undefined;
    return {
      key,
      state,
      action,
      open: stages.reduce((sum, stage) => sum + stage.open, 0),
      ...(main?.summary ? { summary: main.summary } : {}),
      ...(state === 'waiting' && waiting && waiting !== key
        ? { waitingFor: waiting }
        : {}),
      ...(defaultsToCheck ? { defaultsToCheck: true as const } : {}),
      ...(available ? { available } : {}),
    };
  });

  const recommended = journey.recommended;
  const geometryBroken = groups[0]?.state === 'todo';
  const next: ProjectPreparation['next'] =
    defaultsPending && !geometryBroken
      ? {
          group: 'structure',
          action: { action: 'review-structure' },
          reason:
            review!.status === 'reviewing'
              ? 'intake-confirm'
              : 'intake-defaults',
        }
      : recommended
        ? {
            group: GROUP_OF[recommended.stage],
            action: recommended,
            reason: 'journey',
          }
        : undefined;

  const intake = input.intake
    ? {
        fromDocument: (Object.keys(input.intake.values) as IntakeValueKey[])
          .filter((key) => input.intake!.values[key] === 'document')
          .sort(byKeyOrder),
        entered: (Object.keys(input.intake.values) as IntakeValueKey[])
          .filter((key) => input.intake!.values[key] === 'user')
          .sort(byKeyOrder),
        defaults: intakeDefaults(input.intake),
        ...(review ? { review } : {}),
      }
    : undefined;

  return {
    groups,
    ...(next ? { next } : {}),
    done: groups.filter((group) => group.state === 'done').length,
    ...(intake ? { intake } : {}),
    documents: (['execution', 'materials', 'cost'] as const).map((kind) => ({
      kind,
      state: readiness.documents[kind].state,
    })),
    ...(input.cost?.started
      ? { prices: { priced: input.cost.priced, missing: input.cost.missing } }
      : {}),
  };
}

function byKeyOrder(a: IntakeValueKey, b: IntakeValueKey) {
  return INTAKE_VALUE_KEYS.indexOf(a) - INTAKE_VALUE_KEYS.indexOf(b);
}
