import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, Printer, RotateCcw, Trash2, X } from 'lucide-react';
import {
  resolveMonoPitchRoofSystem,
  type MonoPitchRoofSystem,
} from '@cieslacalc/calculator-core';
import { datumDisplayLabel } from '@cieslacalc/drawing-engine';
import { createRoofMemberSchedule } from '@cieslacalc/quantity-core';
import {
  fromMillimetres,
  toMillimetres,
  type LengthUnit,
} from '@cieslacalc/roof-math';
import { formatLength, formatNumber, parseDecimal } from '../format';
import {
  defaultMonoPitchDraft,
  loadMonoPitchDraft,
  MONO_PITCH_ANGLE_FIELDS,
  MONO_PITCH_MAX_PURLINS,
  MONO_PITCH_PURLIN_FIELDS,
  monoPitchDraftIssues,
  monoPitchSystemInput,
  newMonoPitchPurlin,
  purlinFieldKey,
  resolveDraftPitch,
  saveMonoPitchDraft,
  type MonoPitchDraft,
  type MonoPitchFieldIssue,
  type MonoPitchImportOrigin,
  type MonoPitchInputKey,
  type MonoPitchNumberField,
} from './mono-pitch-draft';
import { MonoPitchSection } from './MonoPitchSection';
import type { Scene3DController } from '../assembly/scene3d/TechnicalScene3D';
import { initialWorkbenchViewState } from '../assembly/workbench';
import './mono-pitch.css';

type Field = MonoPitchNumberField;

/** The same Three.js view as the workbench, loaded only when opened. */
const TechnicalScene3D = lazy(() =>
  import('../assembly/scene3d/TechnicalScene3D').then((module) => ({
    default: module.TechnicalScene3D,
  })),
);
type LayerToggle =
  'battensEnabled' | 'counterBattensEnabled' | 'membraneEnabled';

const GROUPS: { key: string; fields: readonly Field[] }[] = [
  // The pitch follows them: typed, or from the plate tops (pitchInputs).
  { key: 'building', fields: ['buildingLengthMm', 'runMm'] },
  {
    key: 'rafters',
    fields: ['rafterWidthMm', 'rafterDepthMm', 'rafterSpacingMm'],
  },
  {
    key: 'supports',
    fields: [
      'lowPlateWidthMm',
      'lowPlateHeightMm',
      'lowSeatMm',
      'highSupportWidthMm',
      'highSupportHeightMm',
      'highSeatMm',
    ],
  },
];
const LAYERS: { toggle: LayerToggle; key: string; fields: readonly Field[] }[] =
  [
    {
      toggle: 'battensEnabled',
      key: 'battens',
      fields: [
        'battenGaugeMm',
        'battenEaveOffsetMm',
        'battenWidthMm',
        'battenHeightMm',
      ],
    },
    {
      toggle: 'counterBattensEnabled',
      key: 'counterBattens',
      fields: ['counterBattenWidthMm', 'counterBattenHeightMm'],
    },
    {
      toggle: 'membraneEnabled',
      key: 'membrane',
      fields: [
        'membraneRollWidthMm',
        'membraneRollLengthMm',
        'membraneOverlapMm',
      ],
    },
  ];

/**
 * VNext-7B-3: the mono-pitch roof as a working calculation — every number
 * comes from `resolveMonoPitchRoofSystem` (the shared rafter solver, batten,
 * counter-batten, membrane engines) and the generic timber schedule. Inputs
 * are exact; nothing is saved as a project yet (ADR-015 V2 writer gate).
 */
export function MonoPitchWorkspace({
  unit,
  initial,
  onClose,
}: {
  unit: LengthUnit;
  /** VNext-7C: a reviewed document import replaces the remembered draft. */
  initial?: { draft: MonoPitchDraft; origin: MonoPitchImportOrigin };
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [draft, setDraft] = useState<MonoPitchDraft>(() =>
    initial ? { ...initial.draft } : loadMonoPitchDraft(),
  );
  const [origin, setOrigin] = useState(initial?.origin);
  /** Fields still holding the document's value (an edit makes them the user's). */
  const [fromDocument, setFromDocument] = useState<ReadonlySet<Field>>(
    () => new Set(initial?.origin.fields),
  );
  const [texts, setTexts] = useState<
    Partial<Record<MonoPitchInputKey, string>>
  >({});
  const [unparsable, setUnparsable] = useState<ReadonlySet<MonoPitchInputKey>>(
    new Set(),
  );
  useEffect(() => saveMonoPitchDraft(draft), [draft]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  const issues = useMemo(() => monoPitchDraftIssues(draft), [draft]);
  const lastValid = useRef<MonoPitchRoofSystem | undefined>(undefined);
  const system = useMemo(() => {
    if (Object.keys(issues).length) return lastValid.current;
    try {
      return resolveMonoPitchRoofSystem(monoPitchSystemInput(draft));
    } catch {
      return lastValid.current;
    }
  }, [draft, issues]);
  if (system) lastValid.current = system;
  const schedule = useMemo(
    () =>
      system
        ? createRoofMemberSchedule({ skeleton: system.skeleton })
        : undefined,
    [system],
  );
  const invalid = Object.keys(issues).length > 0 || unparsable.size > 0;

  const length = (mm: number) => formatLength(mm, unit, locale);
  const angle = (deg: number) => formatNumber(deg, locale, 1);
  const highSupport = t(
    `assembly.monoPitch.highSupport.${draft.topEdge === 'abutment' ? 'ledger' : 'wall-plate'}`,
  );
  const issueText = (key: MonoPitchInputKey): string | undefined => {
    if (unparsable.has(key)) return t('assembly.errors.invalid');
    const issue: MonoPitchFieldIssue | undefined = issues[key];
    return issue ? t(`assembly.monoPitch.issues.${issue}`) : undefined;
  };
  /**
   * One exact numeric input: lengths in the display unit (stored in mm),
   * angles in degrees; the typed text is kept while it cannot be parsed.
   */
  const numberInput = ({
    key,
    label,
    value,
    angleField = false,
    apply,
  }: {
    key: MonoPitchInputKey;
    label: string;
    value: number;
    angleField?: boolean;
    apply: (value: number) => void;
  }) => {
    const id = `mono-pitch.${key}`;
    const error = issueText(key);
    const documented = fromDocument.has(key as Field);
    return (
      <label
        className="mono-field"
        htmlFor={id}
        key={key}
        data-source={documented ? 'document' : undefined}
      >
        <span>
          {label}
          {documented && (
            <em className="mono-from-document">
              {t('assembly.monoPitch.import.badge')}
            </em>
          )}
        </span>
        <div>
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={
              texts[key] ??
              (angleField
                ? String(Number(value.toFixed(4)))
                : String(fromMillimetres(value, unit)))
            }
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              const raw = event.target.value;
              setTexts((current) => ({ ...current, [key]: raw }));
              const parsed = parseDecimal(raw);
              setUnparsable((current) => {
                const next = new Set(current);
                if (parsed === null) next.add(key);
                else next.delete(key);
                return next;
              });
              if (parsed !== null)
                apply(angleField ? parsed : toMillimetres(parsed, unit));
            }}
            onBlur={() =>
              setTexts((current) => {
                if (unparsable.has(key)) return current;
                const next = { ...current };
                delete next[key];
                return next;
              })
            }
          />
          <small>{angleField ? '°' : unit}</small>
        </div>
        {error && (
          <small className="mono-error" id={`${id}-error`} role="alert">
            {error}
          </small>
        )}
      </label>
    );
  };
  const input = (field: Field) =>
    numberInput({
      key: field,
      label: t(`assembly.monoPitch.fields.${field}`),
      value: draft[field],
      angleField: MONO_PITCH_ANGLE_FIELDS.has(field),
      apply: (value) => {
        setDraft((current) => ({ ...current, [field]: value }));
        setFromDocument((current) => {
          if (!current.has(field)) return current;
          const next = new Set(current);
          next.delete(field);
          return next;
        });
      },
    });
  const pitch = resolveDraftPitch(draft);
  /** Switching keeps the same roof: the tops start where the pitch puts them. */
  const setPitchSource = (source: MonoPitchDraft['pitchSource']) =>
    setDraft((current) => {
      if (current.pitchSource === source) return current;
      if (source === 'angle') {
        const resolved = resolveDraftPitch(current);
        return {
          ...current,
          pitchSource: source,
          ...('pitchDeg' in resolved
            ? { pitchDeg: Number(resolved.pitchDeg.toFixed(2)) }
            : {}),
        };
      }
      const difference = system?.framing.plates.differenceMm;
      return {
        ...current,
        pitchSource: source,
        ...(difference !== undefined
          ? {
              highPlateTopMm: Math.round(current.lowPlateTopMm + difference),
            }
          : {}),
      };
    });
  const pitchInputs = (
    <>
      <div
        className="mono-choice"
        role="radiogroup"
        aria-label={t('assembly.monoPitch.pitchSource.label')}
      >
        <span>{t('assembly.monoPitch.pitchSource.label')}</span>
        {(['angle', 'plate-tops'] as const).map((source) => (
          <label key={source}>
            <input
              type="radio"
              name="mono-pitch-pitch-source"
              value={source}
              data-testid={`mono-pitch-source-${source}`}
              checked={draft.pitchSource === source}
              onChange={() => setPitchSource(source)}
            />
            {t(`assembly.monoPitch.pitchSource.${source}`)}
          </label>
        ))}
      </div>
      {draft.pitchSource === 'angle' ? (
        input('pitchDeg')
      ) : (
        <>
          {input('lowPlateTopMm')}
          {input('highPlateTopMm')}
          <p className="mono-derived" data-testid="mono-pitch-derived-pitch">
            {'pitchDeg' in pitch && (
              <strong>
                {t('assembly.monoPitch.pitchSource.derived', {
                  angle: formatNumber(pitch.pitchDeg, locale, 2),
                })}
              </strong>
            )}
            <small>{t('assembly.monoPitch.pitchSource.hint')}</small>
          </p>
        </>
      )}
    </>
  );
  const setPurlins = (
    update: (purlins: MonoPitchDraft['purlins']) => MonoPitchDraft['purlins'],
  ) => {
    setDraft((current) => ({ ...current, purlins: update(current.purlins) }));
    // Texts are keyed by position in the list: start fresh after a change.
    setTexts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.startsWith('purlins.')),
      ),
    );
    setUnparsable(
      (current) =>
        new Set([...current].filter((key) => !key.startsWith('purlins.'))),
    );
  };
  const purlinInputs = (
    <div className="mono-purlins" data-testid="mono-pitch-purlins">
      {draft.purlins.map((purlin, index) => (
        <div
          className="mono-purlin"
          key={index}
          data-testid={`mono-pitch-purlin-${index}`}
        >
          <div className="mono-purlin-head">
            <strong>
              {t('assembly.monoPitch.purlin.heading', { n: index + 1 })}
            </strong>
            <button
              type="button"
              className="mono-icon"
              aria-label={t('assembly.monoPitch.purlin.remove', {
                n: index + 1,
              })}
              title={t('assembly.monoPitch.purlin.remove', { n: index + 1 })}
              onClick={() =>
                setPurlins((purlins) => purlins.filter((_, i) => i !== index))
              }
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
          {MONO_PITCH_PURLIN_FIELDS.map((field) =>
            numberInput({
              key: purlinFieldKey(index, field),
              label: t(`assembly.monoPitch.purlin.${field}`),
              value: purlin[field],
              apply: (value) =>
                setDraft((current) => ({
                  ...current,
                  purlins: current.purlins.map((item, i) =>
                    i === index ? { ...item, [field]: value } : item,
                  ),
                })),
            }),
          )}
        </div>
      ))}
      {draft.purlins.length < MONO_PITCH_MAX_PURLINS && (
        <button
          type="button"
          className="a-button"
          data-testid="mono-pitch-add-purlin"
          onClick={() =>
            setPurlins((purlins) => [...purlins, newMonoPitchPurlin(draft)])
          }
        >
          <Plus size={16} aria-hidden="true" />
          {t('assembly.monoPitch.purlin.add')}
        </button>
      )}
      <small>{t('assembly.monoPitch.purlin.hint')}</small>
    </div>
  );

  return createPortal(
    <div
      className="mono-layer"
      role="dialog"
      aria-modal="true"
      aria-label={t('assembly.monoPitch.title')}
      data-testid="mono-pitch-workspace"
    >
      <section className="mono-workspace">
        <header className="mono-header">
          <div>
            <h2>{t('assembly.monoPitch.title')}</h2>
            <p>{t('assembly.monoPitch.subtitle')}</p>
          </div>
          <div className="mono-header-actions">
            <button
              type="button"
              className="a-button"
              data-testid="mono-pitch-restore"
              onClick={() => {
                setDraft({ ...defaultMonoPitchDraft });
                setTexts({});
                setUnparsable(new Set());
                setOrigin(undefined);
                setFromDocument(new Set());
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {t('assembly.monoPitch.restore')}
            </button>
            <button
              type="button"
              className="a-button"
              data-testid="mono-pitch-print"
              onClick={() => window.print()}
            >
              <Printer size={16} aria-hidden="true" />
              {t('assembly.monoPitch.print')}
            </button>
            <button
              type="button"
              className="mono-icon"
              aria-label={t('assembly.monoPitch.close')}
              title={t('assembly.monoPitch.close')}
              onClick={onClose}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>
        <p className="mono-draft-note">{t('assembly.monoPitch.draftNote')}</p>
        {origin && (
          <div
            className="mono-import-note"
            role="status"
            data-testid="mono-pitch-import-note"
          >
            <FileText size={18} aria-hidden="true" />
            <div>
              <strong>
                {t('assembly.monoPitch.import.heading', {
                  file: origin.fileName,
                })}
              </strong>
              <p>
                {t('assembly.monoPitch.import.note', {
                  fields: origin.fields
                    .map((field) =>
                      t(`assembly.monoPitch.fields.${field}`).toLowerCase(),
                    )
                    .join(', '),
                })}
              </p>
            </div>
            <button
              type="button"
              className="mono-icon"
              aria-label={t('assembly.monoPitch.import.dismiss')}
              title={t('assembly.monoPitch.import.dismiss')}
              onClick={() => setOrigin(undefined)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
        {system && (
          // Phones: the key numbers stay in view while the inputs scroll; the
          // full result (same values) follows the form.
          <div
            className="mono-key"
            aria-hidden="true"
            data-testid="mono-pitch-key"
          >
            <span>
              <small>{t('assembly.monoPitch.results.rafters')}</small>
              <strong>
                {system.framing.rafterSpacing.stationCount} ×{' '}
                {length(system.framing.calculation.plan.minimumStockLengthMm)}{' '}
                {unit}
              </strong>
            </span>
            <span>
              <small>{t('assembly.monoPitch.results.plates')}</small>
              <strong>
                {length(system.framing.plates.differenceMm)} {unit}
              </strong>
            </span>
          </div>
        )}
        <div className="mono-body">
          <form
            className="mono-inputs"
            onSubmit={(event) => event.preventDefault()}
            data-testid="mono-pitch-inputs"
          >
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.building')}</legend>
              {GROUPS[0]!.fields.map(input)}
              {pitchInputs}
            </fieldset>
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.eaves')}</legend>
              {input('lowEaveOverhangMm')}
              <div
                className="mono-choice"
                role="radiogroup"
                aria-label={t('assembly.monoPitch.topEdge.label')}
              >
                <span>{t('assembly.monoPitch.topEdge.label')}</span>
                {(['free', 'abutment'] as const).map((edge) => (
                  <label key={edge}>
                    <input
                      type="radio"
                      name="mono-pitch-top-edge"
                      value={edge}
                      data-testid={`mono-pitch-top-${edge}`}
                      checked={draft.topEdge === edge}
                      onChange={() =>
                        setDraft((current) => ({ ...current, topEdge: edge }))
                      }
                    />
                    {t(`assembly.monoPitch.topEdge.${edge}`)}
                  </label>
                ))}
              </div>
              {draft.topEdge === 'free' && input('highOverhangMm')}
              {input('vergeOverhangMm')}
            </fieldset>
            {GROUPS.slice(1).map((group) => (
              <fieldset key={group.key}>
                <legend>
                  {t(`assembly.monoPitch.groups.${group.key}`)}
                  {group.key === 'supports' ? ` · ${highSupport}` : ''}
                </legend>
                {group.fields.map(input)}
                {group.key === 'supports' && purlinInputs}
              </fieldset>
            ))}
            <fieldset>
              <legend>{t('assembly.monoPitch.groups.layers')}</legend>
              {LAYERS.map((layer) => (
                <div className="mono-layer-group" key={layer.key}>
                  <label className="mono-toggle">
                    <input
                      type="checkbox"
                      data-testid={`mono-pitch-layer-${layer.key}`}
                      checked={draft[layer.toggle]}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [layer.toggle]: event.target.checked,
                        }))
                      }
                    />
                    {t(`assembly.monoPitch.layers.${layer.key}`)}
                  </label>
                  {draft[layer.toggle] && layer.fields.map(input)}
                </div>
              ))}
            </fieldset>
          </form>

          <div className="mono-results" aria-live="polite">
            <MonoPitchPrintInputs draft={draft} unit={unit} />
            {invalid && (
              <p
                className="mono-invalid"
                role="status"
                data-testid="mono-pitch-invalid"
              >
                {t('assembly.monoPitch.invalidResult')}
              </p>
            )}
            {system && schedule && (
              <MonoPitchResults
                draft={draft}
                system={system}
                schedule={schedule}
                unit={unit}
                highSupport={highSupport}
                length={length}
                angle={angle}
              />
            )}
            <section className="mono-limits">
              <h3>{t('assembly.monoPitch.limits.heading')}</h3>
              <p>{t('assembly.monoPitch.limits.text')}</p>
            </section>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function MonoPitchView({
  system,
  unit,
}: {
  system: MonoPitchRoofSystem;
  unit: LengthUnit;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<'section' | '3d'>('section');
  // A local selection: the 3D view must not select anything in the open
  // project, which this roof is not part of (Scene3DController).
  const [selected, setSelected] = useState<{
    id: string;
    prototypeId?: string;
  }>({ id: 'roof' });
  const [isolate, setIsolate] = useState(false);
  const controller = useMemo<Scene3DController>(
    () => ({
      view: {
        ...initialWorkbenchViewState,
        selectedId: selected.id,
        selectedPrototypeId: selected.prototypeId,
        isolateSelection: isolate,
      },
      unit,
      select: (id, prototypeId) => setSelected({ id, prototypeId }),
      clear: () => {
        setSelected({ id: 'roof' });
        setIsolate(false);
      },
      setIsolation: setIsolate,
    }),
    [isolate, selected, unit],
  );
  const counterBattens = useMemo(
    () =>
      (system.counterBattens?.rows ?? []).map((row) => ({
        rowId: row.id,
        roofPlaneId: row.roofPlaneId,
        sourceMemberId: row.sourceMemberId,
        section: row.section,
        segments: row.segments.map(({ from, to }) => ({ from, to })),
      })),
    [system.counterBattens],
  );
  return (
    <section className="mono-view">
      <div
        className="mono-view-switch"
        role="group"
        aria-label={t('assembly.monoPitch.view.label')}
      >
        <button
          type="button"
          aria-pressed={view === 'section'}
          onClick={() => setView('section')}
        >
          {t('assembly.monoPitch.view.section')}
        </button>
        <button
          type="button"
          aria-pressed={view === '3d'}
          data-testid="mono-pitch-view-3d"
          onClick={() => setView('3d')}
        >
          {t('assembly.monoPitch.view.threeD')}
        </button>
      </div>
      {view === 'section' ? (
        <MonoPitchSection
          assembly={system.framing.calculation.assembly}
          unit={unit}
        />
      ) : (
        <>
          <div className="mono-print-only">
            <MonoPitchSection
              assembly={system.framing.calculation.assembly}
              unit={unit}
            />
          </div>
          <div className="mono-scene" data-testid="mono-pitch-scene">
            <Suspense fallback={<div className="a-loading-panel" />}>
              <TechnicalScene3D
                skeleton={system.skeleton}
                counterBattens={counterBattens}
                controller={controller}
                onReturnTo2D={() => setView('section')}
              />
            </Suspense>
          </div>
        </>
      )}
    </section>
  );
}

function MonoPitchResults({
  draft,
  system,
  schedule,
  unit,
  highSupport,
  length,
  angle,
}: {
  draft: MonoPitchDraft;
  system: MonoPitchRoofSystem;
  schedule: ReturnType<typeof createRoofMemberSchedule>;
  unit: LengthUnit;
  highSupport: string;
  length: (mm: number) => string;
  angle: (deg: number) => string;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { framing } = system;
  const { assembly, plan } = framing.calculation;
  const notches = assembly.joints.map((joint, index) => ({
    joint,
    label:
      index === 0
        ? t('assembly.monoPitch.cuts.lowNotch')
        : index === assembly.joints.length - 1
          ? t('assembly.monoPitch.cuts.highNotch', { support: highSupport })
          : t('assembly.monoPitch.cuts.purlinNotch', { n: index }),
  }));
  const eaveCut = assembly.endCuts.find((cut) => cut.end === 'eave')!;
  const topCut = assembly.endCuts.find((cut) => cut.end === 'top')!;
  const [plane] = framing.surface.planes;
  const section = (widthMm: number, depthMm: number) =>
    `${length(widthMm)} × ${length(depthMm)} ${unit}`;
  const labels = new Map(
    plan.datums.map((datum, index) => [datum.id, datumDisplayLabel(index)]),
  );
  const rows = schedule.timberRows;
  const rafterRow = rows.find((row) => row.memberKind === 'rafter');
  const plateRow = (prototypeId: string) =>
    rows.find((row) => row.prototypeId === prototypeId);
  const lowPlate = plateRow(framing.supportIds.low);
  const highPlate = plateRow(framing.supportIds.high);
  const metres = (mm: number) => formatNumber(mm / 1000, locale, 2);
  const squareMetres = (mm2: number) => formatNumber(mm2 / 1e6, locale, 2);
  const card = (
    testId: string,
    label: string,
    value: string,
    note?: string,
  ) => (
    <div className="mono-card" data-testid={`mono-pitch-result-${testId}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
  return (
    <>
      <section className="mono-summary">
        <h3>{t('assembly.monoPitch.results.heading')}</h3>
        <div className="mono-cards">
          {card(
            'rafters',
            t('assembly.monoPitch.results.rafters'),
            t('assembly.monoPitch.results.rafterCount', {
              count: framing.rafterSpacing.stationCount,
              spacing: length(framing.rafterSpacing.actualSpacingMm),
              unit,
            }),
          )}
          {card(
            'stock',
            t('assembly.monoPitch.results.stock'),
            `${length(plan.minimumStockLengthMm)} ${unit}`,
            t('assembly.monoPitch.results.stockNote'),
          )}
          {card(
            'top-edge',
            t('assembly.monoPitch.results.topEdge'),
            `${length(assembly.member.referenceLengthMm)} ${unit}`,
          )}
          {card(
            'plates',
            t('assembly.monoPitch.results.plates'),
            `${length(framing.plates.differenceMm)} ${unit}`,
            t('assembly.monoPitch.results.platesNote', {
              support: highSupport,
            }),
          )}
          {card(
            'rise',
            t('assembly.monoPitch.results.rise'),
            `${length(framing.surface.riseMm)} ${unit}`,
          )}
          {card(
            'area',
            t('assembly.monoPitch.results.area'),
            t('assembly.monoPitch.results.areaValue', {
              area: squareMetres(plane.grossAreaMm2),
              plan: squareMetres(plane.planAreaMm2),
            }),
          )}
        </div>
      </section>

      <MonoPitchView system={system} unit={unit} />

      <section className="mono-cuts" data-testid="mono-pitch-cuts">
        <h3>{t('assembly.monoPitch.cuts.heading')}</h3>
        <dl>
          <div>
            <dt>{t('assembly.monoPitch.cuts.eave')}</dt>
            <dd>
              {t('assembly.monoPitch.cuts.plumb', {
                angle: angle(eaveCut.angleToMemberDeg),
              })}
            </dd>
          </div>
          {notches.map(({ joint, label }) => (
            <div key={joint.id}>
              <dt>{label}</dt>
              <dd>
                {t('assembly.monoPitch.cuts.notch', {
                  seat: length(joint.seatLengthMm),
                  depth: length(joint.normalDepthMm),
                  remaining: length(joint.remainingDepthMm),
                  unit,
                })}
                <br />
                {t('assembly.monoPitch.cuts.station', {
                  distance: length(joint.stationMm),
                  unit,
                })}
              </dd>
            </div>
          ))}
          <div>
            <dt>{t('assembly.monoPitch.cuts.top')}</dt>
            <dd>
              {t('assembly.monoPitch.cuts.plumb', {
                angle: angle(topCut.angleToMemberDeg),
              })}
              <br />
              {t('assembly.monoPitch.cuts.station', {
                distance: length(topCut.stationMm),
                unit,
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mono-marking" data-testid="mono-pitch-marking">
        <h3>{t('assembly.monoPitch.marking.heading')}</h3>
        <p>{t('assembly.monoPitch.marking.note')}</p>
        <ol>
          {plan.steps.map((step) => (
            <li key={`${step.operationId}/${step.action}`}>
              {step.action === 'check-depth'
                ? t('assembly.checkDepth', {
                    depth: length(step.normalDepthMm),
                    remaining: length(step.remainingDepthMm),
                    unit,
                  })
                : t(
                    step.action === 'mark-plumb'
                      ? 'assembly.markPlumb'
                      : 'assembly.markSeat',
                    {
                      from: labels.get(step.from),
                      to: labels.get(step.target),
                      distance: length(step.distanceMm),
                      seat:
                        step.seatLengthMm === undefined
                          ? ''
                          : length(step.seatLengthMm),
                      angle: angle(step.angleDeg),
                      unit,
                    },
                  )}
            </li>
          ))}
        </ol>
      </section>

      <section className="mono-list" data-testid="mono-pitch-list">
        <h3>{t('assembly.monoPitch.list.heading')}</h3>
        <p>{t('assembly.monoPitch.list.note')}</p>
        <table>
          <tbody>
            {rafterRow && (
              <tr data-row="rafter">
                <th scope="row">
                  {t('assembly.monoPitch.list.rafter', {
                    section: section(
                      rafterRow.section.widthMm ?? 0,
                      rafterRow.section.depthMm ?? 0,
                    ),
                  })}
                </th>
                <td>
                  {t('assembly.monoPitch.list.pieces', {
                    count: rafterRow.quantity,
                    length: length(rafterRow.lengthMm),
                    unit,
                  })}
                </td>
              </tr>
            )}
            {(
              [
                ['low-plate', lowPlate, 'assembly.monoPitch.list.lowPlate'],
                [
                  'high-support',
                  highPlate,
                  'assembly.monoPitch.list.highSupport',
                ],
              ] as const
            ).map(([key, row, labelKey]) =>
              row ? (
                <tr key={key} data-row={key}>
                  <th scope="row">
                    {t(labelKey, {
                      support: highSupport,
                      section: section(
                        row.section.widthMm ?? 0,
                        row.section.depthMm ?? 0,
                      ),
                    })}
                  </th>
                  <td>
                    {t('assembly.monoPitch.list.pieces', {
                      count: row.quantity,
                      length: length(row.lengthMm),
                      unit,
                    })}
                  </td>
                </tr>
              ) : null,
            )}
            {rows
              .filter((row) => row.memberKind === 'purlin')
              .map((row) => (
                <tr key={row.id} data-row="purlin">
                  <th scope="row">
                    {t('assembly.monoPitch.list.purlin', {
                      code: row.familyKey,
                      section: section(
                        row.section.widthMm ?? 0,
                        row.section.depthMm ?? 0,
                      ),
                    })}
                  </th>
                  <td>
                    {t('assembly.monoPitch.list.pieces', {
                      count: row.quantity,
                      length: length(row.lengthMm),
                      unit,
                    })}
                  </td>
                </tr>
              ))}
            {system.battens && (
              <tr data-row="battens">
                <th scope="row">
                  {t('assembly.monoPitch.list.battens', {
                    section: section(draft.battenWidthMm, draft.battenHeightMm),
                  })}
                </th>
                <td>
                  {system.battens.status === 'resolved'
                    ? t('assembly.monoPitch.list.length', {
                        length: metres(system.battens.totalLengthMm),
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
            {system.counterBattens && (
              <tr data-row="counter-battens">
                <th scope="row">
                  {t('assembly.monoPitch.list.counterBattens', {
                    section: section(
                      draft.counterBattenWidthMm,
                      draft.counterBattenHeightMm,
                    ),
                  })}
                </th>
                <td>
                  {system.counterBattens.status === 'resolved'
                    ? t('assembly.monoPitch.list.length', {
                        length: metres(
                          system.counterBattens.totalVisibleLengthMm,
                        ),
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
            {system.membrane && (
              <tr data-row="membrane">
                <th scope="row">{t('assembly.monoPitch.list.membrane')}</th>
                <td>
                  {system.membrane.status === 'resolved'
                    ? t('assembly.monoPitch.list.membraneValue', {
                        area: squareMetres(system.membrane.grossAreaMm2),
                        courses: system.membrane.courseCount,
                        rolls: system.membrane.rollCount,
                      })
                    : t('assembly.monoPitch.list.unresolved')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** Print only: the inputs as a compact table (the form is not printed). */
function MonoPitchPrintInputs({
  draft,
  unit,
}: {
  draft: MonoPitchDraft;
  unit: LengthUnit;
}) {
  const { t, i18n } = useTranslation();
  const pitch = resolveDraftPitch(draft);
  const value = (field: Field) =>
    field === 'pitchDeg' && 'pitchDeg' in pitch
      ? `${formatNumber(pitch.pitchDeg, i18n.language, 2)}°`
      : MONO_PITCH_ANGLE_FIELDS.has(field)
        ? `${formatNumber(draft[field], i18n.language, 2)}°`
        : `${formatLength(draft[field], unit, i18n.language)} ${unit}`;
  const fields: Field[] = [
    'buildingLengthMm',
    'runMm',
    ...(draft.pitchSource === 'plate-tops'
      ? (['lowPlateTopMm', 'highPlateTopMm'] as const)
      : []),
    'pitchDeg',
    'lowEaveOverhangMm',
    ...(draft.topEdge === 'free' ? (['highOverhangMm'] as const) : []),
    'vergeOverhangMm',
    'rafterWidthMm',
    'rafterDepthMm',
    'rafterSpacingMm',
    'lowPlateWidthMm',
    'lowPlateHeightMm',
    'lowSeatMm',
    'highSupportWidthMm',
    'highSupportHeightMm',
    'highSeatMm',
  ];
  return (
    <section className="mono-print-only mono-print-inputs">
      <p className="mono-print-header">
        <strong>RoofCalc · {t('assembly.monoPitch.title')}</strong>
        <span>
          {t('assembly.monoPitch.printDate', {
            date: new Date().toLocaleDateString(i18n.language),
          })}
        </span>
      </p>
      <h3>{t('assembly.monoPitch.printInputs')}</h3>
      <dl>
        {fields.map((field) => (
          <div key={field}>
            <dt>{t(`assembly.monoPitch.fields.${field}`)}</dt>
            <dd>{value(field)}</dd>
          </div>
        ))}
        <div>
          <dt>{t('assembly.monoPitch.topEdge.label')}</dt>
          <dd>{t(`assembly.monoPitch.topEdge.${draft.topEdge}`)}</dd>
        </div>
        {draft.purlins.map((purlin, index) => (
          <div key={index}>
            <dt>{t('assembly.monoPitch.purlin.heading', { n: index + 1 })}</dt>
            <dd>
              {t('assembly.monoPitch.purlin.printValue', {
                position: formatLength(purlin.positionMm, unit, i18n.language),
                width: formatLength(purlin.widthMm, unit, i18n.language),
                height: formatLength(purlin.heightMm, unit, i18n.language),
                seat: formatLength(purlin.seatMm, unit, i18n.language),
                unit,
              })}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
