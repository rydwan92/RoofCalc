import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createAssemblyDetailPreviews,
  createHipRafterDetailPreview,
} from '@cieslacalc/calculator-core';
import {
  ArrowLeft,
  Box,
  Columns3,
  House,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  Redo2,
  Triangle,
  Undo2,
  X,
} from 'lucide-react';
import {
  createRoofSkeleton,
  HIP_RAFTER_PROTOTYPE_ID,
  JACK_RAFTER_PROTOTYPE_ID,
  lengthUnits,
  purlinPlacementSegments,
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
  ContextualFabrication,
  ContextualResults,
  Fabrication,
  HipResults,
  Results,
  SpacingSummary,
} from './Summary';
import {
  resolveWorkbenchSelectionContext,
  type WorkbenchSelectionContext,
} from './selection';
import './styles.css';

function Toolbox({
  result,
  detailPreviews,
}: {
  result: Calculation | null;
  detailPreviews: DetailPreviewModel[];
}) {
  const state = useAssembly(),
    { t } = useTranslation();
  const canAdd =
    !!result && purlinPlacementSegments(state.spec, 140).length > 0;
  const selectButton = (id: string, icon: ReactNode, label: string) => (
    <button
      key={id}
      className="a-tool"
      title={label}
      aria-label={label}
      aria-pressed={state.selected === id || state.selectedPrototype === id}
      onClick={() => state.select(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <aside
      className={`a-toolbox ${state.collapsed ? 'is-collapsed' : ''}`}
      aria-label={t('assembly.toolbox')}
    >
      <button
        className="a-collapse a-button"
        aria-label={t(`assembly.${state.collapsed ? 'expand' : 'collapse'}`)}
        onClick={() => useAssembly.setState({ collapsed: !state.collapsed })}
      >
        {state.collapsed ? (
          <PanelLeftOpen size={18} />
        ) : (
          <PanelLeftClose size={18} />
        )}
        <span>{t('assembly.toolbox')}</span>
      </button>
      <section className="a-toolbox-active">
        <h2>{t('assembly.activeSelection')}</h2>
        <strong>{entityLabel(state.selected, state, t)}</strong>
        {detailPreviews.length > 0 && (
          <div className="a-toolbox-detail-shortcuts">
            {detailPreviews.map((preview) => (
              <button
                key={preview.id}
                className="a-tool"
                aria-pressed={state.selected === preview.sourceSelectionId}
                onClick={() =>
                  state.select(
                    preview.sourceSelectionId,
                    preview.subjectMemberId,
                  )
                }
              >
                <Triangle size={18} />
                <span>{t(`assembly.${preview.titleKey}`)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      <details open>
        <summary>{t('assembly.geometry')}</summary>
        {selectButton('roof', <Triangle size={20} />, t('assembly.roof'))}
      </details>
      <details open>
        <summary>{t('assembly.timber')}</summary>
        {selectButton(
          state.spec.member.id,
          <Box size={20} />,
          t('assembly.rafter'),
        )}
        {state.template.type === 'hip' &&
          selectButton(
            HIP_RAFTER_PROTOTYPE_ID,
            <Box size={20} />,
            `${t('assembly.hipRafter')} H1`,
          )}
        {state.template.type === 'hip' &&
          selectButton(
            JACK_RAFTER_PROTOTYPE_ID,
            <Box size={20} />,
            `${t('assembly.jackRafter')} J1`,
          )}
      </details>
      <details open>
        <summary>{t('assembly.supports')}</summary>
        {state.spec.supports.map((support) => {
          const number = /^support:purlin-(\d+)$/.exec(support.id)?.[1];
          return selectButton(
            support.id,
            <Layers3 size={20} />,
            number
              ? `${t('assembly.purlin')} P${number}`
              : t(`assembly.${support.kind}`),
          );
        })}
        <button
          className="a-tool a-add"
          aria-label={t('assembly.addPurlin')}
          title={canAdd ? t('assembly.addPurlin') : t('assembly.noSpace')}
          disabled={!canAdd}
          onClick={state.add}
        >
          <Plus size={20} />
          <span>{t('assembly.addPurlin')}</span>
        </button>
        {selectButton(
          state.spec.ridge.id,
          <Columns3 size={20} />,
          t('assembly.ridge'),
        )}
      </details>
    </aside>
  );
}
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
  const support = state.spec.supports.find(
    (s) => s.id === state.selected || `joint:${s.id}` === state.selected,
  );
  const rafterInstance =
    state.selectedPrototype === state.spec.member.id
      ? skeleton.members.find((member) => member.id === state.selected)
      : undefined;
  const hipInstance =
    state.selectedPrototype === HIP_RAFTER_PROTOTYPE_ID
      ? skeleton.members.find((member) => member.id === state.selected)
      : undefined;
  const jackInstance = context.kind === 'instance' ? context.jack : undefined;
  const isRafter =
    state.selected === state.spec.member.id ||
    state.selectedPrototype === state.spec.member.id;
  const isHip =
    state.selected === HIP_RAFTER_PROTOTYPE_ID ||
    state.selectedPrototype === HIP_RAFTER_PROTOTYPE_ID;
  const isJack =
    state.selected === JACK_RAFTER_PROTOTYPE_ID ||
    state.selectedPrototype === JACK_RAFTER_PROTOTYPE_ID;
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <aside
      className={`a-inspector ${state.inspectorOpen ? 'is-open' : ''}`}
      aria-label={t('assembly.inspector')}
    >
      <button
        className="a-inspector-heading"
        aria-expanded={state.inspectorOpen}
        onClick={() =>
          useAssembly.setState({ inspectorOpen: !state.inspectorOpen })
        }
      >
        <span>
          <small>{t('assembly.inspector')}</small>
          <strong>{entityLabel(state.selected, state, t)}</strong>
        </span>
        <span>{state.inspectorOpen ? '−' : '+'}</span>
      </button>
      {state.inspectorOpen && (
        <div className="a-inspector-body">
          <span className="a-context-badge">
            {t(`assembly.${context.kind}Context`)}
          </span>
          {state.selected === 'roof' && (
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
          {(isRafter || isJack || state.selected === 'cut:eave') && (
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
          {(state.selected === state.spec.ridge.id ||
            state.selected === 'cut:ridge') && (
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
  const [marking, setMarking] = useState(false),
    [focusId, setFocusId] = useState<string | undefined>(),
    [detailOpen, setDetailOpen] = useState(false),
    [detailPinned, setDetailPinned] = useState(false),
    [activeDetailId, setActiveDetailId] = useState<string | undefined>();
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
        selected: state.selected,
        template: state.template,
        spec: state.spec,
        resolved: templateResult,
        skeleton,
      }),
    [state.selected, state.template, state.spec, templateResult, skeleton],
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
  const commonDetailPreviews = useMemo(
    () => (result ? createAssemblyDetailPreviews(result) : []),
    [result],
  );
  const hipDetailPreview = useMemo(
    () => (hip ? createHipRafterDetailPreview(hip) : undefined),
    [hip],
  );
  const allDetailPreviews = useMemo(
    () => [
      ...commonDetailPreviews,
      ...(hipDetailPreview ? [hipDetailPreview] : []),
    ],
    [commonDetailPreviews, hipDetailPreview],
  );
  const selectionDetailPreviews = useMemo(() => {
    const direct = allDetailPreviews.find(
      (preview) => preview.sourceSelectionId === state.selected,
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
    state.selected,
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
  const drawerPreviews = detailPinned
    ? allDetailPreviews
    : selectionDetailPreviews;
  const changeMode = (mode: 'quick' | 'builder') => {
    state.setMode(mode);
    if (mode === 'builder' && window.matchMedia?.('(max-width: 800px)').matches)
      useAssembly.setState({ inspectorOpen: false });
  };
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${brand} — ${t('workshop')}`;
  }, [brand, i18n.language, t]);
  useEffect(() => {
    setFocusId(undefined);
  }, [state.selected, state.mode]);
  useEffect(() => {
    if (state.mode !== 'builder' || detailPinned) return;
    const direct = allDetailPreviews.find(
      (preview) => preview.sourceSelectionId === state.selected,
    );
    if (direct) {
      setActiveDetailId(direct.id);
      setDetailOpen(true);
      if (window.matchMedia?.('(max-width: 800px)').matches)
        useAssembly.setState({ inspectorOpen: false });
      return;
    }
    setActiveDetailId(selectionDetailPreviews[0]?.id);
  }, [
    allDetailPreviews,
    detailPinned,
    selectionDetailPreviews,
    state.mode,
    state.selected,
  ]);
  return (
    <div
      className={`assembly-app mode-${state.mode}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          state.cancelTransaction();
          setFocusId(undefined);
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
              aria-pressed={state.mode === mode}
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
          {state.mode === 'builder' && (
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
              setFocusId(undefined);
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
                ? `${t('assembly.hipRoof')} · ${state.selectedPrototype === JACK_RAFTER_PROTOTYPE_ID || state.selected === JACK_RAFTER_PROTOTYPE_ID ? `J1 ${t('assembly.jackRafter')}` : state.selectedPrototype === HIP_RAFTER_PROTOTYPE_ID || state.selected === HIP_RAFTER_PROTOTYPE_ID ? `H1 ${t('assembly.hipRafter')}` : state.selectedPrototype === state.spec.member.id || state.selected === state.spec.member.id ? `K1 ${t('assembly.commonRafter')}` : t('assembly.skeleton')}`
                : `K1 ${t('assembly.commonRafter')}`}
            </strong>
            <p>
              {t(
                `assembly.${state.mode === 'quick' ? 'quickHint' : 'builderHint'}`,
              )}
            </p>
          </div>
          <span className="a-live">
            <i />
            {t('assembly.local')}
          </span>
        </div>
        {state.mode === 'quick' ? (
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
              <button
                className="a-button"
                aria-expanded={marking}
                onClick={() => setMarking((v) => !v)}
              >
                {t('assembly.steps')}
              </button>
            </section>
          </div>
        ) : (
          <>
            <div
              className={`a-builder-layout ${state.collapsed ? 'tools-collapsed' : ''}`}
            >
              <Toolbox
                result={result}
                detailPreviews={selectionDetailPreviews}
              />
              <section className="a-canvas-column">
                <div
                  className="a-view-switch"
                  role="tablist"
                  aria-label={t('assembly.view')}
                >
                  {(['skeleton', 'rafter'] as const).map((view) => (
                    <button
                      key={view}
                      role="tab"
                      aria-selected={state.view === view}
                      onClick={() => state.setView(view)}
                    >
                      {t(`assembly.${view}`)}
                    </button>
                  ))}
                </div>
                {focusId && (
                  <button
                    className="a-button a-back"
                    onClick={() => setFocusId(undefined)}
                  >
                    <X size={16} />
                    {t('assembly.back')}
                  </button>
                )}
                {!focusId && state.view === 'rafter' && (
                  <button
                    className="a-button a-back"
                    onClick={() => state.setView('skeleton')}
                  >
                    <ArrowLeft size={16} />
                    {t('assembly.backToSkeleton')}
                  </button>
                )}
                {focusId ? (
                  <AssemblyCanvas result={result} focusId={focusId} />
                ) : state.view === 'hip' && hip ? (
                  <HipFabricationSheet
                    hip={hip}
                    onBack={() => state.setView('skeleton')}
                  />
                ) : state.view === 'rafter' ? (
                  <AssemblyCanvas result={result} />
                ) : (
                  <SkeletonCanvas
                    template={state.template}
                    spacing={layoutSpacing}
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
                  setActiveDetailId(preview.id);
                  setDetailOpen(true);
                }}
              />
            </div>
            <DetailDrawer
              previews={drawerPreviews}
              activeId={activeDetailId}
              open={detailOpen}
              pinned={detailPinned}
              onSelect={(id) => {
                const preview = allDetailPreviews.find(
                  (candidate) => candidate.id === id,
                );
                setActiveDetailId(id);
                if (preview)
                  state.select(
                    preview.sourceSelectionId,
                    preview.subjectMemberId,
                  );
              }}
              onToggle={() => setDetailOpen((open) => !open)}
              onClose={() => setDetailOpen(false)}
              onPin={() => setDetailPinned((pinned) => !pinned)}
              onZoom={(preview) => {
                if (preview.subjectCode === 'H1') {
                  state.setView('hip');
                  setFocusId(undefined);
                } else {
                  state.setView('rafter');
                  setFocusId(preview.sourceSelectionId);
                }
              }}
            />
            <ContextualResults
              context={selectionContext}
              resolved={templateResult}
              skeleton={skeleton}
            />
            <ContextualFabrication
              context={selectionContext}
              resolved={templateResult}
              expanded={marking}
            />
            {state.view !== 'hip' && (
              <button
                className="a-button"
                aria-expanded={marking}
                onClick={() => setMarking((v) => !v)}
              >
                {t('assembly.steps')}
              </button>
            )}
          </>
        )}
        {state.mode === 'quick' && result && marking && !hip && (
          <Fabrication result={result} expanded={marking} />
        )}
        {hip && marking && state.mode === 'quick' && (
          <HipFabricationSheet hip={hip} />
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
