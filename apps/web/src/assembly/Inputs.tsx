import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import { purlinRange, type calculateAssembly } from '@cieslacalc/roof-math';
import type { SupportSpec } from '@cieslacalc/timber-model';
import { editableLength, formatLength, formatNumber } from '../format';
import { editValue, supportField, useAssembly, type EditField } from './store';

export type Calculation = ReturnType<typeof calculateAssembly>;
export function NumberField({
  field,
  label,
  min = 0,
  max = 100000,
  step,
}: {
  field: EditField;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const { t } = useTranslation();
  const state = useAssembly();
  const angle = field === 'roof.pitchDeg',
    unit = angle ? '°' : state.unit;
  const value = editValue(state.spec, field, state.template);
  const invalid =
    !!state.invalidFields[field] || !Number.isFinite(value) || value < min || value > max;
  const limit = (n: number) =>
    !Number.isFinite(n)
      ? '—'
      : angle
        ? String(n)
        : editableLength(n, state.unit);
  const display =
    state.drafts[field] ??
    (Number.isFinite(value)
      ? angle
        ? String(value)
        : editableLength(value, state.unit)
      : '');
  return (
    <label className="a-field" htmlFor={field}>
      <span>{t(`assembly.${label}`)}</span>
      <div>
        {step && (
          <button
            type="button"
            className="a-step a-step-down"
            aria-label={t('assembly.decrease')}
            title={t('assembly.decrease')}
            onClick={() => state.stepField(field, -step)}
          >
            <Minus size={15} />
          </button>
        )}
        <input
          id={field}
          aria-label={t(`assembly.${label}`)}
          inputMode="decimal"
          type="text"
          autoComplete="off"
          value={display}
          aria-invalid={invalid}
          onChange={(e) => state.setField(field, e.target.value)}
        />
        <span>{unit}</span>
        {step && (
          <button
            type="button"
            className="a-step"
            aria-label={t('assembly.increase')}
            title={t('assembly.increase')}
            onClick={() => state.stepField(field, step)}
          >
            <Plus size={15} />
          </button>
        )}
      </div>
      <small>
        {invalid
          ? t('assembly.invalidField')
          : `${limit(min)}–${limit(max)} ${unit}`}
      </small>
    </label>
  );
}
export function GeometryInputs({ includeLayout = false }: { includeLayout?: boolean }) {
  return (
    <>
      <NumberField field="roof.runMm" label="run" min={1} />
      <NumberField
        field="roof.pitchDeg"
        label="pitch"
        min={1}
        max={80}
        step={1}
      />
      <NumberField field="roof.overhangMm" label="overhang" max={10000} />
      {includeLayout && <TemplateInputs />}
    </>
  );
}
export function TemplateInputs() {
  const state = useAssembly(),
    { t } = useTranslation();
  return (
    <section className="a-template-inputs">
      <h3>{t('assembly.layout')}</h3>
      <NumberField
        field="template.buildingLengthMm"
        label="buildingLength"
        min={1}
        max={100000}
      />
      <NumberField
        field="template.rafterSpacingMm"
        label="rafterSpacing"
        min={1}
        max={100000}
        step={25}
      />
      <label className="a-select-label">
        {t('assembly.spacingMode')}
        <select
          value={state.template.rafterSpacing.mode}
          onChange={(event) =>
            state.setSpacingMode(
              event.target.value as 'fixed-spacing' | 'fit-evenly',
            )
          }
        >
          <option value="fit-evenly">{t('assembly.fitEvenly')}</option>
          <option value="fixed-spacing">{t('assembly.fixedSpacing')}</option>
        </select>
      </label>
    </section>
  );
}
export function TimberInputs() {
  return (
    <>
      <NumberField field="member.widthMm" label="width" min={1} max={1000} />
      <NumberField field="member.depthMm" label="depth" min={1} max={2000} />
    </>
  );
}
export function SupportInputs({
  support,
  result,
}: {
  support: SupportSpec;
  result: Calculation | null;
}) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const range = purlinRange(state.spec, support.section.widthMm);
  const length = (n: number) =>
    Number.isFinite(n) ? formatLength(n, state.unit, i18n.language) : '—';
  const joint = result?.assembly.joints.find((j) => j.supportId === support.id);
  return (
    <>
      {support.kind === 'purlin' && (
        <>
          <NumberField
            field={supportField(support.id, 'xMm')}
            label="position"
            min={range.min}
            max={range.max}
          />
          <p className="a-help">
            {t('assembly.range', {
              min: length(range.min),
              max: length(range.max),
              unit: state.unit,
            })}
          </p>
        </>
      )}
      <NumberField
        field={supportField(support.id, 'widthMm')}
        label="width"
        min={1}
        max={2000}
      />
      <NumberField
        field={supportField(support.id, 'heightMm')}
        label="height"
        min={1}
        max={2000}
      />
      <label className="a-select-label">
        {t('assembly.control')}
        <select
          value={support.joint.control}
          disabled={!result}
          onChange={(e) =>
            state.setJointControl(
              support.id,
              e.target.value as 'seat' | 'depth',
            )
          }
        >
          <option value="seat">{t('assembly.controlSeat')}</option>
          <option value="depth">{t('assembly.controlDepth')}</option>
        </select>
      </label>
      <NumberField
        field={supportField(support.id, 'valueMm')}
        label={support.joint.control === 'seat' ? 'seat' : 'notchDepth'}
        min={0.001}
        max={
          support.joint.control === 'seat'
            ? support.section.widthMm
            : state.spec.member.section.depthMm
        }
      />
      {joint && (
        <dl className="a-facts">
          <div>
            <dt>{t('assembly.seat')}</dt>
            <dd>
              {length(joint.seatLengthMm)} {state.unit}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.notchDepth')}</dt>
            <dd data-testid="selected-notch-depth">
              {length(joint.normalDepthMm)} {state.unit}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.remaining')}</dt>
            <dd>
              {length(joint.remainingDepthMm)} {state.unit}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.removed')}</dt>
            <dd>
              {formatNumber(joint.removedDepthRatio * 100, i18n.language)}%
            </dd>
          </div>
          <div>
            <dt>{t('assembly.toNotch')}</dt>
            <dd>
              {length(joint.stationMm)} {state.unit}
            </dd>
          </div>
        </dl>
      )}
      {support.kind === 'purlin' && (
        <button
          className="a-button a-remove"
          onClick={() => state.remove(support.id)}
        >
          {t('assembly.removePurlin')}
        </button>
      )}
    </>
  );
}
