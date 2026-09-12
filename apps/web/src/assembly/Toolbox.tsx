import { useMemo, useState, type ReactNode } from 'react';
import {
  Box,
  Columns3,
  Ellipsis,
  Layers3,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Square,
  SquareCheckBig,
  Triangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import {
  distributePurlins,
  purlinPlacementSegments,
} from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import type { Calculation } from './Inputs';
import { entityLabel } from './Canvas';
import { useAssembly } from './store';
import {
  createWorkbenchToolRegistry,
  type ToolIconKey,
  type WorkbenchToolDescriptor,
} from './workbench';

const icon = (key: ToolIconKey): ReactNode => {
  if (key === 'roof') return <Triangle size={20} />;
  if (key === 'timber') return <Box size={20} />;
  if (key === 'ridge') return <Columns3 size={20} />;
  if (key === 'add') return <Plus size={20} />;
  return <Layers3 size={20} />;
};

export function Toolbox({
  result,
  detailPreviews,
}: {
  result: Calculation | null;
  detailPreviews: DetailPreviewModel[];
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const [distributionOpen, setDistributionOpen] = useState(false);
  const buildUp = state.projectDocument.project.buildUp;
  const membrane = buildUp.membrane ?? { enabled: false };
  const counterBattens = buildUp.counterBattens ?? {
    enabled: false,
    widthMm: 40,
    heightMm: 60,
  };
  const battens = buildUp.battenLayout ?? {
    enabled: false,
    battenHeightMm: 40,
    battenWidthMm: 60,
    gaugeMm: 350,
    eaveOffsetMm: 250,
  };
  const tools = createWorkbenchToolRegistry({
    template: state.template,
    spec: state.spec,
    canAddPurlin:
      !!result && purlinPlacementSegments(state.spec, 140).length > 0,
  });
  const label = (tool: WorkbenchToolDescriptor) =>
    `${t(`assembly.${tool.labelKey}`)}${tool.code ? ` ${tool.code}` : ''}`;
  const purlinTools = tools.filter((tool) =>
    tool.selectionId?.startsWith('support:purlin-'),
  );
  const distribution = useMemo(() => {
    if (!distributionOpen || !purlinTools.length) return undefined;
    try {
      return distributePurlins(state.spec, {
        supportIds: purlinTools.map((tool) => tool.selectionId!),
        mode: 'equal-gaps',
      });
    } catch {
      return undefined;
    }
  }, [distributionOpen, purlinTools, state.spec]);
  const renderTool = (tool: WorkbenchToolDescriptor) => (
    <button
      key={tool.id}
      className={`a-tool ${tool.action === 'add-purlin' ? 'a-add' : ''}`}
      title={tool.enabled ? label(tool) : t('assembly.noSpace')}
      aria-label={label(tool)}
      aria-pressed={
        tool.action === 'select'
          ? state.workbench.selectedId === tool.selectionId ||
            state.workbench.selectedPrototypeId === tool.selectionId
          : undefined
      }
      disabled={!tool.enabled}
      onClick={() => {
        if (tool.action === 'add-purlin') state.add();
        else if (tool.selectionId)
          state.select(tool.selectionId, tool.prototypeId);
      }}
    >
      {icon(tool.icon)}
      <span>{label(tool)}</span>
    </button>
  );
  return (
    <aside
      className={`a-toolbox ${state.workbench.toolboxCollapsed ? 'is-collapsed' : ''}`}
      aria-label={t('assembly.toolbox')}
      data-registry-tools={tools.length}
    >
      <button
        className="a-collapse a-button"
        aria-label={t(
          `assembly.${state.workbench.toolboxCollapsed ? 'expand' : 'collapse'}`,
        )}
        onClick={() =>
          state.setToolboxCollapsed(!state.workbench.toolboxCollapsed)
        }
      >
        {state.workbench.toolboxCollapsed ? (
          <PanelLeftOpen size={18} />
        ) : (
          <PanelLeftClose size={18} />
        )}
        <span>{t('assembly.toolbox')}</span>
      </button>
      <section className="a-toolbox-active">
        <h2>{t('assembly.activeSelection')}</h2>
        <strong>{entityLabel(state.workbench.selectedId, state, t)}</strong>
        {detailPreviews.length > 0 && (
          <div className="a-toolbox-detail-shortcuts">
            {detailPreviews.map((preview) => (
              <button
                key={preview.id}
                className="a-tool"
                aria-pressed={
                  state.workbench.selectedId === preview.sourceSelectionId
                }
                onClick={() =>
                  state.activateOperation({
                    operationId: preview.sourceSelectionId,
                    prototypeId: preview.subjectMemberId,
                    selectionId: preview.sourceSelectionId,
                    previewId: preview.id,
                  })
                }
              >
                <Triangle size={18} />
                <span>{t(`assembly.${preview.titleKey}`)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {(['geometry', 'timber', 'support'] as const).map((category) => {
        const collapsed =
          state.workbench.collapsedToolGroups.includes(category);
        return (
          <details key={category} open={!collapsed}>
            <summary
              onClick={(event) => {
                event.preventDefault();
                state.setToolGroupCollapsed(category, !collapsed);
              }}
            >
              {t(`assembly.${category === 'support' ? 'supports' : category}`)}
            </summary>
            {category !== 'support' &&
              tools
                .filter((tool) => tool.category === category)
                .map(renderTool)}
            {category === 'support' && (
              <>
                {tools
                  .filter(
                    (tool) =>
                      tool.category === 'support' &&
                      tool.selectionId === 'support:wall-plate-1',
                  )
                  .map(renderTool)}
                {purlinTools.length > 0 && (
                  <section className="a-purlin-tool-group">
                    <header>
                      <strong>
                        {t('assembly.purlins')} ({purlinTools.length})
                      </strong>
                      <button
                        className="a-icon"
                        aria-label={t('assembly.purlinActions')}
                        aria-expanded={distributionOpen}
                        title={t('assembly.purlinActions')}
                        onClick={() => setDistributionOpen((open) => !open)}
                      >
                        <Ellipsis size={17} />
                      </button>
                    </header>
                    {purlinTools.map(renderTool)}
                    {distributionOpen && (
                      <section
                        className="a-purlin-distribution"
                        role="dialog"
                        aria-label={t('assembly.distributePurlins')}
                      >
                        <strong>{t('assembly.distributePurlins')}</strong>
                        <span>{t('assembly.equalGaps')}</span>
                        {distribution ? (
                          <dl>
                            {distribution.positions.map((position) => {
                              const tool = purlinTools.find(
                                (candidate) =>
                                  candidate.selectionId === position.supportId,
                              )!;
                              const current = state.spec.supports.find(
                                (support) => support.id === position.supportId,
                              )!;
                              return (
                                <div key={position.supportId}>
                                  <dt>{tool.code}</dt>
                                  <dd>
                                    {formatLength(
                                      current.placement.xMm,
                                      state.unit,
                                      i18n.language,
                                    )}{' '}
                                    {state.unit} {'→'}{' '}
                                    {formatLength(
                                      position.xMm,
                                      state.unit,
                                      i18n.language,
                                    )}{' '}
                                    {state.unit}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        ) : (
                          <p>{t('assembly.noDistributionSpace')}</p>
                        )}
                        <p className="a-non-structural-note">
                          {t('assembly.geometricDistributionWarning')}
                        </p>
                        <div className="a-purlin-distribution-actions">
                          <button
                            className="a-button"
                            onClick={() => setDistributionOpen(false)}
                          >
                            {t('assembly.cancel')}
                          </button>
                          <button
                            className="a-button a-primary"
                            disabled={!distribution}
                            onClick={() => {
                              state.distributePurlins();
                              setDistributionOpen(false);
                            }}
                          >
                            {t('assembly.apply')}
                          </button>
                        </div>
                      </section>
                    )}
                  </section>
                )}
                {tools
                  .filter((tool) => tool.action === 'add-purlin')
                  .map(renderTool)}
                {tools
                  .filter(
                    (tool) =>
                      tool.category === 'support' &&
                      tool.selectionId === state.spec.ridge.id,
                  )
                  .map(renderTool)}
              </>
            )}
          </details>
        );
      })}
      <details open={!state.workbench.collapsedToolGroups.includes('opening')}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            state.setToolGroupCollapsed(
              'opening',
              !state.workbench.collapsedToolGroups.includes('opening'),
            );
          }}
        >
          {t('assembly.openings')} (
          {state.projectDocument.project.features.length})
        </summary>
        {state.projectDocument.project.features.map((feature) => {
          const groupSelected = state.workbench.selectedFeatureIds.includes(
            feature.id,
          );
          const featureCode = feature.id.replace('feature:roof-window-', 'O');
          return (
            <div className="a-opening-tool-row" key={feature.id}>
              <button
                className="a-tool"
                aria-pressed={state.workbench.selectedId === feature.id}
                onClick={(event) =>
                  state.selectRoofWindow(feature.id, event.shiftKey)
                }
              >
                <Box size={20} />
                <span>
                  {t('assembly.roofWindow')} {featureCode}
                  {state.projectDocument.project.openingFraming.some(
                    (spec) => spec.featureId === feature.id,
                  ) && <small>✓ {t('assembly.geometricFraming')}</small>}
                </span>
              </button>
              <button
                className="a-opening-select"
                aria-label={t(
                  `assembly.${groupSelected ? 'removeFromWindowSelection' : 'addToWindowSelection'}`,
                  { id: featureCode },
                )}
                aria-pressed={groupSelected}
                onClick={() => state.selectRoofWindow(feature.id, true)}
              >
                {groupSelected ? (
                  <SquareCheckBig size={18} />
                ) : (
                  <Square size={18} />
                )}
              </button>
            </div>
          );
        })}
        <button
          className={`a-tool a-add ${state.workbench.placementTool ? 'is-active' : ''}`}
          aria-pressed={!!state.workbench.placementTool}
          onClick={() =>
            state.workbench.placementTool
              ? state.cancelRoofWindowPlacement()
              : state.beginRoofWindowPlacement()
          }
        >
          <Plus size={20} />
          <span>{t('assembly.addRoofWindow')}</span>
        </button>
      </details>
      <details open={!state.workbench.collapsedToolGroups.includes('build-up')}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            state.setToolGroupCollapsed(
              'build-up',
              !state.workbench.collapsedToolGroups.includes('build-up'),
            );
          }}
        >
          {t('assembly.roofBuildUp')}
        </summary>
        {(
          [
            {
              id: 'membrane',
              label: 'membrane',
              enabled: membrane.enabled,
              select: () => {
                state.select('layer:membrane');
                state.setBuildUpView('membrane');
              },
              toggle: () =>
                state.setMembraneLayer({
                  ...membrane,
                  enabled: !membrane.enabled,
                }),
            },
            {
              id: 'counterBattens',
              label: 'counterBattens',
              enabled: counterBattens.enabled,
              select: () => {
                state.select('layer:counter-battens');
                state.setBuildUpView('counterBattens');
              },
              toggle: () =>
                state.setCounterBattenLayout({
                  ...counterBattens,
                  enabled: !counterBattens.enabled,
                }),
            },
            {
              id: 'battens',
              label: 'battens',
              enabled: battens.enabled,
              select: () => {
                state.select('layer:battens');
                state.setBuildUpView('battens');
              },
              toggle: () =>
                state.setBattenLayout({
                  ...battens,
                  enabled: !battens.enabled,
                }),
            },
          ] as const
        ).map((layer) => (
          <div className="a-layer-tool-row" key={layer.id}>
            <button
              className="a-tool"
              aria-pressed={
                state.workbench.selectedId ===
                `layer:${layer.id === 'counterBattens' ? 'counter-battens' : layer.id}`
              }
              onClick={layer.select}
            >
              <Layers3 size={20} />
              <span>{t(`assembly.${layer.label}`)}</span>
            </button>
            <button
              className="a-layer-toggle"
              role="switch"
              aria-checked={layer.enabled}
              aria-label={`${t(`assembly.${layer.label}`)} · ${t(`assembly.${layer.enabled ? 'enabled' : 'disabled'}`)}`}
              onClick={layer.toggle}
            >
              {layer.enabled ? t('assembly.on') : t('assembly.off')}
            </button>
          </div>
        ))}
      </details>
      <details open={!state.workbench.collapsedToolGroups.includes('quantity')}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            state.setToolGroupCollapsed(
              'quantity',
              !state.workbench.collapsedToolGroups.includes('quantity'),
            );
          }}
        >
          {t('assembly.memberSchedule')}
        </summary>
        <button
          className={`a-tool ${state.workbench.viewPreset === 'materials' ? 'is-active' : ''}`}
          aria-pressed={state.workbench.viewPreset === 'materials'}
          onClick={() => state.setViewPreset('materials')}
        >
          <ListTree size={20} />
          <span>{t('assembly.timber')}</span>
        </button>
        {(buildUp.membrane?.enabled ||
          buildUp.counterBattens?.enabled ||
          buildUp.battenLayout?.enabled) && (
          <button
            className="a-tool"
            onClick={() => state.setViewPreset('materials')}
          >
            <Layers3 size={20} />
            <span>{t('assembly.roofBuildUp')}</span>
          </button>
        )}
      </details>
    </aside>
  );
}
