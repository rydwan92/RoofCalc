import {
  deriveCoveringSupportCapability,
  resolvePrimaryCoveringAssignments,
  type CoveringAssignmentSpec,
} from '@cieslacalc/covering-core';
import {
  staleRoofPlaneReferences,
  uncoveredRoofPlaneIds,
} from '@cieslacalc/calculator-core';
import type { CostScenarioSummary } from '@cieslacalc/cost-core';
import type { SectionCandidate, SectionKind } from '@cieslacalc/document-core';
import { roofStructureSystem } from '@cieslacalc/roof-math';
import type { RoofBuildUp, RoofTemplateSpec } from '@cieslacalc/timber-model';
import type { BattenWorkflow, CounterBattenWorkflow } from './batten-workflow';
import type { K1CuttingRequirement } from './k1-cutting-adapter';
import type { MaterialPlanRow } from './material-plan';
import { MEMBRANE_LIMITATION_CODES } from './membrane-limitations';
import {
  fitInstallationToRoof,
  type InstallationRepairChange,
} from './installation-repair';

/**
 * V47 PROJECT READINESS — one pure application-level projection.
 *
 * It composes facts that are already resolved (surface, covering layouts,
 * batten/counter-batten workflows, membrane layout, K1 requirement, material
 * rows, cost summary, document candidates). It runs no solver, no network and
 * no persistence, and domain packages never depend on it:
 *
 *   domain results → project readiness → UI / documents
 *
 * Severity has real semantics:
 * - BLOCKER: continuing with a dependent action would produce an invalid or
 *   misleading result (only for the documents it `affects`);
 * - WARNING: the result is still useful but has a known limitation;
 * - INFO: an optional decision or a useful next step.
 * Nothing here locks the application: exploration and editing stay free.
 */

export type ReadinessSeverity = 'blocker' | 'warning' | 'info';
export type ReadinessArea =
  'construction' | 'covering' | 'layers' | 'execution' | 'materials' | 'cost';
export type ReadinessDocumentKind = 'execution' | 'materials' | 'cost';

export type ReadinessAction =
  | 'review-geometry'
  | 'review-structure'
  | 'review-openings'
  | 'choose-covering'
  | 'review-covering'
  | 'choose-installation-mode'
  | 'fit-roof'
  | 'fit-auto'
  | 'set-manual'
  | 'enable-auto-battens'
  | 'review-battens'
  | 'review-eave-detail'
  | 'enable-counter-battens'
  | 'choose-hip-detail'
  | 'review-counter-battens'
  | 'choose-membrane-product'
  | 'review-membrane'
  | 'plan-k1'
  | 'open-materials'
  | 'open-cost';

export type ReadinessIssueCode =
  | 'geometry-invalid'
  | 'roof-surface-issue'
  | 'opening-collision'
  | 'covering-missing'
  | 'plane-scope-stale'
  | 'covering-plane-conflict'
  | 'covering-installation-mode'
  | 'covering-incompatible'
  | 'covering-partial-scope'
  | 'tile-eave-projection'
  | 'battens-off'
  | 'battens-incompatible'
  | 'battens-product-incompatible'
  | 'battens-invalid'
  | 'battens-scope'
  | 'battens-auto-unavailable'
  | 'battens-manual-unverified'
  | 'counter-battens-off'
  | 'hip-detail-required'
  | 'counter-battens-invalid'
  | 'membrane-product-missing'
  | 'membrane-layout-incomplete'
  | 'k1-unresolved'
  | 'k1-cutting-plan-missing'
  | 'linear-plan-missing'
  | 'linear-plan-partial'
  | 'cost-not-started'
  | 'cost-prices-missing'
  | 'cost-quantities-missing';

export interface ReadinessIssue {
  id: string;
  code: ReadinessIssueCode;
  severity: ReadinessSeverity;
  area: ReadinessArea;
  /** Interpolation values for the translated title/description. */
  params?: Record<string, string | number>;
  action?: ReadinessAction;
  secondaryAction?: ReadinessAction;
  /** Documents whose result this issue changes. */
  affects: ReadinessDocumentKind[];
  /** Part of the deterministic, non-controversial "Napraw bezpiecznie" group. */
  safeRepair: boolean;
  /** The resolver fact the issue was read from. */
  source: string;
}

export type ReadinessAreaState =
  'ready' | 'attention' | 'blocked' | 'pending' | 'not-applicable';
export type ReadinessRequirement = 'required' | 'conditional' | 'optional';

export interface ReadinessAreaSummary {
  area: ReadinessArea;
  requirement: ReadinessRequirement;
  state: ReadinessAreaState;
  /** Counted in the progress indicator (required, or applicable/started). */
  counted: boolean;
  issueIds: string[];
}

export type DocumentReadinessState =
  'ready' | 'warning' | 'blocked' | 'unavailable';

export interface DocumentReadiness {
  kind: ReadinessDocumentKind;
  state: DocumentReadinessState;
  blockerIds: string[];
  warningIds: string[];
  /** Sections that carry content for this document. */
  readySections: number;
  totalSections: number;
}

/** Stable, renderer-neutral scope and limitation facts for documents. */
export type ProjectLimitation =
  | { code: 'membrane-roll-plan'; params: MembraneFacts }
  | { code: 'membrane-net-only'; params: { netAreaM2: number } }
  | { code: (typeof MEMBRANE_LIMITATION_CODES)[number] }
  | { code: 'hip-detail-not-decided'; params: { count: number } }
  | { code: 'batten-gauge-manual-unverified' }
  | { code: 'batten-no-stock-lengths' }
  | { code: 'covering-coverage-positions' }
  | { code: 'covering-declared-consumption' }
  | { code: 'hip-execution-reference-only' }
  | { code: 'ridge-half-lap-unresolved' }
  | { code: 'collar-tie-geometric' }
  | { code: 'cost-incomplete'; params: { missingPrices: number } };

export interface MembraneFacts {
  netAreaM2: number;
  grossAreaM2: number;
  overlapAreaM2?: number;
  endOverlapAreaM2?: number;
  ridgeOverrunAreaM2?: number;
  courseCount?: number;
  rollCount?: number;
}

export interface ProjectReadiness {
  issues: ReadinessIssue[];
  areas: ReadinessAreaSummary[];
  documents: Record<ReadinessDocumentKind, DocumentReadiness>;
  primary?: ReadinessIssue;
  progress: { ready: number; total: number };
  safeRepair: {
    issueIds: string[];
    changes: InstallationRepairChange[];
  };
  limitations: ProjectLimitation[];
}

export interface ReadinessFacts {
  template: RoofTemplateSpec;
  constructionReady: boolean;
  surfaceIssueCount: number;
  openingWarningCount: number;
  coverings: readonly CoveringAssignmentSpec[];
  coveringLayouts: readonly {
    assignmentId: string;
    status: string;
    issues: readonly {
      code: string;
      severity?: string;
      roofPlaneId?: string;
      actual?: number;
      required?: number;
      minimum?: number;
      maximum?: number;
    }[];
    /** Tile layouts only: V47 eave detail evidence per plane. */
    planes?: readonly { roofPlaneId: string; eaveProjectionMm?: number }[];
  }[];
  buildUp: RoofBuildUp;
  battenWorkflow: BattenWorkflow;
  counterBattenWorkflow: CounterBattenWorkflow;
  membrane: {
    enabled: boolean;
    hasProduct: boolean;
    layoutStatus?: 'disabled' | 'resolved' | 'partial' | 'incomplete';
  };
  k1: K1CuttingRequirement;
  hasCuttingPlan: boolean;
  materialRows: readonly MaterialPlanRow[];
  /**
   * V48: how far the commercial purchase plan for each linear build-up
   * material got. Absent entries simply mean no plan was prepared — a purchase
   * plan is never required to use the geometry.
   */
  linearPlans?: Partial<
    Record<
      'batten' | 'counter-batten',
      { status: 'complete' | 'partial' | 'unfulfilled'; unresolvedRuns: number }
    >
  >;
  /** Linear materials whose layer is on and whose requirement is plannable. */
  linearPlannable?: readonly ('batten' | 'counter-batten')[];
  cost?: CostScenarioSummary;
  candidates: readonly SectionCandidate[];
}

export const DOCUMENT_SECTIONS: Record<
  ReadinessDocumentKind,
  readonly SectionKind[]
> = {
  execution: [
    'project-summary',
    'roof-overview',
    'member-schedule',
    'member-fabrication',
    'cutting-plan',
    'layers',
    'covering',
    'assumptions',
  ],
  cost: ['project-summary', 'cost-estimate'],
  materials: ['project-summary', 'material-list'],
};

const AREA_ORDER: ReadinessArea[] = [
  'construction',
  'covering',
  'layers',
  'execution',
  'materials',
  'cost',
];
const SEVERITY_ORDER: Record<ReadinessSeverity, number> = {
  blocker: 0,
  warning: 1,
  info: 2,
};
const ALL_DOCUMENTS: ReadinessDocumentKind[] = [
  'execution',
  'materials',
  'cost',
];
/** Coverings and layers change what materials and cost mean. */
const QUANTITY_DOCUMENTS: ReadinessDocumentKind[] = [
  'execution',
  'materials',
  'cost',
];

/** Covering issue codes explained by a more specific readiness issue. */
const COVERING_CODES_HANDLED_ELSEWHERE = new Set([
  'roof-plane-not-found',
  'batten-layout-required',
  'batten-course-spacing-required',
  'batten-gauge-below-minimum',
  'batten-gauge-above-maximum',
  'installation-mode-required',
  'installation-mode-not-found',
]);

const round2 = (value: number) => Math.round(value * 100) / 100;

export function deriveProjectReadiness(
  facts: ReadinessFacts,
): ProjectReadiness {
  const issues: ReadinessIssue[] = [];
  const add = (
    issue: Omit<ReadinessIssue, 'id' | 'safeRepair'> & {
      safeRepair?: boolean;
      key?: string;
    },
  ) => {
    const { key, ...rest } = issue;
    issues.push({
      ...rest,
      id: `${issue.code}${key ? `:${key}` : ''}`,
      safeRepair: issue.safeRepair ?? false,
    });
  };
  const battens = facts.battenWorkflow;
  const counter = facts.counterBattenWorkflow;
  const singleCovering = facts.coverings.length === 1;
  const primary = singleCovering ? facts.coverings[0] : undefined;
  const capability = primary
    ? deriveCoveringSupportCapability(primary.product.technicalSpecSnapshot)
    : undefined;

  // ── Construction ─────────────────────────────────────────────────────
  if (!facts.constructionReady)
    add({
      code: 'geometry-invalid',
      severity: 'blocker',
      area: 'construction',
      action: 'review-geometry',
      affects: ALL_DOCUMENTS,
      source: 'roof-surface',
    });
  if (facts.surfaceIssueCount > 0)
    add({
      code: 'roof-surface-issue',
      severity: 'warning',
      area: 'construction',
      params: { count: facts.surfaceIssueCount },
      action: 'review-openings',
      affects: ['execution', 'materials'],
      source: 'roof-surface.issues',
    });
  if (facts.openingWarningCount > 0)
    add({
      code: 'opening-collision',
      severity: 'warning',
      area: 'construction',
      params: { count: facts.openingWarningCount },
      action: 'review-openings',
      affects: ['execution'],
      source: 'opening-placement',
    });

  // ── Covering ─────────────────────────────────────────────────────────
  const stale = staleRoofPlaneReferences(
    facts.template,
    facts.coverings,
    facts.buildUp,
  );
  if (facts.constructionReady && facts.coverings.length === 0)
    add({
      code: 'covering-missing',
      severity: 'info',
      area: 'covering',
      action: 'choose-covering',
      affects: [],
      source: 'project.coverings',
    });
  if (stale.length > 0)
    add({
      code: 'plane-scope-stale',
      severity: 'blocker',
      area: 'covering',
      params: { count: stale.length },
      action: 'fit-roof',
      affects: QUANTITY_DOCUMENTS,
      safeRepair: true,
      source: 'plane-scope',
    });
  const ownership = resolvePrimaryCoveringAssignments(facts.coverings);
  if (ownership.conflicts.length > 0)
    add({
      code: 'covering-plane-conflict',
      severity: 'blocker',
      area: 'covering',
      params: { count: ownership.conflicts.length },
      action: 'review-covering',
      affects: QUANTITY_DOCUMENTS,
      source: 'covering-ownership',
    });
  const modeMissing = facts.coveringLayouts.some((layout) =>
    layout.issues.some(
      (issue) =>
        issue.code === 'installation-mode-required' ||
        issue.code === 'installation-mode-not-found',
    ),
  );
  if (modeMissing)
    add({
      code: 'covering-installation-mode',
      severity: 'blocker',
      area: 'covering',
      action: 'choose-installation-mode',
      affects: QUANTITY_DOCUMENTS,
      source: 'covering-layout.issues',
    });
  for (const layout of facts.coveringLayouts) {
    if (layout.status !== 'incompatible' && layout.status !== 'invalid')
      continue;
    const issue = layout.issues.find(
      (item) =>
        item.severity === 'error' &&
        !COVERING_CODES_HANDLED_ELSEWHERE.has(item.code),
    );
    if (!issue) continue;
    add({
      key: layout.assignmentId,
      code: 'covering-incompatible',
      severity: 'blocker',
      area: 'covering',
      params: {
        issue: issue.code,
        ...(issue.actual !== undefined ? { actual: round2(issue.actual) } : {}),
        ...(issue.required !== undefined
          ? { required: round2(issue.required) }
          : {}),
      },
      action: 'review-covering',
      affects: QUANTITY_DOCUMENTS,
      source: 'covering-layout.issues',
    });
  }
  const uncovered =
    facts.coverings.length > 0
      ? uncoveredRoofPlaneIds(facts.template, facts.coverings)
      : [];
  if (uncovered.length > 0 && stale.length === 0)
    add({
      code: 'covering-partial-scope',
      severity: singleCovering ? 'warning' : 'info',
      area: 'covering',
      params: { count: uncovered.length },
      action: singleCovering ? 'fit-roof' : 'review-covering',
      affects: singleCovering ? QUANTITY_DOCUMENTS : [],
      safeRepair: singleCovering,
      source: 'covering-scope',
    });

  // A tile hangs one physical length below its first batten. Only physically
  // implausible edges are flagged: a first course that does not reach the
  // eave, or a tile hanging more than half its length past it.
  for (const layout of facts.coveringLayouts) {
    const assignment = facts.coverings.find(
      (item) => item.id === layout.assignmentId,
    );
    const spec = assignment?.product.technicalSpecSnapshot;
    const physicalLength =
      spec?.kind === 'roof-tile' ? spec.physicalLengthMm : undefined;
    if (physicalLength === undefined || !layout.planes) continue;
    const projections = layout.planes
      .map((plane) => plane.eaveProjectionMm)
      .filter((value): value is number => value !== undefined);
    const worst = projections.find(
      (value) => value < 0 || value > physicalLength / 2,
    );
    if (worst === undefined) continue;
    add({
      key: layout.assignmentId,
      code: 'tile-eave-projection',
      severity: 'warning',
      area: 'covering',
      params: {
        projectionMm: Math.round(worst),
        direction: worst < 0 ? 'short' : 'long',
      },
      action: 'review-eave-detail',
      affects: ['execution'],
      source: 'tile-layout.eaveProjectionMm',
    });
  }

  // ── Layers ───────────────────────────────────────────────────────────
  const needsBattens = capability?.requiresBattens ?? false;
  const layout = facts.buildUp.battenLayout;
  if (needsBattens && (!layout || !layout.enabled))
    add({
      code: 'battens-off',
      severity: 'warning',
      area: 'layers',
      action: 'enable-auto-battens',
      affects: QUANTITY_DOCUMENTS,
      safeRepair: true,
      source: 'batten-workflow',
    });
  switch (battens.state) {
    case 'geometry-invalid':
      if (stale.length === 0)
        add({
          code: 'battens-invalid',
          severity: 'blocker',
          area: 'layers',
          action: battens.actions.includes('fit-roof')
            ? 'fit-roof'
            : battens.actions.includes('fit-auto')
              ? 'fit-auto'
              : 'review-battens',
          affects: QUANTITY_DOCUMENTS,
          safeRepair: battens.actions.includes('fit-roof'),
          source: 'batten-workflow',
        });
      break;
    case 'manual-incompatible':
      add({
        code: 'battens-incompatible',
        severity: 'blocker',
        area: 'layers',
        params: {
          ...(battens.manualGaugeMm !== undefined
            ? { gaugeMm: battens.manualGaugeMm }
            : {}),
          ...(battens.allowedRangeMm
            ? {
                minMm: battens.allowedRangeMm.min,
                maxMm: battens.allowedRangeMm.max,
              }
            : battens.fixedSupportGaugeMm !== undefined
              ? {
                  minMm: battens.fixedSupportGaugeMm,
                  maxMm: battens.fixedSupportGaugeMm,
                }
              : {}),
          ...(battens.productLabel ? { product: battens.productLabel } : {}),
        },
        action: capability?.supportsAutoBattenGauge
          ? 'fit-auto'
          : 'review-battens',
        secondaryAction: 'review-battens',
        affects: QUANTITY_DOCUMENTS,
        source: 'batten-workflow',
      });
      break;
    case 'auto-incompatible':
      add({
        code: 'battens-product-incompatible',
        severity: 'blocker',
        area: 'layers',
        params: {
          pitchDeg: round2(battens.pitch.actualDeg),
          ...(battens.pitch.minimumDeg !== undefined
            ? { minimumDeg: battens.pitch.minimumDeg }
            : {}),
        },
        action: 'review-covering',
        secondaryAction: 'set-manual',
        affects: QUANTITY_DOCUMENTS,
        source: 'batten-workflow',
      });
      break;
    case 'awaiting-covering-scope':
      if (!issues.some((item) => item.code === 'covering-partial-scope'))
        add({
          code: 'battens-scope',
          severity: 'blocker',
          area: 'layers',
          action: singleCovering ? 'fit-roof' : 'review-covering',
          affects: QUANTITY_DOCUMENTS,
          safeRepair: singleCovering,
          source: 'batten-workflow',
        });
      break;
    case 'awaiting-installation-mode':
      if (!modeMissing)
        add({
          code: 'covering-installation-mode',
          severity: 'blocker',
          area: 'covering',
          action: 'choose-installation-mode',
          affects: QUANTITY_DOCUMENTS,
          source: 'batten-workflow',
        });
      break;
    case 'auto-data-unavailable':
    case 'unsupported-support-model':
      add({
        code: 'battens-auto-unavailable',
        severity: 'warning',
        area: 'layers',
        action: 'set-manual',
        secondaryAction: 'review-covering',
        affects: QUANTITY_DOCUMENTS,
        source: 'batten-workflow',
      });
      break;
    case 'manual-unverified':
      if (facts.coverings.length > 0)
        add({
          code: 'battens-manual-unverified',
          severity: 'warning',
          area: 'layers',
          action: capability?.supportsAutoBattenGauge
            ? 'fit-auto'
            : 'review-battens',
          affects: ['execution'],
          source: 'batten-workflow',
        });
      break;
    default:
      break;
  }
  if (counter.state === 'needs-hip-detail')
    add({
      code: 'hip-detail-required',
      severity: 'warning',
      area: 'layers',
      params: { count: counter.unresolvedHipBoundaryCount },
      action: 'choose-hip-detail',
      affects: QUANTITY_DOCUMENTS,
      source: 'counter-batten-workflow',
    });
  if (counter.state === 'invalid')
    add({
      code: 'counter-battens-invalid',
      severity: 'blocker',
      area: 'layers',
      action: 'review-counter-battens',
      affects: QUANTITY_DOCUMENTS,
      source: 'counter-batten-workflow',
    });
  if (
    capability?.usesStructureDerivedCounterBattens &&
    counter.state === 'layer-off' &&
    battens.complete
  )
    add({
      code: 'counter-battens-off',
      severity: 'info',
      area: 'layers',
      action: 'enable-counter-battens',
      affects: [],
      source: 'counter-batten-workflow',
    });
  if (facts.membrane.enabled && !facts.membrane.hasProduct)
    add({
      code: 'membrane-product-missing',
      severity: 'warning',
      area: 'layers',
      action: 'choose-membrane-product',
      affects: ['materials', 'cost'],
      source: 'membrane-layer',
    });
  if (
    facts.membrane.enabled &&
    facts.membrane.hasProduct &&
    (facts.membrane.layoutStatus === 'partial' ||
      facts.membrane.layoutStatus === 'incomplete')
  )
    add({
      code: 'membrane-layout-incomplete',
      severity: 'warning',
      area: 'layers',
      action: 'review-membrane',
      affects: ['materials', 'cost'],
      source: 'membrane-layout',
    });

  // ── Execution ────────────────────────────────────────────────────────
  if (facts.constructionReady && facts.k1.status === 'unresolved')
    add({
      code: 'k1-unresolved',
      severity: 'warning',
      area: 'execution',
      params: { reason: facts.k1.reason },
      action: 'review-structure',
      affects: ['execution'],
      source: 'k1-requirement',
    });
  if (facts.k1.status === 'resolved' && !facts.hasCuttingPlan)
    add({
      code: 'k1-cutting-plan-missing',
      severity: 'info',
      area: 'execution',
      action: 'plan-k1',
      affects: [],
      source: 'k1-cutting-plan',
    });

  // ── Commercial plan for linear build-up materials (V48) ──────────────
  for (const material of facts.linearPlannable ?? []) {
    const plan = facts.linearPlans?.[material];
    if (!plan)
      add({
        code: 'linear-plan-missing',
        severity: 'info',
        area: 'materials',
        params: { material },
        action: 'open-materials',
        affects: [],
        source: `linear-plan:${material}`,
      });
    else if (plan.status !== 'complete')
      add({
        code: 'linear-plan-partial',
        severity: 'warning',
        area: 'materials',
        params: { material, count: plan.unresolvedRuns },
        action: 'open-materials',
        // A partial plan changes what the purchase quantities mean.
        affects: ['materials', 'cost'],
        source: `linear-plan:${material}`,
      });
  }

  // ── Cost ─────────────────────────────────────────────────────────────
  const costStarted = !!facts.cost && facts.cost.includedLineCount > 0;
  if (facts.constructionReady && !costStarted)
    add({
      code: 'cost-not-started',
      severity: 'info',
      area: 'cost',
      action: 'open-cost',
      affects: [],
      source: 'cost-scenario',
    });
  if (costStarted && facts.cost!.needsPriceCount > 0)
    add({
      code: 'cost-prices-missing',
      severity: 'warning',
      area: 'cost',
      params: { count: facts.cost!.needsPriceCount },
      action: 'open-cost',
      affects: ['cost'],
      source: 'cost-scenario',
    });
  if (costStarted && facts.cost!.needsQuantityCount > 0)
    add({
      code: 'cost-quantities-missing',
      severity: 'warning',
      area: 'cost',
      params: { count: facts.cost!.needsQuantityCount },
      action: 'open-cost',
      affects: ['cost'],
      source: 'cost-scenario',
    });

  issues.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area),
  );

  // ── Areas ────────────────────────────────────────────────────────────
  const layersApplicable =
    needsBattens ||
    !!facts.buildUp.battenLayout?.enabled ||
    !!facts.buildUp.counterBattens?.enabled ||
    facts.membrane.enabled;
  const materialBlocked = issues.some(
    (issue) =>
      issue.severity === 'blocker' && issue.affects.includes('materials'),
  );
  const materialWarning = issues.some(
    (issue) =>
      issue.severity === 'warning' && issue.affects.includes('materials'),
  );
  const areaState = (
    area: ReadinessArea,
    requirement: ReadinessRequirement,
    applicable: boolean,
    started: boolean,
  ): ReadinessAreaSummary => {
    const own = issues.filter((issue) => issue.area === area);
    const state: ReadinessAreaState = !applicable
      ? 'not-applicable'
      : own.some((issue) => issue.severity === 'blocker')
        ? 'blocked'
        : own.some((issue) => issue.severity === 'warning')
          ? 'attention'
          : started
            ? 'ready'
            : 'pending';
    return {
      area,
      requirement,
      state,
      counted:
        applicable &&
        (requirement !== 'optional' || started) &&
        (requirement === 'required' || started || state !== 'pending'),
      issueIds: own.map((issue) => issue.id),
    };
  };
  const areas: ReadinessAreaSummary[] = [
    areaState('construction', 'required', true, facts.constructionReady),
    areaState(
      'covering',
      'required',
      facts.constructionReady,
      facts.coverings.length > 0,
    ),
    areaState('layers', 'conditional', layersApplicable, layersApplicable),
    areaState(
      'execution',
      'conditional',
      facts.constructionReady,
      facts.k1.status === 'resolved',
    ),
    (() => {
      const summary = areaState(
        'materials',
        'conditional',
        facts.constructionReady && facts.materialRows.length > 0,
        facts.materialRows.length > 0,
      );
      // Materials reflect the facts they are made of.
      if (summary.state === 'ready' || summary.state === 'pending')
        summary.state = materialBlocked
          ? 'blocked'
          : materialWarning
            ? 'attention'
            : summary.state;
      return summary;
    })(),
    areaState('cost', 'optional', facts.constructionReady, costStarted),
  ];
  const counted = areas.filter((area) => area.counted);
  const progress = {
    ready: counted.filter((area) => area.state === 'ready').length,
    total: counted.length,
  };

  // ── Documents ────────────────────────────────────────────────────────
  const hasSection = (kind: SectionKind) =>
    facts.candidates.some(
      (candidate) =>
        candidate.kind === kind &&
        candidate.readiness !== 'unavailable' &&
        !!candidate.section,
    );
  const documents = Object.fromEntries(
    ALL_DOCUMENTS.map((kind) => {
      const sections = DOCUMENT_SECTIONS[kind];
      const readySections = sections.filter(hasSection).length;
      const core = sections.filter((section) => section !== 'project-summary');
      const blockerIds = issues
        .filter(
          (issue) =>
            issue.severity === 'blocker' && issue.affects.includes(kind),
        )
        .map((issue) => issue.id);
      const warningIds = issues
        .filter(
          (issue) =>
            issue.severity === 'warning' && issue.affects.includes(kind),
        )
        .map((issue) => issue.id);
      const state: DocumentReadinessState = !core.some(hasSection)
        ? 'unavailable'
        : blockerIds.length
          ? 'blocked'
          : warningIds.length
            ? 'warning'
            : 'ready';
      return [
        kind,
        {
          kind,
          state,
          blockerIds,
          warningIds,
          readySections,
          totalSections: sections.length,
        },
      ];
    }),
  ) as Record<ReadinessDocumentKind, DocumentReadiness>;

  // ── Safe repair group ────────────────────────────────────────────────
  const safeIssues = issues.filter((issue) => issue.safeRepair);
  const repair = safeIssues.length
    ? fitInstallationToRoof({
        template: facts.template,
        coverings: facts.coverings,
        buildUp: facts.buildUp,
      })
    : undefined;

  return {
    issues,
    areas,
    documents,
    primary:
      issues.find((issue) => issue.severity !== 'info') ??
      issues.find(
        (issue) =>
          issue.severity === 'info' &&
          (issue.area === 'covering' || issue.area === 'construction'),
      ),
    progress,
    safeRepair: {
      issueIds: repair?.changed ? safeIssues.map((issue) => issue.id) : [],
      changes: repair?.changed ? repair.changes : [],
    },
    limitations: deriveProjectLimitations(facts),
  };
}

/**
 * The only place document limitations are decided. Every entry is read from
 * a resolved fact; nothing is a generic disclaimer.
 */
export function deriveProjectLimitations(
  facts: ReadinessFacts,
): ProjectLimitation[] {
  const limitations: ProjectLimitation[] = [];
  const membraneRow = facts.materialRows.find((row) => row.id === 'membrane');
  if (facts.membrane.enabled && membraneRow) {
    const metric = (key: string) =>
      membraneRow.metrics.find((item) => item.labelKey === key)?.value;
    const net = metric('netArea') ?? 0;
    const gross = metric('grossArea');
    if (membraneRow.membranePlan === 'roll-plan' && gross !== undefined)
      limitations.push({
        code: 'membrane-roll-plan',
        params: {
          netAreaM2: net,
          grossAreaM2: gross,
          overlapAreaM2: metric('overlapArea'),
          endOverlapAreaM2: metric('endOverlapArea'),
          ridgeOverrunAreaM2: metric('ridgeOverrunArea'),
          courseCount: metric('courseCount'),
          rollCount: metric('rollCount'),
        },
      });
    else
      limitations.push({
        code: 'membrane-net-only',
        params: { netAreaM2: net },
      });
    for (const code of MEMBRANE_LIMITATION_CODES)
      if (membraneRow.warnings.includes(code)) limitations.push({ code });
  }
  if (facts.counterBattenWorkflow.state === 'needs-hip-detail')
    limitations.push({
      code: 'hip-detail-not-decided',
      params: { count: facts.counterBattenWorkflow.unresolvedHipBoundaryCount },
    });
  if (facts.battenWorkflow.state === 'manual-unverified')
    limitations.push({ code: 'batten-gauge-manual-unverified' });
  if (facts.buildUp.battenLayout?.enabled)
    limitations.push({ code: 'batten-no-stock-lengths' });
  if (facts.coverings.length) {
    const tileRow = facts.materialRows.find(
      (row) => row.category === 'covering' && row.range,
    );
    limitations.push({
      code: tileRow
        ? 'covering-declared-consumption'
        : 'covering-coverage-positions',
    });
  }
  limitations.push(
    ...structuralLimitations({ template: facts.template, k1: facts.k1 }),
  );
  if (facts.cost && facts.cost.includedLineCount > 0 && !facts.cost.complete)
    limitations.push({
      code: 'cost-incomplete',
      params: { missingPrices: facts.cost.needsPriceCount },
    });
  return limitations;
}

/** Structural limitations, shared by readiness and older export callers. */
export function structuralLimitations(facts: {
  template: RoofTemplateSpec;
  k1: K1CuttingRequirement;
}): ProjectLimitation[] {
  return [
    ...(facts.template.type === 'hip'
      ? [{ code: 'hip-execution-reference-only' as const }]
      : []),
    ...(facts.k1.status === 'unresolved' &&
    facts.k1.reason === 'ridge-connection-not-modeled'
      ? [{ code: 'ridge-half-lap-unresolved' as const }]
      : []),
    ...(roofStructureSystem(facts.template) === 'rafter-collar-tie'
      ? [{ code: 'collar-tie-geometric' as const }]
      : []),
  ];
}
