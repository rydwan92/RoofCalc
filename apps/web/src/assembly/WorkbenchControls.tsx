import { Eye, EyeOff, Ruler, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RoofSkeleton } from '@cieslacalc/timber-model';
import { useAssembly } from './store';
import {
  createWorkbenchLegend,
  deriveWorkbenchProjectionPolicy,
  type DimensionLevel,
  type ViewPreset,
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
  return (
    <div className="a-workbench-controls">
      <div className="a-smart-view-controls">
        <div
          className="a-view-presets"
          role="tablist"
          aria-label={t('assembly.viewPreset')}
        >
          {(['construction', 'openings', 'battens', 'cuts'] as ViewPreset[]).map((preset) => (
            <button
              key={preset}
              role="tab"
              aria-selected={state.workbench.viewPreset === preset}
              onClick={() => state.setViewPreset(preset)}
            >
              {t(`assembly.${preset}Preset`)}
            </button>
          ))}
        </div>
        <div
          className="a-dimension-levels"
          role="group"
          aria-label={t('assembly.dimensionLevel')}
        >
          <Ruler size={15} aria-hidden="true" />
          {(['minimal', 'working', 'full'] as DimensionLevel[]).map((level) => (
            <button
              key={level}
              aria-pressed={state.workbench.dimensionLevel === level}
              onClick={() => state.setDimensionLevel(level)}
            >
              {t(`assembly.${level}Dimensions`)}
            </button>
          ))}
        </div>
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
          {([
            ['dimensions', 'dimensions'],
            ['structure', 'structureBackground'],
            ['features', 'openings'],
            ['battens', 'battens'],
          ] as const).map(([layer, label]) => (
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
        </details>
      </div>
      <details className="a-dynamic-legend" open>
        <summary>{t('assembly.legend')}</summary>
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
