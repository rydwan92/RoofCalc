import type {
  ProjectReadiness,
  ReadinessAction,
  ReadinessIssue,
} from './project-readiness';
import type {
  RoofSystemAreaKey,
  RoofSystemChecklist,
} from './roof-system-checklist';

/**
 * V53 PROJECT JOURNEY — the human workflow on top of V47 readiness and the
 * V52 roof-system checklist. It decides nothing technical: no geometry, no
 * quantities, no network. It only orders already-resolved facts into
 * stages and picks ONE recommended next action, following the real
 * dependency flow (geometry → structure → covering → layers → roof system →
 * materials → cost → documents). Guidance never locks navigation.
 */
export type JourneyStageKey =
  | 'geometry'
  | 'construction'
  | 'covering'
  | 'layers'
  | 'roof-system'
  | 'materials'
  | 'cost'
  | 'documents';

export type JourneyStageState =
  | 'ready'
  | 'in-progress'
  | 'decision'
  | 'fix'
  | 'optional'
  | 'waiting'
  | 'not-applicable';

export interface JourneyAction {
  action: ReadinessAction;
  /** The readiness issue behind it, when there is one. */
  issue?: ReadinessIssue;
  /** Exact roof-system focus (area, opening) for `open-roof-system`. */
  focus?: { area: RoofSystemAreaKey; featureId?: string };
  /** Copy key under `assembly.journey.next.*` when there is no issue. */
  reasonKey?: string;
}

export interface JourneyStage {
  key: JourneyStageKey;
  state: JourneyStageState;
  /** Why a stage waits, as a copy key (`assembly.journey.waiting.*`). */
  waitingFor?: JourneyStageKey;
  issues: ReadinessIssue[];
  action: ReadinessAction;
  /** Counts shown next to a stage (decisions still open). */
  open: number;
  /** Exact focus when this stage is opened (roof system: first gap). */
  focus?: JourneyAction['focus'];
  summary?: string;
}

export interface ProjectJourney {
  stages: JourneyStage[];
  overview: JourneyOverviewStage[];
  recommended?: JourneyAction & { stage: JourneyStageKey };
  counts: { ready: number; decisions: number };
}

export type JourneyOverviewKey = Exclude<
  JourneyStageKey,
  'layers' | 'roof-system'
>;
export interface JourneyOverviewStage {
  key: JourneyOverviewKey;
  status: 'complete' | 'needs-action' | 'not-started';
  target: JourneyAction;
  summary?: string;
}

/** Six user-facing stages, composed from the detailed readiness journey. */
export function projectJourneyOverview(
  stages: readonly JourneyStage[],
): JourneyOverviewStage[] {
  const groups: readonly [JourneyOverviewKey, readonly JourneyStageKey[]][] = [
    ['geometry', ['geometry']],
    ['construction', ['construction']],
    ['covering', ['covering', 'layers']],
    ['materials', ['materials', 'roof-system']],
    ['cost', ['cost']],
    ['documents', ['documents']],
  ];
  return groups.map(([key, keys]) => {
    const children = keys.flatMap((child) =>
      stages.filter((stage) => stage.key === child),
    );
    const main = children[0]!;
    const unfinished =
      children.find((stage) => stage.state === 'fix') ??
      children.find(
        (stage) => stage.state === 'decision' || stage.state === 'in-progress',
      );
    const target = unfinished ?? main;
    const absent =
      main.state === 'optional' ||
      main.state === 'waiting' ||
      main.issues.some((issue) => issue.code === 'covering-missing');
    return {
      key,
      status: absent ? 'not-started' : unfinished ? 'needs-action' : 'complete',
      target: {
        action: unfinished ? target.action : STAGE_ACTION[main.key],
        ...(target.focus ? { focus: target.focus } : {}),
      },
      ...(main.summary ? { summary: main.summary } : {}),
    };
  });
}

export interface JourneyFacts {
  readiness: ProjectReadiness;
  checklist: RoofSystemChecklist;
  /** Presentation summaries prepared by the caller (already resolved). */
  summaries?: Partial<Record<JourneyStageKey, string>>;
  /** Openings still without a resolved flashing, for exact focus. */
  openingsNeedingFlashing?: readonly { featureId: string }[];
  materials?: { attention: number; total: number };
  cost?: { started: boolean; missingPrices: number };
}

const GEOMETRY_CODES = new Set([
  'geometry-invalid',
  'roof-surface-issue',
  'opening-collision',
]);
const ROOF_SYSTEM_PREFIXES = ['drainage-', 'opening-flashing', 'roof-system-'];
const isRoofSystemIssue = (issue: ReadinessIssue) =>
  ROOF_SYSTEM_PREFIXES.some((prefix) => issue.code.startsWith(prefix));

const STAGE_ACTION: Record<JourneyStageKey, ReadinessAction> = {
  geometry: 'review-geometry',
  construction: 'review-structure',
  covering: 'choose-covering',
  layers: 'review-battens',
  'roof-system': 'open-roof-system',
  materials: 'open-materials',
  cost: 'open-cost',
  documents: 'open-documents',
};

function issueState(
  issues: readonly ReadinessIssue[],
  infoIsDecision: boolean,
): JourneyStageState | undefined {
  if (issues.some((issue) => issue.severity === 'blocker')) return 'fix';
  if (issues.some((issue) => issue.severity === 'warning')) return 'decision';
  if (infoIsDecision && issues.some((issue) => issue.action)) return 'decision';
  return undefined;
}

export function deriveProjectJourney(facts: JourneyFacts): ProjectJourney {
  const { readiness, checklist } = facts;
  const area = (key: string) =>
    readiness.areas.find((item) => item.area === key);
  const byArea = (key: string) =>
    readiness.issues.filter(
      (issue) =>
        issue.area === key &&
        !GEOMETRY_CODES.has(issue.code) &&
        !isRoofSystemIssue(issue),
    );
  const stages: JourneyStage[] = [];
  const push = (
    stage: Omit<JourneyStage, 'open' | 'action'> & {
      action?: ReadinessAction;
    },
  ) =>
    stages.push({
      ...stage,
      action:
        stage.action ?? stage.issues[0]?.action ?? STAGE_ACTION[stage.key],
      open: stage.issues.filter((issue) => issue.severity !== 'info').length,
      ...(facts.summaries?.[stage.key]
        ? { summary: facts.summaries[stage.key] }
        : {}),
    });

  const geometry = readiness.issues.filter((issue) =>
    GEOMETRY_CODES.has(issue.code),
  );
  push({
    key: 'geometry',
    state: issueState(geometry, false) ?? 'ready',
    issues: geometry,
  });
  const geometryBroken = geometry.some((issue) => issue.severity === 'blocker');

  const construction = [...byArea('construction'), ...byArea('execution')];
  push({
    key: 'construction',
    state: geometryBroken
      ? 'waiting'
      : (issueState(byArea('construction'), true) ??
        issueState(byArea('execution'), false) ??
        (area('construction')?.state === 'ready' ? 'ready' : 'in-progress')),
    ...(geometryBroken ? { waitingFor: 'geometry' as const } : {}),
    issues: construction,
  });

  const covering = byArea('covering');
  const coveringArea = area('covering');
  const hasCovering = checklist.hasBaseCovering;
  push({
    key: 'covering',
    state:
      issueState(covering, true) ??
      (hasCovering && coveringArea?.state === 'ready'
        ? 'ready'
        : hasCovering
          ? 'in-progress'
          : 'decision'),
    issues: covering,
    ...(hasCovering ? {} : { action: 'choose-covering' as const }),
  });

  const layers = byArea('layers');
  const layersArea = area('layers');
  push({
    key: 'layers',
    state: !hasCovering
      ? 'waiting'
      : (issueState(layers, false) ??
        (layersArea?.state === 'not-applicable'
          ? 'optional'
          : layersArea?.state === 'ready'
            ? 'ready'
            : 'in-progress')),
    ...(hasCovering ? {} : { waitingFor: 'covering' as const }),
    issues: layers,
  });

  const systemIssues = readiness.issues.filter(isRoofSystemIssue);
  const systemAreas = checklist.areas.filter((item) => item.key !== 'covering');
  const systemAttention = systemAreas.filter(
    (item) => item.state === 'needs-decision',
  ).length;
  const systemStarted = systemAreas.some((item) => item.state === 'ready');
  push({
    key: 'roof-system',
    state: !hasCovering
      ? 'waiting'
      : (issueState(systemIssues, false) ??
        (systemAttention ? 'decision' : systemStarted ? 'ready' : 'optional')),
    ...(hasCovering ? {} : { waitingFor: 'covering' as const }),
    issues: systemIssues,
    action: 'open-roof-system',
  });
  {
    const stage = stages.at(-1)!;
    const opening = facts.openingsNeedingFlashing?.[0];
    const gap = checklist.areas.find(
      (item) => item.key !== 'covering' && item.state === 'needs-decision',
    )?.key;
    if (opening && (gap === 'openings' || !gap))
      stage.focus = { area: 'openings', featureId: opening.featureId };
    else if (gap) stage.focus = { area: gap };
  }

  const materials = byArea('materials');
  const materialsArea = area('materials');
  push({
    key: 'materials',
    state: !hasCovering
      ? 'waiting'
      : (issueState(materials, false) ??
        ((facts.materials?.attention ?? 0) > 0
          ? 'in-progress'
          : materialsArea?.state === 'ready'
            ? 'ready'
            : 'in-progress')),
    ...(hasCovering ? {} : { waitingFor: 'covering' as const }),
    issues: materials,
    action: 'open-materials',
  });

  const cost = byArea('cost');
  const costStarted = facts.cost?.started ?? area('cost')?.state === 'ready';
  push({
    key: 'cost',
    state: !costStarted
      ? 'optional'
      : (issueState(cost, false) ??
        ((facts.cost?.missingPrices ?? 0) > 0 ? 'decision' : 'ready')),
    issues: costStarted ? cost : [],
    action: 'open-cost',
  });

  const execution = readiness.documents.execution;
  push({
    key: 'documents',
    state:
      execution.state === 'blocked' || !hasCovering
        ? 'waiting'
        : execution.state === 'ready' &&
            readiness.documents.materials.state === 'ready' &&
            (!costStarted || readiness.documents.cost.state === 'ready')
          ? 'ready'
          : 'in-progress',
    ...(execution.state === 'blocked' || !hasCovering
      ? {
          waitingFor: hasCovering
            ? ('construction' as const)
            : ('covering' as const),
        }
      : {}),
    issues: [],
    action: 'open-documents',
  });

  // V47's primary issue already encodes the tested priorities (geometry
  // and blockers first); the journey adds guidance when it has none.
  const unfinishedFoundation = stages.find(
    (stage) =>
      (stage.key === 'geometry' || stage.key === 'construction') &&
      ['fix', 'decision', 'in-progress'].includes(stage.state),
  );
  const primary = readiness.primary;
  const primaryStage = primary
    ? stages.find((stage) =>
        stage.issues.some((item) => item.id === primary.id),
      )
    : undefined;
  return {
    stages,
    overview: projectJourneyOverview(stages),
    recommended: unfinishedFoundation
      ? pickFor(unfinishedFoundation, facts)
      : primary && primaryStage
        ? pickFor(primaryStage, facts, primary)
        : recommend(stages, facts),
    counts: {
      ready: stages.filter((stage) => stage.state === 'ready').length,
      decisions: stages.filter(
        (stage) => stage.state === 'decision' || stage.state === 'fix',
      ).length,
    },
  };
}

/**
 * ONE next action. Blockers first (in dependency order), then decisions in
 * dependency order, then the first unfinished useful step. A later stage
 * never outranks an earlier blocker.
 */
function pickFor(
  stage: JourneyStage,
  facts: JourneyFacts,
  chosen?: ReadinessIssue,
): NonNullable<ProjectJourney['recommended']> {
  {
    const issue =
      chosen ??
      stage.issues.find((item) => item.severity === 'blocker') ??
      stage.issues.find((item) => item.severity === 'warning') ??
      stage.issues.find((item) => item.action);
    const action = issue?.action ?? stage.action;
    if (stage.key === 'roof-system') {
      const opening = facts.openingsNeedingFlashing?.[0];
      const area =
        opening && (!issue || issue.code.startsWith('opening-flashing'))
          ? ('openings' as const)
          : issue?.code.startsWith('drainage-')
            ? ('drainage' as const)
            : facts.checklist.areas.find(
                (item) =>
                  item.key !== 'covering' && item.state === 'needs-decision',
              )?.key;
      return {
        stage: stage.key,
        action: issue?.code.startsWith('drainage-')
          ? (issue.action ?? 'open-drainage')
          : 'open-roof-system',
        ...(issue ? { issue } : {}),
        ...(area
          ? {
              focus: {
                area,
                ...(area === 'openings' && opening
                  ? { featureId: opening.featureId }
                  : {}),
              },
            }
          : {}),
        ...(issue ? {} : { reasonKey: `roof-system-${area ?? 'open'}` }),
      };
    }
    return {
      stage: stage.key,
      action,
      ...(issue ? { issue } : { reasonKey: stage.key }),
    };
  }
}

function recommend(
  stages: readonly JourneyStage[],
  facts: JourneyFacts,
): ProjectJourney['recommended'] {
  const pick = (stage: JourneyStage) => pickFor(stage, facts);
  const fix = stages.find((stage) => stage.state === 'fix');
  if (fix) return pick(fix);
  const decision = stages.find((stage) => stage.state === 'decision');
  if (decision) return pick(decision);
  const next = stages.find(
    (stage) =>
      stage.state === 'in-progress' &&
      stage.key !== 'documents' &&
      stage.key !== 'cost',
  );
  if (next) return pick(next);
  const documents = stages.find((stage) => stage.key === 'documents');
  if (documents && documents.state !== 'waiting') return pick(documents);
  return undefined;
}
