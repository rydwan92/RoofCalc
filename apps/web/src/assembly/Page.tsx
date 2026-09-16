import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRoofProjectDocument,
  currentMemberInstance,
  withOpeningFramingFabrication,
} from '@cieslacalc/calculator-core';
import {
  createCutToLengthSheetQuantitySource,
  createModularSheetQuantitySource,
  createRoofTileQuantitySource,
  createStandingSeamQuantitySource,
  resolveCutToLengthSheetLayout,
  resolveModularSheetLayout,
  resolvePrimaryCoveringAssignments,
  resolveRoofTileLayout,
  resolveStandingSeamLayout,
  type CoveringAssignmentSpec,
  type CutToLengthSheetLayoutResult,
  type ModularSheetLayoutResult,
  type RoofTileLayoutResult,
  type StandingSeamLayoutResult,
} from '@cieslacalc/covering-core';
import {
  createRoofMemberSchedule,
  type RoofMemberScheduleRow,
} from '@cieslacalc/quantity-core';
import {
  ArrowLeft,
  House,
  RotateCcw,
  Redo2,
  Undo2,
  X,
  SlidersHorizontal,
  Wrench,
  Maximize,
} from 'lucide-react';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  lengthUnits,
  createOpeningFramingDraft,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
  resolveBattenLayout,
  resolveCounterBattenLayout,
  resolveFinishedRafterSolid,
  resolveMembraneLayout,
  resolveRoofFeatureCollisions,
  resolveRoofSurfaceGeometry,
} from '@cieslacalc/roof-math';
import { useAssembly } from './store';
import {
  GeometryInputs,
  HipTimberInputs,
  NumberField,
  RoofTypeSelector,
  SupportInputs,
  TimberInputs,
} from './Inputs';
import { AssemblyCanvas, entityLabel } from './Canvas';
import { HipFabricationSheet } from './HipFabricationSheet';
import {
  DetailDrawer,
  QuickCutPreviews,
  QuickDetailDialog,
} from './DetailPreview';
import { ContextualResults, HipResults, Results } from './Summary';
import { Toolbox } from './Toolbox';
import { WorkbenchControls, MobileViewSettings } from './WorkbenchControls';
import { ContextualTaskTabs, PerspectiveBar } from './PerspectiveBar';
import {
  DocumentHub,
  HUB_DOCUMENT_SECTIONS,
  type HubDocumentKind,
} from './DocumentHub';
import { downloadMaterialCsv } from './material-csv';
import { downloadCostEstimateCsv } from './cost-csv';
import { workbenchLocation } from './workbench';
import { projectExampleDocument } from './project-examples';
import { PreparationPlan } from './PreparationPlan';
import { Inspector } from './Inspector';
import { WorkbenchContextBar } from './WorkbenchContextBar';
import { MobileSheet } from './MobileSheet';
import { MobileTaskDock } from './MobileTaskDock';
import { useMobileWorkbench } from './mobile-workbench';
import { BuildUpSummaryBar } from './BuildUpWorkspace';
import { workbenchProjectResolver } from './workbench-project';
import { resolveWorkbenchSelectionContext } from './selection';
import { createK1CuttingRequirement } from './k1-cutting-adapter';
import { k1RequirementSignature } from './k1-cutting-adapter';
import type { ExportFacts } from './export-adapter';
import { usePriceOptions } from '../pricing/use-prices';
import {
  createMaterialPlanRows,
  materialScenarioPrices,
  type MaterialPriceSelection,
} from './material-plan';
import { useCostScenario } from './use-cost-scenario';
import type { DocumentSource } from '@cieslacalc/document-core';
import type { K1SessionPlan } from './K1CuttingPlan';
import {
  deriveProjectWorkflow,
  type ProjectWorkflowAction,
} from './project-workflow';
import { ProjectSummary, ProjectWorkflowStrip } from './ProjectWorkflow';
import { ProjectManager, projectStatusLabel } from '../projects/ProjectManager';
import { ProjectSession } from '../projects/session';
import {
  ProjectStartAssistant,
  type ProjectStartMode,
} from './ProjectStartAssistant';
import { evaluateBattenInstallation } from './batten-installation';
import { deriveProjectGuidance } from './project-guidance';
import { resolveBattenAutoComposition } from './batten-composition';
import './styles.css';
import './v37.css';

const creatorStartSeenKey = 'cieslacalc.creatorStartSeen.v1';

function creatorStartWasSeen() {
  try {
    return globalThis.localStorage.getItem(creatorStartSeenKey) === '1';
  } catch {
    return false;
  }
}

function rememberCreatorStart() {
  try {
    globalThis.localStorage.setItem(creatorStartSeenKey, '1');
  } catch {
    // The assistant remains usable when browser preference storage is blocked.
  }
}

const MaterialSchedule = lazy(() =>
  import('./MaterialSchedule').then((module) => ({
    default: module.MaterialSchedule,
  })),
);
const SkeletonCanvas = lazy(() =>
  import('./SkeletonCanvas').then((module) => ({
    default: module.SkeletonCanvas,
  })),
);
const MaterialScheduleInspector = lazy(() =>
  import('./MaterialSchedule').then((module) => ({
    default: module.MaterialScheduleInspector,
  })),
);
const CoveringWorkspace = lazy(() =>
  import('./CoveringWorkspace').then((module) => ({
    default: module.CoveringWorkspace,
  })),
);
const CoveringInspector = lazy(() =>
  import('./CoveringWorkspace').then((module) => ({
    default: module.CoveringInspector,
  })),
);
const K1CuttingPlan = lazy(() =>
  import('./K1CuttingPlan').then((module) => ({
    default: module.K1CuttingPlan,
  })),
);
const ExecutionExport = lazy(() =>
  import('./ExecutionExport').then((module) => ({
    default: module.ExecutionExport,
  })),
);
const MaterialPlan = lazy(() =>
  import('./MaterialPlan').then((module) => ({ default: module.MaterialPlan })),
);
const CostWorkspace = lazy(() =>
  import('./CostWorkspace').then((module) => ({
    default: module.CostWorkspace,
  })),
);
/**
 * V38: the whole Three.js stack lives behind this one dynamic import, so the
 * initial Quick/Creator bundle never pays for a renderer the user has not
 * opened. 2D remains the default workspace renderer.
 */
const TechnicalScene3D = lazy(() =>
  import('./scene3d/TechnicalScene3D').then((module) => ({
    default: module.TechnicalScene3D,
  })),
);

type TileAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'roof-tile' }
    >;
  };
};

type ModularSheetAssignment = CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'modular-sheet' }
    >;
  };
};

type ResolvedCoveringLayout =
  | RoofTileLayoutResult
  | ModularSheetLayoutResult
  | CutToLengthSheetLayoutResult
  | StandingSeamLayoutResult;

function isTileAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is TileAssignment {
  return assignment.product.technicalSpecSnapshot.kind === 'roof-tile';
}

function isModularSheetAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is ModularSheetAssignment {
  return assignment.product.technicalSpecSnapshot.kind === 'modular-sheet';
}

function isCutToLengthSheetAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is ModularSheetAssignment & {
  product: ModularSheetAssignment['product'] & {
    technicalSpecSnapshot: ModularSheetAssignment['product']['technicalSpecSnapshot'] & {
      lengthModel: Extract<
        ModularSheetAssignment['product']['technicalSpecSnapshot']['lengthModel'],
        { kind: 'cut-to-length' }
      >;
    };
  };
} {
  return (
    isModularSheetAssignment(assignment) &&
    assignment.product.technicalSpecSnapshot.lengthModel.kind ===
      'cut-to-length'
  );
}

function isStandingSeamAssignment(
  assignment: CoveringAssignmentSpec,
): assignment is CoveringAssignmentSpec & {
  product: CoveringAssignmentSpec['product'] & {
    technicalSpecSnapshot: Extract<
      CoveringAssignmentSpec['product']['technicalSpecSnapshot'],
      { kind: 'standing-seam' }
    >;
  };
} {
  return assignment.product.technicalSpecSnapshot.kind === 'standing-seam';
}

function AssemblyPageContent() {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const [projectSession] = useState(() => new ProjectSession());
  const projectSessionState = useSyncExternalStore(
    projectSession.subscribe,
    projectSession.snapshot,
  );
  const [quickDetail, setQuickDetail] = useState<
    (typeof allDetailPreviews)[number] | undefined
  >();
  const [documentRequest, setDocumentRequest] = useState<{
    kind: HubDocumentKind;
    mode: 'preview' | 'configure';
  }>();
  const [materialPrices, setMaterialPrices] = useState<
    Record<string, MaterialPriceSelection>
  >({});
  useEffect(() => setMaterialPrices({}), [projectSessionState.active?.id]);
  const [currentCuttingPlan, setCurrentCuttingPlan] = useState<{
    projectId: string;
    plan: K1SessionPlan;
  }>();
  const [exportSource, setExportSource] = useState<DocumentSource>();
  const [exportError, setExportError] = useState('');
  const [costScenario, setCostScenario] = useCostScenario(
    projectSessionState.active?.id,
  );
  const [projectStartMode, setProjectStartMode] = useState<ProjectStartMode>();
  const [reuseFreshProject, setReuseFreshProject] = useState(false);
  const workbench = state.workbench;
  const mobile = useMobileWorkbench();
  const drawer = workbench.detailDrawer;
  const brand = import.meta.env.VITE_BRAND_NAME || 'CieślaCalc';
  const project = useMemo(
    () => workbenchProjectResolver.resolve(state.template),
    [state.template],
  );
  const {
    resolved: templateResult,
    skeleton: baseSkeleton,
    fabricationPackage: baseFabricationPackage,
    memberInstances,
    detailPreviews: allDetailPreviews,
  } = project;
  const roofWindows = useMemo(
    () =>
      state.projectDocument.project.features.filter(
        (feature) => feature.kind === 'roof-window',
      ),
    [state.projectDocument.project.features],
  );
  const framingProjection = useMemo(
    () =>
      resolveOpeningFramingSet({
        template: state.template,
        skeleton: baseSkeleton,
        features: roofWindows,
        framingSpecs: state.projectDocument.project.openingFraming,
      }),
    [
      baseSkeleton,
      roofWindows,
      state.projectDocument.project.openingFraming,
      state.template,
    ],
  );
  const openingSummary = useMemo(
    () => ({
      total: roofWindows.length,
      collisions: roofWindows.filter(
        (feature) =>
          resolveRoofFeatureCollisions({
            template: state.template,
            skeleton: baseSkeleton,
            feature,
          }).length > 0,
      ).length,
      acceptedFraming: framingProjection.results.filter(
        (result) =>
          result.status === 'resolved' &&
          result.reviewStatus === 'valid' &&
          !!result.framingSpecId,
      ).length,
      needsReview: framingProjection.results.filter(
        (result) => !!result.framingSpecId && result.reviewStatus !== 'valid',
      ).length,
    }),
    [baseSkeleton, framingProjection.results, roofWindows, state.template],
  );
  const framingProposal = useMemo(() => {
    const featureId = workbench.openingFramingProposalFeatureId;
    if (!featureId) return undefined;
    const feature = roofWindows.find((candidate) => candidate.id === featureId);
    if (!feature) return undefined;
    const existing = state.projectDocument.project.openingFraming.find(
      (spec) => spec.featureId === featureId,
    );
    return resolveOpeningFraming({
      template: state.template,
      skeleton: baseSkeleton,
      feature,
      framingSpec: {
        ...(existing ?? createOpeningFramingDraft(state.template, featureId)),
        acceptedGeometrySignature: '',
      },
    });
  }, [
    baseSkeleton,
    roofWindows,
    state.projectDocument.project.openingFraming,
    state.template,
    workbench.openingFramingProposalFeatureId,
  ]);
  const proposalMembers = useMemo(
    () =>
      framingProposal?.status === 'resolved'
        ? [
            framingProposal.lowerFramingMember!.member,
            framingProposal.upperFramingMember!.member,
          ]
        : [],
    [framingProposal],
  );
  const skeleton = useMemo(
    () => ({
      ...framingProjection.composedSkeleton,
      members: [
        ...framingProjection.composedSkeleton.members,
        ...proposalMembers.filter(
          (member) =>
            !framingProjection.composedSkeleton.members.some(
              (candidate) => candidate.id === member.id,
            ),
        ),
      ],
    }),
    [framingProjection.composedSkeleton, proposalMembers],
  );
  const fabricationPackage = useMemo(
    () =>
      withOpeningFramingFabrication(
        baseFabricationPackage,
        framingProjection.results,
      ),
    [baseFabricationPackage, framingProjection.results],
  );
  const battenLayout = state.projectDocument.project.buildUp.battenLayout;
  const membrane = state.projectDocument.project.buildUp.membrane;
  const membraneProduct = state.projectDocument.project.membraneProduct;
  const counterBattens = state.projectDocument.project.buildUp.counterBattens;
  const surfaceProjection = useMemo(
    () =>
      resolveRoofSurfaceGeometry({
        template: state.template,
        features: state.projectDocument.project.features,
      }),
    [state.projectDocument.project.features, state.template],
  );
  const membraneAreaMm2 = membrane?.enabled
    ? surfaceProjection.planes
        .filter(
          (plane) =>
            membrane.roofPlaneIds === undefined ||
            membrane.roofPlaneIds.includes(plane.roofPlaneId),
        )
        .reduce((sum, plane) => sum + plane.netAreaMm2, 0)
    : 0;
  const membraneCourseLayout = useMemo(
    () =>
      membrane?.enabled && membraneProduct
        ? resolveMembraneLayout({
            template: state.template,
            layout: membrane,
            product: {
              rollWidthMm: membraneProduct.technicalSpecSnapshot.rollWidthMm,
              rollLengthMm: membraneProduct.technicalSpecSnapshot.rollLengthMm,
              minimumOverlapMm:
                membraneProduct.technicalSpecSnapshot.minimumOverlapMm,
            },
            features: state.projectDocument.project.features,
          })
        : undefined,
    [
      membrane,
      membraneProduct,
      state.projectDocument.project.features,
      state.template,
    ],
  );
  const counterBattenProjection = useMemo(
    () =>
      resolveCounterBattenLayout({
        template: state.template,
        skeleton: framingProjection.composedSkeleton,
        layout: counterBattens ?? {
          enabled: false,
          widthMm: 40,
          heightMm: 60,
        },
        features: state.projectDocument.project.features,
      }),
    [
      counterBattens,
      framingProjection.composedSkeleton,
      state.projectDocument.project.features,
      state.template,
    ],
  );
  const coveringAssignments = useMemo(
    () => state.projectDocument.project.coverings,
    [state.projectDocument.project.coverings],
  );
  const coveringOwnership = useMemo(
    () => resolvePrimaryCoveringAssignments(coveringAssignments),
    [coveringAssignments],
  );
  const coveringVariantIds = useMemo(
    () =>
      coveringAssignments.flatMap((assignment) => {
        const variantId = assignment.product.catalogRef?.variantId;
        return variantId ? [variantId] : [];
      }),
    [coveringAssignments],
  );
  const variantPrices = usePriceOptions([
    ...coveringVariantIds,
    ...(currentCuttingPlan?.plan.scenario.stocks.flatMap((stock) =>
      stock.commercialVariantId ? [stock.commercialVariantId] : [],
    ) ?? []),
    ...(membraneProduct?.catalogRef?.variantId
      ? [membraneProduct.catalogRef.variantId]
      : []),
  ]);
  const effectiveBattenLayout = useMemo(
    () =>
      battenLayout ?? {
        enabled: false,
        battenHeightMm: 40,
        battenWidthMm: 60,
        gaugeMm: 350,
        eaveOffsetMm: 250,
        ridgeOffsetMm: 0,
      },
    [battenLayout],
  );
  const battenAutoComposition = useMemo(
    () =>
      resolveBattenAutoComposition({
        layout: effectiveBattenLayout,
        assignments: coveringAssignments,
        ownership: coveringOwnership,
        roofPitchDeg: state.template.pitchDeg,
        roofPlaneIds: surfaceProjection.planes.map(
          (plane) => plane.roofPlaneId,
        ),
      }),
    [
      coveringAssignments,
      coveringOwnership,
      effectiveBattenLayout,
      surfaceProjection.planes,
      state.template.pitchDeg,
    ],
  );
  /**
   * V39 build-up and fabrication context for the technical 3D scene.
   *
   * Everything here is already resolved by `roof-math`; the scene adapter and
   * the renderer only transport and draw it. Memoized separately so camera,
   * selection and filter changes never rerun a solver.
   */
  const scene3dContext = useMemo(() => {
    const counterBattenRuns = counterBattenProjection.rows.map((row) => ({
      rowId: row.id,
      roofPlaneId: row.roofPlaneId,
      sourceMemberId: row.sourceMemberId,
      section: row.section,
      segments: row.segments.map((segment) => ({
        from: segment.from,
        to: segment.to,
      })),
    }));
    const hipMembers = new Map(
      skeleton.members
        .filter((member) => member.kind === 'hip-rafter')
        .map((member) => [member.id, member]),
    );
    const unresolvedHipBoundaries = counterBattenProjection.hipBoundaries
      .filter((boundary) => boundary.status === 'unresolved')
      .flatMap((boundary) => {
        const member = hipMembers.get(boundary.hipMemberId);
        return member
          ? [
              {
                hipMemberId: boundary.hipMemberId,
                roofPlaneIds: boundary.roofPlaneIds,
                from: member.from,
                to: member.to,
              },
            ]
          : [];
      });
    // Finished K1 solids, only where the fabrication actually resolved.
    const finishedMembers = skeleton.members.flatMap((member) => {
      if (member.kind !== 'rafter') return [];
      const solid = resolveFinishedRafterSolid({
        assembly: templateResult.calculation.assembly,
        member,
        pitchDeg: state.template.pitchDeg,
      });
      return solid.status === 'resolved'
        ? [
            {
              memberId: member.id,
              profile: solid.solid.profile,
              thicknessMm: solid.solid.section.widthMm,
              origin: solid.solid.origin,
              basis: solid.solid.frame,
            },
          ]
        : [];
    });
    return { counterBattenRuns, unresolvedHipBoundaries, finishedMembers };
  }, [
    counterBattenProjection.hipBoundaries,
    counterBattenProjection.rows,
    skeleton.members,
    state.template.pitchDeg,
    templateResult.calculation.assembly,
  ]);
  const battenProjection = useMemo(
    () =>
      resolveBattenLayout({
        template: state.template,
        layout: effectiveBattenLayout,
        features: state.projectDocument.project.features,
        autoSource: battenAutoComposition.source,
      }),
    [
      battenAutoComposition.source,
      effectiveBattenLayout,
      state.projectDocument.project.features,
      state.template,
    ],
  );
  const battenInstallationDecision = useMemo(
    () =>
      evaluateBattenInstallation({
        layout: effectiveBattenLayout,
        result: battenProjection,
        composition: battenAutoComposition,
      }),
    [effectiveBattenLayout, battenProjection, battenAutoComposition],
  );
  const resolvedCoveringLayouts = useMemo(
    () =>
      coveringAssignments.flatMap<ResolvedCoveringLayout>((assignment) => {
        const common = {
          assignmentId: assignment.id,
          roofPlaneIds:
            coveringOwnership.trustedRoofPlaneIdsByAssignment[assignment.id] ??
            [],
          roofSurfaceGeometry: surfaceProjection.planes.map((plane) => ({
            roofPlaneId: plane.roofPlaneId,
            pitchDeg: state.template.pitchDeg,
            localPolygon: plane.polygon,
            netAreaMm2: plane.netAreaMm2,
          })),
          openings: roofWindows.map((feature) => ({
            id: feature.id,
            roofPlaneId: feature.roofPlaneId,
            fromUMm: feature.position.uMm,
            toUMm: feature.position.uMm + feature.widthMm,
            fromVMm: feature.position.vMm,
            toVMm: feature.position.vMm + feature.heightMm,
          })),
          battens: battenProjection.battens.map((batten) => ({
            id: batten.id,
            roofPlaneId: batten.roofPlaneId,
            stationVMm: batten.stationMm,
            segments: batten.segments,
          })),
        };
        if (isTileAssignment(assignment))
          return [
            resolveRoofTileLayout({
              ...common,
              productSpec: assignment.product.technicalSpecSnapshot,
              selectedInstallationModeId: assignment.selectedInstallationModeId,
              layoutIntent:
                assignment.layoutIntent?.kind === 'roof-tile'
                  ? assignment.layoutIntent
                  : { kind: 'roof-tile', horizontalAlignment: 'centered' },
            }),
          ];
        if (isCutToLengthSheetAssignment(assignment)) {
          const previous = assignment.layoutIntent;
          return [
            resolveCutToLengthSheetLayout({
              ...common,
              productSpec: assignment.product.technicalSpecSnapshot,
              layoutIntent:
                previous?.kind === 'modular-sheet-cut-to-length'
                  ? previous
                  : previous?.kind === 'modular-sheet'
                    ? { ...previous, kind: 'modular-sheet-cut-to-length' }
                    : {
                        kind: 'modular-sheet-cut-to-length',
                        horizontalAlignment: 'centered',
                      },
            }),
          ];
        }
        if (isModularSheetAssignment(assignment))
          return [
            resolveModularSheetLayout({
              ...common,
              productSpec: assignment.product.technicalSpecSnapshot,
              layoutIntent:
                assignment.layoutIntent?.kind === 'modular-sheet'
                  ? assignment.layoutIntent
                  : {
                      kind: 'modular-sheet',
                      horizontalAlignment: 'centered',
                    },
            }),
          ];
        if (isStandingSeamAssignment(assignment))
          return [
            resolveStandingSeamLayout({
              ...common,
              productSpec: assignment.product.technicalSpecSnapshot,
              selectedInstallationModeId: assignment.selectedInstallationModeId,
              layoutIntent:
                assignment.layoutIntent?.kind === 'standing-seam'
                  ? assignment.layoutIntent
                  : { kind: 'standing-seam', horizontalAlignment: 'centered' },
            }),
          ];
        return [];
      }),
    [
      battenProjection.battens,
      coveringAssignments,
      coveringOwnership.trustedRoofPlaneIdsByAssignment,
      roofWindows,
      state.template.pitchDeg,
      surfaceProjection.planes,
    ],
  );
  const activeCoveringAssignment =
    coveringAssignments.find(
      (assignment) => assignment.id === workbench.selectedCoveringAssignmentId,
    ) ?? coveringAssignments[0];
  const activeCoveringLayout = activeCoveringAssignment
    ? resolvedCoveringLayouts.find(
        (layout) => layout.assignmentId === activeCoveringAssignment.id,
      )
    : undefined;
  const activeCoveringConflicts = activeCoveringAssignment
    ? coveringOwnership.conflicts.filter((conflict) =>
        conflict.assignmentIds.includes(activeCoveringAssignment.id),
      )
    : [];
  useEffect(() => {
    if (activeCoveringAssignment?.id !== workbench.selectedCoveringAssignmentId)
      state.setSelectedCoveringAssignment(activeCoveringAssignment?.id);
  }, [
    activeCoveringAssignment?.id,
    state,
    workbench.selectedCoveringAssignmentId,
  ]);
  const coveringQuantitySources = useMemo(
    () =>
      resolvedCoveringLayouts.flatMap((layout) => {
        const assignment = coveringAssignments.find(
          (candidate) => candidate.id === layout.assignmentId,
        );
        const source =
          layout.kind === 'roof-tile'
            ? createRoofTileQuantitySource({
                layout,
                productDisplay: assignment?.product.displaySnapshot,
              })
            : layout.kind === 'modular-sheet-cut-to-length'
              ? createCutToLengthSheetQuantitySource({
                  layout,
                  productDisplay: assignment?.product.displaySnapshot,
                })
              : layout.kind === 'modular-sheet'
                ? createModularSheetQuantitySource({
                    layout,
                    productDisplay: assignment?.product.displaySnapshot,
                  })
                : createStandingSeamQuantitySource({
                    layout,
                    productDisplay: assignment?.product.displaySnapshot,
                  });
        return source ? [source] : [];
      }),
    [coveringAssignments, resolvedCoveringLayouts],
  );
  const memberSchedule = useMemo(
    () =>
      createRoofMemberSchedule({
        // Proposals never enter quantities; only accepted/current composition does.
        skeleton: framingProjection.composedSkeleton,
        sectionOverrides: {
          [state.template.ridge.id]: {
            ...(state.template.ridge.thicknessMm > 0
              ? { widthMm: state.template.ridge.thicknessMm }
              : {}),
            ...(state.template.ridge.depthMm !== undefined
              ? { depthMm: state.template.ridge.depthMm }
              : {}),
            completeness:
              state.template.ridge.thicknessMm > 0 &&
              state.template.ridge.depthMm !== undefined
                ? 'complete'
                : 'partial',
          },
        },
        buildUp: [
          ...(counterBattens?.enabled
            ? counterBattenProjection.rows.map((row) => ({
                id: row.id,
                familyKey: 'KL',
                memberKind: 'counter-batten' as const,
                lengthMm: row.visibleLengthMm,
                section: row.section,
                segmentCount: row.segments.length,
                warningKeys: row.warnings,
              }))
            : []),
          ...(battenLayout?.enabled
            ? battenProjection.battens.map((batten) => ({
                id: batten.id,
                familyKey: 'L',
                memberKind: 'batten' as const,
                lengthMm: batten.usableLengthMm,
                section: {
                  widthMm: battenLayout.battenWidthMm,
                  depthMm: battenLayout.battenHeightMm,
                },
                segmentCount: batten.segments.length,
              }))
            : []),
        ],
        surfaceBuildUp: membrane?.enabled
          ? surfaceProjection.planes
              .filter(
                (plane) =>
                  membrane.roofPlaneIds === undefined ||
                  membrane.roofPlaneIds.includes(plane.roofPlaneId),
              )
              .map((plane) => {
                const course = membraneCourseLayout?.planes.find(
                  (row) =>
                    row.roofPlaneId === plane.roofPlaneId &&
                    row.status === 'resolved',
                );
                const warningKeys = [
                  ...plane.issues.map((issue) => issue.code),
                  ...(course?.tapers ? ['hip-course-width-approximated'] : []),
                  ...(course?.hasOpenings ? ['openings-not-subtracted'] : []),
                ];
                return course
                  ? {
                      id: `surface:${plane.roofPlaneId}`,
                      familyKey: 'MEM',
                      memberKind: 'membrane' as const,
                      semantic: 'gross-installed' as const,
                      roofPlaneId: plane.roofPlaneId,
                      areaMm2: plane.netAreaMm2,
                      grossAreaMm2: course.grossAreaMm2,
                      overlapAreaMm2: course.overlapAreaMm2,
                      ridgeOverrunAreaMm2: course.ridgeOverrunAreaMm2,
                      courseCount: course.courseCount,
                      rollCount: course.rollCount,
                      warningKeys,
                    }
                  : {
                      id: `surface:${plane.roofPlaneId}`,
                      familyKey: 'MEM',
                      memberKind: 'membrane' as const,
                      semantic: 'net-geometric' as const,
                      roofPlaneId: plane.roofPlaneId,
                      areaMm2: plane.netAreaMm2,
                      warningKeys,
                    };
              })
          : [],
        covering: coveringQuantitySources,
      }),
    [
      battenLayout,
      battenProjection.battens,
      counterBattens?.enabled,
      counterBattenProjection.rows,
      coveringQuantitySources,
      framingProjection.composedSkeleton,
      membrane,
      membraneCourseLayout,
      state.template.ridge.id,
      state.template.ridge.depthMm,
      state.template.ridge.thicknessMm,
      surfaceProjection.planes,
    ],
  );
  const k1Requirement = useMemo(
    () => createK1CuttingRequirement(templateResult, memberSchedule),
    [templateResult, memberSchedule],
  );
  const activeCuttingPlan =
    k1Requirement.status === 'resolved' &&
    currentCuttingPlan?.projectId === projectSessionState.active?.id &&
    currentCuttingPlan?.plan.signature === k1RequirementSignature(k1Requirement)
      ? currentCuttingPlan.plan
      : undefined;
  const materialFacts: ExportFacts = {
    source: {
      projectId: projectSessionState.active?.id ?? 'unsaved',
      projectName: projectSessionState.active?.name ?? brand,
      projectCreatedAt: projectSessionState.active?.createdAt ?? '',
      projectUpdatedAt: projectSessionState.active?.updatedAt ?? '',
      projectSchemaVersion: state.projectDocument.schemaVersion,
    },
    template: state.template,
    resolved: templateResult,
    skeleton: framingProjection.composedSkeleton,
    surface: surfaceProjection,
    windows: roofWindows,
    schedule: memberSchedule,
    details: allDetailPreviews,
    k1: k1Requirement,
    cutting: activeCuttingPlan,
    membraneEnabled: !!membrane?.enabled,
    membraneProduct,
    counterBattensEnabled: !!counterBattens?.enabled,
    battensEnabled: !!battenLayout?.enabled,
    battens: battenProjection,
    battenAutoSource: battenAutoComposition.source,
    battenInstallationDecision,
    counterBattens: counterBattenProjection,
    coverings: coveringAssignments,
    coveringStatuses: resolvedCoveringLayouts.map((layout) => ({
      assignmentId: layout.assignmentId,
      status: layout.status,
      warnings: [...layout.issueCodes],
    })),
    coveringLayouts: resolvedCoveringLayouts,
    variantPrices,
    cost: costScenario,
  };
  const materialRows = createMaterialPlanRows(materialFacts, membraneProduct);
  const effectiveMaterialPrices = {
    ...materialScenarioPrices(costScenario, materialRows),
    ...materialPrices,
  };
  const documentFacts: ExportFacts = {
    ...materialFacts,
    membraneProduct,
    materialRows,
    materialPrices: effectiveMaterialPrices,
  };
  const projectWorkflowFacts = useMemo(
    () => ({
      constructionReady:
        surfaceProjection.planes.length > 0 &&
        surfaceProjection.grossAreaMm2 > 0 &&
        memberSchedule.timberRows.length > 0,
      openingCount: openingSummary.total,
      openingWarnings:
        openingSummary.collisions +
        openingSummary.needsReview +
        surfaceProjection.issues.length,
      enabledLayerCount: [
        membrane?.enabled,
        counterBattens?.enabled,
        battenLayout?.enabled,
      ].filter(Boolean).length,
      layerWarnings:
        (battenLayout?.enabled &&
          ['incompatible', 'no-data', 'decision-required'].includes(
            battenInstallationDecision.status,
          )) ||
        counterBattenProjection.status === 'partial' ||
        memberSchedule.buildUpRows.some((row) => row.warningKeys.length > 0) ||
        memberSchedule.surfaceBuildUpRows.some(
          (row) => row.warningKeys.length > 0,
        )
          ? 1
          : 0,
      coveringCount: coveringAssignments.length,
      resolvedCoveringCount: resolvedCoveringLayouts.filter(
        (layout) => layout.status === 'resolved',
      ).length,
      coveringWarnings:
        coveringOwnership.conflicts.length +
        (battenLayout?.enabled &&
        ['incompatible', 'no-data', 'decision-required'].includes(
          battenInstallationDecision.status,
        )
          ? 1
          : 0),
      k1Ready: k1Requirement.status === 'resolved',
      hasResults: memberSchedule.timberRows.length > 0,
    }),
    [
      surfaceProjection.planes.length,
      surfaceProjection.grossAreaMm2,
      surfaceProjection.issues.length,
      openingSummary,
      membrane?.enabled,
      counterBattens?.enabled,
      battenLayout?.enabled,
      counterBattenProjection.status,
      coveringAssignments.length,
      resolvedCoveringLayouts,
      coveringOwnership.conflicts.length,
      battenInstallationDecision.status,
      k1Requirement.status,
      memberSchedule.timberRows.length,
      memberSchedule.buildUpRows,
      memberSchedule.surfaceBuildUpRows,
    ],
  );
  const projectWorkflow = useMemo(
    () => deriveProjectWorkflow(projectWorkflowFacts),
    [projectWorkflowFacts],
  );
  const projectGuidance = useMemo(
    () =>
      deriveProjectGuidance(
        projectWorkflowFacts,
        projectWorkflowFacts.hasResults,
        battenLayout?.enabled ? battenInstallationDecision : undefined,
      ).filter(
        (item) =>
          item.targetTask !== workbench.viewPreset ||
          item.severity === 'blocker',
      ),
    [
      projectWorkflowFacts,
      workbench.viewPreset,
      battenLayout?.enabled,
      battenInstallationDecision,
    ],
  );
  const projectSummary = useMemo(() => {
    const timberFamilies = new Map<string, number>();
    memberSchedule.timberRows.forEach((row) =>
      timberFamilies.set(
        row.familyKey,
        (timberFamilies.get(row.familyKey) ?? 0) + row.quantity,
      ),
    );
    return {
      roofType: state.template.type,
      netRoofAreaMm2:
        surfaceProjection.status === 'resolved'
          ? surfaceProjection.netAreaMm2
          : undefined,
      timberCount: memberSchedule.timberSummary.quantity,
      timberFamilies: [...timberFamilies].map(([familyKey, quantity]) => ({
        familyKey,
        quantity,
      })),
      openingCount: openingSummary.total,
      enabledLayerCount: [
        membrane?.enabled,
        counterBattens?.enabled,
        battenLayout?.enabled,
      ].filter(Boolean).length,
      coveringCount: coveringAssignments.length,
      coveringStatus: projectWorkflow.stages[3]!.status,
      coveringPositionCount:
        memberSchedule.coveringSummary.effectiveCoveragePositions,
      coveringRunCount: memberSchedule.coveringSummary.geometricPanelRuns,
      k1Ready: k1Requirement.status === 'resolved',
    };
  }, [
    state.template.type,
    surfaceProjection.status,
    surfaceProjection.netAreaMm2,
    memberSchedule,
    openingSummary.total,
    membrane?.enabled,
    counterBattens?.enabled,
    battenLayout?.enabled,
    coveringAssignments.length,
    projectWorkflow.stages,
    k1Requirement.status,
  ]);
  const selectionContext = useMemo(
    () =>
      resolveWorkbenchSelectionContext({
        selected: workbench.selectedId,
        template: state.template,
        spec: state.spec,
        resolved: templateResult,
        skeleton: baseSkeleton,
        features: state.projectDocument.project.features,
      }),
    [
      workbench.selectedId,
      state.template,
      state.spec,
      templateResult,
      baseSkeleton,
      state.projectDocument.project.features,
    ],
  );
  const result = templateResult.calculation;
  const hip =
    'hipRafter' in templateResult ? templateResult.hipRafter : undefined;
  const layoutSpacing =
    'jackRafterSpacing' in templateResult
      ? templateResult.jackRafterSpacing
      : templateResult.rafterSpacing;
  const spacingEntries =
    'jackRafterSpacing' in templateResult
      ? [
          ...(templateResult.rafterSpacing
            ? [
                {
                  spacing: templateResult.rafterSpacing,
                  stationLabelKey: 'rafterPairs' as const,
                  headingKey: 'commonRafterRegionSpacing' as const,
                },
              ]
            : []),
          {
            spacing: templateResult.jackRafterSpacing,
            stationLabelKey: 'spacingAxes' as const,
            headingKey: 'jackRafterRegionSpacing' as const,
          },
        ]
      : [
          {
            spacing: templateResult.rafterSpacing,
            stationLabelKey: 'rafterPairs' as const,
          },
        ];
  const wall = state.spec.supports.find((s) => s.kind === 'wall-plate')!;
  const activeInstance = useMemo(
    () => currentMemberInstance(memberInstances, workbench.selectedInstanceId),
    [memberInstances, workbench.selectedInstanceId],
  );
  useEffect(() => {
    if (!workbench.selectedInstanceId || activeInstance) return;
    const prototypeId = workbench.selectedPrototypeId;
    useAssembly.getState().select(prototypeId ?? 'roof', prototypeId);
  }, [
    activeInstance,
    workbench.selectedInstanceId,
    workbench.selectedPrototypeId,
  ]);
  const commonDetailPreviews = useMemo(
    () => allDetailPreviews.filter((preview) => preview.subjectCode === 'K1'),
    [allDetailPreviews],
  );
  const hipDetailPreview = useMemo(
    () => allDetailPreviews.find((preview) => preview.subjectCode === 'H1'),
    [allDetailPreviews],
  );
  const selectionDetailPreviews = useMemo(() => {
    const direct = allDetailPreviews.find(
      (preview) => preview.sourceSelectionId === workbench.selectedId,
    );
    if (direct) return [direct];
    if (selectionContext.kind === 'support')
      return allDetailPreviews.filter(
        (preview) => preview.relatedSupportId === selectionContext.id,
      );
    const prototypeId =
      selectionContext.kind === 'prototype'
        ? selectionContext.prototype.id
        : selectionContext.kind === 'instance'
          ? selectionContext.member.prototypeId
          : undefined;
    if (prototypeId === HIP_RAFTER_PROTOTYPE_ID)
      return hipDetailPreview ? [hipDetailPreview] : [];
    if (prototypeId === state.spec.member.id) return commonDetailPreviews;
    return [];
  }, [
    allDetailPreviews,
    commonDetailPreviews,
    hipDetailPreview,
    selectionContext,
    workbench.selectedId,
    state.spec.member.id,
  ]);
  const quickDetailPreviews = hip
    ? hipDetailPreview
      ? [hipDetailPreview]
      : []
    : commonDetailPreviews.filter(
        (preview) =>
          preview.type === 'ridge-cut-detail' ||
          preview.relatedSupportId === wall.id,
      );
  const activeOperation = fabricationPackage.families
    .flatMap((family) => family.operations)
    .find((operation) => operation.id === workbench.activeOperationId);
  const selectedScheduleRow = memberSchedule.rows.find(
    (row) => row.id === workbench.selectedScheduleRowId,
  );
  const relatedSelectionIds = useMemo(() => {
    const ids = new Set<string>();
    activeInstance?.relatedInstanceIds.forEach((id) => ids.add(id));
    if (activeOperation?.relatedSupportId)
      ids.add(activeOperation.relatedSupportId);
    const prototypeId = workbench.selectedPrototypeId;
    if (!activeOperation && prototypeId === state.spec.member.id) {
      state.spec.supports.forEach((support) => ids.add(support.id));
      ids.add(state.spec.ridge.id);
    }
    if (prototypeId === HIP_RAFTER_PROTOTYPE_ID) {
      ids.add(state.spec.supports[0]!.id);
      ids.add(state.spec.ridge.id);
    }
    if (prototypeId === JACK_RAFTER_PROTOTYPE_ID) {
      ids.add(state.spec.supports[0]!.id);
      if (activeInstance?.hipCorner)
        ids.add(`instance:hip:${activeInstance.hipCorner}`);
      else if (selectionContext.kind === 'instance' && selectionContext.jack)
        ids.add(selectionContext.jack.spec.hipRafterInstanceId);
      else ids.add(HIP_RAFTER_PROTOTYPE_ID);
    }
    const selectedFraming =
      framingProposal ??
      framingProjection.results.find(
        (result) => result.featureId === workbench.selectedId,
      );
    selectedFraming?.affectedMemberInstanceIds.forEach((id) => ids.add(id));
    selectedFraming?.boundingMemberInstanceIds.forEach((id) => ids.add(id));
    selectedScheduleRow?.sourceInstanceIds.forEach((id) => ids.add(id));
    if (workbench.selectedScheduleInstanceId) {
      ids.clear();
      ids.add(workbench.selectedScheduleInstanceId);
    }
    return ids;
  }, [
    activeOperation,
    activeInstance,
    selectionContext,
    state.spec.member.id,
    state.spec.ridge.id,
    state.spec.supports,
    workbench.selectedPrototypeId,
    workbench.selectedId,
    framingProposal,
    framingProjection.results,
    selectedScheduleRow,
    workbench.selectedScheduleInstanceId,
  ]);
  const selectScheduleInstance = (
    row: RoofMemberScheduleRow,
    instanceId: string,
  ) => {
    const instance = memberInstances.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (instance)
      state.navigateToInstance({
        instanceId,
        prototypeId: instance.prototypeId,
        operationIds: instance.relatedOperationIds,
      });
    else state.select(instanceId, row.prototypeId);
    state.setScheduleSelection(row.id, instanceId);
    if (mobile) state.setMobilePanel('inspector');
  };
  const openCutting = () => {
    if (k1Requirement.status !== 'resolved') return;
    state.navigateTo(workbenchLocation('materials', 'cutting'));
  };
  /**
   * V38: a 3D selection opens the element's existing preparation through the
   * existing navigation. No fabrication surface is duplicated in 3D.
   */
  const openInstancePreparation = (instanceId: string, prototypeId: string) => {
    const instance = memberInstances.find(
      (candidate) => candidate.instanceId === instanceId,
    );
    if (workbench.viewPreset !== 'cuts')
      state.navigateTo(workbenchLocation('cuts'), { remember: true });
    state.navigateToInstance({
      instanceId,
      prototypeId,
      operationIds: instance?.relatedOperationIds ?? [],
    });
    if (mobile) state.setMobilePanel('inspector');
  };
  const openExecutionExport = () =>
    state.navigateTo(workbenchLocation('documents'));
  const openDocument = (
    kind: HubDocumentKind,
    mode: 'preview' | 'configure',
  ) => {
    setExportError('');
    void projectSession
      .persistNow()
      .then(() => {
        const active = projectSession.snapshot().active;
        if (!active) return;
        setDocumentRequest({ kind, mode });
        setExportSource({
          projectId: active.id,
          projectName: active.name,
          projectCreatedAt: active.createdAt,
          projectUpdatedAt: active.updatedAt,
          projectSchemaVersion: state.projectDocument.schemaVersion,
        });
      })
      .catch(() =>
        setExportError(
          i18n.language.startsWith('pl')
            ? 'Nie można zapisać aktualnego stanu projektu do dokumentu.'
            : 'Could not save the current project state for the document.',
        ),
      );
  };
  const closeDocument = () => {
    setExportSource(undefined);
    setDocumentRequest(undefined);
  };
  const runProjectAction = (action: ProjectWorkflowAction | 'openExport') => {
    if (action === 'openExport') {
      openExecutionExport();
      return;
    }
    if (action === 'planK1') {
      openCutting();
      return;
    }
    if (action === 'openSummary') {
      state.navigateTo(workbenchLocation('materials', 'summary'));
      return;
    }
    state.navigateTo(
      workbenchLocation(
        action === 'completeGeometry'
          ? 'construction'
          : action === 'reviewOpenings'
            ? 'openings'
            : action === 'reviewLayers'
              ? 'layers'
              : 'covering',
      ),
    );
    if (mobile && action === 'completeGeometry') {
      state.setInspectorOpen(true);
      state.setMobilePanel('inspector');
    }
    if (mobile && action === 'reviewLayers') state.setMobilePanel('tools');
  };
  const wideWorkspace =
    workbench.viewPreset === 'costing' || workbench.viewPreset === 'documents';
  // An empty covering task has nothing to edit: give the space to the
  // "Dodaj pokrycie" empty state instead of a blank Inspector.
  const coveringWithoutProduct =
    workbench.viewPreset === 'covering' && !activeCoveringAssignment;
  const drawerPreviews = drawer.pinned
    ? allDetailPreviews
    : selectionDetailPreviews;
  const changeMode = (mode: 'quick' | 'builder') => {
    state.setMode(mode);
    if (mode === 'builder' && mobile) state.setInspectorOpen(false);
    state.setMobilePanel('none');
  };
  useEffect(() => {
    if (workbench.mode === 'builder')
      void projectSession.initialize().catch(() => undefined);
  }, [projectSession, workbench.mode]);
  useEffect(() => {
    if (
      workbench.mode === 'builder' &&
      projectSessionState.initialized &&
      projectSessionState.freshProject
    ) {
      if (creatorStartWasSeen()) {
        projectSession.acknowledgeFreshProject();
        return;
      }
      setReuseFreshProject(true);
      setProjectStartMode((current) => current ?? 'new');
    }
  }, [
    projectSession,
    projectSessionState.freshProject,
    projectSessionState.initialized,
    workbench.mode,
  ]);
  useEffect(
    () => () => {
      void projectSession.dispose();
    },
    [projectSession],
  );
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${brand} — ${t('workshop')}`;
  }, [brand, i18n.language, t]);
  useEffect(() => {
    if (workbench.mode !== 'builder') return;
    const duplicateSelectedWindow = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      if (
        (target instanceof HTMLElement &&
          (target.matches('input, textarea, select') ||
            target.isContentEditable)) ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'd'
      )
        return;
      const selected = roofWindows.find(
        (feature) => feature.id === useAssembly.getState().workbench.selectedId,
      );
      if (!selected) return;
      event.preventDefault();
      useAssembly.getState().beginRoofWindowDuplicatePlacement(selected.id);
    };
    window.addEventListener('keydown', duplicateSelectedWindow);
    return () => window.removeEventListener('keydown', duplicateSelectedWindow);
  }, [roofWindows, workbench.mode]);
  useEffect(() => {
    if (workbench.mode !== 'builder' || drawer.pinned) return;
    const direct = allDetailPreviews.find(
      (preview) => preview.sourceSelectionId === workbench.selectedId,
    );
    if (direct) {
      useAssembly
        .getState()
        .setDetailDrawer({ activePreviewId: direct.id, open: true });
      useAssembly.getState().setViewPreset('cuts');
      if (mobile) useAssembly.getState().setInspectorOpen(false);
      return;
    }
    useAssembly.getState().setDetailDrawer({
      activePreviewId: selectionDetailPreviews[0]?.id,
    });
  }, [
    allDetailPreviews,
    drawer.pinned,
    selectionDetailPreviews,
    workbench.mode,
    workbench.selectedId,
    mobile,
  ]);
  const detailDrawerElement = (
    <DetailDrawer
      previews={drawerPreviews}
      activeId={drawer.activePreviewId}
      open={drawer.open}
      mode={drawer.mode}
      pinned={drawer.pinned}
      cutState={drawer.cutState}
      onSelect={(id) => {
        const preview = allDetailPreviews.find(
          (candidate) => candidate.id === id,
        );
        if (!preview) return;
        state.activateOperation({
          operationId: preview.sourceSelectionId,
          prototypeId: preview.subjectMemberId,
          selectionId: preview.sourceSelectionId,
          previewId: preview.id,
        });
      }}
      onModeChange={(mode) => state.setDetailDrawer({ mode })}
      onClose={state.closeDetailDrawer}
      onPin={() => state.setDetailDrawer({ pinned: !drawer.pinned })}
      onCutStateChange={(cutState) => state.setDetailDrawer({ cutState })}
      onZoom={(preview) => {
        if (preview.subjectCode === 'H1') {
          state.setView('hip');
          state.setFocusId(undefined);
        } else {
          state.setView('rafter');
          state.setFocusId(preview.sourceSelectionId);
        }
      }}
    />
  );
  const inspectorContent =
    workbench.viewPreset === 'materials' ? (
      <Suspense fallback={<aside className="a-inspector" />}>
        <MaterialScheduleInspector schedule={memberSchedule} />
      </Suspense>
    ) : workbench.viewPreset === 'covering' ? (
      <Suspense fallback={<aside className="a-inspector" />}>
        <CoveringInspector
          layout={activeCoveringLayout}
          assignment={activeCoveringAssignment}
          conflicts={activeCoveringConflicts}
          surfaceGeometry={surfaceProjection}
        />
      </Suspense>
    ) : (
      <Inspector
        result={result}
        hip={hip}
        skeleton={baseSkeleton}
        context={selectionContext}
        spacingEntries={spacingEntries}
        detailPreviews={selectionDetailPreviews}
        activeInstance={activeInstance}
        roofPackage={fabricationPackage}
        surfaceGeometry={surfaceProjection}
        battens={battenProjection}
        battenAutoComposition={battenAutoComposition}
        counterBattens={counterBattenProjection}
      />
    );
  return (
    <div
      className={`assembly-app mode-${workbench.mode} detail-${drawer.mode} ${mobile ? 'is-mobile-workbench' : ''}`}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.matches('input, textarea, select') ||
          target.isContentEditable
        )
          return;
        if (e.key === 'Escape') {
          if (mobile && workbench.mobilePanel !== 'none')
            state.setMobilePanel('none');
          else if (state.activeTransaction) state.cancelTransaction();
          else if (workbench.measurement) state.cancelMeasurement();
          else if (workbench.workspaceFocus.active)
            state.setWorkspaceFocus(false);
          else if (workbench.focusId) state.setFocusId(undefined);
          else state.stepBackContext();
          return;
        }
        if (
          e.altKey &&
          e.key === 'ArrowLeft' &&
          workbench.navigationTrail.length > 0
        ) {
          e.preventDefault();
          state.navigateBack();
          return;
        }
        if (e.key.toLowerCase() === 'm' && workbench.mode === 'builder') {
          e.preventDefault();
          state.toggleMeasurement();
          return;
        }
        if (e.key.toLowerCase() === 'f' && workbench.mode === 'builder') {
          e.preventDefault();
          state.requestFit();
          return;
        }
        if (!(e.ctrlKey || e.metaKey)) return;
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) state.redo();
          else state.undo();
        }
        if (key === 'y') {
          e.preventDefault();
          state.redo();
        }
      }}
    >
      <header className="a-header">
        <a className="a-brand" href="#/calculators/common-rafter">
          <House size={24} />
          <span>{brand}</span>
        </a>
        <nav className="a-modes" aria-label={t('workshop')}>
          {(['quick', 'builder'] as const).map((mode) => (
            <button
              key={mode}
              data-mode={mode}
              aria-pressed={workbench.mode === mode}
              onClick={() => changeMode(mode)}
            >
              {t(`assembly.${mode}`)}
            </button>
          ))}
        </nav>
        {workbench.mode === 'builder' && (
          <ProjectManager
            session={projectSession}
            state={projectSessionState}
            mobile={mobile}
            onStartNew={() => {
              projectSession.acknowledgeFreshProject();
              setReuseFreshProject(false);
              setProjectStartMode('new');
            }}
            onEditBasics={() => {
              setReuseFreshProject(false);
              setProjectStartMode('edit');
            }}
          />
        )}
        {workbench.mode === 'builder' && (
          <button
            type="button"
            className="a-export-trigger"
            data-testid="project-execution-export"
            onClick={openExecutionExport}
          >
            {t('assembly.perspective.documents')}
          </button>
        )}
        {exportError && <span role="alert">{exportError}</span>}
        <div className="a-settings">
          <div className="a-units" role="group" aria-label={t('assembly.unit')}>
            {lengthUnits.map((unit) => (
              <button
                key={unit}
                aria-pressed={state.unit === unit}
                onClick={() => state.setUnit(unit)}
              >
                {unit}
              </button>
            ))}
          </div>
          {workbench.mode === 'builder' && (
            <div
              className="a-history"
              role="group"
              aria-label={t('assembly.history')}
            >
              <button
                className="a-icon"
                aria-label={t('assembly.undoChange')}
                title={`${t('assembly.undoChange')} (Ctrl+Z)`}
                disabled={!state.historyPast.length}
                onClick={state.undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="a-icon"
                aria-label={t('assembly.redoChange')}
                title={`${t('assembly.redoChange')} (Ctrl+Y)`}
                disabled={!state.historyFuture.length}
                onClick={state.redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
          )}
          {mobile && (
            <details className="a-header-overflow">
              <summary
                className="a-icon"
                aria-label={t('assembly.settings')}
                title={t('assembly.settings')}
              >
                <SlidersHorizontal size={18} />
              </summary>
              <div>
                <div
                  className="a-overflow-units"
                  role="group"
                  aria-label={t('assembly.unit')}
                >
                  {lengthUnits.map((unit) => (
                    <button
                      key={unit}
                      className="a-button"
                      aria-pressed={state.unit === unit}
                      onClick={() => state.setUnit(unit)}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
                <button
                  className="a-button"
                  onClick={() => {
                    state.reset();
                    state.setFocusId(undefined);
                  }}
                >
                  <RotateCcw size={18} />
                  {t('assembly.reset')}
                </button>
                <button
                  className="a-button"
                  onClick={() => {
                    void i18n.changeLanguage(
                      i18n.language === 'pl' ? 'en' : 'pl',
                    );
                  }}
                >
                  {t('assembly.language')} · {i18n.language.toUpperCase()}
                </button>
              </div>
            </details>
          )}
          {!mobile && (
            <button
              className="a-icon a-desktop-setting"
              aria-label={t('assembly.reset')}
              onClick={() => {
                state.reset();
                state.setFocusId(undefined);
              }}
            >
              <RotateCcw size={18} />
            </button>
          )}
          {!mobile && (
            <button
              className="a-icon a-desktop-setting"
              aria-label={t('assembly.language')}
              onClick={() => {
                void i18n.changeLanguage(i18n.language === 'pl' ? 'en' : 'pl');
              }}
            >
              {i18n.language.toUpperCase()}
            </button>
          )}
        </div>
      </header>
      <main className="a-main">
        <div className="a-page-heading">
          <div>
            <span className="a-eyebrow">
              {t('workshop')} / {t('assembly.model')}
            </span>
            <h1>{t('assembly.title')}</h1>
            <strong className="a-member-subtitle">
              {state.template.type === 'hip'
                ? `${t('assembly.hipRoof')} · ${workbench.selectedPrototypeId === JACK_RAFTER_PROTOTYPE_ID || workbench.selectedId === JACK_RAFTER_PROTOTYPE_ID ? `J1 ${t('assembly.jackRafter')}` : workbench.selectedPrototypeId === HIP_RAFTER_PROTOTYPE_ID || workbench.selectedId === HIP_RAFTER_PROTOTYPE_ID ? `H1 ${t('assembly.hipRafter')}` : workbench.selectedPrototypeId === state.spec.member.id || workbench.selectedId === state.spec.member.id ? `K1 ${t('assembly.commonRafter')}` : t('assembly.skeleton')}`
                : `K1 ${t('assembly.commonRafter')}`}
            </strong>
            <p>
              {t(
                `assembly.${workbench.mode === 'quick' ? 'quickHint' : 'builderHint'}`,
              )}
            </p>
          </div>
          <span className="a-live">
            <i />
            {t('assembly.local')}
          </span>
        </div>
        {workbench.mode === 'quick' ? (
          <div className="a-quick-layout">
            <section className="a-quick-inputs">
              <RoofTypeSelector context="member" />
              <div className="a-basic-fields">
                <GeometryInputs />
              </div>
              <details className="a-more">
                <summary>{t('assembly.more')}</summary>
                <h3>
                  {state.template.type === 'hip'
                    ? t('assembly.hipRafter')
                    : t('assembly.rafter')}
                </h3>
                {state.template.type === 'hip' ? (
                  <HipTimberInputs />
                ) : (
                  <>
                    <TimberInputs />
                    <h3>{t('assembly.wall-plate')}</h3>
                    <SupportInputs support={wall} result={result} />
                  </>
                )}
                <NumberField
                  field="ridge.thicknessMm"
                  label="ridgeWidth"
                  max={1000}
                />
                <NumberField
                  field="ridge.depthMm"
                  label="ridgeDepth"
                  min={1}
                  max={2000}
                  optional
                />
              </details>
              {state.spec.supports.some((s) => s.kind === 'purlin') && (
                <p className="a-help">{t('assembly.purlinPresent')}</p>
              )}
              <button
                className="a-button a-primary"
                data-testid="quick-create-project"
                onClick={() => {
                  setReuseFreshProject(false);
                  setProjectStartMode('quick');
                  changeMode('builder');
                }}
              >
                {t('assembly.projectStart.createFromQuick')} →
              </button>
            </section>
            <section className="a-quick-output">
              {hip ? <HipResults hip={hip} /> : <Results result={result} />}
              {hip ? (
                <HipFabricationSheet hip={hip} compact />
              ) : (
                result && <AssemblyCanvas result={result} compact readOnly />
              )}
              <QuickCutPreviews
                previews={quickDetailPreviews}
                onOpen={setQuickDetail}
              />
            </section>
          </div>
        ) : (
          <>
            <ProjectWorkflowStrip
              workflow={projectWorkflow}
              guidance={projectGuidance}
              onAction={runProjectAction}
            />
            <div
              className={`a-builder-layout ${workbench.toolboxCollapsed ? 'tools-collapsed' : ''} ${workbench.workspaceFocus.active ? 'is-workspace-focus' : ''} ${workbench.viewPreset === 'materials' && !selectedScheduleRow ? 'material-inspector-empty' : ''} ${wideWorkspace ? 'is-wide-workspace' : ''} ${coveringWithoutProduct ? 'no-inspector' : ''}`}
              data-view-preset={workbench.viewPreset}
            >
              {!mobile && !wideWorkspace && (
                <Toolbox
                  result={result}
                  detailPreviews={selectionDetailPreviews}
                />
              )}
              <section className="a-canvas-column">
                {!mobile && <PerspectiveBar />}
                {!mobile && (
                  <WorkbenchControls
                    skeleton={skeleton}
                    k1Ready={k1Requirement.status === 'resolved'}
                  />
                )}
                <WorkbenchContextBar
                  instances={memberInstances}
                  activeInstance={activeInstance}
                  roofPackage={fabricationPackage}
                  activeOperation={activeOperation}
                  selectedScheduleRow={selectedScheduleRow}
                  openingSummary={openingSummary}
                />
                {mobile && (
                  <ContextualTaskTabs
                    k1Ready={k1Requirement.status === 'resolved'}
                  />
                )}
                {mobile && !wideWorkspace && (
                  <div className="a-mobile-workspace-actions">
                    <button
                      className="a-button"
                      data-testid="mobile-open-tools"
                      onClick={() => {
                        if (workbench.viewPreset === 'covering') {
                          state.setInspectorOpen(true);
                          state.setMobilePanel('inspector');
                        } else state.setMobilePanel('tools');
                      }}
                    >
                      <Wrench size={17} />
                      {t(
                        workbench.viewPreset === 'covering'
                          ? 'assembly.coveringParameters'
                          : 'assembly.toolbox',
                      )}
                    </button>
                    <button
                      className="a-button"
                      onClick={() => state.setMobilePanel('view')}
                    >
                      <SlidersHorizontal size={17} />
                      {t('assembly.view')}
                    </button>
                    {workbench.viewPreset === 'layers' && (
                      <button
                        className="a-button"
                        data-testid="mobile-open-inspector"
                        onClick={() => {
                          state.setInspectorOpen(true);
                          state.setMobilePanel('inspector');
                        }}
                      >
                        {t('assembly.editSelection')}
                      </button>
                    )}
                    {/* V38: Fit and Measure act on the 2D drawing; the 3D
                        viewport carries its own camera controls. */}
                    {workbench.workspaceRenderer === '2d' &&
                      workbench.viewPreset !== 'covering' &&
                      (workbench.viewPreset !== 'materials' ||
                        workbench.materialsView === 'drawing') && (
                        <button className="a-button" onClick={state.requestFit}>
                          <Maximize size={17} />
                          {t('assembly.fit')}
                        </button>
                      )}
                    {workbench.workspaceRenderer === '2d' &&
                      workbench.viewPreset !== 'covering' &&
                      workbench.viewPreset !== 'materials' && (
                        <button
                          className="a-button"
                          aria-pressed={!!workbench.measurement}
                          onClick={state.toggleMeasurement}
                        >
                          {t('assembly.measure')}
                        </button>
                      )}
                  </div>
                )}
                {workbench.viewPreset === 'layers' && (
                  <BuildUpSummaryBar
                    membraneEnabled={!!membrane?.enabled}
                    membraneAreaMm2={membraneAreaMm2}
                    counterBattensEnabled={!!counterBattens?.enabled}
                    counterBattenLengthMm={
                      counterBattenProjection.totalVisibleLengthMm
                    }
                    battensEnabled={!!battenLayout?.enabled}
                    battenLengthMm={battenProjection.totalLengthMm}
                    partial={counterBattenProjection.status === 'partial'}
                    selectedView={workbench.buildUpView}
                    onSelect={(view) => {
                      state.setBuildUpView(view);
                      if (view !== 'overview')
                        state.select(
                          `layer:${view === 'counterBattens' ? 'counter-battens' : view}`,
                        );
                    }}
                  />
                )}
                {workbench.focusId && (
                  <button
                    className="a-button a-back"
                    onClick={() => state.setFocusId(undefined)}
                  >
                    <X size={16} />
                    {t('assembly.back')}
                  </button>
                )}
                {!workbench.focusId &&
                  workbench.canvasView === 'rafter' &&
                  (workbench.viewPreset === 'construction' ||
                    workbench.viewPreset === 'cuts') && (
                    <button
                      className="a-button a-back"
                      onClick={() => state.setView('skeleton')}
                    >
                      <ArrowLeft size={16} />
                      {t('assembly.backToSkeleton')}
                    </button>
                  )}
                {workbench.viewPreset === 'materials' ? (
                  <div
                    className={`a-material-workspace material-view-${workbench.materialsView}`}
                  >
                    <div
                      className="a-material-local-switch"
                      role="tablist"
                      aria-label={t('assembly.materialWorkspaceView')}
                    >
                      <details className="mp-secondary-views">
                        <summary>{t('assembly.materialDetailViews')}</summary>
                        {(['summary', 'drawing'] as const).map((view) => (
                          <button
                            key={view}
                            role="tab"
                            aria-selected={workbench.materialsView === view}
                            onClick={() => state.setMaterialsView(view)}
                          >
                            {t(`assembly.${view}MaterialView`)}
                          </button>
                        ))}
                      </details>
                    </div>
                    <div data-material-surface="plan">
                      <Suspense fallback={<div className="a-loading-panel" />}>
                        <MaterialPlan
                          key={projectSessionState.active?.id ?? 'unsaved'}
                          facts={materialFacts}
                          membrane={membraneProduct}
                          scenario={costScenario}
                          prices={effectiveMaterialPrices}
                          onPricesChange={setMaterialPrices}
                          onScenarioChange={setCostScenario}
                          onOpenCutting={openCutting}
                          onOpenLayers={() =>
                            state.navigateTo(workbenchLocation('layers'))
                          }
                          onOpenCovering={() =>
                            state.navigateTo(workbenchLocation('covering'))
                          }
                          onOpenCosting={() =>
                            state.navigateTo(workbenchLocation('costing'))
                          }
                          onOpenExport={openExecutionExport}
                        />
                      </Suspense>
                    </div>
                    <div
                      data-material-surface="cutting"
                      data-testid="k1-cutting-surface"
                    >
                      {workbench.materialsView === 'cutting' &&
                        (k1Requirement.status === 'resolved' ? (
                          <Suspense
                            fallback={<div className="a-loading-panel" />}
                          >
                            <K1CuttingPlan
                              presentation="inline"
                              requirement={k1Requirement}
                              projectName={projectSessionState.active?.name}
                              unit={state.unit}
                              mobile={mobile}
                              onClose={() => state.navigateBack()}
                              initialPlan={activeCuttingPlan}
                              onPlanChange={(plan) =>
                                setCurrentCuttingPlan(
                                  plan && projectSessionState.active
                                    ? {
                                        projectId:
                                          projectSessionState.active.id,
                                        plan,
                                      }
                                    : undefined,
                                )
                              }
                            />
                          </Suspense>
                        ) : (
                          <div
                            className="a-empty-state"
                            data-testid="k1-cutting-unavailable"
                          >
                            <strong>
                              {t('assembly.workflow.k1Unavailable')}
                            </strong>
                            <p>
                              {t('assembly.workflow.k1UnavailableDescription')}
                            </p>
                            <button
                              type="button"
                              className="a-button a-primary"
                              onClick={() =>
                                state.navigateTo(
                                  workbenchLocation('construction'),
                                )
                              }
                            >
                              {t('assembly.workflow.action.completeGeometry')}
                            </button>
                          </div>
                        ))}
                    </div>
                    <div data-material-surface="summary">
                      <ProjectSummary
                        facts={projectSummary}
                        onOpenCutting={openCutting}
                        onOpenCovering={() =>
                          state.navigateTo(workbenchLocation('covering'))
                        }
                      />
                    </div>
                    <div
                      className="a-material-canvas"
                      data-material-surface="drawing"
                    >
                      <Suspense fallback={<div className="a-loading-panel" />}>
                        <SkeletonCanvas
                          template={state.template}
                          skeleton={framingProjection.composedSkeleton}
                          collisionSkeleton={baseSkeleton}
                          spacing={layoutSpacing}
                          relatedIds={relatedSelectionIds}
                          activeInstance={activeInstance}
                          surfaceGeometry={surfaceProjection}
                          battens={battenProjection}
                          counterBattens={counterBattenProjection}
                          compact
                        />
                      </Suspense>
                    </div>
                    <div data-material-surface="schedule">
                      <Suspense fallback={<div className="a-loading-panel" />}>
                        <MaterialSchedule
                          schedule={memberSchedule}
                          k1={k1Requirement}
                          coveringStatus={projectWorkflow.stages[3]!.status}
                          onOpenCutting={openCutting}
                          selectedRowId={workbench.selectedScheduleRowId}
                          selectedInstanceId={
                            workbench.selectedScheduleInstanceId
                          }
                          battens={battenProjection}
                          counterBattens={counterBattenProjection}
                          battenAutoComposition={battenAutoComposition}
                          onSelectRow={(row) => {
                            state.setScheduleSelection(row.id);
                            if (mobile) state.setMobilePanel('inspector');
                          }}
                          onSelectInstance={selectScheduleInstance}
                        />
                      </Suspense>
                    </div>
                  </div>
                ) : workbench.viewPreset === 'covering' ? (
                  <Suspense fallback={<div className="a-loading-panel" />}>
                    <CoveringWorkspace
                      assignments={coveringAssignments}
                      assignment={activeCoveringAssignment}
                      layout={activeCoveringLayout}
                      conflicts={activeCoveringConflicts}
                      surfaceGeometry={surfaceProjection}
                      battens={battenProjection}
                      counterBattens={counterBattenProjection}
                    />
                  </Suspense>
                ) : workbench.viewPreset === 'costing' ? (
                  <Suspense fallback={<div className="a-loading-panel" />}>
                    {costScenario && projectSessionState.active ? (
                      <CostWorkspace
                        facts={
                          {
                            source: {
                              projectId: projectSessionState.active.id,
                              projectName: projectSessionState.active.name,
                              projectCreatedAt:
                                projectSessionState.active.createdAt,
                              projectUpdatedAt:
                                projectSessionState.active.updatedAt,
                              projectSchemaVersion:
                                state.projectDocument.schemaVersion,
                            },
                            template: state.template,
                            resolved: templateResult,
                            skeleton: framingProjection.composedSkeleton,
                            surface: surfaceProjection,
                            windows: roofWindows,
                            schedule: memberSchedule,
                            details: allDetailPreviews,
                            k1: k1Requirement,
                            cutting: activeCuttingPlan,
                            membraneEnabled: !!membrane?.enabled,
                            counterBattensEnabled: !!counterBattens?.enabled,
                            battensEnabled: !!battenLayout?.enabled,
                            battens: battenProjection,
                            battenAutoSource: battenAutoComposition.source,
                            battenInstallationDecision,
                            counterBattens: counterBattenProjection,
                            coverings: coveringAssignments,
                            coveringStatuses: resolvedCoveringLayouts.map(
                              (layout) => ({
                                assignmentId: layout.assignmentId,
                                status: layout.status,
                                warnings: [...layout.issueCodes],
                              }),
                            ),
                            coveringLayouts: resolvedCoveringLayouts,
                            variantPrices,
                          } satisfies Omit<ExportFacts, 'cost'>
                        }
                        scenario={costScenario}
                        onScenarioChange={setCostScenario}
                        onOpenDocuments={openExecutionExport}
                      />
                    ) : (
                      <div className="a-loading-panel" />
                    )}
                  </Suspense>
                ) : workbench.viewPreset === 'documents' ? (
                  <DocumentHub
                    facts={documentFacts}
                    onOpen={openDocument}
                    onMaterialCsv={() =>
                      downloadMaterialCsv(
                        materialRows,
                        effectiveMaterialPrices,
                        projectSessionState.active?.name ?? brand,
                        i18n.language,
                      )
                    }
                    onCostCsv={
                      costScenario?.lines.length
                        ? () =>
                            downloadCostEstimateCsv(
                              costScenario,
                              projectSessionState.active?.name ?? brand,
                              i18n.language,
                            )
                        : undefined
                    }
                  />
                ) : workbench.focusId ? (
                  <AssemblyCanvas result={result} focusId={workbench.focusId} />
                ) : workbench.canvasView === 'hip' && hip ? (
                  <HipFabricationSheet
                    hip={hip}
                    onBack={() => state.setView('skeleton')}
                  />
                ) : workbench.canvasView === 'rafter' ? (
                  <AssemblyCanvas result={result} />
                ) : workbench.workspaceRenderer === '3d' ? (
                  <Suspense
                    fallback={
                      <div className="a-loading-panel" role="status">
                        {t('assembly.scene3d.loading')}
                      </div>
                    }
                  >
                    <TechnicalScene3D
                      skeleton={skeleton}
                      relatedIds={relatedSelectionIds}
                      counterBattens={scene3dContext.counterBattenRuns}
                      unresolvedHipBoundaries={
                        scene3dContext.unresolvedHipBoundaries
                      }
                      finishedMembers={scene3dContext.finishedMembers}
                      onReturnTo2D={() => state.setWorkspaceRenderer('2d')}
                      onOpenPreparation={openInstancePreparation}
                    />
                  </Suspense>
                ) : (
                  <Suspense fallback={<div className="a-loading-panel" />}>
                    <SkeletonCanvas
                      template={state.template}
                      skeleton={skeleton}
                      collisionSkeleton={baseSkeleton}
                      proposalMemberIds={
                        new Set(proposalMembers.map((member) => member.id))
                      }
                      spacing={layoutSpacing}
                      relatedSupportId={activeOperation?.relatedSupportId}
                      relatedIds={relatedSelectionIds}
                      activeInstance={activeInstance}
                      surfaceGeometry={surfaceProjection}
                      battens={battenProjection}
                      counterBattens={counterBattenProjection}
                    />
                  </Suspense>
                )}
              </section>
              {!mobile &&
                !wideWorkspace &&
                !coveringWithoutProduct &&
                (workbench.viewPreset !== 'materials' || selectedScheduleRow) &&
                inspectorContent}
            </div>
            {exportSource && (
              <Suspense fallback={<div className="a-loading-panel" />}>
                <ExecutionExport
                  key={`${documentRequest?.kind}:${documentRequest?.mode}`}
                  source={exportSource}
                  facts={{ ...documentFacts, source: exportSource }}
                  unit={state.unit}
                  mobile={mobile}
                  onClose={closeDocument}
                  onPlanK1={() => {
                    closeDocument();
                    openCutting();
                  }}
                  initialSelection={
                    documentRequest?.mode === 'preview'
                      ? HUB_DOCUMENT_SECTIONS[documentRequest.kind]
                      : undefined
                  }
                  startInPreview={documentRequest?.mode === 'preview'}
                  backLabel={t('assembly.nav.documentHub')}
                />
              </Suspense>
            )}
            {mobile &&
              workbench.selectedId !== 'roof' &&
              workbench.viewPreset !== 'covering' &&
              !drawer.open &&
              workbench.mobilePanel === 'none' && (
                <div className="a-mobile-selection-peek">
                  <strong>{entityLabel(workbench.selectedId, state, t)}</strong>
                  <button
                    className="a-button"
                    onClick={() => {
                      state.setInspectorOpen(true);
                      state.setMobilePanel('inspector');
                    }}
                  >
                    {t('assembly.editSelection')}
                  </button>
                </div>
              )}
            {mobile && <MobileTaskDock />}
            {mobile && workbench.mobilePanel === 'tools' && (
              <MobileSheet
                title={t('assembly.toolbox')}
                onClose={() => state.setMobilePanel('none')}
              >
                <Toolbox
                  result={result}
                  detailPreviews={selectionDetailPreviews}
                  mobileTask={workbench.viewPreset}
                />
              </MobileSheet>
            )}
            {mobile && workbench.mobilePanel === 'inspector' && (
              <MobileSheet
                title={t('assembly.inspector')}
                onClose={() => state.setMobilePanel('none')}
              >
                {inspectorContent}
                {(workbench.viewPreset === 'construction' ||
                  workbench.viewPreset === 'cuts') && (
                  <>
                    <PreparationPlan
                      roofPackage={fabricationPackage}
                      activeInstance={activeInstance}
                    />
                    <ContextualResults
                      context={selectionContext}
                      resolved={templateResult}
                      skeleton={skeleton}
                    />
                  </>
                )}
              </MobileSheet>
            )}
            {mobile && workbench.mobilePanel === 'view' && (
              <MobileSheet
                title={t('assembly.view')}
                onClose={() => state.setMobilePanel('none')}
              >
                <MobileViewSettings skeleton={skeleton} />
              </MobileSheet>
            )}
            {mobile
              ? drawer.open && (
                  <MobileSheet
                    title={t('assembly.detailDrawer')}
                    onClose={state.closeDetailDrawer}
                    expanded={drawer.mode === 'focus'}
                  >
                    {detailDrawerElement}
                  </MobileSheet>
                )
              : detailDrawerElement}
            {!mobile &&
              (workbench.viewPreset === 'construction' ||
                workbench.viewPreset === 'cuts') && (
                <>
                  <PreparationPlan
                    roofPackage={fabricationPackage}
                    activeInstance={activeInstance}
                  />
                  <ContextualResults
                    context={selectionContext}
                    resolved={templateResult}
                    skeleton={skeleton}
                  />
                </>
              )}
          </>
        )}
        <details className="a-assumptions">
          <summary>{t('assembly.assumptions')}</summary>
          <p>
            {t(
              `assembly.${state.template.type === 'hip' ? 'hipAssumptionsText' : 'assumptionsText'}`,
            )}
          </p>
          <p>{t('assembly.structural')}</p>
        </details>
        <footer className="a-footer">
          <span>
            {brand} · {t('assembly.local')}
          </span>
          <span>
            {workbench.mode === 'builder' && projectSessionState.active
              ? projectStatusLabel(
                  projectSessionState.saveStatus,
                  i18n.language,
                )
              : t('assembly.noSave')}
          </span>
        </footer>
      </main>
      {projectStartMode && workbench.mode === 'builder' && (
        <ProjectStartAssistant
          mode={projectStartMode}
          template={state.template}
          onClose={() => {
            rememberCreatorStart();
            projectSession.acknowledgeFreshProject();
            setReuseFreshProject(false);
            setProjectStartMode(undefined);
          }}
          onSubmit={async (template) => {
            if (projectStartMode === 'new' || projectStartMode === 'quick') {
              if (!reuseFreshProject) await projectSession.create();
              useAssembly
                .getState()
                .replaceProjectDocument(createRoofProjectDocument(template));
            } else if (projectStartMode === 'edit') {
              useAssembly.getState().setProjectRoof(template);
            }
            rememberCreatorStart();
            projectSession.acknowledgeFreshProject();
            setReuseFreshProject(false);
            setProjectStartMode(undefined);
            state.navigatePerspective('project');
            state.setViewPreset('construction');
          }}
          onAdvanced={async () => {
            // A fresh, untouched session project is reused; otherwise a new
            // record is created so an existing project is never replaced.
            if (!reuseFreshProject) await projectSession.create();
            rememberCreatorStart();
            projectSession.acknowledgeFreshProject();
            setReuseFreshProject(false);
            setProjectStartMode(undefined);
            state.navigatePerspective('project');
            state.setViewPreset('construction');
          }}
          onExample={async (id) => {
            const title = t(`assembly.creator.examples.item.${id}.title`);
            await projectSession.createFromDocument(
              projectExampleDocument(id),
              t('assembly.creator.examples.name', { title }),
            );
            rememberCreatorStart();
            setReuseFreshProject(false);
            setProjectStartMode(undefined);
            state.navigatePerspective('project');
            state.setViewPreset('construction');
          }}
        />
      )}
      {quickDetail && workbench.mode === 'quick' && (
        <QuickDetailDialog
          preview={quickDetail}
          onClose={() => setQuickDetail(undefined)}
          onOpenBuilder={(preview) => {
            setReuseFreshProject(false);
            setProjectStartMode('quick');
            state.setMode('builder');
            state.activateOperation({
              operationId: preview.sourceSelectionId,
              prototypeId: preview.subjectMemberId,
              selectionId: preview.sourceSelectionId,
              previewId: preview.id,
            });
            setQuickDetail(undefined);
          }}
        />
      )}
    </div>
  );
}

export function AssemblyPage() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AssemblyPageContent />
    </QueryClientProvider>
  );
}
