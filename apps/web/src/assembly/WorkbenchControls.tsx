import {
  Eye,
  EyeOff,
  Hammer,
  Layers3,
  ListTree,
  Maximize,
  Maximize2,
  Ruler,
  Scissors,
  SlidersHorizontal,
  SquareDashed,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import { useAssembly } from './store';
import {
  createWorkbenchLegend,
  deriveWorkbenchProjectionPolicy,
  type DimensionLevel,
} from './workbench';

export function WorkbenchControls({ skeleton }: { skeleton: RoofSkeleton }) {
  const state = useAssembly();
  const { t } = useTranslation();
  const policy = deriveWorkbenchProjectionPolicy(state.workbench);
  const legend = createWorkbenchLegend({
    skeleton,
    policy,
    hasSelection: state.workbench.selectedId !== 'roof',
  });
  const tasks = [
    ['construction', Hammer],
    ['openings', SquareDashed],
    ['layers', Layers3],
    ['cuts', Scissors],
    ['materials', ListTree],
  ] as const;
  return (
    <div className="a-workbench-controls">
      <div
        className="a-view-presets a-task-ribbon"
        role="tablist"
        aria-label={t('assembly.viewPreset')}
      >
        {tasks.map(([preset, Icon]) => (
          <button
            key={preset}
            role="tab"
            aria-selected={state.workbench.viewPreset === preset}
            onClick={() => state.setViewPreset(preset)}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{t(`assembly.${preset}Preset`)}</span>
          </button>
        ))}
      </div>
      {state.workbench.viewPreset === 'layers' && (
        <div
          className="a-layer-switch"
          role="tablist"
          aria-label={t('assembly.roofBuildUp')}
        >
          {(['overview', 'membrane', 'counterBattens', 'battens'] as const).map(
            (view) => (
              <button
                key={view}
                role="tab"
                aria-selected={state.workbench.buildUpView === view}
                onClick={() => state.setBuildUpView(view)}
              >
                {t(`assembly.${view}LayerView`)}
              </button>
            ),
          )}
        </div>
      )}
      <div className="a-smart-view-controls">
        <button
          className="a-isolate-button a-measure-button"
          aria-pressed={!!state.workbench.measurement}
          title={t('assembly.measureShortcut')}
          onClick={state.toggleMeasurement}
        >
          <Ruler size={16} />
          {t('assembly.measure')}
        </button>
        <button
          className="a-isolate-button a-workspace-focus-button"
          aria-pressed={state.workbench.workspaceFocus.active}
          onClick={() =>
            state.setWorkspaceFocus(!state.workbench.workspaceFocus.active)
          }
        >
          <Maximize2 size={16} />
          {t(
            `assembly.${state.workbench.workspaceFocus.active ? 'restoreWorkspace' : 'focusWorkspace'}`,
          )}
        </button>
        {!state.workbench.selectedInstanceId && (
          <button
            className="a-isolate-button"
            aria-pressed={state.workbench.isolateSelection}
            disabled={state.workbench.selectedId === 'roof'}
            onClick={() =>
              state.setIsolation(!state.workbench.isolateSelection)
            }
          >
            {state.workbench.isolateSelection ? (
              <Eye size={16} />
            ) : (
              <EyeOff size={16} />
            )}
            {t(
              `assembly.${state.workbench.isolateSelection ? 'showWholeRoof' : 'isolateElement'}`,
            )}
          </button>
        )}
        <details className="a-view-options">
          <summary>
            <SlidersHorizontal size={15} />
            {t('assembly.view')}
          </summary>
          <div className="a-view-popover">
            {(
              [
                ['dimensions', 'dimensions'],
                ['labels', 'labels'],
                ['structure', 'structureBackground'],
                ['features', 'openings'],
                ['membrane', 'membrane'],
                ['counterBattens', 'counterBattens'],
                ['battens', 'battens'],
              ] as const
            ).map(([layer, label]) => (
              <label key={layer}>
                <input
                  type="checkbox"
                  checked={state.workbench.layerVisibility[layer]}
                  onChange={(event) =>
                    state.setLayerVisibility(layer, event.target.checked)
                  }
                />
                {t(`assembly.${label}`)}
              </label>
            ))}
            <fieldset className="a-view-dimensions">
              <legend>
                <Ruler size={14} /> {t('assembly.dimensionLevel')}
              </legend>
              {(['minimal', 'working', 'full'] as DimensionLevel[]).map(
                (level) => (
                  <label key={level}>
                    <input
                      type="radio"
                      name="dimension-level"
                      checked={state.workbench.dimensionLevel === level}
                      onChange={() => state.setDimensionLevel(level)}
                    />
                    {t(`assembly.${level}Dimensions`)}
                  </label>
                ),
              )}
            </fieldset>
            <button className="a-button a-fit-view" onClick={state.requestFit}>
              <Maximize size={15} />
              {t('assembly.fit')}
            </button>
          </div>
        </details>
      </div>
      <details className="a-dynamic-legend">
        <summary>
          {t('assembly.legend')}
          <span aria-hidden="true">
            {legend
              .slice(0, 3)
              .map((entry) => entry.code)
              .filter(Boolean)
              .join(' · ')}
          </span>
        </summary>
        <div>
          {legend.map((entry) => (
            <span key={entry.id} data-legend-role={entry.role}>
              <i aria-hidden="true" />
              {entry.code && <strong>{entry.code}</strong>}
              {t(`assembly.${entry.labelKey}`)}
            </span>
          ))}
        </div>
      </details>
    </div>
  );
}
