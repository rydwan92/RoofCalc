import type { ReactNode } from 'react';
import {
  Box,
  Columns3,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Triangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DetailPreviewModel } from '@cieslacalc/drawing-engine';
import { purlinPlacementSegments } from '@cieslacalc/roof-math';
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
  const { t } = useTranslation();
  const tools = createWorkbenchToolRegistry({
    template: state.template,
    spec: state.spec,
    canAddPurlin:
      !!result && purlinPlacementSegments(state.spec, 140).length > 0,
  });
  const label = (tool: WorkbenchToolDescriptor) =>
    `${t(`assembly.${tool.labelKey}`)}${tool.code ? ` ${tool.code}` : ''}`;
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
            {tools.filter((tool) => tool.category === category).map(renderTool)}
          </details>
        );
      })}
    </aside>
  );
}
