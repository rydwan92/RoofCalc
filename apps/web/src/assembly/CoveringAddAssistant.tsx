import { useState } from 'react';
import { ArrowLeft, Check, Grid3X3, Rows3, SquareStack } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  coveringProductSelectionSchema,
  type CoveringKind,
  type CoveringProductSelection,
} from '@cieslacalc/covering-core';
import { toMillimetres, type LengthUnit } from '@cieslacalc/roof-math';
import { parseDecimal } from '../format';

type Step = 'family' | 'source' | 'manual';
type ManualDraft = Record<
  | 'name'
  | 'physicalWidth'
  | 'physicalLength'
  | 'coverWidth'
  | 'gaugeMin'
  | 'gaugeMax'
  | 'minimumPitch'
  | 'effectiveWidth'
  | 'totalWidth'
  | 'effectiveLength'
  | 'totalLength'
  | 'moduleLength'
  | 'minimumLength'
  | 'maximumLength'
  | 'seamHeight',
  string
> & { pattern: 'straight' | 'staggered' | 'crown' };

const emptyDraft: ManualDraft = {
  name: '',
  physicalWidth: '',
  physicalLength: '',
  coverWidth: '',
  gaugeMin: '',
  gaugeMax: '',
  minimumPitch: '',
  effectiveWidth: '',
  totalWidth: '',
  effectiveLength: '',
  totalLength: '',
  moduleLength: '',
  minimumLength: '',
  maximumLength: '',
  seamHeight: '',
  pattern: 'straight',
};

function coursePattern(pattern: ManualDraft['pattern']) {
  if (pattern === 'crown')
    return {
      layers: [
        { id: 'base', horizontalOffsetFraction: 0 },
        { id: 'cover', horizontalOffsetFraction: 0.5 },
      ],
      battenRowOffsetCycle: [0],
    };
  return {
    layers: [{ id: 'base', horizontalOffsetFraction: 0 }],
    battenRowOffsetCycle: pattern === 'staggered' ? [0, 0.5] : [0],
  };
}

function buildManualProduct(
  kind: CoveringKind,
  draft: ManualDraft,
  unit: LengthUnit,
): CoveringProductSelection {
  const length = (key: keyof ManualDraft) => {
    const parsed = parseDecimal(String(draft[key]));
    if (parsed === null || parsed <= 0) throw new Error('required');
    return toMillimetres(parsed, unit);
  };
  const pitch = parseDecimal(draft.minimumPitch);
  if (!draft.name.trim() || pitch === null || pitch <= 0 || pitch > 90)
    throw new Error('required');
  const technicalSpecSnapshot =
    kind === 'roof-tile'
      ? {
          schemaVersion: 1 as const,
          kind,
          physicalWidthMm: length('physicalWidth'),
          physicalLengthMm: length('physicalLength'),
          installationModes: [
            {
              id: 'manual-standard',
              coverWidthMm: length('coverWidth'),
              gaugeRangeMm: {
                min: length('gaugeMin'),
                max: length('gaugeMax'),
              },
              minPitchDeg: pitch,
              coursePattern: coursePattern(draft.pattern),
            },
          ],
        }
      : kind === 'modular-sheet'
        ? {
            schemaVersion: 1 as const,
            kind,
            effectiveWidthMm: length('effectiveWidth'),
            totalWidthMm: length('totalWidth'),
            lengthModel: {
              kind: 'fixed-sheet' as const,
              effectiveLengthMm: length('effectiveLength'),
              totalLengthMm: length('totalLength'),
            },
            moduleLengthMm: length('moduleLength'),
            minPitchDeg: pitch,
          }
        : {
            schemaVersion: 1 as const,
            kind,
            installationModes: [
              {
                id: 'manual-standard',
                effectiveWidthMm: length('effectiveWidth'),
                minPitchDeg: pitch,
              },
            ],
            minPanelLengthMm: length('minimumLength'),
            maxPanelLengthMm: length('maximumLength'),
            minPitchDeg: pitch,
            seamHeightMm: length('seamHeight'),
          };
  return coveringProductSelectionSchema.parse({
    displaySnapshot: { familyName: draft.name.trim() },
    technicalSpecSnapshot,
  });
}

const families: Array<{
  kind: CoveringKind;
  icon: typeof Grid3X3;
}> = [
  { kind: 'roof-tile', icon: Rows3 },
  { kind: 'modular-sheet', icon: SquareStack },
  { kind: 'standing-seam', icon: Grid3X3 },
];

export function CoveringAddAssistant({
  unit,
  onCatalog,
  onConfirm,
  onClose,
  initialKind,
}: {
  unit: LengthUnit;
  onCatalog: (kind: CoveringKind) => void;
  onConfirm: (kind: CoveringKind, product: CoveringProductSelection) => void;
  onClose?: () => void;
  initialKind?: CoveringKind;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(initialKind ? 'manual' : 'family');
  const [kind, setKind] = useState<CoveringKind | undefined>(initialKind);
  const [draft, setDraft] = useState<ManualDraft>(emptyDraft);
  const [error, setError] = useState('');
  const update = (key: keyof ManualDraft, value: string) => {
    setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const input = (
    key: keyof ManualDraft,
    label: string,
    suffix: string = unit,
  ) => (
    <label className="a-field a-covering-draft-field">
      <span>{label}</span>
      <span className="a-input-with-unit">
        <input
          data-manual-field={key}
          aria-label={label}
          inputMode="decimal"
          value={String(draft[key])}
          onChange={(event) => update(key, event.target.value)}
        />
        <small>{suffix}</small>
      </span>
    </label>
  );

  return (
    <section className="a-covering-add" data-testid="covering-add-assistant">
      <header>
        <div>
          <small>{t('assembly.coveringAdd.eyebrow')}</small>
          <h2>{t('assembly.coveringAdd.title')}</h2>
          <p>{t(`assembly.coveringAdd.stepDescription.${step}`)}</p>
        </div>
        {onClose && (
          <button className="a-button" onClick={onClose}>
            {t('assembly.coveringAdd.close')}
          </button>
        )}
      </header>
      {step === 'family' && (
        <div className="a-covering-family-grid">
          {families.map((family) => {
            const Icon = family.icon;
            return (
              <button
                key={family.kind}
                data-covering-family={family.kind}
                onClick={() => {
                  setKind(family.kind);
                  setStep('source');
                }}
              >
                <Icon size={30} />
                <strong>
                  {t(`assembly.coveringAdd.family.${family.kind}.title`)}
                </strong>
                <span>
                  {t(`assembly.coveringAdd.family.${family.kind}.description`)}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {step === 'source' && kind && (
        <div className="a-covering-source-step">
          <button className="a-covering-back" onClick={() => setStep('family')}>
            <ArrowLeft size={17} /> {t('assembly.coveringAdd.back')}
          </button>
          <strong>{t(`assembly.coveringAdd.family.${kind}.title`)}</strong>
          <div>
            <button
              className="a-covering-source-card"
              data-covering-source="catalogue"
              onClick={() => onCatalog(kind)}
            >
              <span>{t('assembly.coveringAdd.catalogBadge')}</span>
              <strong>{t('assembly.coveringAdd.catalog')}</strong>
              <small>{t('assembly.coveringAdd.catalogHint')}</small>
            </button>
            <button
              className="a-covering-source-card"
              data-covering-source="manual"
              onClick={() => setStep('manual')}
            >
              <span>{t('assembly.coveringAdd.manualBadge')}</span>
              <strong>{t('assembly.coveringAdd.manual')}</strong>
              <small>{t('assembly.coveringAdd.manualHint')}</small>
            </button>
          </div>
        </div>
      )}
      {step === 'manual' && kind && (
        <form
          className="a-covering-manual-draft"
          data-testid="manual-covering-draft"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              onConfirm(kind, buildManualProduct(kind, draft, unit));
            } catch {
              setError(t('assembly.coveringAdd.validation'));
            }
          }}
        >
          <button
            type="button"
            className="a-covering-back"
            onClick={() => setStep('source')}
          >
            <ArrowLeft size={17} /> {t('assembly.coveringAdd.back')}
          </button>
          <label className="a-field a-covering-name-field">
            <span>{t('assembly.productName')}</span>
            <input
              data-manual-field="name"
              aria-label={t('assembly.productName')}
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <div className="a-covering-draft-grid">
            {kind === 'roof-tile' && (
              <>
                {input('physicalWidth', t('assembly.physicalWidth'))}
                {input('physicalLength', t('assembly.physicalLength'))}
                {input('coverWidth', t('assembly.coverWidth'))}
                {input('gaugeMin', t('assembly.minimumGauge'))}
                {input('gaugeMax', t('assembly.maximumGauge'))}
                {input('minimumPitch', t('assembly.minimumPitch'), '°')}
                <label className="a-select-label">
                  {t('assembly.tileCoursePattern')}
                  <select
                    value={draft.pattern}
                    onChange={(event) => update('pattern', event.target.value)}
                  >
                    <option value="straight">
                      {t('assembly.patternStraight')}
                    </option>
                    <option value="staggered">
                      {t('assembly.patternStaggered')}
                    </option>
                    <option value="crown">{t('assembly.patternCrown')}</option>
                  </select>
                </label>
              </>
            )}
            {kind === 'modular-sheet' && (
              <>
                {input('effectiveWidth', t('assembly.effectiveWidth'))}
                {input('totalWidth', t('assembly.totalWidth'))}
                {input('effectiveLength', t('assembly.effectiveSheetLength'))}
                {input('totalLength', t('assembly.totalLength'))}
                {input('moduleLength', t('assembly.moduleLength'))}
                {input('minimumPitch', t('assembly.minimumPitch'), '°')}
              </>
            )}
            {kind === 'standing-seam' && (
              <>
                {input('effectiveWidth', t('assembly.effectiveWidth'))}
                {input('minimumLength', t('assembly.minimumPanelLength'))}
                {input('maximumLength', t('assembly.maximumPanelLength'))}
                {input('minimumPitch', t('assembly.minimumPitch'), '°')}
                {input('seamHeight', t('assembly.seamHeight'))}
              </>
            )}
          </div>
          <details>
            <summary>{t('assembly.coveringAdd.advanced')}</summary>
            <p>{t('assembly.coveringAdd.advancedHint')}</p>
          </details>
          {error && (
            <p className="a-covering-draft-error" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="a-button a-primary"
            data-testid="confirm-manual-covering"
          >
            <Check size={17} /> {t('assembly.coveringAdd.confirm')}
          </button>
        </form>
      )}
    </section>
  );
}
