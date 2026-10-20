import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUp, X } from 'lucide-react';
import {
  analyzeCadRoofPlan,
  readDxf,
  type CadLengthUnit,
  type CadPlanAnalysis,
  type CadRectangle,
  type DxfDocument,
  type Vec2,
} from '@cieslacalc/bim-import-core';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
  validateProjectStart,
  type ProjectStartField,
} from '../../assembly/project-start';
import { createDefaultProjectDocument, useAssembly } from '../../assembly/store';
import { formatLength, formatNumber, parseDecimal } from '../../format';
import { classifyProjectFile } from '../../import/file-kind';
import { cadCopy, type CadCopy } from './cad-copy';
import './cad-import.css';

type Supported = Extract<CadPlanAnalysis, { status: 'supported' }>;

/**
 * VNext-4 CAD plan import: a DXF file → a reviewed RoofCalc project start.
 * Reads on the device, shows what was recognised on the drawing itself and
 * asks only what the drawing cannot tell (unit, outline meaning, pitch).
 * The project is created by the ordinary project-start path.
 */
export function CadImportWorkspace({
  initialFile,
  onClose,
  onCreate,
  onOpenIfc,
}: {
  initialFile?: File;
  onClose: () => void;
  onCreate: (template: RoofTemplateSpec, name: string) => Promise<void>;
  /** An IFC model dropped here goes to the IFC importer. */
  onOpenIfc?: (file: File) => void;
}) {
  const { i18n } = useTranslation();
  const c = cadCopy(i18n.language);
  const [document, setDocument] = useState<DxfDocument>();
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [unit, setUnit] = useState<CadLengthUnit>();
  const [outlineIndex, setOutlineIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  async function load(file: File) {
    setError('');
    setDocument(undefined);
    setUnit(undefined);
    setOutlineIndex(0);
    setReading(true);
    try {
      const kind = await classifyProjectFile(file);
      if (kind.status === 'accepted' && kind.kind === 'ifc' && onOpenIfc) {
        onOpenIfc(file);
        return;
      }
      if (kind.status === 'rejected') {
        setError(c.errors[kind.reason] ?? c.errors.read!);
        return;
      }
      if (kind.kind !== 'dxf') {
        setError(c.errors['not-dxf']!);
        return;
      }
      const result = readDxf(await file.text());
      if (result.status === 'rejected') {
        setError(c.errors[result.reason] ?? c.errors.read!);
        return;
      }
      setFileName(file.name.replace(/\.[^.]+$/, '') || file.name);
      setDocument(result.document);
    } catch {
      setError(c.errors.read!);
    } finally {
      setReading(false);
    }
  }

  useEffect(() => {
    if (!initialFile || started.current) return;
    started.current = true;
    void load(initialFile);
    // Load once, for the file the dialog was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  const analysis = useMemo(
    () =>
      document
        ? analyzeCadRoofPlan(document, {
            ...(unit ? { unit } : {}),
            outlineIndex,
          })
        : undefined,
    [document, outlineIndex, unit],
  );
  const failure =
    analysis?.status === 'unsupported' &&
    analysis.reason === 'no-rectangular-outline'
      ? c.errors['no-rectangular-outline']
      : '';

  return (
    <div
      className="cad-layer"
      role="dialog"
      aria-modal="true"
      aria-label={c.title}
      data-testid="cad-import-workspace"
    >
      <section className="cad-workspace">
        <header className="cad-header">
          <div>
            <h2>{c.title}</h2>
            <p>{c.subtitle}</p>
          </div>
          <button
            type="button"
            className="cad-icon"
            aria-label={c.close}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {!document && (
          <div
            className={`cad-drop${dragging ? ' is-dragging' : ''}`}
            data-testid="cad-drop"
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void load(file);
            }}
          >
            <FileUp size={28} aria-hidden="true" />
            <strong>{c.drop}</strong>
            <p>{c.dropHint}</p>
            <button
              type="button"
              className="a-button a-primary"
              onClick={() => input.current?.click()}
            >
              {c.choose}
            </button>
            {reading && <p role="status">{c.reading}</p>}
            {error && (
              <p role="alert" className="cad-error" data-testid="cad-error">
                {error}
              </p>
            )}
          </div>
        )}
        <input
          ref={input}
          type="file"
          hidden
          accept=".dxf,.ifc"
          aria-label={c.choose}
          data-testid="cad-file-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void load(file);
          }}
        />

        {document && analysis?.status === 'unsupported' && (
          <div className="cad-step">
            {analysis.reason === 'unit-unknown' ? (
              <UnitQuestion
                c={c}
                longest={analysis.longestSide ?? 0}
                locale={i18n.language}
                onUnit={setUnit}
              />
            ) : (
              <p role="alert" className="cad-error" data-testid="cad-error">
                {failure}
              </p>
            )}
            <button
              type="button"
              className="a-button"
              onClick={() => setDocument(undefined)}
            >
              {c.another}
            </button>
          </div>
        )}

        {document && analysis?.status === 'supported' && (
          <div className="cad-body">
            <CadPreview
              c={c}
              analysis={analysis}
              locale={i18n.language}
              onNextOutline={() =>
                setOutlineIndex(
                  (analysis.outlineIndex + 1) % analysis.outlines.length,
                )
              }
              onUnit={setUnit}
            />
            <CadConfirmation
              key={`${analysis.outlineIndex}:${analysis.unit.unit}`}
              c={c}
              analysis={analysis}
              warnings={document.warnings}
              fileName={fileName}
              onCreate={onCreate}
              onAnother={() => setDocument(undefined)}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function UnitQuestion({
  c,
  longest,
  locale,
  onUnit,
}: {
  c: CadCopy;
  longest: number;
  locale: string;
  onUnit: (unit: CadLengthUnit) => void;
}) {
  return (
    <fieldset className="cad-question" data-testid="cad-unit-question">
      <legend>{c.unitQuestion}</legend>
      <p>{c.unitHelp(formatNumber(longest, locale, 2))}</p>
      <div className="cad-chips">
        {(['mm', 'cm', 'm'] as const).map((unit) => (
          <button
            key={unit}
            type="button"
            data-testid={`cad-unit-${unit}`}
            onClick={() => onUnit(unit)}
          >
            {c.units[unit]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The drawing as read: every line faint, the recognised parts named. */
function CadPreview({
  c,
  analysis,
  locale,
  onNextOutline,
  onUnit,
}: {
  c: CadCopy;
  analysis: Supported;
  locale: string;
  onNextOutline: () => void;
  onUnit: (unit: CadLengthUnit) => void;
}) {
  const outline = analysis.outlines[analysis.outlineIndex]!;
  const focus = analysis.eaveOutline ?? outline;
  // Frame the chosen outline with a margin; far-away lines may clip.
  const pad = Math.max(focus.longMm, focus.shortMm) * 0.18;
  const xs = focus.corners.map((corner) => corner[0]);
  const ys = focus.corners.map((corner) => corner[1]);
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;
  const width = maxX - minX;
  const height = maxY - minY;
  const stroke = Math.max(width, height) / 400;
  // CAD y points up; SVG y points down.
  const toSvg = (point: Vec2): Vec2 => [point[0], maxY + minY - point[1]];
  const poly = (rect: CadRectangle) =>
    rect.corners.map((corner) => toSvg(corner).join(',')).join(' ');
  const length = (mm: number) => `${formatLength(mm, 'm', locale)} m`;
  return (
    <figure className="cad-preview" aria-label={c.preview}>
      <svg
        viewBox={`${minX} ${minY} ${width} ${height}`}
        role="img"
        aria-label={c.preview}
        data-testid="cad-preview"
      >
        {analysis.preview.segments.map(([from, to], index) => {
          const a = toSvg(from),
            b = toSvg(to);
          return (
            <line
              key={index}
              className="cad-line"
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              strokeWidth={stroke}
            />
          );
        })}
        {analysis.eaveOutline && (
          <polygon
            className="cad-eave"
            points={poly(analysis.eaveOutline)}
            strokeWidth={stroke * 2.5}
            strokeDasharray={`${stroke * 8} ${stroke * 5}`}
          />
        )}
        <polygon
          className={analysis.wallOutline ? 'cad-walls' : 'cad-outline'}
          points={poly(analysis.wallOutline ?? outline)}
          strokeWidth={stroke * 3}
        />
        {analysis.roofLines.map((line, index) => {
          const a = toSvg(line.from),
            b = toSvg(line.to);
          return (
            <line
              key={`roof-${index}`}
              className={`cad-roof-line is-${line.kind}`}
              x1={a[0]}
              y1={a[1]}
              x2={b[0]}
              y2={b[1]}
              strokeWidth={stroke * 3}
            />
          );
        })}
        {(() => {
          const rect = analysis.wallOutline ?? outline;
          // Under the lowest drawn outline, so it never sits on a line.
          const lowest = Math.max(
            ...focus.corners.map((corner) => toSvg(corner)[1]),
          );
          return (
            <text
              className="cad-label"
              x={(minX + maxX) / 2}
              y={lowest + stroke * 22}
              fontSize={stroke * 14}
              textAnchor="middle"
            >
              {length(rect.longMm)} × {length(rect.shortMm)}
            </text>
          );
        })()}
      </svg>
      <figcaption>
        <span className="cad-key is-walls">
          {analysis.wallOutline ? c.legend.walls : c.legend.outline}
        </span>
        {analysis.eaveOutline && (
          <span className="cad-key is-eaves">{c.legend.eaves}</span>
        )}
        {analysis.roofLines.some((line) => line.kind === 'ridge') && (
          <span className="cad-key is-ridge">{c.legend.ridge}</span>
        )}
        {analysis.roofLines.some((line) => line.kind === 'hip') && (
          <span className="cad-key is-hip">{c.legend.hip}</span>
        )}
        <span className="cad-key is-other">{c.legend.other}</span>
      </figcaption>
      <div className="cad-preview-actions">
        <span data-testid="cad-unit">
          {c.fileUnit(c.units[analysis.unit.unit], c.unitBasis[analysis.unit.basis])}
        </span>
        {analysis.unit.basis !== 'declared' && (
          <label className="cad-inline">
            {c.changeUnit}
            <select
              value={analysis.unit.unit}
              onChange={(event) =>
                onUnit(event.target.value as CadLengthUnit)
              }
            >
              {(['mm', 'cm', 'm'] as const).map((unit) => (
                <option key={unit} value={unit}>
                  {c.units[unit]}
                </option>
              ))}
            </select>
          </label>
        )}
        {analysis.outlines.length > 1 && (
          <button
            type="button"
            className="a-button"
            data-testid="cad-next-outline"
            onClick={onNextOutline}
          >
            {c.otherOutline(
              ((analysis.outlineIndex + 1) % analysis.outlines.length) + 1,
              analysis.outlines.length,
            )}
          </button>
        )}
      </div>
    </figure>
  );
}

const LENGTH_FIELDS: readonly ProjectStartField[] = [
  'buildingLength',
  'buildingWidth',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
];
const ALL_FIELDS: readonly ProjectStartField[] = [
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
];

function CadConfirmation({
  c,
  analysis,
  warnings,
  fileName,
  onCreate,
  onAnother,
}: {
  c: CadCopy;
  analysis: Supported;
  warnings: DxfDocument['warnings'];
  fileName: string;
  onCreate: (template: RoofTemplateSpec, name: string) => Promise<void>;
  onAnother: () => void;
}) {
  const { t, i18n } = useTranslation();
  const displayUnit = useAssembly((state) => state.unit);
  const [base] = useState(() => createDefaultProjectDocument().project.roof);
  const defaults = projectStartValuesFromTemplate(base);
  const nested = !!analysis.wallOutline;
  const outline = analysis.outlines[analysis.outlineIndex]!;
  const [meaning, setMeaning] = useState<'walls' | 'eaves'>('walls');
  const [roofType, setRoofType] = useState(analysis.proposed.roofType);
  const show = (mm: number) =>
    String(Math.round(fromMillimetres(mm, displayUnit) * 1000) / 1000);
  const [draft, setDraft] = useState<Record<ProjectStartField, string>>(() => ({
    buildingLength: show(analysis.proposed.buildingLengthMm),
    buildingWidth: show(analysis.proposed.buildingWidthMm),
    pitch:
      analysis.proposed.pitchDeg !== undefined
        ? String(analysis.proposed.pitchDeg)
        : '',
    eave: show(analysis.proposed.eaveOverhangMm ?? defaults.eaveOverhangMm),
    spacing: show(defaults.rafterSpacingMm),
    rafterWidth: show(defaults.rafterWidthMm ?? 80),
    rafterDepth: show(defaults.rafterDepthMm ?? 200),
  }));
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const read = (field: ProjectStartField) => {
    const value = parseDecimal(draft[field]);
    if (value === null) return null;
    return LENGTH_FIELDS.includes(field)
      ? toMillimetres(value, displayUnit)
      : value;
  };
  const eaveMm = read('eave');
  // A single outline that is the eave edge: walls = outline − 2 × overhang.
  const derived = !nested && meaning === 'eaves';
  const numbers = {
    buildingLength: derived
      ? eaveMm === null
        ? null
        : outline.longMm - 2 * eaveMm
      : read('buildingLength'),
    buildingWidth: derived
      ? eaveMm === null
        ? null
        : outline.shortMm - 2 * eaveMm
      : read('buildingWidth'),
    pitch: read('pitch'),
    eave: eaveMm,
    spacing: read('spacing'),
    rafterWidth: read('rafterWidth'),
    rafterDepth: read('rafterDepth'),
  };
  const issues = roofType
    ? validateProjectStart({ ...numbers, roofType }, ALL_FIELDS)
    : [];
  let template: RoofTemplateSpec | undefined;
  if (roofType && !issues.length)
    try {
      template = createProjectStartTemplate(
        {
          ...defaults,
          roofType,
          buildingLengthMm: numbers.buildingLength!,
          buildingWidthMm: numbers.buildingWidth!,
          pitchDeg: numbers.pitch!,
          eaveOverhangMm: numbers.eave!,
          rafterSpacingMm: numbers.spacing!,
          rafterWidthMm: numbers.rafterWidth!,
          rafterDepthMm: numbers.rafterDepth!,
        },
        base,
      );
    } catch {
      /* The canonical schema is the final gate. */
    }

  const dimensionNote = (field: 'buildingLength' | 'buildingWidth') =>
    analysis.evidence.includes(
      field === 'buildingLength'
        ? 'dimension-matches-length'
        : 'dimension-matches-width',
    )
      ? ` · ${c.source.dimension}`
      : '';
  const provenance = (field: ProjectStartField): string => {
    if (changed.has(field)) return c.source.user;
    if (field === 'buildingLength' || field === 'buildingWidth')
      return derived
        ? c.derived
        : `${nested ? c.source.walls : c.source.outline}${dimensionNote(field)}`;
    if (field === 'eave')
      return nested ? c.source.nested : c.source.defaults;
    if (field === 'pitch')
      return analysis.pitchCandidates[0]
        ? c.pitchFromText(analysis.pitchCandidates[0].text)
        : c.pitchMissing;
    return c.source.defaults;
  };
  const edit = (field: ProjectStartField, value: string) => {
    setDraft({ ...draft, [field]: value });
    setChanged((current) => new Set([...current, field]));
    setConfirmed(false);
  };
  const unitLabel = (field: ProjectStartField) =>
    field === 'pitch' ? '°' : displayUnit;
  const allWarnings = [
    ...analysis.warnings.filter(
      (warning) =>
        warning !== 'single-outline-meaning' &&
        warning !== 'pitch-not-found' &&
        warning !== 'roof-type-not-recognized',
    ),
  ];

  return (
    <form
      className="cad-confirmation"
      data-testid="cad-confirmation"
      onSubmit={(event) => {
        event.preventDefault();
        if (!template || !confirmed || busy) return;
        setBusy(true);
        setFailed(false);
        void onCreate(template, c.name(fileName)).catch(() => {
          setFailed(true);
          setBusy(false);
        });
      }}
    >
      <h3>{c.title2}</h3>
      {(allWarnings.length > 0 || warnings.length > 0) && (
        <ul className="cad-warnings" data-testid="cad-warnings">
          {allWarnings.map((warning) => (
            <li key={warning}>{c.warning[warning]}</li>
          ))}
          {warnings.map((warning) => (
            <li key={warning}>{c.dxfWarning[warning]}</li>
          ))}
        </ul>
      )}
      <fieldset className="cad-question" disabled={busy}>
        <legend>{c.roofType}</legend>
        <div className="cad-chips">
          {(['gable', 'hip'] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={roofType === type}
              data-testid={`cad-roof-${type}`}
              onClick={() => {
                setRoofType(type);
                setChanged((current) => new Set([...current, 'roofType']));
                setConfirmed(false);
              }}
            >
              {c[type]}
            </button>
          ))}
        </div>
        <small>
          {changed.has('roofType')
            ? c.source.user
            : analysis.proposed.roofType
              ? analysis.evidence.includes('roof-type-text')
                ? c.source.text
                : c.source.lines
              : c.warning['roof-type-not-recognized']}
        </small>
      </fieldset>
      {!nested && (
        <fieldset className="cad-question" disabled={busy}>
          <legend>{c.meaningQuestion}</legend>
          <div className="cad-chips">
            {(['walls', 'eaves'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={meaning === value}
                data-testid={`cad-meaning-${value}`}
                onClick={() => {
                  setMeaning(value);
                  setConfirmed(false);
                }}
              >
                {c.meaning[value]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="cad-fields" disabled={busy}>
        {ALL_FIELDS.map((field) => {
          const issue = issues.find((item) => item.field === field);
          const derivedField =
            derived && (field === 'buildingLength' || field === 'buildingWidth');
          const value = derivedField
            ? numbers[field] === null
              ? ''
              : show(numbers[field]!)
            : draft[field];
          return (
            <label key={field} className="cad-field">
              <span>
                {t(`assembly.creator.field.${field}`)} ({unitLabel(field)})
              </span>
              <input
                inputMode="decimal"
                value={value}
                readOnly={derivedField}
                data-testid={`cad-${field}`}
                aria-invalid={!!issue}
                onChange={(event) => edit(field, event.target.value)}
              />
              <small>
                {issue
                  ? t(`assembly.creator.issue.${issue.code}`, {
                      min:
                        field === 'pitch'
                          ? issue.min
                          : issue.min !== undefined
                            ? formatLength(issue.min, displayUnit, i18n.language)
                            : undefined,
                      max:
                        field === 'pitch'
                          ? issue.max
                          : issue.max !== undefined
                            ? formatLength(issue.max, displayUnit, i18n.language)
                            : undefined,
                      unit: unitLabel(field),
                    })
                  : provenance(field)}
              </small>
              {field === 'pitch' && analysis.pitchCandidates.length > 1 && (
                <span className="cad-chips is-small">
                  {analysis.pitchCandidates.map((candidate) => (
                    <button
                      key={candidate.valueDeg}
                      type="button"
                      title={candidate.text}
                      aria-pressed={
                        parseDecimal(draft.pitch) === candidate.valueDeg
                      }
                      onClick={() => edit('pitch', String(candidate.valueDeg))}
                    >
                      {formatNumber(candidate.valueDeg, i18n.language, 1)}°
                    </button>
                  ))}
                </span>
              )}
            </label>
          );
        })}
      </fieldset>
      {analysis.evidence.length > 0 && (
        <details className="cad-evidence">
          <summary>{c.evidence}</summary>
          <ul>
            {analysis.evidence.map((item) => (
              <li key={item}>{c.evidenceItem[item]}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="cad-muted">{c.summary}</p>
      <label className="cad-check">
        <input
          type="checkbox"
          checked={confirmed}
          data-testid="cad-confirm"
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        {c.confirm}
      </label>
      {!template && <p role="status">{c.invalid}</p>}
      {failed && <p role="alert">{c.failure}</p>}
      <div className="cad-actions">
        <button
          type="submit"
          className="a-button a-primary"
          data-testid="cad-create"
          disabled={!template || !confirmed || busy}
        >
          {busy ? c.busy : c.create}
        </button>
        <button type="button" className="a-button" onClick={onAnother}>
          {c.another}
        </button>
      </div>
    </form>
  );
}
