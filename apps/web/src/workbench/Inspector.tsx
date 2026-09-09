import { ChevronDown, Info, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RafterWorkbenchResult } from '@cieslacalc/roof-math';
import type { WorkbenchObject } from '@cieslacalc/calculator-core';
import { fieldValue, useWorkbench, type Field } from '../store';
import { formatLength, formatNumber, parseDecimal } from '../format';
import type { InputIssue } from './WorkbenchPage';

export const objectFields: Record<WorkbenchObject, Field[]> = {
  geometry: ['geometry.runMm', 'geometry.pitchDeg', 'geometry.overhangMm'],
  rafter: ['timber.widthMm', 'timber.depthMm'],
  'wall-plate': ['wallPlate.widthMm', 'wallPlate.seatLengthMm'],
  ridge: ['ridge.thicknessMm'],
  birdsmouth: ['wallPlate.seatLengthMm', 'timber.depthMm', 'wallPlate.widthMm'],
  'ridge-cut': ['ridge.thicknessMm'],
};
export function fieldObject(field: Field): WorkbenchObject {
  return field.startsWith('geometry.')
    ? 'geometry'
    : field.startsWith('timber.')
      ? 'rafter'
      : field.startsWith('ridge.')
        ? 'ridge'
        : 'wall-plate';
}
const limits: Record<Field, [number, number]> = {
  'geometry.runMm': [1, 100000],
  'geometry.pitchDeg': [1, 80],
  'geometry.overhangMm': [0, 10000],
  'timber.widthMm': [1, 1000],
  'timber.depthMm': [1, 2000],
  'wallPlate.widthMm': [1, 2000],
  'wallPlate.seatLengthMm': [1, 2000],
  'ridge.thicknessMm': [0, 1000],
};

export function Inspector({
  result,
  issues,
}: {
  result: RafterWorkbenchResult | null;
  issues: InputIssue[];
}) {
  const state = useWorkbench();
  const { t, i18n } = useTranslation();
  const length = (n: number) =>
    `${formatLength(n, state.unit, i18n.language)} ${state.unit}`;
  const object = state.selected;
  const joint = object === 'birdsmouth' || object === 'wall-plate';
  const ridge = object === 'ridge-cut' || object === 'ridge';
  const formatAngle = (n: number) => `${formatNumber(n, i18n.language)}°`;
  return (
    <aside className="inspector">
      <button
        type="button"
        className="inspector-heading"
        aria-expanded={state.inspectorOpen}
        aria-controls="inspector-body"
        onClick={() => state.setInspectorOpen(!state.inspectorOpen)}
      >
        <SlidersHorizontal size={17} />
        <span>{t('inspector')}</span>
        <ChevronDown size={16} />
      </button>
      <div id="inspector-body" hidden={!state.inspectorOpen}>
        <div className="selected-object">
          <span className="overline">{t('selected')}</span>
          <h2>{t(`objects.${object}`)}</h2>
          <div className="selected-rule" />
        </div>
        <form noValidate onSubmit={(event) => event.preventDefault()}>
          {objectFields[object].map((field) => {
            const issue = issues.find((entry) => entry.field === field);
            const [min, max] = limits[field];
            const angle = field === 'geometry.pitchDeg';
            const error = issue
              ? parseDecimal(state.draft[field]) === null
                ? t('errors.number')
                : issue.code === 'invalid'
                  ? t('errors.invalid', {
                      min: angle
                        ? min
                        : formatLength(min, state.unit, i18n.language),
                      max: angle
                        ? max
                        : formatLength(max, state.unit, i18n.language),
                      unit: angle ? '°' : state.unit,
                    })
                  : t(`errors.${issue.code}`)
              : null;
            return (
              <div className="field-group" key={field}>
                <label htmlFor={field}>{t(`fields.${field}`)}</label>
                <div className={`number-input ${error ? 'invalid' : ''}`}>
                  <input
                    id={field}
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={state.draft[field]}
                    onChange={(event) =>
                      state.setField(field, event.target.value)
                    }
                    aria-invalid={!!error}
                    aria-describedby={`${field}-hint${error ? ` ${field}-error` : ''}`}
                  />
                  <span>{angle ? '°' : state.unit}</span>
                </div>
                <p id={`${field}-hint`} className="field-hint">
                  {t(`hints.${field}`)}
                </p>
                {error && (
                  <p id={`${field}-error`} className="field-error" role="alert">
                    {error}
                  </p>
                )}
                {angle && (
                  <div
                    className="pitch-presets"
                    role="group"
                    aria-label={t('roofPitch')}
                  >
                    {[25, 30, 35, 40, 45].map((pitch) => (
                      <button
                        type="button"
                        key={pitch}
                        aria-pressed={fieldValue(state.input, field) === pitch}
                        onClick={() => state.setField(field, String(pitch))}
                      >
                        {pitch}°
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </form>
        {result && joint && (
          <div className="joint-readouts">
            <dl>
              <div>
                <dt>{t('normalDepth')}</dt>
                <dd data-testid="notch-depth">
                  {length(result.notch.normalDepthMm)}
                </dd>
              </div>
              <div>
                <dt>{t('remaining')}</dt>
                <dd>{length(result.notch.remainingDepthMm)}</dd>
              </div>
              <div>
                <dt>{t('heelHeight')}</dt>
                <dd>{length(result.notch.verticalRiseAcrossSeatMm)}</dd>
              </div>
            </dl>
            <div className="notch-ratio">
              <div>
                <span>{t('removed')}</span>
                <strong>
                  {formatNumber(
                    result.notch.removedDepthRatio * 100,
                    i18n.language,
                  )}
                  %
                </strong>
              </div>
              <meter
                min="0"
                max="1"
                value={result.notch.removedDepthRatio}
                aria-label={t('removed')}
              />
            </div>
            <p className="structural-note">
              <Info size={15} />
              {t('structuralNote')}
            </p>
          </div>
        )}
        {result && ridge && (
          <div className="joint-readouts">
            <dl>
              <div>
                <dt>{t('ridgeDeduction')}</dt>
                <dd>{length(result.ridge.alongMemberDeductionMm)}</dd>
              </div>
              <div>
                <dt>{t('plumbAngle')}</dt>
                <dd>{formatAngle(result.ridge.angleToMemberDeg)}</dd>
              </div>
              <div>
                <dt>{t('edgeOffset')}</dt>
                <dd>{length(result.ridge.topBottomStationOffsetMm)}</dd>
              </div>
            </dl>
            <p className="field-hint">{t('angleNote')}</p>
          </div>
        )}
        <p className="inspector-footnote">{t('defaultNote')}</p>
      </div>
    </aside>
  );
}
