import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  analyzeIfcRoof,
  type IfcRoofAnalysis,
  type IfcRoofCandidate,
} from '@cieslacalc/bim-import-core';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import { createDefaultProjectDocument } from '../../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
  validateProjectStart,
  type ProjectStartField,
  type ProjectStartValues,
} from '../../assembly/project-start';
import { parseDecimal } from '../../format';
import type { IfcReferenceModel } from './ifc-runtime-types';

const copy = {
  pl: {
    analyze: 'Analizuj dach',
    title: 'Parametry projektu RoofCalc',
    gable: 'Dach dwuspadowy',
    source: 'Odczytano z modelu IFC',
    defaults: 'Wartość RoofCalc — sprawdź przed utworzeniem projektu',
    user: 'Twoja wartość',
    extents:
      'IFC określa obrys dachu, który może obejmować okapy. Sprawdź proponowane wymiary budynku i wpisz okap osobno.',
    confirm: 'Sprawdziłem wymiary budynku, okap i ustawienia konstrukcji.',
    create: 'Utwórz projekt RoofCalc',
    busy: 'Tworzenie projektu…',
    summary:
      'Model IFC jest używany tylko jako źródło parametrów. Po utworzeniu projektu obliczenia wykonuje RoofCalc.',
    blocked:
      'Ten kształt dachu nie jest jeszcze wspierany. Obsługujemy tylko kompletne, regularne dachy dwuspadowe bez otworów i grubości połaci.',
    missing:
      'Nie rozpoznano jednostki długości IFC. Nie można utworzyć projektu.',
    insufficient:
      'Za mało danych geometrycznych, aby wiarygodnie rozpoznać dach. Wybierz inny dach lub utwórz projekt ręcznie.',
    failure:
      'Nie udało się zapisać projektu. Sprawdź dostępność lokalnego zapisu i spróbuj ponownie.',
    invalid: 'Sprawdź wymagane pola i dopuszczalne zakresy.',
    evidence: 'Podstawa rozpoznania',
    proof:
      'Pozioma kalenica, dwie symetryczne połacie i pełny prostokątny obrys.',
  },
  en: {
    analyze: 'Analyze roof',
    title: 'RoofCalc project parameters',
    gable: 'Gable roof',
    source: 'Read from IFC model',
    defaults: 'RoofCalc value — check before creating the project',
    user: 'Your value',
    extents:
      'IFC gives the roof outline, which may include overhangs. Check the proposed building dimensions and enter the overhang separately.',
    confirm:
      'I checked the building dimensions, overhang and construction settings.',
    create: 'Create RoofCalc project',
    busy: 'Creating project…',
    summary:
      'The IFC model is used only as a parameter source. After project creation, RoofCalc performs all calculations.',
    blocked:
      'This roof shape is not supported yet. Only complete, regular gable surfaces without openings or slab thickness are supported.',
    missing: 'The IFC length unit is unknown. A project cannot be created.',
    insufficient:
      'There is not enough geometry to identify this roof reliably. Select another roof or create a project manually.',
    failure:
      'The project could not be saved. Check local storage availability and try again.',
    invalid: 'Check required fields and allowed ranges.',
    evidence: 'Recognition evidence',
    proof:
      'Horizontal ridge, two symmetric slopes and a complete rectangular outline.',
  },
};

const fieldValues = {
  buildingLength: 'buildingLengthMm',
  buildingWidth: 'buildingWidthMm',
  pitch: 'pitchDeg',
  eave: 'eaveOverhangMm',
  spacing: 'rafterSpacingMm',
  rafterWidth: 'rafterWidthMm',
  rafterDepth: 'rafterDepthMm',
} as const;
const fields = Object.keys(fieldValues) as ProjectStartField[];

export function IfcRoofConfirmation({
  model,
  candidate,
  onCreate,
}: {
  model: IfcReferenceModel;
  candidate: IfcRoofCandidate;
  onCreate: (template: RoofTemplateSpec) => Promise<void>;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [base] = useState(() => createDefaultProjectDocument().project.roof);
  const [analysis, setAnalysis] = useState<IfcRoofAnalysis>();
  return (
    <section className="ifc-analysis" aria-label={m.title}>
      {!analysis ? (
        <button
          className="ifc-primary"
          type="button"
          onClick={() => {
            const element = model.summary.elements.find(
              (item) => item.expressId === candidate.expressId,
            );
            setAnalysis(
              analyzeIfcRoof({
                sourceRoof: candidate,
                sourceToMillimetres: model.summary.metadata.sourceToMillimetres,
                geometry: model.analysisGeometry[candidate.expressId] ?? [],
                semanticEvidence: element?.predefinedType
                  ? [element.predefinedType]
                  : [],
              }),
            );
          }}
        >
          {m.analyze}
        </button>
      ) : analysis.status !== 'supported' ? (
        <p role="alert">
          {analysis.reason === 'missing-units'
            ? m.missing
            : analysis.reason === 'insufficient-geometry'
              ? m.insufficient
              : m.blocked}
        </p>
      ) : (
        <ConfirmationForm analysis={analysis} base={base} onCreate={onCreate} />
      )}
      <span className="ifc-source-name">{candidate.name}</span>
    </section>
  );
}

function ConfirmationForm({
  analysis,
  base,
  onCreate,
}: {
  analysis: Extract<IfcRoofAnalysis, { status: 'supported' }>;
  base: RoofTemplateSpec;
  onCreate: (template: RoofTemplateSpec) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const [initial] = useState(() => ({
    ...projectStartValuesFromTemplate(base),
    ...analysis.proposed,
    // These are editable proposals, not canonical measurements. Avoid exposing
    // parser floating-point noise; the user confirms the displayed precision.
    buildingLengthMm: Number(analysis.proposed.buildingLengthMm.toFixed(1)),
    buildingWidthMm: Number(analysis.proposed.buildingWidthMm.toFixed(1)),
    pitchDeg: Number(analysis.proposed.pitchDeg.toFixed(2)),
    roofType: 'gable' as const,
  }));
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(
        fields.map((field) => [field, String(initial[fieldValues[field]])]),
      ) as Record<ProjectStartField, string>,
  );
  const [construction, setConstruction] =
    useState<Pick<ProjectStartValues, 'structureSystem' | 'ridgeConnection'>>(
      initial,
    );
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState(false);
  const numbers = Object.fromEntries(
    fields.map((field) => [field, parseDecimal(draft[field])]),
  ) as Record<ProjectStartField, number | null>;
  const issues = validateProjectStart(
    { ...numbers, roofType: 'gable' },
    fields,
  );
  let template: RoofTemplateSpec | undefined;
  if (!issues.length) {
    try {
      template = createProjectStartTemplate(
        {
          ...initial,
          ...construction,
          ...Object.fromEntries(
            fields.map((field) => [fieldValues[field], numbers[field]]),
          ),
        },
        base,
      );
    } catch {
      /* Existing canonical validation is the final gate. */
    }
  }
  function markChanged(field: string) {
    setConfirmed(false);
    setChanged((previous) => new Set([...previous, field]));
  }
  return (
    <form
      className="ifc-confirmation"
      onSubmit={(event) => {
        event.preventDefault();
        if (!template || !confirmed || submitting.current) return;
        submitting.current = true;
        setBusy(true);
        setError(false);
        void onCreate(template).catch(() => {
          setError(true);
          setBusy(false);
          submitting.current = false;
        });
      }}
    >
      <h2 tabIndex={-1}>{m.title}</h2>
      <strong>{m.gable}</strong>
      <p className="ifc-notice">{m.extents}</p>
      <fieldset disabled={busy}>
        {fields.map((field) => {
          const issue = issues.find((item) => item.field === field);
          const provenance = changed.has(field)
            ? m.user
            : ['buildingLength', 'buildingWidth', 'pitch'].includes(field)
              ? m.source
              : m.defaults;
          return (
            <label className="ifc-field" key={field}>
              <span>
                {t(`assembly.creator.field.${field}`)} (
                {field === 'pitch' ? '°' : 'mm'})
              </span>
              <input
                inputMode="decimal"
                type="text"
                value={draft[field]}
                data-testid={`ifc-${field}`}
                aria-invalid={!!issue}
                aria-describedby={`ifc-help-${field}`}
                onChange={(event) => {
                  setDraft({ ...draft, [field]: event.target.value });
                  markChanged(field);
                }}
              />
              <small id={`ifc-help-${field}`}>
                {issue
                  ? t(`assembly.creator.issue.${issue.code}`, {
                      min: issue.min,
                      max: issue.max,
                      unit: field === 'pitch' ? '°' : 'mm',
                    })
                  : provenance}
              </small>
            </label>
          );
        })}
        <label className="ifc-field">
          <span>{t('assembly.creator.field.structure')}</span>
          <select
            value={construction.structureSystem}
            onChange={(event) => {
              setConstruction({
                ...construction,
                structureSystem: event.target
                  .value as ProjectStartValues['structureSystem'],
              });
              markChanged('structure');
            }}
          >
            <option value="rafter">{t('assembly.rafterSystem')}</option>
            <option value="rafter-collar-tie">
              {t('assembly.rafterCollarTieSystem')}
            </option>
          </select>
          <small>{changed.has('structure') ? m.user : m.defaults}</small>
        </label>
        <label className="ifc-field">
          <span>{t('assembly.ridgeConnection')}</span>
          <select
            value={construction.ridgeConnection}
            onChange={(event) => {
              setConstruction({
                ...construction,
                ridgeConnection: event.target
                  .value as ProjectStartValues['ridgeConnection'],
              });
              markChanged('ridge');
            }}
          >
            {(['ridge-board', 'direct-meeting', 'half-lap'] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {t(
                    `assembly.${{ 'ridge-board': 'ridgeBoardConnection', 'direct-meeting': 'directMeetingConnection', 'half-lap': 'halfLapConnection' }[value]}`,
                  )}
                </option>
              ),
            )}
          </select>
          <small>{changed.has('ridge') ? m.user : m.defaults}</small>
        </label>
        {construction.ridgeConnection === 'half-lap' && (
          <p role="note">{t('assembly.halfLapUnresolvedNote')}</p>
        )}
        <details>
          <summary>{m.evidence}</summary>
          <p>{m.proof}</p>
        </details>
        <p>{m.summary}</p>
        <label className="ifc-check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          {m.confirm}
        </label>
        {!template && <p role="status">{m.invalid}</p>}
        {error && <p role="alert">{m.failure}</p>}
        <button
          className="ifc-primary"
          type="submit"
          disabled={!template || !confirmed || busy}
        >
          {busy ? m.busy : m.create}
        </button>
      </fieldset>
    </form>
  );
}
