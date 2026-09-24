import {
  lazy,
  Suspense,
  useCallback,
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
  resolveRoofFeatureTopology,
} from '@cieslacalc/roof-math';
import { useAssembly } from './store';
import {
  QuickH1Result,
  QuickK1Result,
  type QuickHighlight,
} from './QuickResults';
import {
  deriveBattenWorkflow,
  deriveCounterBattenWorkflow,
} from './batten-workflow';
import {
  disabledBattenLayer,
  disabledCounterBattenLayer,
  newBattenLayer,
} from './build-up-defaults';
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
import { ContextualResults } from './Summary';
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
import { createExportCandidates, type ExportFacts } from './export-adapter';
import { usePriceOptions } from '../pricing/use-prices';
import { BusinessContextProvider } from '../business/context';
import { useBusiness } from '../business/context';
import { useEffectiveVariantPrices } from '../business/use-effective-prices';
import { BusinessHeader, BusinessModeToggle } from '../business/BusinessHeader';
import { BusinessHome } from '../business/BusinessHome';
import { WorkspaceStatus } from '../business/workspace/WorkspaceStatus';
import { useBusinessWorkspace } from '../business/workspace/useBusinessWorkspace';
import { BusinessJourney } from '../business/BusinessJourney';
import { QuoteWorkspace } from '../business/QuoteWorkspace';
import { createTilePurchasePlans } from './tile-purchase';
import { resolveRoofSystemFacts, ridgeTileCount } from './roof-system';
import {
  requestRoofSystemFocus,
  resolveRoofSystemChecklist,
} from './roof-system-checklist';
import {
  deriveProjectJourney,
  type JourneyAction,
  type JourneyStageKey,
} from './project-journey';
import { tileProductName } from './tile-purchase';
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
import { ProjectSummary } from './ProjectWorkflow';
import {
  ActionFeedback,
  ProjectReadinessBar,
  JourneyRail,
  ProjectReadinessPanel,
} from './ProjectReadiness';
import {
  deriveProjectReadiness,
  type ReadinessAction,
  type ReadinessDocumentKind,
} from './project-readiness';
import { documentStatusFor } from './readiness-copy';
import {
  battenRequirement,
  counterBattenRequirement,
  planLinearPurchase,
  type LinearMaterialKind,
  type LinearPurchasePlan,
} from './linear-material-plan';
import type { LinearPlanSurface } from './MaterialPlan';
import { useInstallationActions } from './InstallationWorkflow';
import { summarizeCostScenario } from '@cieslacalc/cost-core';
import { ProjectManager, projectStatusLabel } from '../projects/ProjectManager';
import { LocalProjectRepository } from '../projects/local-repository';
import {
  recentProjects,
  rememberProjectVisit,
} from '../projects/recent-projects';
import type { ProjectSummary as SavedProjectSummary } from '@cieslacalc/project-core';
import { ProjectSession } from '../projects/session';
import { AppHome } from '../home/AppHome';
import {
  ProjectStartAssistant,
  type ProjectStartMode,
} from './ProjectStartAssistant';
import { evaluateBattenInstallation } from './batten-installation';
import { resolveBattenAutoComposition } from './batten-composition';
import './styles.css';
import './v37.css';
import '../business/business.css';

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
const DrainageWorkspace = lazy(() =>
  import('./DrainageWorkspace').then((module) => ({
    default: module.DrainageWorkspace,
  })),
);
const RoofSystemWorkspace = lazy(() =>
  import('./RoofSystemWorkspace').then((module) => ({
    default: module.RoofSystemWorkspace,
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
const IfcImportWorkspace = lazy(() =>
  import('../bim/ifc/IfcImportWorkspace').then((module) => ({
    default: module.IfcImportWorkspace,
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

export type AppView = 'home' | 'workbench' | 'platform';

/** "K1 × 26 · P1 × 2" from the resolved schedule — presentation only. */
function timberFamilySummary(
  rows: readonly { familyKey: string; quantity: number; memberKind: string }[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const families = new Map<string, number>();
  for (const row of rows)
    if (row.memberKind !== 'batten' && row.memberKind !== 'counter-batten')
      families.set(
        row.familyKey,
        (families.get(row.familyKey) ?? 0) + row.quantity,
      );
  const total = [...families.values()].reduce((sum, value) => sum + value, 0);
  if (!total) return '';
  return `${t('assembly.journey.members', { count: total })} · ${[...families]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, quantity]) => `${key} × ${quantity}`)
    .join(' · ')}`;
}

function formatArea(areaMm2: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    areaMm2 / 1_000_000,
  );
}

function costNetSummary(
  summary: { netMinor: number; currencyCode: string; needsPriceCount: number },
  locale: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const net = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: summary.currencyCode,
    maximumFractionDigits: 0,
  }).format(summary.netMinor / 100);
  return summary.needsPriceCount
    ? `${net} ${t('assembly.journey.net')} · ${t('assembly.journey.missingPrices', { count: summary.needsPriceCount })}`
    : `${net} ${t('assembly.journey.net')}`;
}

function AssemblyPageContent({
  home = false,
  platform = false,
  onNavigate,
}: AppRouteProps) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const business = useBusiness();
  const [projectSession] = useState(() => new ProjectSession());
  const projectSessionState = useSyncExternalStore(
    projectSession.subscribe,
    projectSession.snapshot,
  );
  // V44: transient Quick result ↔ drawing highlight; never history.
  const [quickHighlight, setQuickHighlight] = useState<QuickHighlight>();
  const [quickDetail, setQuickDetail] = useState<
    (typeof allDetailPreviews)[number] | undefined
  >();
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [foundationFocus, setFoundationFocus] = useState<
    'geometry' | 'construction'
  >('construction');
  const [actionFeedback, setActionFeedback] = useState<{
    message: string;
    historyLength: number;
  }>();
  const dismissFeedback = useCallback(() => setActionFeedback(undefined), []);
  const runInstallationAction = useInstallationActions();
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
  const [projectStartAt, setProjectStartAt] = useState<'examples' | 1>();
  const [homeProjects, setHomeProjects] = useState<SavedProjectSummary[]>([]);
  // The home lists saved projects without initializing (or creating) one.
  useEffect(() => {
    if (home)
      void new LocalProjectRepository()
        .list()
        .then(setHomeProjects)
        .catch(() => setHomeProjects([]));
  }, [home]);
  const navigate = useCallback(
    (view: AppView) => onNavigate?.(view),
    [onNavigate],
  );
  const activeProjectId = projectSessionState.active?.id;
  useEffect(() => {
    if (activeProjectId && !projectSessionState.freshProject)
      rememberProjectVisit(activeProjectId);
  }, [activeProjectId, projectSessionState.freshProject]);
  const [ifcImportOpen, setIfcImportOpen] = useState(false);
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
  // V51: one canonical roof topology per resolved surface. Covering drawing,
  // tile accessories, drainage, materials, cost and documents all read it;
  // camera, hover and panel state never re-run it.
  const roofTopology = useMemo(
    () => resolveRoofFeatureTopology(surfaceProjection),
    [surfaceProjection],
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
        layout: counterBattens ?? disabledCounterBattenLayer(),
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
  const pricedVariantIds = useMemo(
    () => [
      ...coveringVariantIds,
      ...(currentCuttingPlan?.plan.scenario.stocks.flatMap((stock) =>
        stock.commercialVariantId ? [stock.commercialVariantId] : [],
      ) ?? []),
      ...(membraneProduct?.catalogRef?.variantId
        ? [membraneProduct.catalogRef.variantId]
        : []),
      // V49: catalogue batten/counter-batten lengths carry their own prices.
      ...[
        ...(state.projectDocument.project.buildUp.linearStock?.battens
          ?.lengths ?? []),
        ...(state.projectDocument.project.buildUp.linearStock?.counterBattens
          ?.lengths ?? []),
      ].flatMap((item) =>
        item.catalogRef?.variantId ? [item.catalogRef.variantId] : [],
      ),
    ],
    [
      coveringVariantIds,
      currentCuttingPlan,
      membraneProduct,
      state.projectDocument.project.buildUp.linearStock,
    ],
  );
  const cataloguePrices = usePriceOptions(pricedVariantIds);
  /*
   * V54 §40/§41: in Business mode the active wholesaler's price becomes the
   * primary commercial suggestion, and the fallback is an explicit policy the
   * user can see. In Standard mode this is `cataloguePrices` unchanged.
   */
  const variantPrices = useEffectiveVariantPrices(
    cataloguePrices,
    pricedVariantIds,
  );
  const effectiveBattenLayout = useMemo(
    () => battenLayout ?? disabledBattenLayer(),
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
  const scene3dOpen = workbench.workspaceRenderer === '3d';
  const scene3dContext = useMemo(() => {
    // V44: finished K1 solids are only for the open 3D viewport; a 2D geometry
    // edit must not re-resolve them.
    if (!scene3dOpen)
      return {
        counterBattenRuns: [],
        unresolvedHipBoundaries: [],
        finishedMembers: [],
      };
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
    scene3dOpen,
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
  // V43B: one derived workflow projection shared by every batten surface.
  const battenWorkflow = useMemo(
    () =>
      deriveBattenWorkflow({
        layout: battenLayout,
        result: battenProjection,
        composition: battenAutoComposition,
        decision: battenInstallationDecision,
        assignments: coveringAssignments,
        roofPitchDeg: state.template.pitchDeg,
      }),
    [
      battenLayout,
      battenProjection,
      battenAutoComposition,
      battenInstallationDecision,
      coveringAssignments,
      state.template.pitchDeg,
    ],
  );
  const counterBattenWorkflow = useMemo(
    () =>
      deriveCounterBattenWorkflow({
        layout: counterBattens,
        result: counterBattenProjection,
      }),
    [counterBattens, counterBattenProjection],
  );
  // What the `paired-plane-runs` hip detail would add, from the same resolver.
  const hipPairedRunsPreviewMm = useMemo(() => {
    if (
      !counterBattens?.enabled ||
      counterBattenProjection.unresolvedHipBoundaryCount === 0
    )
      return undefined;
    const paired = resolveCounterBattenLayout({
      template: state.template,
      skeleton: framingProjection.composedSkeleton,
      layout: { ...counterBattens, hipBoundaryDetail: 'paired-plane-runs' },
      features: state.projectDocument.project.features,
    });
    return paired.hipBoundaries.reduce(
      (sum, boundary) => sum + boundary.addedLengthMm,
      0,
    );
  }, [
    counterBattens,
    counterBattenProjection.unresolvedHipBoundaryCount,
    framingProjection.composedSkeleton,
    state.projectDocument.project.features,
    state.template,
  ]);
  const installationFacts = useMemo(
    () => ({
      battens: battenWorkflow,
      counterBattens: counterBattenWorkflow,
      ...(hipPairedRunsPreviewMm !== undefined
        ? { hipPairedRunsPreviewMm }
        : {}),
    }),
    [battenWorkflow, counterBattenWorkflow, hipPairedRunsPreviewMm],
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
                      endOverlapAreaMm2: course.endOverlapAreaMm2,
                      endLapCount: course.endLapCount,
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
  // V50: tile purchase plans for every assignment the user prepared one for.
  const tilePurchasePlans = useMemo(
    () =>
      createTilePurchasePlans({
        coverings: coveringAssignments,
        layouts: resolvedCoveringLayouts,
        surface: surfaceProjection,
        topology: roofTopology,
      }),
    [
      coveringAssignments,
      resolvedCoveringLayouts,
      surfaceProjection,
      roofTopology,
    ],
  );
  // V51/V52: the whole roof system from the one topology. Resolved after the
  // tile plans so a clip rule can read the resolved ridge-tile count.
  const roofSystemIntent = state.projectDocument.project.roofSystem;
  const resolvedRidgeTiles = ridgeTileCount(tilePurchasePlans);
  const roofSystem = useMemo(
    () =>
      resolveRoofSystemFacts({
        surface: surfaceProjection,
        topology: roofTopology,
        intent: roofSystemIntent,
        ridgeTileCount: resolvedRidgeTiles,
      }),
    [surfaceProjection, roofTopology, roofSystemIntent, resolvedRidgeTiles],
  );
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
    battenWorkflow,
    counterBattenWorkflow,
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
    tilePurchasePlans,
    roofSystem,
  };
  const materialRows = createMaterialPlanRows(materialFacts, membraneProduct);
  const effectiveMaterialPrices = {
    ...materialScenarioPrices(costScenario, materialRows),
    ...materialPrices,
  };
  const {
    currentQuoteDraft,
    currentCommercialFingerprint,
    commercialReadiness,
    quoteOpen,
    setQuoteOpen,
    openQuote,
    refreshQuote,
    runCommercialAction,
    startBusinessEstimation,
    openBusinessProject,
    changeQuote,
    saveStatus,
    retrySave,
    reloadRemote,
    compareDraft,
    activeEstimation,
    exportRecovery,
    returnHome,
    commercialSummary,
  } = useBusinessWorkspace({
    state,
    projectSession,
    projectSessionState,
    materialRows,
    effectiveMaterialPrices,
    costScenario,
    hasCovering: coveringAssignments.length > 0,
    locale: i18n.language,
    setReuseFreshProject,
    setProjectStartMode,
  });
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
      // V43B: batten and hip-detail decisions are their own guided steps;
      // a layer warning is reserved for genuinely invalid layer data.
      layerWarnings:
        battenWorkflow.state === 'geometry-invalid' ||
        battenWorkflow.state === 'manual-incompatible' ||
        battenWorkflow.state === 'auto-incompatible' ||
        counterBattenWorkflow.state === 'invalid' ||
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
        (battenWorkflow.pitch.status === 'below-minimum' ? 1 : 0),
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
      battenWorkflow.state,
      battenWorkflow.pitch.status,
      counterBattenWorkflow.state,
      coveringAssignments.length,
      resolvedCoveringLayouts,
      coveringOwnership.conflicts.length,
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
  /**
   * V48: the commercial planning surface. Requirements come from the resolved
   * batten/counter-batten layouts, and the plan is only computed once the user
   * has actually chosen commercial lengths — geometry never depends on it.
   */
  const linearStock = state.projectDocument.project.buildUp.linearStock;
  const linearRequirements = useMemo(
    () => ({
      batten: battenRequirement({
        template: state.template,
        skeleton: framingProjection.composedSkeleton,
        result: battenProjection,
        section: battenLayout
          ? {
              widthMm: battenLayout.battenWidthMm,
              depthMm: battenLayout.battenHeightMm,
            }
          : undefined,
      }),
      'counter-batten': counterBattenRequirement({
        template: state.template,
        result: counterBattenProjection,
      }),
    }),
    [
      battenLayout,
      battenProjection,
      counterBattenProjection,
      framingProjection.composedSkeleton,
      state.template,
    ],
  );
  const linearSelections = useMemo(
    () => ({
      batten: linearStock?.battens,
      'counter-batten': linearStock?.counterBattens,
    }),
    [linearStock],
  );
  const linearPlans = useMemo(() => {
    const plans: Partial<Record<LinearMaterialKind, LinearPurchasePlan>> = {};
    for (const kind of ['batten', 'counter-batten'] as const) {
      const selection = linearSelections[kind];
      if (!selection?.lengths.length) continue;
      const plan = planLinearPurchase(linearRequirements[kind], {
        stockLengths: selection.lengths.map((item, index) => ({
          // A catalogue length is identified by its variant/product, so two
          // products of the same length stay distinct in the plan.
          id: item.catalogRef
            ? `stock-${item.catalogRef.variantId ?? item.catalogRef.productId}`
            : `stock-${item.lengthMm}-${index}`,
          lengthMm: item.lengthMm,
          ...(item.availability === undefined
            ? {}
            : { availability: item.availability }),
          source: item.catalogRef
            ? {
                kind: 'catalogue' as const,
                ...(item.catalogRef.variantId
                  ? { variantId: item.catalogRef.variantId }
                  : {}),
                productId: item.catalogRef.productId,
                revisionId: item.catalogRef.technicalRevisionId,
                productName: item.catalogRef.productName,
                ...(item.catalogRef.manufacturerName
                  ? { manufacturerName: item.catalogRef.manufacturerName }
                  : {}),
              }
            : { kind: 'manual' as const },
        })),
        cutting: {
          kerfMm: selection.kerfMm ?? 3,
          endTrimMm: selection.endTrimMm ?? 0,
          minimumReusableRemnantMm: selection.minimumReusableRemnantMm ?? 300,
        },
        ...(selection.objective ? { objective: selection.objective } : {}),
        ...(selection.angledEndAllowanceMm === undefined
          ? {}
          : { angledEndAllowanceMm: selection.angledEndAllowanceMm }),
      });
      if (plan) plans[kind] = plan;
    }
    return plans;
  }, [linearRequirements, linearSelections]);
  const linearSurface: LinearPlanSurface = useMemo(
    () => ({
      requirements: linearRequirements,
      selections: linearSelections,
      plans: linearPlans,
      onSelectionChange: (kind, selection) =>
        state.setLinearStockSelection(
          kind === 'batten' ? 'battens' : 'counterBattens',
          selection,
        ),
      onFixBlocker: (_kind, blocker) => {
        if (blocker === 'hip-detail-unresolved')
          runReadinessAction('choose-hip-detail');
      },
      // V49 §26: only ever an explicit click, never a silent substitution.
      onChangeSection: (kind, section) => {
        if (kind !== 'batten' || !battenLayout) return;
        state.setBattenLayout({
          ...battenLayout,
          battenWidthMm: section.widthMm,
          battenHeightMm: section.depthMm,
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [battenLayout, linearPlans, linearRequirements, linearSelections],
  );
  // V47: one readiness projection over already-resolved facts.
  const readinessCandidates = useMemo(
    () => createExportCandidates(documentFacts),
    // Section availability only; limitations never change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.projectDocument,
      activeCuttingPlan,
      costScenario,
      membraneProduct,
      resolvedCoveringLayouts,
    ],
  );
  const projectReadiness = useMemo(
    () =>
      deriveProjectReadiness({
        template: state.template,
        constructionReady: projectWorkflowFacts.constructionReady,
        surfaceIssueCount: surfaceProjection.issues.length,
        openingWarningCount:
          openingSummary.collisions + openingSummary.needsReview,
        coverings: coveringAssignments,
        coveringLayouts: resolvedCoveringLayouts.map((layout) => ({
          assignmentId: layout.assignmentId,
          status: layout.status,
          issues: layout.issues,
          ...(layout.kind === 'roof-tile' ? { planes: layout.planes } : {}),
        })),
        buildUp: state.projectDocument.project.buildUp,
        battenWorkflow,
        counterBattenWorkflow,
        membrane: {
          enabled: !!membrane?.enabled,
          hasProduct: !!membraneProduct,
          layoutStatus: membraneCourseLayout?.status,
        },
        k1: k1Requirement,
        hasCuttingPlan: !!activeCuttingPlan,
        materialRows,
        cost:
          costScenario && costScenario.lines.length
            ? summarizeCostScenario(costScenario)
            : undefined,
        candidates: readinessCandidates,
        // V51: optional drainage — never a blocker for unrelated work.
        drainage: {
          status: roofSystem.drainage.status,
          issueCodes: roofSystem.drainage.issues.map((issue) => issue.code),
          unconfirmedRuns: roofSystem.drainage.issues.filter(
            (issue) => issue.code === 'outlets-unconfirmed',
          ).length,
        },
        roofDetails: {
          openingsUndecided: roofSystem.openingSystems.filter(
            (opening) =>
              opening.flashing.status === 'requires-product' ||
              opening.flashing.status === 'requires-decision',
          ).length,
          openingsIncompatible: roofSystem.openingSystems.filter(
            (opening) => opening.flashing.status === 'incompatible',
          ).length,
          componentsUndecided: roofSystem.lineComponents.filter(
            (item) => item.status === 'requires-decision',
          ).length,
        },
        // V48: commercial planning is optional, so only plannable materials
        // are ever mentioned, and never as a blocker.
        tilePlannable: resolvedCoveringLayouts.flatMap((layout) =>
          layout.kind === 'roof-tile' && layout.status === 'resolved'
            ? [layout.assignmentId]
            : [],
        ),
        tilePlans: tilePurchasePlans.map((plan) => ({
          assignmentId: plan.assignmentId,
          status: plan.requirement.status,
          splitPositions: plan.requirement.splitPositionCount,
          openingPositions: plan.requirement.openingCutPositionCount,
          undecidedAccessories: plan.accessories.filter(
            (item) => item.status === 'requires-decision',
          ).length,
        })),
        linearPlannable: (['batten', 'counter-batten'] as const).filter(
          (kind) => linearRequirements[kind].status === 'ready',
        ),
        linearPlans: Object.fromEntries(
          (['batten', 'counter-batten'] as const).flatMap((kind) => {
            const plan = linearPlans[kind];
            return plan
              ? [
                  [
                    kind,
                    {
                      status: plan.status,
                      unresolvedRuns: plan.assembly.unresolved.length,
                    },
                  ],
                ]
              : [];
          }),
        ),
      }),
    [
      state.template,
      state.projectDocument.project.buildUp,
      projectWorkflowFacts.constructionReady,
      surfaceProjection.issues.length,
      openingSummary,
      coveringAssignments,
      resolvedCoveringLayouts,
      battenWorkflow,
      counterBattenWorkflow,
      membrane?.enabled,
      membraneProduct,
      membraneCourseLayout?.status,
      k1Requirement,
      activeCuttingPlan,
      materialRows,
      costScenario,
      readinessCandidates,
      linearRequirements,
      linearPlans,
      tilePurchasePlans,
      roofSystem,
    ],
  );
  // V53 project journey: stages + ONE next action from resolved facts only.
  const roofChecklist = resolveRoofSystemChecklist(materialFacts);
  const pitch = Math.round(state.template.pitchDeg * 10) / 10;
  const primaryCovering = coveringAssignments[0];
  const projectJourney = deriveProjectJourney({
    readiness: projectReadiness,
    checklist: roofChecklist,
    summaries: {
      geometry: `${t(`assembly.${state.template.type === 'gable' ? 'gableRoof' : 'hipRoof'}`)} · ${(
        state.template.buildingLengthMm / 1000
      ).toLocaleString(i18n.language)} × ${(
        (state.template.halfRunMm * 2) /
        1000
      ).toLocaleString(
        i18n.language,
      )} m · ${pitch.toLocaleString(i18n.language)}°`,
      construction: timberFamilySummary(memberSchedule.timberRows, t),
      ...(primaryCovering
        ? {
            covering: [
              tileProductName(primaryCovering),
              surfaceProjection.status === 'resolved'
                ? `${formatArea(surfaceProjection.netAreaMm2, i18n.language)} m²`
                : undefined,
            ]
              .filter(Boolean)
              .join(' · '),
          }
        : {}),
      layers: [
        membrane?.enabled ? t('assembly.journey.layer.membrane') : undefined,
        counterBattens?.enabled
          ? t('assembly.journey.layer.counterBattens')
          : undefined,
        battenLayout?.enabled ? t('assembly.journey.layer.battens') : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      ...(materialRows.length
        ? {
            materials: t('assembly.journey.positions', {
              count: materialRows.length,
            }),
          }
        : {}),
      ...(costScenario && costScenario.lines.length
        ? {
            cost: costNetSummary(
              summarizeCostScenario(costScenario),
              i18n.language,
              t,
            ),
          }
        : {}),
    },
    openingsNeedingFlashing: roofSystem.openingSystems.filter(
      (opening) => opening.flashing.status !== 'resolved',
    ),
    materials: {
      attention: materialRows.filter((row) => row.partial).length,
      total: materialRows.length,
    },
    cost: {
      started: !!costScenario && costScenario.lines.length > 0,
      missingPrices:
        costScenario && costScenario.lines.length
          ? summarizeCostScenario(costScenario).needsPriceCount
          : 0,
    },
  });
  const documentFactsWithLimits: ExportFacts = {
    ...documentFacts,
    limitations: projectReadiness.limitations,
    // V48: cost and documents read the one resolved plan; neither re-solves.
    linearPlans,
  };
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
    if (action === 'reviewBattens' || action === 'reviewHipDetail') {
      state.navigateTo(workbenchLocation('layers'));
      const view = action === 'reviewBattens' ? 'battens' : 'counterBattens';
      state.setBuildUpView(view);
      state.select(
        view === 'battens' ? 'layer:battens' : 'layer:counter-battens',
      );
      if (mobile) {
        state.setInspectorOpen(true);
        state.setMobilePanel('inspector');
      }
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
  const openLayerView = (
    view: 'battens' | 'counterBattens' | 'membrane',
    selection: string,
  ) => {
    state.navigateTo(workbenchLocation('layers'));
    state.setBuildUpView(view);
    state.select(selection);
    if (mobile) {
      state.setInspectorOpen(true);
      state.setMobilePanel('inspector');
    }
  };
  const showFeedback = (messageKey: string) =>
    setActionFeedback({
      message: t(messageKey),
      historyLength: useAssembly.getState().historyPast.length,
    });
  // V53: a journey action may carry an exact roof-system focus (one
  // opening, one area); it is transient view state and creates no history.
  const runJourneyAction = (next: JourneyAction) => {
    if (next.focus) requestRoofSystemFocus(next.focus);
    runReadinessAction(next.action);
  };
  const runReadinessAction = (action: ReadinessAction) => {
    setReadinessOpen(false);
    closeDocument();
    const project = state.projectDocument.project;
    switch (action) {
      case 'review-geometry':
      case 'review-structure':
        setFoundationFocus(
          action === 'review-geometry' ? 'geometry' : 'construction',
        );
        runProjectAction('completeGeometry');
        state.select('roof');
        state.setInspectorOpen(true);
        requestAnimationFrame(() => {
          const settings = document.querySelector<HTMLDetailsElement>(
            '[data-testid="structure-settings"]',
          );
          if (settings) settings.open = action === 'review-structure';
          const field =
            action === 'review-structure'
              ? settings?.querySelector('input')
              : document.getElementById('roof.runMm');
          field?.focus();
          field?.scrollIntoView({ block: 'nearest' });
        });
        return;
      case 'review-openings':
        runProjectAction('reviewOpenings');
        return;
      case 'choose-covering':
        runProjectAction('addCovering');
        return;
      case 'review-covering':
      case 'choose-installation-mode':
        runProjectAction('reviewCovering');
        return;
      case 'fit-roof': {
        const before = useAssembly.getState().historyPast.length;
        state.fitInstallationToRoof();
        if (useAssembly.getState().historyPast.length > before)
          showFeedback('assembly.readiness.feedback.repaired');
        return;
      }
      case 'fit-auto':
        runInstallationAction('fit-auto');
        showFeedback('assembly.readiness.feedback.autoGauge');
        return;
      case 'set-manual':
        runInstallationAction('set-manual', battenWorkflow.gaugeMm);
        return;
      case 'enable-auto-battens':
        state.setBattenLayout(
          project.buildUp.battenLayout
            ? { ...project.buildUp.battenLayout, enabled: true }
            : newBattenLayer(),
        );
        return;
      case 'review-battens':
        openLayerView('battens', 'layer:battens');
        return;
      case 'review-eave-detail':
        openLayerView('battens', 'layer:battens');
        requestAnimationFrame(() => {
          const settings = document.querySelector<HTMLDetailsElement>(
            '[data-testid="batten-advanced-settings"]',
          );
          if (!settings) return;
          settings.open = true;
          const field = [
            ...settings.querySelectorAll<HTMLLabelElement>('label'),
          ].find((label) =>
            label.textContent?.includes(t('assembly.battenEaveOffset')),
          );
          field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
          field?.querySelector('input')?.focus();
        });
        return;
      case 'enable-counter-battens':
        runInstallationAction('enable-counter-battens');
        return;
      case 'choose-hip-detail':
        openLayerView('counterBattens', 'layer:counter-battens');
        requestAnimationFrame(() =>
          document
            .querySelector('[data-testid="hip-boundary-detail"]')
            ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
        );
        return;
      case 'review-counter-battens':
        openLayerView('counterBattens', 'layer:counter-battens');
        return;
      case 'choose-membrane-product':
      case 'review-membrane':
        openLayerView('membrane', 'layer:membrane');
        return;
      case 'plan-k1':
        openCutting();
        return;
      case 'open-materials':
        state.navigateTo(workbenchLocation('materials'));
        return;
      case 'open-drainage':
        state.navigateTo(workbenchLocation('materials', 'drainage'));
        return;
      case 'open-roof-system':
        state.navigateTo(workbenchLocation('materials', 'system'));
        return;
      case 'open-documents':
        state.navigateTo(workbenchLocation('documents'));
        return;
      case 'open-cost':
        state.navigateTo(workbenchLocation('costing'));
        return;
    }
  };
  const applySafeRepair = () => {
    const before = useAssembly.getState().historyPast.length;
    state.fitInstallationToRoof();
    if (useAssembly.getState().historyPast.length > before)
      showFeedback('assembly.readiness.feedback.repaired');
  };
  const wideWorkspace =
    workbench.viewPreset === 'costing' || workbench.viewPreset === 'documents';
  // An empty covering task has nothing to edit: give the space to the
  // "Dodaj pokrycie" empty state instead of a blank Inspector.
  const overviewActive =
    workbench.viewPreset === 'materials' &&
    workbench.materialsView === 'summary';
  const currentJourneyStage = (
    {
      construction: foundationFocus,
      openings: 'geometry',
      layers: 'layers',
      covering: 'covering',
      cuts: 'construction',
      materials:
        workbench.materialsView === 'system' ||
        workbench.materialsView === 'drainage'
          ? 'roof-system'
          : 'materials',
      costing: 'cost',
      documents: 'documents',
    } as Partial<Record<string, JourneyStageKey>>
  )[workbench.viewPreset];
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
  /** The home's Standard column always means Standard mode. */
  const standardMode = () => {
    if (business.mode !== 'standard') business.setMode('standard');
  };
  /** Every start path ends in the workbench with no chooser left open. */
  const enterProject = () => {
    rememberCreatorStart();
    projectSession.acknowledgeFreshProject();
    setReuseFreshProject(false);
    setProjectStartMode(undefined);
    setProjectStartAt(undefined);
    changeMode('builder');
    state.navigatePerspective('project');
    navigate('workbench');
  };
  const openSavedProject = async (id: string) => {
    await projectSession.initialize();
    await projectSession.open(id);
    enterProject();
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
        installation={installationFacts}
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
      {home || platform ? (
        <AppHome
          brand={brand}
          projects={recentProjects(homeProjects)}
          onNewProject={() => {
            standardMode();
            setReuseFreshProject(false);
            setProjectStartAt(1);
            setProjectStartMode('new');
          }}
          onImportIfc={() => {
            standardMode();
            setIfcImportOpen(true);
          }}
          onQuick={() => {
            standardMode();
            changeMode('quick');
            navigate('workbench');
          }}
          onOpenProject={(id) => {
            standardMode();
            void openSavedProject(id);
          }}
          onExamples={() => {
            standardMode();
            setProjectStartAt('examples');
            setProjectStartMode('new');
          }}
          onBusiness={() => {
            business.setMode('business');
            business.setHomeOpen(true);
            navigate('workbench');
          }}
          onPlatform={() => navigate('platform')}
        />
      ) : (
        <>
          <header className="a-header">
            <a
              className="a-brand"
              href="#/"
              onClick={(event) => {
                if (!onNavigate) return;
                event.preventDefault();
                navigate('home');
              }}
            >
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
                onImportIfc={() => setIfcImportOpen(true)}
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
            <BusinessHeader onHome={returnHome} />
            <div className="a-settings">
              <div
                className="a-units"
                role="group"
                aria-label={t('assembly.unit')}
              >
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
                    void i18n.changeLanguage(
                      i18n.language === 'pl' ? 'en' : 'pl',
                    );
                  }}
                >
                  {i18n.language.toUpperCase()}
                </button>
              )}
              {/* An application capability, beside unit and language (§14). */}
              <BusinessModeToggle />
            </div>
          </header>
          {business.mode === 'business' &&
            activeEstimation &&
            !business.homeOpen && (
              <WorkspaceStatus
                status={saveStatus}
                locale={i18n.language}
                onRetry={retrySave}
                onReload={reloadRemote}
                onExport={exportRecovery}
                onQuote={openQuote}
                onHome={returnHome}
                onMaterials={() =>
                  state.navigateTo(workbenchLocation('materials', 'plan'))
                }
              />
            )}
          {business.mode === 'business' && business.homeOpen ? (
            <BusinessHome
              projects={projectSessionState.projects}
              onCreate={startBusinessEstimation}
              onOpenProject={openBusinessProject}
              onContinue={() => business.setHomeOpen(false)}
            />
          ) : (
            <main className="a-main">
              <div className="a-page-heading">
                <div>
                  <span className="a-eyebrow">
                    {t('workshop')} / {t('assembly.model')}
                  </span>
                  <h1>{t('assembly.title')}</h1>
                  <strong className="a-member-subtitle">
                    {workbench.mode === 'quick'
                      ? state.template.type === 'hip'
                        ? `H1 ${t('assembly.hipRafter')}`
                        : `K1 ${t('assembly.commonRafter')}`
                      : state.template.type === 'hip'
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
                    {hip ? (
                      <QuickH1Result hip={hip} />
                    ) : (
                      result && (
                        <QuickK1Result
                          result={result}
                          highlight={quickHighlight}
                          onHighlight={setQuickHighlight}
                        />
                      )
                    )}
                    {hip ? (
                      <HipFabricationSheet hip={hip} compact />
                    ) : (
                      result && (
                        <div className="a-quick-drawing">
                          <AssemblyCanvas
                            result={result}
                            compact
                            readOnly
                            highlight={quickHighlight}
                            heightPx={330}
                          />
                          <p className="a-help">
                            {t('assembly.quickResult.drawingHint')}
                          </p>
                        </div>
                      )
                    )}
                    <QuickCutPreviews
                      previews={quickDetailPreviews}
                      onOpen={setQuickDetail}
                    />
                  </section>
                </div>
              ) : (
                <div className="a-project-shell">
                  <JourneyRail
                    journey={projectJourney}
                    currentStage={currentJourneyStage}
                    overviewActive={overviewActive}
                    onAction={runJourneyAction}
                    onOverview={() => runProjectAction('openSummary')}
                  />
                  <div className="a-project-body">
                    {business.mode === 'business' && (
                      <BusinessJourney
                        summary={commercialSummary}
                        readiness={commercialReadiness}
                        onAction={runCommercialAction}
                      />
                    )}
                    <ProjectReadinessBar
                      key={projectSessionState.active?.id ?? 'unsaved'}
                      readiness={projectReadiness}
                      journey={projectJourney}
                      currentStage={currentJourneyStage}
                      unit={state.unit}
                      onAction={runReadinessAction}
                      onJourneyAction={runJourneyAction}
                      onOpenPanel={() => setReadinessOpen(true)}
                    />
                    {readinessOpen && (
                      <ProjectReadinessPanel
                        journey={projectJourney}
                        onJourneyAction={runJourneyAction}
                        readiness={projectReadiness}
                        unit={state.unit}
                        onAction={runReadinessAction}
                        onSafeRepair={applySafeRepair}
                        onClose={() => setReadinessOpen(false)}
                      />
                    )}
                    {actionFeedback && (
                      <ActionFeedback
                        message={actionFeedback.message}
                        onUndo={
                          useAssembly.getState().historyPast.length ===
                          actionFeedback.historyLength
                            ? () => state.undo()
                            : undefined
                        }
                        onDismiss={dismissFeedback}
                      />
                    )}
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
                                <button
                                  className="a-button"
                                  onClick={state.requestFit}
                                >
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
                            installation={installationFacts}
                            selectedView={workbench.buildUpView}
                            onSelect={(view) => {
                              state.setBuildUpView(view);
                              if (
                                view !== 'overview' &&
                                view !== 'installation'
                              )
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
                                <summary>
                                  {t('assembly.materialDetailViews')}
                                </summary>
                                {(['summary', 'drawing'] as const).map(
                                  (view) => (
                                    <button
                                      key={view}
                                      role="tab"
                                      aria-selected={
                                        workbench.materialsView === view
                                      }
                                      onClick={() =>
                                        state.setMaterialsView(view)
                                      }
                                    >
                                      {t(`assembly.${view}MaterialView`)}
                                    </button>
                                  ),
                                )}
                              </details>
                            </div>
                            <div data-material-surface="plan">
                              <Suspense
                                fallback={<div className="a-loading-panel" />}
                              >
                                <MaterialPlan
                                  key={
                                    projectSessionState.active?.id ?? 'unsaved'
                                  }
                                  facts={materialFacts}
                                  membrane={membraneProduct}
                                  scenario={costScenario}
                                  prices={effectiveMaterialPrices}
                                  readiness={projectReadiness}
                                  onReadinessAction={runReadinessAction}
                                  linear={linearSurface}
                                  onPricesChange={setMaterialPrices}
                                  onScenarioChange={setCostScenario}
                                  onOpenCutting={openCutting}
                                  onOpenLayers={() =>
                                    state.navigateTo(
                                      workbenchLocation('layers'),
                                    )
                                  }
                                  onOpenCovering={() =>
                                    state.navigateTo(
                                      workbenchLocation('covering'),
                                    )
                                  }
                                  onOpenCosting={() =>
                                    state.navigateTo(
                                      workbenchLocation('costing'),
                                    )
                                  }
                                  onOpenExport={openExecutionExport}
                                />
                              </Suspense>
                            </div>
                            <div data-material-surface="system">
                              {workbench.materialsView === 'system' && (
                                <Suspense
                                  fallback={<div className="a-loading-panel" />}
                                >
                                  <RoofSystemWorkspace
                                    surface={surfaceProjection}
                                    facts={materialFacts}
                                    onOpenCovering={() =>
                                      state.navigateTo(
                                        workbenchLocation('covering'),
                                      )
                                    }
                                    onOpenTilePlan={() =>
                                      state.setMaterialsView('plan')
                                    }
                                    onOpenDrainage={() =>
                                      state.setMaterialsView('drainage')
                                    }
                                  />
                                </Suspense>
                              )}
                            </div>
                            <div data-material-surface="drainage">
                              {workbench.materialsView === 'drainage' && (
                                <Suspense
                                  fallback={<div className="a-loading-panel" />}
                                >
                                  <DrainageWorkspace
                                    surface={surfaceProjection}
                                    facts={roofSystem}
                                    onOpenPlan={() =>
                                      state.setMaterialsView('plan')
                                    }
                                  />
                                </Suspense>
                              )}
                            </div>
                            <div
                              data-material-surface="cutting"
                              data-testid="k1-cutting-surface"
                            >
                              {workbench.materialsView === 'cutting' &&
                                (k1Requirement.status === 'resolved' ? (
                                  <Suspense
                                    fallback={
                                      <div className="a-loading-panel" />
                                    }
                                  >
                                    <K1CuttingPlan
                                      presentation="inline"
                                      requirement={k1Requirement}
                                      projectName={
                                        projectSessionState.active?.name
                                      }
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
                                      {t(
                                        'assembly.workflow.k1UnavailableDescription',
                                      )}
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
                                      {t(
                                        'assembly.workflow.action.completeGeometry',
                                      )}
                                    </button>
                                  </div>
                                ))}
                            </div>
                            <div data-material-surface="summary">
                              <ProjectSummary
                                facts={projectSummary}
                                {...(projectSessionState.active
                                  ? {
                                      projectName:
                                        projectSessionState.active.name,
                                    }
                                  : {})}
                                journey={projectJourney}
                                onJourneyAction={runJourneyAction}
                                unit={state.unit}
                                onOpenCutting={openCutting}
                                onOpenCovering={() =>
                                  state.navigateTo(
                                    workbenchLocation('covering'),
                                  )
                                }
                              />
                            </div>
                            <div
                              className="a-material-canvas"
                              data-material-surface="drawing"
                            >
                              <Suspense
                                fallback={<div className="a-loading-panel" />}
                              >
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
                              <Suspense
                                fallback={<div className="a-loading-panel" />}
                              >
                                <MaterialSchedule
                                  schedule={memberSchedule}
                                  k1={k1Requirement}
                                  coveringStatus={
                                    projectWorkflow.stages[3]!.status
                                  }
                                  onOpenCutting={openCutting}
                                  selectedRowId={
                                    workbench.selectedScheduleRowId
                                  }
                                  selectedInstanceId={
                                    workbench.selectedScheduleInstanceId
                                  }
                                  battens={battenProjection}
                                  counterBattens={counterBattenProjection}
                                  battenAutoComposition={battenAutoComposition}
                                  onSelectRow={(row) => {
                                    state.setScheduleSelection(row.id);
                                    if (mobile)
                                      state.setMobilePanel('inspector');
                                  }}
                                  onSelectInstance={selectScheduleInstance}
                                />
                              </Suspense>
                            </div>
                          </div>
                        ) : workbench.viewPreset === 'covering' ? (
                          <Suspense
                            fallback={<div className="a-loading-panel" />}
                          >
                            <CoveringWorkspace
                              assignments={coveringAssignments}
                              assignment={activeCoveringAssignment}
                              layout={activeCoveringLayout}
                              conflicts={activeCoveringConflicts}
                              surfaceGeometry={surfaceProjection}
                              battens={battenProjection}
                              counterBattens={counterBattenProjection}
                              installation={installationFacts}
                              tilePlan={tilePurchasePlans.find(
                                (plan) =>
                                  plan.assignmentId ===
                                  activeCoveringAssignment?.id,
                              )}
                              roofTopology={roofTopology}
                              drainage={roofSystem.drainage}
                              onOpenMaterials={() =>
                                state.navigateTo(
                                  workbenchLocation('materials', 'plan'),
                                  { remember: true },
                                )
                              }
                            />
                          </Suspense>
                        ) : workbench.viewPreset === 'costing' ? (
                          <Suspense
                            fallback={<div className="a-loading-panel" />}
                          >
                            {costScenario && projectSessionState.active ? (
                              <CostWorkspace
                                facts={
                                  {
                                    source: {
                                      projectId: projectSessionState.active.id,
                                      projectName:
                                        projectSessionState.active.name,
                                      projectCreatedAt:
                                        projectSessionState.active.createdAt,
                                      projectUpdatedAt:
                                        projectSessionState.active.updatedAt,
                                      projectSchemaVersion:
                                        state.projectDocument.schemaVersion,
                                    },
                                    template: state.template,
                                    resolved: templateResult,
                                    skeleton:
                                      framingProjection.composedSkeleton,
                                    surface: surfaceProjection,
                                    windows: roofWindows,
                                    schedule: memberSchedule,
                                    details: allDetailPreviews,
                                    k1: k1Requirement,
                                    cutting: activeCuttingPlan,
                                    membraneEnabled: !!membrane?.enabled,
                                    counterBattensEnabled:
                                      !!counterBattens?.enabled,
                                    battensEnabled: !!battenLayout?.enabled,
                                    battens: battenProjection,
                                    battenAutoSource:
                                      battenAutoComposition.source,
                                    battenInstallationDecision,
                                    counterBattens: counterBattenProjection,
                                    coverings: coveringAssignments,
                                    coveringStatuses:
                                      resolvedCoveringLayouts.map((layout) => ({
                                        assignmentId: layout.assignmentId,
                                        status: layout.status,
                                        warnings: [...layout.issueCodes],
                                      })),
                                    coveringLayouts: resolvedCoveringLayouts,
                                    variantPrices,
                                    // V48: price the commercial pieces, not metres.
                                    linearPlans,
                                    // V50: price the tiles to buy, not the area.
                                    tilePurchasePlans,
                                    // V51: price the commercial roof-system pieces.
                                    roofSystem,
                                  } satisfies Omit<ExportFacts, 'cost'>
                                }
                                scenario={costScenario}
                                onScenarioChange={setCostScenario}
                                onOpenDocuments={openExecutionExport}
                                materialsAttention={
                                  materialRows.filter((row) => row.partial)
                                    .length
                                }
                                onOpenMaterials={() =>
                                  state.navigateTo(
                                    workbenchLocation('materials'),
                                  )
                                }
                                onOpenQuote={openQuote}
                              />
                            ) : (
                              <div className="a-loading-panel" />
                            )}
                          </Suspense>
                        ) : workbench.viewPreset === 'documents' ? (
                          <DocumentHub
                            facts={documentFactsWithLimits}
                            readiness={projectReadiness}
                            unit={state.unit}
                            onAction={runReadinessAction}
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
                          <AssemblyCanvas
                            result={result}
                            focusId={workbench.focusId}
                          />
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
                              onReturnTo2D={() =>
                                state.setWorkspaceRenderer('2d')
                              }
                              onOpenPreparation={openInstancePreparation}
                            />
                          </Suspense>
                        ) : (
                          <Suspense
                            fallback={<div className="a-loading-panel" />}
                          >
                            <SkeletonCanvas
                              template={state.template}
                              skeleton={skeleton}
                              collisionSkeleton={baseSkeleton}
                              proposalMemberIds={
                                new Set(
                                  proposalMembers.map((member) => member.id),
                                )
                              }
                              spacing={layoutSpacing}
                              relatedSupportId={
                                activeOperation?.relatedSupportId
                              }
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
                        (workbench.viewPreset !== 'materials' ||
                          selectedScheduleRow) &&
                        inspectorContent}
                    </div>
                    {exportSource && (
                      <Suspense fallback={<div className="a-loading-panel" />}>
                        <ExecutionExport
                          key={`${documentRequest?.kind}:${documentRequest?.mode}`}
                          source={exportSource}
                          facts={{
                            ...documentFactsWithLimits,
                            source: exportSource,
                          }}
                          documentKind={
                            (documentRequest?.kind ??
                              'execution') as ReadinessDocumentKind
                          }
                          documentStatus={documentStatusFor(
                            projectReadiness,
                            (documentRequest?.kind ??
                              'execution') as ReadinessDocumentKind,
                          )}
                          onFixProblems={() => {
                            closeDocument();
                            const kind = (documentRequest?.kind ??
                              'execution') as ReadinessDocumentKind;
                            const firstBlocker = projectReadiness.issues.find(
                              (issue) =>
                                issue.severity === 'blocker' &&
                                issue.affects.includes(kind) &&
                                issue.action,
                            );
                            if (firstBlocker?.action)
                              runReadinessAction(firstBlocker.action);
                            else setReadinessOpen(true);
                          }}
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
                          <strong>
                            {entityLabel(workbench.selectedId, state, t)}
                          </strong>
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
                  </div>
                </div>
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
          )}
        </>
      )}
      {quoteOpen && currentQuoteDraft && (
        <QuoteWorkspace
          draft={currentQuoteDraft}
          saveStatus={saveStatus}
          onRetrySave={retrySave}
          onReload={reloadRemote}
          comparison={compareDraft}
          currentFingerprint={currentCommercialFingerprint}
          locale={i18n.language}
          onChange={changeQuote}
          onRefresh={refreshQuote}
          onOpenMaterials={() => {
            setQuoteOpen(false);
            state.navigateTo(workbenchLocation('materials', 'plan'));
          }}
          onClose={() => setQuoteOpen(false)}
        />
      )}
      {projectStartMode && (
        <ProjectStartAssistant
          mode={projectStartMode}
          template={state.template}
          projects={recentProjects(
            (projectSessionState.initialized
              ? projectSessionState.projects
              : homeProjects
            ).filter(
              (project) =>
                !projectSessionState.freshProject ||
                project.id !== projectSessionState.active?.id,
            ),
          )}
          {...(projectStartAt ? { startAt: projectStartAt } : {})}
          onBeginProject={() => state.setMode('builder')}
          onQuick={() => {
            setProjectStartMode(undefined);
            state.setMode('quick');
          }}
          onImportIfc={() => {
            state.setMode('builder');
            setProjectStartMode(undefined);
            setIfcImportOpen(true);
          }}
          onOpenProject={openSavedProject}
          onClose={() => {
            rememberCreatorStart();
            projectSession.acknowledgeFreshProject();
            setReuseFreshProject(false);
            setProjectStartMode(undefined);
            setProjectStartAt(undefined);
          }}
          onSubmit={async (template) => {
            if (projectStartMode === 'new' || projectStartMode === 'quick') {
              // A fresh, untouched session project is reused; otherwise a
              // new record is created so an existing project is never replaced.
              const initialized = projectSession.snapshot().initialized;
              await projectSession.initialize();
              if (
                !reuseFreshProject &&
                (initialized || !projectSession.snapshot().freshProject)
              )
                await projectSession.create();
              useAssembly
                .getState()
                .replaceProjectDocument(createRoofProjectDocument(template));
            } else if (projectStartMode === 'edit') {
              useAssembly.getState().setProjectRoof(template);
            }
            enterProject();
            state.setViewPreset('construction');
          }}
          onAdvanced={async () => {
            const initialized = projectSession.snapshot().initialized;
            await projectSession.initialize();
            if (
              !reuseFreshProject &&
              (initialized || !projectSession.snapshot().freshProject)
            )
              await projectSession.create();
            enterProject();
            state.setViewPreset('construction');
          }}
          onExample={async (id) => {
            await projectSession.initialize();
            const title = t(`assembly.creator.examples.item.${id}.title`);
            await projectSession.createFromDocument(
              projectExampleDocument(id),
              t('assembly.creator.examples.name', { title }),
            );
            enterProject();
            state.setViewPreset('construction');
          }}
        />
      )}
      {ifcImportOpen && (
        <Suspense fallback={<p>Uruchamianie importera IFC…</p>}>
          <IfcImportWorkspace
            onClose={() => setIfcImportOpen(false)}
            onCreate={async (template) => {
              const name = i18n.language.startsWith('pl')
                ? 'Projekt z IFC'
                : 'Project from IFC';
              const initialized = projectSession.snapshot().initialized;
              await projectSession.initialize();
              // Reuse the placeholder a first initialization just created.
              if (!initialized && projectSession.snapshot().freshProject) {
                useAssembly
                  .getState()
                  .replaceProjectDocument(createRoofProjectDocument(template));
                await projectSession.rename(name);
              } else
                await projectSession.createFromDocument(
                  createRoofProjectDocument(template),
                  name,
                );
              setIfcImportOpen(false);
              enterProject();
              state.setViewPreset('construction');
            }}
          />
        </Suspense>
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

export interface AppRouteProps {
  /** `#/` — the application home (Standard and Business entry). */
  home?: boolean;
  /** `#/platform` — the RoofCalc system console (platform admins only). */
  platform?: boolean;
  onNavigate?: (view: AppView) => void;
}

export function AssemblyPage(props: AppRouteProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      {/*
       * V54: the application-level business context. It wraps the workbench
       * rather than living inside the project store, so switching wholesaler
       * can never invalidate a roof (§12, §49). In STANDARD mode the provider
       * issues no request and renders no business UI at all (§65).
       */}
      <BusinessContextProvider>
        <AssemblyPageContent {...props} />
      </BusinessContextProvider>
    </QueryClientProvider>
  );
}
