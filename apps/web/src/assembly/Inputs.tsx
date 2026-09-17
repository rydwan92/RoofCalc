import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react';
import {
  convertRoofTemplate,
  purlinRange,
  roofPlaneIds,
  type calculateAssembly,
} from '@cieslacalc/roof-math';
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
  optional = false,
}: {
  field: EditField;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  optional?: boolean;
}) {
  const { t } = useTranslation();
  const state = useAssembly();
  const angle = field === 'roof.pitchDeg',
    unit = angle ? '°' : state.unit;
  const value = editValue(state.spec, field, state.template);
  const invalid =
    !!state.invalidFields[field] ||
    (!optional && !Number.isFinite(value)) ||
    value < min ||
    value > max;
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
          onFocus={() => state.beginTransaction()}
          onBlur={() => state.commitTransaction()}
          onChange={(e) => state.setField(field, e.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              state.commitTransaction();
              event.currentTarget.blur();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              state.cancelTransaction();
              event.currentTarget.blur();
            }
          }}
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
          : optional && !Number.isFinite(value)
            ? t('assembly.optionalManualValue')
            : `${limit(min)}–${limit(max)} ${unit}`}
      </small>
    </label>
  );
}
export function GeometryInputs({
  includeLayout = false,
}: {
  includeLayout?: boolean;
}) {
  return (
    <>
      {includeLayout && <RoofTypeSelector context="roof" />}
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
export function StructureSystemSelector() {
  const state = useAssembly(),
    { t } = useTranslation();
  const system =
    state.template.type === 'gable' && state.template.structure?.system
      ? state.template.structure.system
      : 'rafter';
  return (
    <div className="a-roof-type">
      <span>{t('assembly.structureSystem')}</span>
      <div role="group" aria-label={t('assembly.structureSystem')}>
        {(['rafter', 'rafter-collar-tie'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={system === option}
            onClick={() => state.setRoofStructureSystem(option)}
          >
            {t(
              `assembly.${option === 'rafter' ? 'rafterSystem' : 'rafterCollarTieSystem'}`,
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
export function RidgeConnectionSelector() {
  const state = useAssembly(),
    { t } = useTranslation();
  const connection = state.spec.ridge.connection ?? 'ridge-board';
  return (
    <div className="a-roof-type">
      <span>{t('assembly.ridgeConnection')}</span>
      <div role="group" aria-label={t('assembly.ridgeConnection')}>
        {(['ridge-board', 'direct-meeting', 'half-lap'] as const).map(
          (option) => (
            <button
              key={option}
              type="button"
              aria-pressed={connection === option}
              onClick={() => state.setRidgeConnection(option)}
            >
              {t(
                `assembly.${
                  option === 'ridge-board'
                    ? 'ridgeBoardConnection'
                    : option === 'direct-meeting'
                      ? 'directMeetingConnection'
                      : 'halfLapConnection'
                }`,
              )}
            </button>
          ),
        )}
      </div>
      {connection === 'half-lap' && (
        <p className="a-help">{t('assembly.halfLapUnresolvedNote')}</p>
      )}
    </div>
  );
}
export function CollarTieInputs() {
  const state = useAssembly();
  if (state.template.type !== 'gable' || !state.template.structure?.collarTie)
    return null;
  return (
    <>
      <NumberField
        field="collarTie.heightAboveWallPlateMm"
        label="collarTieHeight"
        min={1}
        max={100000}
      />
      <NumberField field="collarTie.widthMm" label="width" min={1} max={1000} />
      <NumberField field="collarTie.depthMm" label="depth" min={1} max={2000} />
    </>
  );
}
/**
 * V47 consequence preview: a roof-type change remaps covering and build-up
 * scopes (V46), so the Creator explains what will be updated before it
 * happens. Nothing is asked when no dependent data exists.
 */
function roofTypeConsequences(
  state: ReturnType<typeof useAssembly.getState>,
  next: 'gable' | 'hip',
) {
  const project = state.projectDocument.project;
  // Plane IDs belong to the template resolver (ADR-007).
  const nextPlanes = roofPlaneIds(convertRoofTemplate(state.template, next));
  const windowsOnRemovedPlanes = project.features.filter(
    (feature) => !nextPlanes.includes(feature.roofPlaneId),
  ).length;
  const items = [
    ...(project.coverings.length
      ? [{ key: 'coverings', count: project.coverings.length }]
      : []),
    ...(project.buildUp.battenLayout?.enabled ? [{ key: 'battens' }] : []),
    ...(project.buildUp.counterBattens?.enabled
      ? [{ key: 'counterBattens' }]
      : []),
    ...(project.buildUp.membrane?.enabled ? [{ key: 'membrane' }] : []),
    ...(windowsOnRemovedPlanes
      ? [{ key: 'openings', count: windowsOnRemovedPlanes }]
      : []),
  ];
  return items;
}
export function RoofTypeSelector({ context }: { context: 'roof' | 'member' }) {
  const state = useAssembly(),
    { t } = useTranslation();
  const [pending, setPending] = useState<'gable' | 'hip'>();
  const consequences = pending ? roofTypeConsequences(state, pending) : [];
  const typeLabel = (type: 'gable' | 'hip') =>
    t(`assembly.${type === 'gable' ? 'gableRoof' : 'hipRoof'}`);
  const choose = (type: 'gable' | 'hip') => {
    if (type === state.template.type) return;
    if (
      context === 'roof' &&
      state.workbench.mode === 'builder' &&
      roofTypeConsequences(state, type).length > 0
    ) {
      setPending(type);
      return;
    }
    state.setRoofType(type);
  };
  return (
    <div className="a-roof-type">
      <span>
        {t(`assembly.${context === 'roof' ? 'roofType' : 'memberType'}`)}
      </span>
      <div
        role="group"
        aria-label={t(
          `assembly.${context === 'roof' ? 'roofType' : 'memberType'}`,
        )}
      >
        {(['gable', 'hip'] as const).map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={state.template.type === type}
            onClick={() => choose(type)}
          >
            {t(
              `assembly.${context === 'roof' ? (type === 'gable' ? 'gableRoof' : 'hipRoof') : type === 'gable' ? 'commonRafter' : 'hipRafter'}`,
            )}
          </button>
        ))}
      </div>
      {pending && consequences.length > 0 && (
        <div
          className="a-consequence"
          role="alertdialog"
          aria-label={t('assembly.readiness.consequence.title', {
            from: typeLabel(state.template.type),
            to: typeLabel(pending),
          })}
          data-testid="roof-type-consequence"
        >
          <strong>
            {t('assembly.readiness.consequence.title', {
              from: typeLabel(state.template.type),
              to: typeLabel(pending),
            })}
          </strong>
          <span>{t('assembly.readiness.consequence.intro')}</span>
          <ul>
            {consequences.map((item) => (
              <li key={item.key}>
                {t(`assembly.readiness.consequence.${item.key}`, {
                  count: 'count' in item ? item.count : 0,
                })}
              </li>
            ))}
          </ul>
          <small>{t('assembly.readiness.consequence.undoHint')}</small>
          <div className="a-readiness-issue-actions">
            <button
              type="button"
              className="a-button a-primary"
              data-testid="roof-type-consequence-confirm"
              onClick={() => {
                state.setRoofType(pending);
                setPending(undefined);
              }}
            >
              {t('assembly.readiness.consequence.confirm')}
            </button>
            <button
              type="button"
              className="a-button"
              onClick={() => setPending(undefined)}
            >
              {t('assembly.readiness.consequence.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
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
        min={state.template.type === 'hip' ? state.template.halfRunMm * 2 : 1}
        max={100000}
      />
      {state.template.type === 'hip' && (
        <p className="a-help">{t('assembly.hipLengthRule')}</p>
      )}
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
              event.target.value as
                'max-even-spacing' | 'target-even-spacing' | 'fixed-module',
            )
          }
        >
          <option value="max-even-spacing">
            {t('assembly.maxEvenSpacing')}
          </option>
          <option value="target-even-spacing">
            {t('assembly.targetEvenSpacing')}
          </option>
          <option value="fixed-module">{t('assembly.fixedModule')}</option>
        </select>
      </label>
      {state.template.rafterSpacing.mode === 'fixed-module' && (
        <label className="a-select-label">
          {t('assembly.endStationPolicy')}
          <select
            value={state.template.rafterSpacing.endPolicy}
            onChange={(event) =>
              state.setEndStationPolicy(
                event.target.value as 'require-both-ends' | 'allow-open-end',
              )
            }
          >
            <option value="require-both-ends">
              {t('assembly.requireBothEnds')}
            </option>
            <option value="allow-open-end">{t('assembly.allowOpenEnd')}</option>
          </select>
        </label>
      )}
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
export function HipTimberInputs() {
  return (
    <>
      <NumberField field="hip.widthMm" label="width" min={1} max={1000} />
      <NumberField field="hip.depthMm" label="depth" min={1} max={2000} />
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
