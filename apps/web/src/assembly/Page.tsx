import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  currentMemberInstance,
  withOpeningFramingFabrication,
} from '@cieslacalc/calculator-core';
import {
  createRoofMemberSchedule,
  type RoofMemberScheduleRow,
} from '@cieslacalc/quantity-core';
import { ArrowLeft, House, RotateCcw, Redo2, Undo2, X } from 'lucide-react';
import {
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  lengthUnits,
  createOpeningFramingDraft,
  resolveOpeningFraming,
  resolveOpeningFramingSet,
  resolveBattenLayout,
  resolveCounterBattenLayout,
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
import { AssemblyCanvas } from './Canvas';
import { SkeletonCanvas } from './SkeletonCanvas';
import { HipFabricationSheet } from './HipFabricationSheet';
import {
  DetailDrawer,
  QuickCutPreviews,
  QuickDetailDialog,
} from './DetailPreview';
import { ContextualResults, HipResults, Results } from './Summary';
import { Toolbox } from './Toolbox';
import { WorkbenchControls } from './WorkbenchControls';
import { PreparationPlan } from './PreparationPlan';
import { Inspector } from './Inspector';
import { WorkbenchContextBar } from './WorkbenchContextBar';
import { BuildUpSummaryBar } from './BuildUpWorkspace';
import { workbenchProjectResolver } from './workbench-project';
import { resolveWorkbenchSelectionContext } from './selection';
import './styles.css';

const MaterialSchedule = lazy(() =>
  import('./MaterialSchedule').then((module) => ({
    default: module.MaterialSchedule,
  })),
);
const MaterialScheduleInspector = lazy(() =>
  import('./MaterialSchedule').then((module) => ({
    default: module.MaterialScheduleInspector,
  })),
);
export function AssemblyPage() {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const [quickDetail, setQuickDetail] = useState<
    (typeof allDetailPreviews)[number] | undefined
  >();
  const workbench = state.workbench;
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
  const roofWindows = state.projectDocument.project.features.filter(
    (feature) => feature.kind === 'roof-window',
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
  const counterBattenProjection = useMemo(
    () =>
      counterBattens
        ? resolveCounterBattenLayout({
            template: state.template,
            skeleton: framingProjection.composedSkeleton,
            layout: counterBattens,
            features: state.projectDocument.project.features,
          })
        : {
            status: 'disabled' as const,
            rows: [],
            totalVisibleLengthMm: 0,
            warnings: [],
          },
    [
      counterBattens,
      framingProjection.composedSkeleton,
      state.projectDocument.project.features,
      state.template,
    ],
  );
  const battenProjection = useMemo(
    () =>
      battenLayout?.enabled
        ? resolveBattenLayout({
            template: state.template,
            layout: battenLayout,
            features: state.projectDocument.project.features,
          })
        : { battens: [], totalLengthMm: 0 },
    [battenLayout, state.projectDocument.project.features, state.template],
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
            completeness: 'partial',
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
              .map((plane) => ({
                id: `surface:${plane.roofPlaneId}`,
                familyKey: 'MEM',
                memberKind: 'membrane' as const,
                roofPlaneId: plane.roofPlaneId,
                areaMm2: plane.netAreaMm2,
                warningKeys: plane.issues.map((issue) => issue.code),
              }))
          : [],
      }),
    [
      battenLayout,
      battenProjection.battens,
      counterBattens?.enabled,
      counterBattenProjection.rows,
      framingProjection.composedSkeleton,
      membrane,
      state.template.ridge.id,
      state.template.ridge.thicknessMm,
      surfaceProjection.planes,
    ],
  );
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
  };
  const drawerPreviews = drawer.pinned
    ? allDetailPreviews
    : selectionDetailPreviews;
  const changeMode = (mode: 'quick' | 'builder') => {
    state.setMode(mode);
    if (mode === 'builder' && window.matchMedia?.('(max-width: 800px)').matches)
      state.setInspectorOpen(false);
  };
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${brand} — ${t('workshop')}`;
  }, [brand, i18n.language, t]);
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
      if (window.matchMedia?.('(max-width: 800px)').matches)
        useAssembly.getState().setInspectorOpen(false);
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
  ]);
  return (
    <div
      className={`assembly-app mode-${workbench.mode} detail-${drawer.mode}`}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        if (
          target.matches('input, textarea, select') ||
          target.isContentEditable
        )
          return;
        if (e.key === 'Escape') {
          if (state.activeTransaction) state.cancelTransaction();
          else if (workbench.focusId) state.setFocusId(undefined);
          else state.stepBackContext();
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
              aria-pressed={workbench.mode === mode}
              onClick={() => changeMode(mode)}
            >
              {t(`assembly.${mode}`)}
            </button>
          ))}
        </nav>
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
                aria-label={t('assembly.undo')}
                title={t('assembly.undo')}
                disabled={!state.historyPast.length}
                onClick={state.undo}
              >
                <Undo2 size={18} />
              </button>
              <button
                className="a-icon"
                aria-label={t('assembly.redo')}
                title={t('assembly.redo')}
                disabled={!state.historyFuture.length}
                onClick={state.redo}
              >
                <Redo2 size={18} />
              </button>
            </div>
          )}
          <button
            className="a-icon"
            aria-label={t('assembly.reset')}
            onClick={() => {
              state.reset();
              state.setFocusId(undefined);
            }}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="a-icon"
            aria-label={t('assembly.language')}
            onClick={() => {
              void i18n.changeLanguage(i18n.language === 'pl' ? 'en' : 'pl');
            }}
          >
            {i18n.language.toUpperCase()}
          </button>
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
              </details>
              {state.spec.supports.some((s) => s.kind === 'purlin') && (
                <p className="a-help">{t('assembly.purlinPresent')}</p>
              )}
              <button
                className="a-button a-primary"
                onClick={() => changeMode('builder')}
              >
                {t('assembly.openBuilder')} →
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
            <div
              className={`a-builder-layout ${workbench.toolboxCollapsed ? 'tools-collapsed' : ''}`}
            >
              <Toolbox
                result={result}
                detailPreviews={selectionDetailPreviews}
              />
              <section className="a-canvas-column">
                <WorkbenchControls skeleton={skeleton} />
                <WorkbenchContextBar
                  instances={memberInstances}
                  activeInstance={activeInstance}
                  roofPackage={fabricationPackage}
                  activeOperation={activeOperation}
                />
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
                    limited={counterBattenProjection.status === 'limited'}
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
                {!workbench.focusId && workbench.canvasView === 'rafter' && (
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
                      {(['schedule', 'drawing'] as const).map((view) => (
                        <button
                          key={view}
                          role="tab"
                          aria-selected={workbench.materialsView === view}
                          onClick={() => state.setMaterialsView(view)}
                        >
                          {t(`assembly.${view}MaterialView`)}
                        </button>
                      ))}
                    </div>
                    <div
                      className="a-material-canvas"
                      data-material-surface="drawing"
                    >
                      <SkeletonCanvas
                        template={state.template}
                        skeleton={framingProjection.composedSkeleton}
                        collisionSkeleton={baseSkeleton}
                        spacing={layoutSpacing}
                        relatedIds={relatedSelectionIds}
                        activeInstance={activeInstance}
                        surfaceGeometry={surfaceProjection}
                        counterBattens={counterBattenProjection}
                      />
                    </div>
                    <div data-material-surface="schedule">
                      <Suspense fallback={<div className="a-loading-panel" />}>
                        <MaterialSchedule
                          schedule={memberSchedule}
                          selectedRowId={workbench.selectedScheduleRowId}
                          selectedInstanceId={
                            workbench.selectedScheduleInstanceId
                          }
                          onSelectRow={(row) =>
                            state.setScheduleSelection(row.id)
                          }
                          onSelectInstance={selectScheduleInstance}
                        />
                      </Suspense>
                    </div>
                  </div>
                ) : workbench.focusId ? (
                  <AssemblyCanvas result={result} focusId={workbench.focusId} />
                ) : workbench.canvasView === 'hip' && hip ? (
                  <HipFabricationSheet
                    hip={hip}
                    onBack={() => state.setView('skeleton')}
                  />
                ) : workbench.canvasView === 'rafter' ? (
                  <AssemblyCanvas result={result} />
                ) : (
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
                    counterBattens={counterBattenProjection}
                  />
                )}
              </section>
              {workbench.viewPreset === 'materials' ? (
                <Suspense fallback={<aside className="a-inspector" />}>
                  <MaterialScheduleInspector schedule={memberSchedule} />
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
                  counterBattens={counterBattenProjection}
                />
              )}
            </div>
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
              onCutStateChange={(cutState) =>
                state.setDetailDrawer({ cutState })
              }
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
          <span>{t('assembly.noSave')}</span>
        </footer>
      </main>
      {quickDetail && workbench.mode === 'quick' && (
        <QuickDetailDialog
          preview={quickDetail}
          onClose={() => setQuickDetail(undefined)}
          onOpenBuilder={(preview) => {
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
