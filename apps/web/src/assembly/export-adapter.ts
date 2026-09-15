import {
  createAssemblyDrawing,
  type ResolvedRoofProject,
} from '@cieslacalc/calculator-core';
import type { CoveringAssignmentSpec } from '@cieslacalc/covering-core';
import {
  calculateLine,
  sortedScenarioLines,
  summarizeCostScenario,
  type CostScenario,
} from '@cieslacalc/cost-core';
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
import { uniformBattenGauge } from './batten-installation';

type ResolvedK1 = Extract<K1CuttingRequirement, { status: 'resolved' }>;
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
  coverings: CoveringAssignmentSpec[];
  counterBattens: CounterBattenLayoutResult;
  coveringStatuses: {
    assignmentId: string;
    status: string;
    warnings: string[];
  }[];
  /** Absent means no estimate exists yet for this project. */
  cost?: CostScenario;
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
              },
            }
          : row.familyKey === 'KL'
            ? {
                layoutFacts: {
                  status: facts.counterBattens.status,
                  planeCount: facts.counterBattens.roofPlaneIds.length,
                  axisCount: facts.counterBattens.resolvedAxisCount,
                  segmentCount: facts.counterBattens.visibleSegmentCount,
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
        return {
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
  const assumptions: ExecutionSection = {
    kind: 'assumptions',
    codes: [
      ...(facts.k1.status === 'resolved'
        ? [
            facts.k1.blank.ridgeConnection ===
            'direct-opposing-rafter-plumb-meeting'
              ? ('ridge-direct-meeting' as const)
              : ('ridge-board' as const),
          ]
        : facts.k1.status === 'unresolved' &&
            facts.k1.reason === 'ridge-connection-not-modeled'
          ? ['ridge-half-lap-unresolved' as const]
          : []),
      ...(roofStructureSystem(facts.template) === 'rafter-collar-tie'
        ? ['collar-tie-geometric' as const]
        : []),
      ...(coveringRows.length ? ['geometric-covering' as const] : []),
      ...(facts.membraneEnabled ? ['net-membrane' as const] : []),
      'no-structural-check',
      ...(facts.template.type === 'hip' || facts.surface.status !== 'resolved'
        ? ['unresolved-execution' as const]
        : []),
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
    { kind: 'assumptions', readiness: 'available', section: assumptions },
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
