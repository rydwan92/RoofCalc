import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createRoofFabricationPackage,
  detailPreviewsFromFabricationPackage,
} from '@cieslacalc/calculator-core';
import { ArrowLeft, House, RotateCcw, Redo2, Undo2, X } from 'lucide-react';
import {
  createRoofSkeleton,
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  lengthUnits,
  resolveRoofTemplate,
} from '@cieslacalc/roof-math';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import type {
  ResolvedHipRafter,
  ResolvedRafterSpacing,
  RoofSkeleton,
} from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { useAssembly } from './store';
import {
  GeometryInputs,
  HipTimberInputs,
  NumberField,
  RoofTypeSelector,
  SupportInputs,
  TimberInputs,
  type Calculation,
} from './Inputs';
import { AssemblyCanvas, entityLabel } from './Canvas';
import { SkeletonCanvas } from './SkeletonCanvas';
import { HipFabricationSheet } from './HipFabricationSheet';
import { DetailDrawer, QuickCutPreviews } from './DetailPreview';
import {
  ContextualResults,
  HipResults,
  Results,
  SpacingSummary,
} from './Summary';
import { Toolbox } from './Toolbox';
import { WorkbenchControls } from './WorkbenchControls';
import { PreparationPlan } from './PreparationPlan';
import {
  resolveWorkbenchSelectionContext,
  type WorkbenchSelectionContext,
} from './selection';
import './styles.css';
function Inspector({
  result,
  hip,
  skeleton,
  context,
  spacingEntries,
  detailPreviews,
  onOpenDetail,
}: {
  result: Calculation | null;
  hip?: ResolvedHipRafter;
  skeleton: RoofSkeleton;
  context: WorkbenchSelectionContext;
  spacingEntries: {
    spacing: ResolvedRafterSpacing;
    stationLabelKey: 'rafterPairs' | 'spacingAxes';
    headingKey?: 'commonRafterRegionSpacing' | 'jackRafterRegionSpacing';
  }[];
  detailPreviews: DetailPreviewModel[];
  onOpenDetail: (preview: DetailPreviewModel) => void;
}) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const workbench = state.workbench;
  const support = state.spec.supports.find(
    (s) =>
      s.id === workbench.selectedId || `joint:${s.id}` === workbench.selectedId,
  );
  const rafterInstance =
    workbench.selectedPrototypeId === state.spec.member.id
      ? skeleton.members.find((member) => member.id === workbench.selectedId)
      : undefined;
  const hipInstance =
    workbench.selectedPrototypeId === HIP_RAFTER_PROTOTYPE_ID
      ? skeleton.members.find((member) => member.id === workbench.selectedId)
      : undefined;
  const jackInstance = context.kind === 'instance' ? context.jack : undefined;
  const isRafter =
    workbench.selectedId === state.spec.member.id ||
    workbench.selectedPrototypeId === state.spec.member.id;
  const isHip =
    workbench.selectedId === HIP_RAFTER_PROTOTYPE_ID ||
    workbench.selectedPrototypeId === HIP_RAFTER_PROTOTYPE_ID;
  const isJack =
    workbench.selectedId === JACK_RAFTER_PROTOTYPE_ID ||
    workbench.selectedPrototypeId === JACK_RAFTER_PROTOTYPE_ID;
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <aside
      className={`a-inspector ${workbench.inspectorOpen ? 'is-open' : ''}`}
      aria-label={t('assembly.inspector')}
    >
      <button
        className="a-inspector-heading"
        aria-expanded={workbench.inspectorOpen}
        onClick={() => state.setInspectorOpen(!workbench.inspectorOpen)}
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>{entityLabel(workbench.selectedId, state, t)}</strong>
        </span>
        <span>{workbench.inspectorOpen ? '−' : '+'}</span>
      </button>
      {workbench.inspectorOpen && (
        <div className="a-inspector-body">
          <span className="a-context-badge">
            {t(`assembly.${context.kind}Context`)}
          </span>
          {workbench.selectedId === 'roof' && (
            <>
              <GeometryInputs includeLayout />
              {spacingEntries.map((entry) => (
                <SpacingSummary
                  key={`${entry.headingKey ?? 'gable'}:${entry.spacing.mode}`}
                  spacing={entry.spacing}
                  stationLabelKey={entry.stationLabelKey}
                  headingKey={entry.headingKey}
                />
              ))}
            </>
          )}
          {rafterInstance && (
            <section className="a-instance-facts">
              <dl className="a-facts">
                <div>
                  <dt>{t('assembly.physicalInstance')}</dt>
                  <dd>{rafterInstance.id.replace('instance:', '')}</dd>
                </div>
                <div>
                  <dt>{t('assembly.side')}</dt>
                  <dd>{t(`assembly.${rafterInstance.side}`)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.positionAlongBuilding')}</dt>
                  <dd>{length(rafterInstance.stationMm ?? 0)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.prototype')}</dt>
                  <dd>
                    {t('assembly.rafter')} K
                    {/-([0-9]+)$/.exec(rafterInstance.prototypeId)?.[1]}
                  </dd>
                </div>
              </dl>
              <button
                className="a-button"
                onClick={() => state.setView('rafter')}
              >
                {t('assembly.openMember')}
              </button>
            </section>
          )}
          {hipInstance && (
            <section className="a-instance-facts">
              <dl className="a-facts">
                <div>
                  <dt>{t('assembly.physicalInstance')}</dt>
                  <dd>{hipInstance.id.replace('instance:hip:', '')}</dd>
                </div>
                <div>
                  <dt>{t('assembly.corner')}</dt>
                  <dd>{t(`assembly.${hipInstance.side}`)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.prototype')}</dt>
                  <dd>H1 · {t('assembly.hipRafter')}</dd>
                </div>
              </dl>
              <p className="a-help">{t('assembly.hipSelectionHint')}</p>
            </section>
          )}
          {jackInstance && (
            <section className="a-instance-facts" data-testid="jack-inspector">
              <dl className="a-facts">
                <div>
                  <dt>{t('assembly.physicalInstance')}</dt>
                  <dd>J1/{jackInstance.spec.ordinalFromCorner}</dd>
                </div>
                <div>
                  <dt>{t('assembly.roofPlane')}</dt>
                  <dd>{t(`assembly.${jackInstance.spec.roofPlane}`)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.corner')}</dt>
                  <dd>{t(`assembly.${jackInstance.spec.hipCorner}`)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.position')}</dt>
                  <dd>{length(jackInstance.spec.stationFromHipCornerMm)}</dd>
                </div>
                <div>
                  <dt>{t('assembly.exactLength')}</dt>
                  <dd>
                    {length(
                      jackInstance.result.outerEaveToHipCenterLineLengthMm,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{t('assembly.prototype')}</dt>
                  <dd>J1 · {t('assembly.jackRafter')}</dd>
                </div>
              </dl>
              <p className="a-help">{t('assembly.hipFaceDeductionNote')}</p>
            </section>
          )}
          {(isRafter || isJack || workbench.selectedId === 'cut:eave') && (
            <TimberInputs />
          )}
          {isHip && hip && (
            <>
              <HipTimberInputs />
              <button className="a-button" onClick={() => state.setView('hip')}>
                {t('assembly.prepareHip')} H1
              </button>
            </>
          )}
          {(workbench.selectedId === state.spec.ridge.id ||
            workbench.selectedId === 'cut:ridge') && (
            <NumberField
              field="ridge.thicknessMm"
              label="ridgeWidth"
              max={1000}
            />
          )}
          {support && <SupportInputs support={support} result={result} />}
          {detailPreviews.length > 0 && (
            <section className="a-inspector-details">
              <h3>{t('assembly.availableDetails')}</h3>
              {detailPreviews.map((preview) => (
                <button
                  key={preview.id}
                  className="a-button"
                  onClick={() => {
                    state.select(
                      preview.sourceSelectionId,
                      preview.subjectMemberId,
                    );
                    onOpenDetail(preview);
                  }}
                >
                  {preview.subjectCode} · {t(`assembly.${preview.titleKey}`)}
                </button>
              ))}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}
export function AssemblyPage() {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const workbench = state.workbench;
  const drawer = workbench.detailDrawer;
  const brand = import.meta.env.VITE_BRAND_NAME || 'CieślaCalc';
  const templateResult = useMemo(
    () => resolveRoofTemplate(state.template),
    [state.template],
  );
  const skeleton = useMemo(
    () => createRoofSkeleton(state.template),
    [state.template],
  );
  const selectionContext = useMemo(
    () =>
      resolveWorkbenchSelectionContext({
        selected: workbench.selectedId,
        template: state.template,
        spec: state.spec,
        resolved: templateResult,
        skeleton,
      }),
    [
      workbench.selectedId,
      state.template,
      state.spec,
      templateResult,
      skeleton,
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
  const fabricationPackage = useMemo(
    () => createRoofFabricationPackage(templateResult),
    [templateResult],
  );
  const allDetailPreviews = useMemo(
    () => detailPreviewsFromFabricationPackage(fabricationPackage),
    [fabricationPackage],
  );
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
  const relatedSelectionIds = useMemo(() => {
    const ids = new Set<string>();
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
      if (selectionContext.kind === 'instance' && selectionContext.jack)
        ids.add(selectionContext.jack.spec.hipRafterInstanceId);
      else ids.add(HIP_RAFTER_PROTOTYPE_ID);
    }
    return ids;
  }, [
    activeOperation,
    selectionContext,
    state.spec.member.id,
    state.spec.ridge.id,
    state.spec.supports,
    workbench.selectedPrototypeId,
  ]);
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
      className={`assembly-app mode-${workbench.mode}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          state.cancelTransaction();
          state.setFocusId(undefined);
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
              <QuickCutPreviews previews={quickDetailPreviews} />
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
                {workbench.focusId ? (
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
                    spacing={layoutSpacing}
                    relatedSupportId={activeOperation?.relatedSupportId}
                    relatedIds={relatedSelectionIds}
                  />
                )}
              </section>
              <Inspector
                result={result}
                hip={hip}
                skeleton={skeleton}
                context={selectionContext}
                spacingEntries={spacingEntries}
                detailPreviews={selectionDetailPreviews}
                onOpenDetail={(preview) => {
                  state.setViewPreset('cuts');
                  state.setDetailDrawer({
                    activePreviewId: preview.id,
                    open: true,
                  });
                }}
              />
            </div>
            <DetailDrawer
              previews={drawerPreviews}
              activeId={drawer.activePreviewId}
              open={drawer.open}
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
              onToggle={() => state.setDetailDrawer({ open: !drawer.open })}
              onClose={() => state.setDetailDrawer({ open: false })}
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
            <PreparationPlan roofPackage={fabricationPackage} />
            <ContextualResults
              context={selectionContext}
              resolved={templateResult}
              skeleton={skeleton}
            />
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
    </div>
  );
}
