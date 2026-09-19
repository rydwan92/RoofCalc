import {
  createAssemblyDrawing,
  type ResolvedRoofProject,
} from '@cieslacalc/calculator-core';
import type {
  CoveringAssignmentSpec,
  CutToLengthSheetLayoutResult,
  ModularSheetLayoutResult,
  RoofTileLayoutResult,
  StandingSeamLayoutResult,
} from '@cieslacalc/covering-core';
import {
  calculateLine,
  sortedScenarioLines,
  summarizeCostScenario,
  type CostScenario,
} from '@cieslacalc/cost-core';
import type { VariantPrice } from '../pricing/client';
import type {
  DetailPreviewModel,
  DrawingModel,
} from '@cieslacalc/drawing-engine';
import type {
  DocumentDrawing,
  DocumentSource,
  ExecutionSection,
  SectionCandidate,
} from '@cieslacalc/document-core';
import type { RoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  projectPlaneLocalToWorld,
  resolveRoofPlaneBasis,
  roofStructureSystem,
  type BattenAutoSource,
  type BattenLayoutResult,
  type CounterBattenLayoutResult,
  type RoofSurfaceGeometryResult,
} from '@cieslacalc/roof-math';
import type {
  RoofSkeleton,
  RoofTemplateSpec,
  RoofWindowFeature,
} from '@cieslacalc/timber-model';
import type { K1CuttingRequirement } from './k1-cutting-adapter';
import type { K1SessionPlan } from './K1CuttingPlan';
import type { BattenInstallationDecision } from './batten-installation';
import type { BattenWorkflow, CounterBattenWorkflow } from './batten-workflow';
import { uniformBattenGauge } from './batten-installation';
import {
  createMaterialPlanRows,
  materialValue,
  type MaterialPlanRow,
  type MaterialPriceSelection,
} from './material-plan';
import type {
  LinearMaterialKind,
  LinearPurchasePlan,
} from './linear-material-plan';
import type { MembraneProductSelection } from '@cieslacalc/covering-core';
import type { TilePurchasePlan } from './tile-purchase';
import { eaveLabel, type RoofSystemFacts } from './roof-system';
import { ROOF_SYSTEM_ROLE_GROUP } from '@cieslacalc/roof-system-core';
import {
  structuralLimitations,
  type ProjectLimitation,
} from './project-readiness';

type ResolvedK1 = Extract<K1CuttingRequirement, { status: 'resolved' }>;
export type ResolvedCoveringLayout =
  | RoofTileLayoutResult
  | ModularSheetLayoutResult
  | CutToLengthSheetLayoutResult
  | StandingSeamLayoutResult;
export type ExportFacts = {
  source: DocumentSource;
  template: RoofTemplateSpec;
  resolved: ResolvedRoofProject;
  skeleton: RoofSkeleton;
  surface: RoofSurfaceGeometryResult;
  windows: RoofWindowFeature[];
  schedule: RoofMemberSchedule;
  details: DetailPreviewModel[];
  k1: K1CuttingRequirement;
  cutting?: K1SessionPlan;
  membraneEnabled: boolean;
  counterBattensEnabled: boolean;
  battensEnabled: boolean;
  battens: BattenLayoutResult;
  battenAutoSource: BattenAutoSource;
  battenInstallationDecision?: BattenInstallationDecision;
  /** V43B workflow projections; consumed as facts, never recalculated. */
  battenWorkflow?: BattenWorkflow;
  counterBattenWorkflow?: CounterBattenWorkflow;
  coverings: CoveringAssignmentSpec[];
  counterBattens: CounterBattenLayoutResult;
  coveringStatuses: {
    assignmentId: string;
    status: string;
    warnings: string[];
  }[];
  /** Full resolved layout results, used to reach `declaredConsumptionReference`. */
  coveringLayouts?: ResolvedCoveringLayout[];
  /** Active catalogue prices for the project's assigned `catalogRef.variantId`s. */
  variantPrices?: VariantPrice[];
  /** Absent means no estimate exists yet for this project. */
  cost?: CostScenario;
  membraneProduct?: MembraneProductSelection;
  materialRows?: MaterialPlanRow[];
  materialPrices?: Record<string, MaterialPriceSelection>;
  /**
   * V47: limitation facts from project readiness — the single decision point.
   * Absent (older callers) → only structural limitations are known.
   */
  limitations?: ProjectLimitation[];
  /**
   * V48: resolved commercial plans for the linear build-up materials. Absent
   * means the user has not prepared one, and the quantities stay geometric.
   * Cost and documents consume this plan; neither re-runs a solver.
   */
  linearPlans?: Partial<Record<LinearMaterialKind, LinearPurchasePlan>>;
  /**
   * V50: roof-tile purchase plans, one per assignment the user prepared.
   * Cost, the material list and readiness read these; none re-solves them.
   */
  tilePurchasePlans?: TilePurchasePlan[];
  /**
   * V51: canonical roof features, line components and the drainage plan.
   * Absent on older callers → no roof-system rows or drainage sections.
   */
  roofSystem?: RoofSystemFacts;
};

function drawing(model: DrawingModel): DocumentDrawing {
  return {
    bounds: model.bounds,
    lines: model.lines.map(({ id, from, to, role }) => ({
      id,
      from,
      to,
      role,
    })),
    polygons: (model.polygons ?? []).map(({ id, points, role }) => ({
      id,
      points,
      role,
    })),
    dimensions: model.dimensions.map(({ id, valueMm, from, to }) => ({
      id,
      valueMm,
      from,
      to,
    })),
  };
}

function k1Section(facts: ExportFacts, k1: ResolvedK1): ExecutionSection {
  return {
    kind: 'member-fabrication',
    code: 'K1',
    count: k1.requiredPieces.length,
    section: k1.blank.section,
    requiredBlankLengthMm: k1.blank.requiredBlankLengthMm,
    ridgeConnection:
      k1.blank.ridgeConnection === 'direct-opposing-rafter-plumb-meeting'
        ? 'direct-meeting'
        : 'ridge-board',
    drawing: drawing(
      createAssemblyDrawing(facts.resolved.calculation.assembly),
    ),
    details: facts.details
      .filter(
        (detail) =>
          detail.subjectCode === 'K1' &&
          (detail.type === 'birdsmouth-detail' ||
            detail.type === 'ridge-cut-detail'),
      )
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id))
      .map((detail) => ({
        type: detail.type as 'birdsmouth-detail' | 'ridge-cut-detail',
        drawing: drawing(detail.cutStates?.after ?? detail.drawing),
        dimensions: detail.keyDimensions.map(({ labelKey, value, unit }) => ({
          labelKey,
          value,
          unit,
        })),
        steps: detail.fabricationSteps.map(
          ({
            id,
            operationId,
            action,
            fromLabel,
            targetLabel,
            distanceMm,
            angleDeg,
            seatLengthMm,
            normalDepthMm,
            remainingDepthMm,
          }) => ({
            id,
            operationId,
            action,
            fromLabel,
            targetLabel,
            distanceMm,
            angleDeg,
            seatLengthMm,
            normalDepthMm,
            remainingDepthMm,
          }),
        ),
      })),
  };
}

/** Copies the current scenario's computed totals. No pricing decision happens here. */
function costEstimateSection(
  scenario: CostScenario,
): Extract<ExecutionSection, { kind: 'cost-estimate' }> {
  const summary = summarizeCostScenario(scenario);
  const lines = sortedScenarioLines(scenario)
    .filter((line) => line.included)
    .map((line) => {
      const computed = calculateLine(line, scenario.taxRateBps);
      return {
        category: line.category,
        label: line.label,
        quantityValue: line.quantity.value,
        quantityUnit: line.quantity.unit,
        basis: line.quantityBasis,
        unitPriceMinor: line.unitPriceMinor,
        netMinor: computed.netMinor,
        taxMinor: computed.taxMinor,
        grossMinor: computed.grossMinor,
        noteKeys: [...line.noteKeys],
      };
    });
  return {
    kind: 'cost-estimate',
    currencyCode: scenario.currencyCode,
    taxRateBps: scenario.taxRateBps,
    lines,
    categoryTotals: summary.categoryTotals.map((total) => ({
      category: total.category,
      netMinor: total.netMinor,
    })),
    netMinor: summary.netMinor,
    taxMinor: summary.taxMinor,
    grossMinor: summary.grossMinor,
    complete: summary.complete,
  };
}

/** Copies already resolved facts. No roof, quantity or procurement solver runs here. */
/**
 * V51 execution-package drainage plan, read from the resolved drainage plan
 * and the canonical eaves. No count or price is computed here.
 */
function drainagePlanCandidate(facts: ExportFacts): SectionCandidate {
  const system = facts.roofSystem;
  const plan = system?.drainage;
  if (!system || !plan || plan.status === 'disabled' || !plan.runs.length)
    return {
      kind: 'drainage-plan',
      readiness: 'unavailable',
      reason: 'no-drainage',
    };
  const eaves = new Map(system.eaves.map((eave) => [eave.id, eave]));
  const label = (id: string) => {
    const eave = eaves.get(id);
    return eave ? eaveLabel(eave) : '—';
  };
  const section: ExecutionSection = {
    kind: 'drainage-plan',
    ...(system.intent?.drainage?.system
      ? { systemName: system.intent.drainage.system.name }
      : {}),
    layout: plan.mode === 'auto' ? 'proposed' : 'manual',
    outlines: facts.surface.planes.map((plane) => ({
      id: plane.roofPlaneId,
      points: plane.worldPolygon.map(({ x, y }) => ({ x, y })),
    })),
    gutters: plan.gutteredEaveIds.flatMap((id) => {
      const eave = eaves.get(id);
      return eave
        ? [
            {
              eaveLabel: eaveLabel(eave),
              from: { x: eave.start.x, y: eave.start.y },
              to: { x: eave.end.x, y: eave.end.y },
              lengthMm: eave.lengthMm,
            },
          ]
        : [];
    }),
    runs: plan.runs.map((run) => ({
      label: `R${run.ordinal}`,
      eaveLabels: run.segments.map((segment) => label(segment.eaveId)),
      lengthMm: run.lengthMm,
      closed: run.closed,
      connectedCorners: run.cornerIds.length,
    })),
    outlets: plan.outlets.map((outlet, index) => {
      const eave = eaves.get(outlet.eaveId)!;
      return {
        label: `P${index + 1}`,
        eaveLabel: eaveLabel(eave),
        at: {
          x: eave.start.x + (eave.end.x - eave.start.x) * outlet.station,
          y: eave.start.y + (eave.end.y - eave.start.y) * outlet.station,
        },
        distanceFromEaveStartMm: outlet.positionMm,
        ...(outlet.downpipe.heightMm !== undefined
          ? { downpipeHeightMm: outlet.downpipe.heightMm }
          : {}),
        ...(outlet.downpipe.elbows !== undefined
          ? { elbows: outlet.downpipe.elbows }
          : {}),
        ...(outlet.downpipe.route ? { route: outlet.downpipe.route } : {}),
        ...(outlet.downpipe.offsetPipeLengthMm !== undefined
          ? { offsetPipeLengthMm: outlet.downpipe.offsetPipeLengthMm }
          : {}),
      };
    }),
    ...(plan.hooks.actualIntervalMm !== undefined
      ? { hookSpacingMm: plan.hooks.actualIntervalMm }
      : {}),
    ...(plan.hooks.jointClearanceMm !== undefined
      ? { hookJointClearanceMm: plan.hooks.jointClearanceMm }
      : {}),
    hydraulicsNotVerified: true,
  };
  return {
    kind: 'drainage-plan',
    readiness: plan.status === 'complete' ? 'available' : 'warning',
    ...(plan.status === 'complete' ? {} : { reason: 'drainage-incomplete' }),
    section,
  };
}

/**
 * V52 roof-detail execution section: system elements per roof area, read
 * from the resolved line components and opening systems. Present only when
 * the roof has such elements or openings.
 */
function roofDetailsCandidate(facts: ExportFacts): SectionCandidate {
  const system = facts.roofSystem;
  const features = system?.topology.features ?? [];
  const scope = (featureIds: readonly string[]) =>
    (['ridge', 'hip', 'eave', 'verge', 'valley'] as const).flatMap((kind) => {
      const ordinals = features
        .filter(
          (feature) => feature.kind === kind && featureIds.includes(feature.id),
        )
        .map((feature) => feature.ordinal);
      return ordinals.length ? [{ kind, ordinals }] : [];
    });
  const lineGroup = (
    area: 'ridge' | 'eave' | 'verge',
    groups: readonly string[],
  ) => ({
    area,
    items: (system?.lineComponents ?? [])
      .filter(
        (item) =>
          item.status !== 'not-applicable' &&
          groups.includes(ROOF_SYSTEM_ROLE_GROUP[item.role]),
      )
      .map((item) => ({
        roleKey: `roofSystem.${item.role}`,
        product: item.name,
        source: item.source,
        scope: scope(item.featureIds),
        decided: item.status === 'resolved',
      })),
  });
  const groups = [
    lineGroup('ridge', ['ridge-hip']),
    lineGroup('eave', ['eave']),
    lineGroup('verge', ['verge']),
    {
      area: 'openings' as const,
      items: (system?.openingSystems ?? []).map((opening) => ({
        roleKey: 'opening.flashing-kit',
        ...(opening.flashing.name ? { product: opening.flashing.name } : {}),
        source: opening.flashing.source ?? ('manual' as const),
        scope: [],
        opening: {
          ordinal: opening.ordinal,
          widthMm: opening.widthMm,
          heightMm: opening.heightMm,
          includes: opening.flashing.includes,
        },
        decided: opening.flashing.status === 'resolved',
      })),
    },
  ].filter((group) => group.items.length);
  if (!groups.length)
    return {
      kind: 'roof-details',
      readiness: 'unavailable',
      reason: 'no-roof-details',
    };
  const open = groups.some((group) =>
    group.items.some((item) => !item.decided),
  );
  return {
    kind: 'roof-details',
    readiness: open ? 'warning' : 'available',
    ...(open ? { reason: 'roof-details-incomplete' } : {}),
    section: { kind: 'roof-details', groups },
  };
}

export function createExportCandidates(facts: ExportFacts): SectionCandidate[] {
  const timberFamilies = new Map<string, number>();
  for (const row of facts.schedule.timberRows)
    timberFamilies.set(
      row.familyKey,
      (timberFamilies.get(row.familyKey) ?? 0) + row.quantity,
    );
  const summary: ExecutionSection = {
    kind: 'project-summary',
    roofType: facts.template.type,
    structuralSystem: roofStructureSystem(facts.template),
    buildingLengthMm: facts.template.buildingLengthMm,
    halfRunMm: facts.template.halfRunMm,
    pitchDeg: facts.template.pitchDeg,
    netRoofAreaMm2:
      facts.surface.status === 'resolved'
        ? facts.surface.netAreaMm2
        : undefined,
    openingCount: facts.windows.length,
    timberFamilies: [...timberFamilies]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, count]) => ({ code, count })),
    enabledLayerCount: [
      facts.membraneEnabled,
      facts.counterBattensEnabled,
      facts.battensEnabled,
    ].filter(Boolean).length,
    coveringCount: facts.coverings.length,
    resolvedCoveringCount: facts.coveringStatuses.filter(
      (row) => row.status === 'resolved',
    ).length,
  };
  const overview: ExecutionSection = {
    kind: 'roof-overview',
    outlines: facts.surface.planes.map((plane) => ({
      id: plane.roofPlaneId,
      points: plane.worldPolygon.map(({ x, y }) => ({ x, y })),
    })),
    members: facts.skeleton.members
      .filter(
        (member) => member.kind !== 'wall-plate' && member.kind !== 'purlin',
      )
      .map((member) => ({
        id: member.id,
        code:
          member.kind === 'rafter'
            ? 'K1'
            : member.kind === 'hip-rafter'
              ? 'H1'
              : member.kind === 'jack-rafter'
                ? 'J1'
                : member.kind === 'ridge'
                  ? 'KR'
                  : member.kind === 'collar-tie'
                    ? 'C1'
                    : member.kind === 'opening-header'
                      ? 'N'
                      : member.kind === 'rafter-segment'
                        ? 'K1*'
                        : member.kind,
        from: { x: member.from.x, y: member.from.y },
        to: { x: member.to.x, y: member.to.y },
        role: member.kind,
      })),
    openings: facts.windows.map((window) => {
      const { uMm, vMm } = window.position;
      return {
        id: window.id,
        points: [
          { uMm, vMm },
          { uMm: uMm + window.widthMm, vMm },
          { uMm: uMm + window.widthMm, vMm: vMm + window.heightMm },
          { uMm, vMm: vMm + window.heightMm },
        ].map((local) => {
          const world = projectPlaneLocalToWorld(
            resolveRoofPlaneBasis(facts.template, window.roofPlaneId),
            local,
          );
          return { x: world.x, y: world.y };
        }),
      };
    }),
  };
  const grouped = new Map<
    string,
    Extract<ExecutionSection, { kind: 'member-schedule' }>['rows'][number]
  >();
  for (const row of facts.schedule.timberRows) {
    const key = JSON.stringify([
      row.familyKey,
      row.memberKind,
      row.section.widthMm,
      row.section.depthMm,
      row.lengthBasis,
    ]);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += row.quantity;
      existing.minLengthMm = Math.min(existing.minLengthMm, row.lengthMm);
      existing.maxLengthMm = Math.max(existing.maxLengthMm, row.lengthMm);
    } else
      grouped.set(key, {
        code: row.familyKey,
        memberKind: row.memberKind,
        count: row.quantity,
        widthMm:
          row.section.completeness === 'complete'
            ? row.section.widthMm
            : undefined,
        depthMm:
          row.section.completeness === 'complete'
            ? row.section.depthMm
            : undefined,
        minLengthMm: row.lengthMm,
        maxLengthMm: row.lengthMm,
        basis: row.lengthBasis,
      });
  }
  const schedule: ExecutionSection = {
    kind: 'member-schedule',
    rows: [...grouped.values()].sort(
      (a, b) =>
        a.code.localeCompare(b.code) ||
        a.memberKind.localeCompare(b.memberKind),
    ),
  };
  const ungroupedLayers: Extract<ExecutionSection, { kind: 'layers' }>['rows'] =
    [
      ...facts.schedule.surfaceBuildUpRows.map((row) => ({
        code: row.familyKey,
        areaMm2: row.areaMm2,
        basis: row.semantic,
        warnings: row.warningKeys,
      })),
      ...facts.schedule.buildUpRows.map((row) => ({
        code: row.familyKey,
        count: row.quantity,
        lengthMm: row.totalLengthMm,
        basis: row.lengthBasis,
        warnings: row.warningKeys,
        ...(row.familyKey === 'L'
          ? {
              layoutFacts: {
                mode: facts.battens.mode,
                status: facts.battens.status,
                actualGaugeMm: uniformBattenGauge(facts.battens),
                ...(facts.battenInstallationDecision
                  ? {
                      decisionStatus: facts.battenInstallationDecision.status,
                      decisionIssueCodes:
                        facts.battenInstallationDecision.issues.map(
                          (issue) => issue.code,
                        ),
                      gaugeSource:
                        facts.battenInstallationDecision.gaugeSource ===
                        'manufacturer-product-data'
                          ? ('manufacturer-product-data' as const)
                          : facts.battenInstallationDecision.gaugeSource ===
                              'project-user-input'
                            ? ('project-user-input' as const)
                            : ('unavailable' as const),
                      eaveOffsetMm:
                        facts.battenInstallationDecision.eaveReference.valueMm,
                      ridgeOffsetMm:
                        facts.battenInstallationDecision.ridgeReference.valueMm,
                    }
                  : {}),
                autoPlans: facts.battens.planes.flatMap((plane) =>
                  plane.autoPlan
                    ? [
                        {
                          planeId: plane.roofPlaneId,
                          regularSpanMm: plane.autoPlan.regularSpanMm,
                          targetGaugeMm: plane.autoPlan.targetGaugeMm,
                          intervalCount: plane.autoPlan.intervalCount,
                          courseCount: plane.autoPlan.courseCount,
                          actualGaugeMm: plane.autoPlan.actualGaugeMm,
                          firstStationMm: plane.autoPlan.firstStationMm,
                          lastStationMm: plane.autoPlan.lastStationMm,
                        },
                      ]
                    : [],
                ),
                ...(facts.battenAutoSource.status === 'resolved'
                  ? {
                      minimumGaugeMm: facts.battenAutoSource.minimumGaugeMm,
                      maximumGaugeMm: facts.battenAutoSource.maximumGaugeMm,
                    }
                  : {}),
                planeCount: facts.battens.planes.length,
                courseCount: facts.battens.planes.reduce(
                  (sum, plane) => sum + plane.courseCount,
                  0,
                ),
                ...(facts.battenWorkflow
                  ? {
                      workflowState: facts.battenWorkflow.state,
                      ...(facts.battenWorkflow.productLabel
                        ? { coveringProduct: facts.battenWorkflow.productLabel }
                        : {}),
                      ...(facts.battenWorkflow.installationModeId
                        ? {
                            installationModeId:
                              facts.battenWorkflow.installationModeId,
                          }
                        : {}),
                    }
                  : {}),
              },
            }
          : row.familyKey === 'KL'
            ? {
                layoutFacts: {
                  status: facts.counterBattens.status,
                  planeCount: facts.counterBattens.roofPlaneIds.length,
                  axisCount: facts.counterBattens.resolvedAxisCount,
                  segmentCount: facts.counterBattens.visibleSegmentCount,
                  ...(facts.counterBattenWorkflow
                    ? {
                        workflowState: facts.counterBattenWorkflow.state,
                        ...(facts.counterBattenWorkflow.hipBoundaryCount > 0
                          ? {
                              hipDetail: facts.counterBattenWorkflow.hipDetail,
                              hipBoundaryCount:
                                facts.counterBattenWorkflow.hipBoundaryCount,
                              unresolvedHipBoundaryCount:
                                facts.counterBattenWorkflow
                                  .unresolvedHipBoundaryCount,
                            }
                          : {}),
                      }
                    : {}),
                },
              }
            : {}),
      })),
    ];
  const layerGroups = new Map<string, (typeof ungroupedLayers)[number]>();
  for (const row of ungroupedLayers) {
    const key = JSON.stringify([row.code, row.basis]);
    const existing = layerGroups.get(key);
    if (existing) {
      if (row.count !== undefined)
        existing.count = (existing.count ?? 0) + row.count;
      if (row.lengthMm !== undefined)
        existing.lengthMm = (existing.lengthMm ?? 0) + row.lengthMm;
      if (row.areaMm2 !== undefined)
        existing.areaMm2 = (existing.areaMm2 ?? 0) + row.areaMm2;
      existing.warnings = [
        ...new Set([...existing.warnings, ...row.warnings]),
      ].sort();
    } else layerGroups.set(key, { ...row, warnings: [...row.warnings].sort() });
  }
  const layerRows = [...layerGroups.values()];
  const layers: ExecutionSection = {
    kind: 'layers',
    rows: layerRows.sort((a, b) => a.code.localeCompare(b.code)),
  };
  const coveringRows: Extract<ExecutionSection, { kind: 'covering' }>['rows'] =
    facts.coverings
      .map((assignment) => {
        const row = facts.schedule.coveringRows.find(
          (candidate) => candidate.assignmentId === assignment.id,
        );
        const status = facts.coveringStatuses.find(
          (candidate) => candidate.assignmentId === assignment.id,
        );
        const spec = assignment.product.technicalSpecSnapshot;
        const tileLayout = (facts.coveringLayouts ?? []).find(
          (item): item is RoofTileLayoutResult =>
            item.kind === 'roof-tile' && item.assignmentId === assignment.id,
        );
        const tilePlan = facts.tilePurchasePlans?.find(
          (plan) => plan.assignmentId === assignment.id,
        );
        const gauges = (tileLayout?.planes ?? []).flatMap((plane) =>
          plane.actualGaugeRangeMm ? [plane.actualGaugeRangeMm] : [],
        );
        return {
          ...(tileLayout?.status === 'resolved'
            ? {
                tile: {
                  installationModeId: tileLayout.installationModeId,
                  courseCount: tileLayout.planes.reduce(
                    (sum, plane) =>
                      sum +
                      plane.courses.filter((course) => course.layerIndex === 0)
                        .length,
                    0,
                  ),
                  ...(gauges.length
                    ? {
                        gaugeMinMm: Math.min(...gauges.map((g) => g.min)),
                        gaugeMaxMm: Math.max(...gauges.map((g) => g.max)),
                      }
                    : {}),
                  accessories: (tilePlan?.accessories ?? []).map((item) => ({
                    role: item.role,
                    ...(item.selection?.displaySnapshot?.familyName
                      ? { name: item.selection.displaySnapshot.familyName }
                      : {}),
                    ...(item.quantity !== undefined
                      ? { quantity: item.quantity }
                      : {}),
                    status: item.status,
                  })),
                },
              }
            : {}),
          name:
            [
              assignment.product.displaySnapshot?.manufacturer,
              assignment.product.displaySnapshot?.familyName,
              assignment.product.displaySnapshot?.variantName,
            ]
              .filter(Boolean)
              .join(' ') || assignment.id,
          family:
            spec.kind === 'modular-sheet' &&
            spec.lengthModel.kind === 'cut-to-length'
              ? ('modular-sheet-cut-to-length' as const)
              : spec.kind,
          planeIds: [...assignment.roofPlaneIds].sort(),
          status:
            status?.status === 'resolved' && row
              ? ('resolved' as const)
              : ('unresolved' as const),
          measure: row
            ? row.unit === 'coverage-position'
              ? {
                  kind: row.unit,
                  count: row.quantity,
                  full: row.fullPositions,
                  cut: row.cutPositions,
                }
              : { kind: row.unit, count: row.quantity }
            : undefined,
          warnings: [
            ...(status?.warnings ?? []),
            ...(row?.warningKeys ?? []),
          ].sort(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  const covering: ExecutionSection = { kind: 'covering', rows: coveringRows };
  const pieceLabels = new Map(
    facts.k1.status === 'resolved'
      ? facts.k1.requiredPieces.map(
          (piece, index) =>
            [piece.id, `K1-${String(index + 1).padStart(2, '0')}`] as const,
        )
      : [],
  );
  const cutting: ExecutionSection | undefined =
    facts.cutting && facts.k1.status === 'resolved'
      ? {
          kind: 'cutting-plan',
          status: facts.cutting.value.status,
          stock: [
            ...facts.cutting.value.stockUsages.reduce(
              (map, usage) =>
                map.set(
                  usage.originalLengthMm,
                  (map.get(usage.originalLengthMm) ?? 0) + 1,
                ),
              new Map<number, number>(),
            ),
          ]
            .sort(([a], [b]) => a - b)
            .map(([lengthMm, count]) => ({ lengthMm, count })),
          usages: facts.cutting.value.stockUsages.map((usage) => ({
            id: usage.stockInstanceId,
            lengthMm: usage.originalLengthMm,
            cuts: usage.cuts.map((cut) => ({
              pieceId: cut.requiredPieceId,
              label: pieceLabels.get(cut.requiredPieceId) ?? 'K1',
              fromMm: cut.fromMm,
              toMm: cut.toMm,
              blankLengthMm: cut.requiredBlankLengthMm,
            })),
            remainingLengthMm: usage.remainingLengthMm,
            remnantClassification: usage.remnantClassification,
          })),
          requiredCount: facts.cutting.value.summary.requiredPieceCount,
          assignedCount: facts.cutting.value.summary.assignedPieceCount,
          unassignedCount: facts.cutting.value.summary.unassignedPieceCount,
          kerfMm: facts.cutting.settings.kerfMm,
          endTrimMm: facts.cutting.settings.endTrimMm,
          minimumReusableRemnantMm:
            facts.cutting.settings.minimumReusableRemnantMm,
          kerfLossMm: facts.cutting.value.summary.kerfLossMm,
          wasteLengthMm: facts.cutting.value.summary.wasteLengthMm,
          reusableRemnantLengthMm:
            facts.cutting.value.summary.reusableRemnantLengthMm,
        }
      : undefined;
  const limitations = facts.limitations ?? structuralLimitations(facts);
  const membranePlan = limitations.find(
    (item) => item.code === 'membrane-roll-plan',
  );
  const resolvedCoverings = coveringRows.filter(
    (row) => row.status === 'resolved',
  );
  const assumptions: ExecutionSection = {
    kind: 'assumptions',
    scope: [
      {
        code: 'roof-geometry',
        params: {
          roofType: facts.template.type,
          pitchDeg: facts.template.pitchDeg,
        },
      },
      ...(facts.k1.status === 'resolved'
        ? [
            {
              code:
                facts.k1.blank.ridgeConnection ===
                'direct-opposing-rafter-plumb-meeting'
                  ? 'k1-direct-meeting'
                  : 'k1-ridge-board',
              params: { count: facts.k1.requiredPieces.length },
            },
          ]
        : []),
      ...(cutting
        ? [
            {
              code: 'k1-cutting-plan',
              params: { stockCount: cutting.usages.length },
            },
          ]
        : []),
      ...(resolvedCoverings.length
        ? [
            {
              code: 'covering-layout',
              params: {
                count: resolvedCoverings.reduce(
                  (sum, row) => sum + (row.measure?.count ?? 0),
                  0,
                ),
              },
            },
          ]
        : []),
      ...(facts.battensEnabled && facts.battens.battens.length
        ? [
            {
              code: 'battens-layout',
              params: {
                rows: facts.battens.battens.length,
                lengthMm: facts.battens.totalLengthMm,
              },
            },
          ]
        : []),
      ...(facts.counterBattensEnabled &&
      facts.counterBattens.totalVisibleLengthMm > 0
        ? [
            {
              code: 'counter-battens-layout',
              params: { lengthMm: facts.counterBattens.totalVisibleLengthMm },
            },
          ]
        : []),
      ...(membranePlan && 'params' in membranePlan
        ? [
            {
              code: 'membrane-roll-plan',
              params: Object.fromEntries(
                Object.entries(membranePlan.params).filter(
                  (entry): entry is [string, number] =>
                    typeof entry[1] === 'number',
                ),
              ),
            },
          ]
        : []),
    ],
    limitations: limitations
      .filter((item) => item.code !== 'membrane-roll-plan')
      .map((item) =>
        'params' in item
          ? {
              code: item.code,
              params: item.params as Record<string, number>,
            }
          : { code: item.code },
      ),
    notModelled: [
      { code: 'structural-check' },
      { code: 'connector-sizing' },
      { code: 'waste-and-stock' },
    ],
  };
  return [
    { kind: 'project-summary', readiness: 'available', section: summary },
    {
      kind: 'roof-overview',
      readiness: facts.surface.planes.length
        ? facts.surface.status === 'resolved'
          ? 'available'
          : 'warning'
        : 'unavailable',
      reason:
        facts.surface.status === 'invalid' ? 'invalid-roof-surface' : undefined,
      section: facts.surface.planes.length ? overview : undefined,
    },
    {
      kind: 'member-schedule',
      readiness: schedule.rows.length ? 'available' : 'unavailable',
      reason: schedule.rows.length ? undefined : 'no-members',
      section: schedule.rows.length ? schedule : undefined,
    },
    {
      kind: 'member-fabrication',
      readiness: facts.k1.status === 'resolved' ? 'available' : 'unavailable',
      reason: facts.k1.status === 'resolved' ? undefined : 'k1-unresolved',
      section:
        facts.k1.status === 'resolved' ? k1Section(facts, facts.k1) : undefined,
    },
    {
      kind: 'cutting-plan',
      readiness: cutting
        ? cutting.status === 'complete'
          ? 'available'
          : 'warning'
        : 'unavailable',
      reason: cutting
        ? cutting.status === 'complete'
          ? undefined
          : 'cutting-incomplete'
        : 'plan-k1-first',
      section: cutting,
    },
    {
      kind: 'layers',
      readiness: layerRows.length
        ? layerRows.some(
            (row) =>
              row.warnings.length ||
              (row.layoutFacts?.decisionStatus &&
                ['incompatible', 'no-data', 'decision-required'].includes(
                  row.layoutFacts.decisionStatus,
                )),
          )
          ? 'warning'
          : 'available'
        : 'unavailable',
      reason: layerRows.length ? undefined : 'no-layers',
      section: layerRows.length ? layers : undefined,
    },
    {
      kind: 'covering',
      readiness: coveringRows.length
        ? coveringRows.some(
            (row) => row.status === 'unresolved' || row.warnings.length,
          )
          ? 'warning'
          : 'available'
        : 'unavailable',
      reason: coveringRows.length ? undefined : 'no-covering',
      section: coveringRows.length ? covering : undefined,
    },
    drainagePlanCandidate(facts),
    roofDetailsCandidate(facts),
    { kind: 'assumptions', readiness: 'available', section: assumptions },
    (() => {
      const rows =
        facts.materialRows ??
        createMaterialPlanRows(facts, facts.membraneProduct);
      return {
        kind: 'material-list' as const,
        readiness: rows.length
          ? ('warning' as const)
          : ('unavailable' as const),
        reason: rows.length ? undefined : 'no-materials',
        section: rows.length
          ? {
              kind: 'material-list' as const,
              rows: rows.map((row) => {
                /**
                 * V48 §30: the material list states the commercial plan the
                 * workbench already resolved — never a second solver run, and
                 * never hundreds of individual cuts (those belong in the
                 * execution annex).
                 */
                const linearKind =
                  row.labelKey === 'battens'
                    ? ('batten' as const)
                    : row.labelKey === 'counterBattens'
                      ? ('counter-batten' as const)
                      : undefined;
                const linearPlan = linearKind
                  ? facts.linearPlans?.[linearKind]
                  : undefined;
                const chosen = facts.materialPrices?.[row.id];
                const price =
                  chosen &&
                  chosen.valid !== false &&
                  (chosen.source === 'manual' ||
                    (chosen.variantId === row.product?.variantId &&
                      chosen.saleUnit === row.unit))
                    ? chosen
                    : undefined;
                const value = materialValue(row, price);
                const linearPieces = linearPlan
                  ? linearPlan.stock.reduce(
                      (sum, item) => sum + item.quantity,
                      0,
                    )
                  : undefined;
                // V49: each commercial length names its section and source,
                // so the list says exactly what to buy and where it came from.
                const linearSection = linearPlan?.section
                  ? `${Math.min(linearPlan.section.widthMm, linearPlan.section.depthMm)}×${Math.max(linearPlan.section.widthMm, linearPlan.section.depthMm)} × `
                  : '';
                const linearBreakdown = linearPlan
                  ? [...linearPlan.stock]
                      .sort(
                        (a, b) =>
                          a.lengthMm - b.lengthMm ||
                          a.stockOptionId.localeCompare(b.stockOptionId),
                      )
                      .map((item) => {
                        const origin =
                          linearPlan.stockSources[item.stockOptionId];
                        // Language-neutral: the document renders its own
                        // labels; a manual length simply has no product name.
                        return `${item.quantity} × ${linearSection}${item.lengthMm / 1000} m${
                          origin?.kind === 'catalogue'
                            ? ` (${origin.manufacturerName ? `${origin.manufacturerName}: ` : ''}${origin.productName})`
                            : ''
                        }`;
                      })
                      .join(' · ')
                  : undefined;
                const linearMetrics = linearPlan
                  ? [
                      {
                        labelKey: 'installationRequirement',
                        value: linearPlan.installedLengthMm / 1000,
                        unit: 'm',
                      },
                      {
                        labelKey: 'purchasedLength',
                        value: linearPlan.purchasedLengthMm / 1000,
                        unit: 'm',
                      },
                      {
                        labelKey: 'wasteLength',
                        value: linearPlan.plan.summary.wasteLengthMm / 1000,
                        unit: 'm',
                      },
                      {
                        labelKey: 'reusableLength',
                        value:
                          linearPlan.plan.summary.reusableRemnantLengthMm /
                          1000,
                        unit: 'm',
                      },
                    ]
                  : [];
                return {
                  category: row.category,
                  labelKey: row.labelKey,
                  description: linearBreakdown ?? row.description,
                  product: row.product?.name,
                  basis: linearPlan
                    ? 'procurement-stock'
                    : row.range
                      ? 'manufacturer'
                      : row.basis,
                  quantity: linearPieces ?? row.quantity,
                  minimumQuantity: row.range?.min,
                  maximumQuantity: row.range?.max,
                  unit: linearPlan ? 'piece' : row.unit,
                  partial: row.partial,
                  warnings: row.warnings,
                  metrics: [...linearMetrics, ...row.metrics],
                  priceProvenance: price?.provenance,
                  unitPriceMinor: price?.amountMinor,
                  minimumValueMinor: value?.min,
                  maximumValueMinor: value?.max,
                  currencyCode: price?.currencyCode,
                };
              }),
            }
          : undefined,
      };
    })(),
    (() => {
      const includedLineCount =
        facts.cost?.lines.filter((line) => line.included).length ?? 0;
      if (!facts.cost || !includedLineCount)
        return {
          kind: 'cost-estimate' as const,
          readiness: 'unavailable' as const,
          reason: 'no-cost-lines',
        };
      const section = costEstimateSection(facts.cost);
      return {
        kind: 'cost-estimate' as const,
        readiness: section.complete
          ? ('available' as const)
          : ('warning' as const),
        reason: section.complete ? undefined : 'cost-incomplete',
        section,
      };
    })(),
  ];
}
