import { useMemo, useState } from 'react';
import { Check, House, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { parseDecimal } from '../format';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
} from './project-start';
import { useAssembly } from './store';

export type ProjectStartMode = 'new' | 'quick' | 'edit';

interface Draft {
  roofType: RoofTemplateSpec['type'];
  buildingLength: string;
  buildingWidth: string;
  pitch: string;
  eave: string;
  spacing: string;
}

function initialDraft(
  template: RoofTemplateSpec,
  unit: 'mm' | 'cm' | 'm',
): Draft {
  const values = projectStartValuesFromTemplate(template);
  return {
    roofType: values.roofType,
    buildingLength: String(fromMillimetres(values.buildingLengthMm, unit)),
    buildingWidth: String(fromMillimetres(values.buildingWidthMm, unit)),
    pitch: String(values.pitchDeg),
    eave: String(fromMillimetres(values.eaveOverhangMm, unit)),
    spacing: String(fromMillimetres(values.rafterSpacingMm, unit)),
  };
}

function RoofPreview({ type }: { type: RoofTemplateSpec['type'] }) {
  return (
    <svg
      className="a-project-start-preview"
      viewBox="0 0 360 220"
      aria-hidden="true"
    >
      <path className="ground" d="M38 177H326" />
      <path className="walls" d="M72 104V177H292V104" />
      {type === 'gable' ? (
        <>
          <path className="roof-main" d="M47 111L181 38L317 111" />
          <path className="roof-back" d="M181 38L292 72L317 111" />
          <path className="roof-guide" d="M181 38V177" />
        </>
      ) : (
        <>
          <path
            className="roof-fill"
            d="M47 111L118 55L247 55L317 111L292 133L72 133Z"
          />
          <path className="roof-main" d="M47 111L118 55H247L317 111" />
          <path className="roof-guide" d="M118 55L72 133M247 55L292 133" />
          <path className="ridge" d="M118 55H247" />
        </>
      )}
      <path className="dimension" d="M72 197H292M72 190V204M292 190V204" />
    </svg>
  );
}

export function ProjectStartAssistant({
  mode,
  template,
  onSubmit,
  onClose,
}: {
  mode: ProjectStartMode;
  template: RoofTemplateSpec;
  onSubmit: (template: RoofTemplateSpec) => void | Promise<void>;
  onClose?: () => void;
}) {
  const state = useAssembly();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => initialDraft(template, state.unit));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => {
    const length = parseDecimal(draft.buildingLength);
    const width = parseDecimal(draft.buildingWidth);
    const pitch = parseDecimal(draft.pitch);
    const eave = parseDecimal(draft.eave);
    const spacing = parseDecimal(draft.spacing);
    if (
      length === null ||
      width === null ||
      pitch === null ||
      eave === null ||
      spacing === null
    )
      return undefined;
    return {
      roofType: draft.roofType,
      buildingLengthMm: toMillimetres(length, state.unit),
      buildingWidthMm: toMillimetres(width, state.unit),
      pitchDeg: pitch,
      eaveOverhangMm: toMillimetres(eave, state.unit),
      rafterSpacingMm: toMillimetres(spacing, state.unit),
    };
  }, [draft, state.unit]);
  const valid =
    !!parsed &&
    parsed.buildingLengthMm > 0 &&
    parsed.buildingWidthMm > 0 &&
    parsed.pitchDeg >= 1 &&
    parsed.pitchDeg <= 80 &&
    parsed.eaveOverhangMm >= 0 &&
    parsed.rafterSpacingMm > 0 &&
    (parsed.roofType !== 'hip' ||
      parsed.buildingLengthMm >= parsed.buildingWidthMm);

  const field = (
    key: keyof Pick<
      Draft,
      'buildingLength' | 'buildingWidth' | 'pitch' | 'eave' | 'spacing'
    >,
    label: string,
    angle = false,
  ) => (
    <label className="a-project-start-field">
      <span>{label}</span>
      <span>
        <input
          data-project-start-field={key}
          aria-label={`${label} — ${t('assembly.projectStart.title')}`}
          inputMode="decimal"
          value={draft[key]}
          onChange={(event) => {
            setError('');
            setDraft((current) => ({ ...current, [key]: event.target.value }));
          }}
        />
        <small>{angle ? '°' : state.unit}</small>
      </span>
    </label>
  );

  return (
    <div
      className="a-project-start-layer"
      data-testid="project-start-assistant"
    >
      <section
        className="a-project-start"
        role="dialog"
        aria-modal="true"
        aria-label={t('assembly.projectStart.title')}
      >
        <header>
          <div>
            <small>{t(`assembly.projectStart.mode.${mode}`)}</small>
            <h2>{t('assembly.projectStart.title')}</h2>
            <p>{t(`assembly.projectStart.description.${mode}`)}</p>
          </div>
          {onClose && (
            <button
              className="a-icon"
              aria-label={t('assembly.projectStart.close')}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          )}
        </header>
        <div className="a-project-start-grid">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!parsed || !valid) {
                setError(
                  parsed?.roofType === 'hip' &&
                    parsed.buildingLengthMm < parsed.buildingWidthMm
                    ? t('assembly.projectStart.hipLengthError')
                    : t('assembly.projectStart.invalid'),
                );
                return;
              }
              try {
                const next = createProjectStartTemplate(parsed, template);
                setBusy(true);
                Promise.resolve(onSubmit(next))
                  .catch(() => setError(t('assembly.projectStart.saveError')))
                  .finally(() => setBusy(false));
              } catch {
                setError(t('assembly.projectStart.invalid'));
              }
            }}
          >
            <fieldset className="a-project-start-types">
              <legend>{t('assembly.projectStart.roofType')}</legend>
              {(['gable', 'hip'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={draft.roofType === type}
                  onClick={() =>
                    setDraft((current) => ({ ...current, roofType: type }))
                  }
                >
                  <span className={`a-roof-card-icon is-${type}`}>
                    <House size={26} />
                  </span>
                  <strong>{t(`assembly.${type}Roof`)}</strong>
                  <small>{t(`assembly.projectStart.roofHint.${type}`)}</small>
                  {draft.roofType === type && (
                    <Check size={18} aria-hidden="true" />
                  )}
                </button>
              ))}
            </fieldset>
            <div className="a-project-start-section">
              <strong>{t('assembly.projectStart.building')}</strong>
              <div className="a-project-start-fields">
                {field('buildingLength', t('assembly.projectStart.length'))}
                {mode !== 'quick' &&
                  field('buildingWidth', t('assembly.projectStart.width'))}
              </div>
            </div>
            <div className="a-project-start-section">
              <strong>{t('assembly.projectStart.roof')}</strong>
              {mode === 'quick' ? (
                <div className="a-project-start-known">
                  <span>
                    {t('assembly.projectStart.width')}{' '}
                    <b>
                      {draft.buildingWidth} {state.unit}
                    </b>
                  </span>
                  <span>
                    {t('assembly.projectStart.pitch')} <b>{draft.pitch}°</b>
                  </span>
                  <span>
                    {t('assembly.projectStart.eave')}{' '}
                    <b>
                      {draft.eave} {state.unit}
                    </b>
                  </span>
                </div>
              ) : (
                <div className="a-project-start-fields">
                  {field('pitch', t('assembly.projectStart.pitch'), true)}
                  {field('eave', t('assembly.projectStart.eave'))}
                </div>
              )}
              {field('spacing', t('assembly.projectStart.spacing'))}
            </div>
            {error && (
              <p className="a-project-start-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="a-button a-primary a-project-start-submit"
              data-testid="project-start-submit"
              disabled={!valid || busy}
            >
              {t(`assembly.projectStart.submit.${mode}`)}
            </button>
          </form>
          <aside>
            <span>{t('assembly.projectStart.preview')}</span>
            <RoofPreview type={draft.roofType} />
            <strong>{t(`assembly.${draft.roofType}Roof`)}</strong>
            <p>{t('assembly.projectStart.previewHint')}</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
