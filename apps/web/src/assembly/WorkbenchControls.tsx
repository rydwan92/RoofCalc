import {
  Box,
  Eye,
  EyeOff,
  Maximize,
  Maximize2,
  Ruler,
  Square,
  SlidersHorizontal,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import { ContextualTaskTabs } from './PerspectiveBar';
import { useAssembly } from './store';
import {
  createWorkbenchLegend,
  deriveWorkbenchProjectionPolicy,
  supportsTechnical3D,
  type DimensionLevel,
  type WorkspaceRenderer,
} from './workbench';

/**
 * V38: the renderer switch belongs with the technical view controls, not with
 * the perspectives. 3D is a view of the current task, never a destination.
 */
export function WorkspaceRendererSwitch({ compact }: { compact?: boolean }) {
  const state = useAssembly();
  const { t } = useTranslation();
  if (!supportsTechnical3D(state.workbench.viewPreset)) return null;
  return (
    <div
      className={`a-workspace-renderer ${compact ? 'is-compact' : ''}`}
      role="group"
      aria-label={t('assembly.workspaceRenderer')}
    >
      {(['2d', '3d'] as WorkspaceRenderer[]).map((renderer) => (
        <button
          key={renderer}
          className="a-button a-ghost"
          data-workspace-renderer={renderer}
          aria-pressed={state.workbench.workspaceRenderer === renderer}
          title={t(
            `assembly.workspaceRenderer${renderer === '2d' ? '2D' : '3D'}Title`,
          )}
          onClick={() => state.setWorkspaceRenderer(renderer)}
        >
          {renderer === '2d' ? (
            <Square size={15} aria-hidden="true" />
          ) : (
            <Box size={15} aria-hidden="true" />
          )}
          {t(`assembly.workspaceRenderer${renderer === '2d' ? '2D' : '3D'}`)}
        </button>
      ))}
    </div>
  );
}

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
  // V38: the 3D viewport owns its own camera, isolation and filter controls,
  // so the 2D drawing tools stand down rather than duplicating them.
  const drawing2D = state.workbench.workspaceRenderer === '2d';
  return (
    <div className="a-workbench-controls">
      <ContextualTaskTabs k1Ready={k1Ready} />
      {drawingTask && (
        <div className="a-smart-view-controls">
          <WorkspaceRendererSwitch />
          {drawing2D && (
            <>
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
                  state.setWorkspaceFocus(
                    !state.workbench.workspaceFocus.active,
                  )
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
            </>
          )}
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
  // V38: dimension level, drawing layers and the 2D Fit belong to the 2D
  // drawing. In 3D the viewport carries its own camera and family controls.
  const drawing2D = state.workbench.workspaceRenderer === '2d';
  return (
    <div className="a-mobile-view-settings">
      <WorkspaceRendererSwitch compact />
      {drawing2D &&
        state.workbench.viewPreset !== 'covering' &&
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
      {drawing2D && (
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
      )}
      {drawing2D && (
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
      )}
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
