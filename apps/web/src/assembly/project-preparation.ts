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

/**
 * VNext-6 PROJECT PREPARATION — the compact "Przygotowanie projektu" card.
 *
 * Five groups a roofer recognises (structure and dimensions; covering and
 * layers; drainage and flashings; materials and costing; documents) and
 * ONE next step. It decides nothing: every state comes from the V53
 * journey and V47 readiness that the workbench already derives, plus what
 * an import reported about where each start value came from. No geometry,
 * no quantity, no price is computed here, and nothing is stored (ADR-002).
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
 * What an import gave the new project. Session-only: the file, the draft
 * and this report never enter the saved project (ADR-012).
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
  /** Structure: start values the document did not give are unchecked. */
  defaultsToCheck?: true;
  /** Documents: how many of the required ones can be produced now. */
  available?: { ready: number; total: number };
}

export interface PreparationDocument {
  kind: ReadinessDocumentKind;
  state: DocumentReadinessState;
}

export interface ProjectPreparation {
  groups: PreparationGroup[];
  next?: {
    group: PreparationGroupKey;
    action: JourneyAction;
    /** `intake-defaults`: check values the document did not give. */
    reason: 'intake-defaults' | 'journey';
  };
  done: number;
  /** Start values from the document / typed / RoofCalc defaults. */
  intake?: {
    fromDocument: IntakeValueKey[];
    entered: IntakeValueKey[];
    defaults: IntakeValueKey[];
    reviewed: boolean;
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
  /** The user has opened and accepted the structure values once. */
  intakeReviewed?: boolean;
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
  const defaults = input.intake ? intakeDefaults(input.intake) : [];
  const checkDefaults = defaults.length > 0 && !input.intakeReviewed;
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
      key === 'structure' && checkDefaults && state === 'done';
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
  const next: ProjectPreparation['next'] = checkDefaults
    ? {
        group: 'structure',
        action: { action: 'review-structure' },
        reason: 'intake-defaults',
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
        defaults,
        reviewed: !!input.intakeReviewed,
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
