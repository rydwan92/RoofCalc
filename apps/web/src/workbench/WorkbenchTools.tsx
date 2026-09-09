import {
  Box,
  Columns3,
  Crosshair,
  House,
  Layers3,
  MoveDiagonal,
  RotateCcw,
  Ruler,
  Scissors,
  Triangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lengthUnits, type RafterWorkbenchResult } from '@cieslacalc/roof-math';
import type { WorkbenchObject } from '@cieslacalc/calculator-core';
import { Button } from '@cieslacalc/ui';
import { useWorkbench } from '../store';
import { formatLength, formatNumber } from '../format';
import type { InputIssue } from './WorkbenchPage';

export const objectGroups: { label: string; objects: WorkbenchObject[] }[] = [
  { label: 'geometry', objects: ['geometry'] },
  { label: 'timber', objects: ['rafter'] },
  { label: 'supports', objects: ['wall-plate', 'ridge'] },
  { label: 'cuts', objects: ['birdsmouth', 'ridge-cut'] },
];
const icons = {
  geometry: Triangle,
  rafter: Box,
  'wall-plate': Layers3,
  ridge: Columns3,
  birdsmouth: Scissors,
  'ridge-cut': MoveDiagonal,
};
export function WorkbenchToolbar({ brand }: { brand: string }) {
  const { t, i18n } = useTranslation();
  const { unit, setUnit, reset } = useWorkbench();
  return (
    <header className="workbench-toolbar">
      <a href="#/calculators/common-rafter" className="brand">
        <span className="brand-mark">
          <House size={22} />
        </span>
        {brand}
        <span className="brand-subtitle">{t('workshop')}</span>
      </a>
      <div className="toolbar-right">
        <div className="unit-control">
          <span>{t('units')}</span>
          <div className="segmented" role="group" aria-label={t('units')}>
            {lengthUnits.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={unit === value}
                onClick={() => setUnit(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <Button
          className="reset-button"
          onClick={reset}
          aria-label={t('reset')}
        >
          <RotateCcw size={17} />
          <span>{t('reset')}</span>
        </Button>
        <Button
          className="language-button"
          aria-label={t('language')}
          onClick={() => {
            void i18n.changeLanguage(i18n.language === 'pl' ? 'en' : 'pl');
          }}
        >
          {i18n.language.toUpperCase()}
        </Button>
      </div>
    </header>
  );
}
export function Toolbox({
  result,
  issues,
}: {
  result: RafterWorkbenchResult | null;
  issues: InputIssue[];
}) {
  const { t, i18n } = useTranslation();
  const state = useWorkbench();
  const length = (n: number) =>
    Number.isFinite(n)
      ? `${formatLength(n, state.unit, i18n.language)} ${state.unit}`
      : '—';
  const meta: Record<WorkbenchObject, string> = {
    geometry: Number.isFinite(state.input.geometry.pitchDeg)
      ? `${formatNumber(state.input.geometry.pitchDeg, i18n.language)}°`
      : '—',
    rafter: `${length(state.input.timber.widthMm)} × ${length(state.input.timber.depthMm)}`,
    'wall-plate': length(state.input.wallPlate.widthMm),
    ridge: length(state.input.ridge.thicknessMm),
    birdsmouth: length(state.input.wallPlate.seatLengthMm),
    'ridge-cut': result
      ? `${formatNumber(result.ridge.angleToMemberDeg, i18n.language)}°`
      : '—',
  };
  return (
    <aside className="toolbox" aria-label={t('edit')}>
      <div className="toolbox-heading">
        <Crosshair size={17} />
        <span>{t('edit')}</span>
      </div>
      <div className="tool-groups">
        {objectGroups.map((group) => (
          <section key={group.label} className="tool-group">
            <h2>{t(`groups.${group.label}`)}</h2>
            {group.objects.map((object) => {
              const Icon = icons[object];
              const invalid = issues.some((issue) =>
                object === 'geometry'
                  ? issue.field.startsWith('geometry.')
                  : object === 'rafter'
                    ? issue.field.startsWith('timber.')
                    : object === 'ridge' || object === 'ridge-cut'
                      ? issue.field.startsWith('ridge.')
                      : issue.field.startsWith('wallPlate.'),
              );
              return (
                <button
                  key={object}
                  type="button"
                  className={`tool-item ${invalid ? 'has-error' : ''}`}
                  aria-pressed={state.selected === object}
                  onClick={() => state.select(object)}
                >
                  <Icon size={19} />
                  <span>
                    <strong>{t(`objects.${object}`)}</strong>
                    <small>{meta[object]}</small>
                  </span>
                  <i />
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <p className="toolbox-tip">
        <Ruler size={17} />
        {t('selectHint')}
      </p>
    </aside>
  );
}
