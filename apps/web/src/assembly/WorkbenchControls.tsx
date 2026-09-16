import {
  Eye,
  EyeOff,
  Maximize,
  Maximize2,
  Ruler,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import { ContextualTaskTabs } from './PerspectiveBar';
import { useAssembly } from './store';
import {
  createWorkbenchLegend,
  deriveWorkbenchProjectionPolicy,
  type DimensionLevel,
} from './workbench';

export function WorkbenchControls({
  skeleton,
  k1Ready,
}: {
  skeleton: RoofSkeleton;
  k1Ready?: boolean;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const policy = deriveWorkbenchProjectionPolicy(state.workbench);
  const legend = createWorkbenchLegend({
    skeleton,
    policy,
    hasSelection: state.workbench.selectedId !== 'roof',
  });
  // V37: only the active perspective's tasks are shown; drawing tools are
  // offered only where there is a drawing to act on.
  const drawingTask = ['construction', 'openings', 'layers', 'cuts'].includes(
    state.workbench.viewPreset,
  );
  return (
    <div className="a-workbench-controls">
      <ContextualTaskTabs k1Ready={k1Ready} />
      {drawingTask && (
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
              <button
                className="a-button a-fit-view"
                onClick={state.requestFit}
              >
                <Maximize size={15} />
                {t('assembly.fit')}
              </button>
            </div>
          </details>
        </div>
      )}
      {drawingTask && (
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
      )}
    </div>
  );
}

export function MobileViewSettings({ skeleton }: { skeleton: RoofSkeleton }) {
  const state = useAssembly();
  const { t } = useTranslation();
  const policy = deriveWorkbenchProjectionPolicy(state.workbench, true);
  const legend = createWorkbenchLegend({
    skeleton,
    policy,
    hasSelection: state.workbench.selectedId !== 'roof',
  });
  return (
    <div className="a-mobile-view-settings">
      {state.workbench.viewPreset !== 'covering' &&
        (state.workbench.viewPreset !== 'materials' ||
          state.workbench.materialsView === 'drawing') && (
          <button className="a-button" onClick={state.requestFit}>
            <Maximize size={17} />
            {t('assembly.fit')}
          </button>
        )}
      <button
        className="a-button"
        aria-pressed={state.workbench.workspaceFocus.active}
        onClick={() =>
          state.setWorkspaceFocus(!state.workbench.workspaceFocus.active)
        }
      >
        <Maximize2 size={17} />
        {t(
          state.workbench.workspaceFocus.active
            ? 'assembly.restoreWorkspace'
            : 'assembly.focusWorkspace',
        )}
      </button>
      <button
        className="a-button"
        aria-pressed={state.workbench.isolateSelection}
        disabled={state.workbench.selectedId === 'roof'}
        onClick={() => state.setIsolation(!state.workbench.isolateSelection)}
      >
        <Eye size={17} />
        {t(
          state.workbench.isolateSelection
            ? 'assembly.showWholeRoof'
            : 'assembly.isolateElement',
        )}
      </button>
      <fieldset>
        <legend>{t('assembly.dimensionLevel')}</legend>
        {(['minimal', 'working', 'full'] as DimensionLevel[]).map((level) => (
          <label key={level}>
            <input
              type="radio"
              name="mobile-dimension-level"
              checked={state.workbench.dimensionLevel === level}
              onChange={() => state.setDimensionLevel(level)}
            />
            {t(`assembly.${level}Dimensions`)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{t('assembly.view')}</legend>
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
      </fieldset>
      <div className="a-mobile-legend">
        <strong>{t('assembly.legend')}</strong>
        {legend.map((entry) => (
          <span key={entry.id} data-legend-role={entry.role}>
            <i aria-hidden="true" />
            {entry.code && <strong>{entry.code}</strong>}
            {t(`assembly.${entry.labelKey}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
