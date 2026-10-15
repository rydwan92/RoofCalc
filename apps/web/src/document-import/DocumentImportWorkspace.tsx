import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Crosshair,
  FileUp,
  MapPin,
  Minus,
  Plus,
  Ruler,
  ScanLine,
  X,
} from 'lucide-react';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import {
  calibrateFromDrawingScale,
  calibrateFromPoints,
  chooseMeasurement,
  classifyDocumentBytes,
  confirmField,
  deriveImportedRoofDraft,
  DOCUMENT_IMPORT_LIMITS,
  EMPTY_DECISIONS,
  enterValue,
  manualMeasurementResult,
  mapDraftToRoofStart,
  NUMERIC_ROOF_FIELDS,
  recognizeTextLayer,
  REQUIRED_ROOF_FIELDS,
  START_PARAMETER_OF,
  type DocumentPageInfo,
  type DocumentSourceKind,
  type DraftField,
  type ImportDecisions,
  type ImportedRoofDraftV1,
  type IngestionRejection,
  type ManualMeasurementInput,
  type NumericRoofField,
  type PagePoint,
  type RecognitionResult,
  type RecognizedMeasurement,
  type RoofStartParameters,
  type ScaleCalibration,
  type SourceRegion,
} from '@cieslacalc/document-import-core';
import { parseDecimal } from '../format';
import { createDefaultProjectDocument, useAssembly } from '../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
} from '../assembly/project-start';
import { RoofPlanPreview } from '../assembly/ProjectStartAssistant';
import { importCopy, type ImportCopy } from './copy';
import {
  fingerprintBytes,
  ImageTooLargeError,
  openImage,
  type OpenedImage,
} from './image-runtime';
import {
  openPdf,
  PdfPasswordError,
  releasePdfRuntime,
  type OpenedPdf,
} from './pdf-runtime';
import './document-import.css';

/**
 * VNext document import workspace: file → preview → recognition → review →
 * RoofCalc project. All parsing happens in this browser; the only output is
 * the ordinary roof template, created by the caller through the same path
 * as the Creator and the IFC import.
 */

interface LoadedDocument {
  fileName: string;
  kind: DocumentSourceKind;
  byteLength: number;
  fingerprint: string;
  pageCount: number;
  pages: DocumentPageInfo[];
  text?: RecognitionResult;
  pdf?: OpenedPdf;
  image?: OpenedImage;
}

type LoadFailure =
  IngestionRejection | 'password' | 'image-too-large' | 'failed';

class DocumentLoadError extends Error {
  constructor(readonly reason: LoadFailure) {
    super(reason);
  }
}

async function loadDocument(file: File): Promise<LoadedDocument> {
  const header = new Uint8Array(
    await file.slice(0, DOCUMENT_IMPORT_LIMITS.headerBytes).arrayBuffer(),
  );
  // The bytes decide the format; the name and browser MIME type do not.
  const verdict = classifyDocumentBytes({ byteLength: file.size, header });
  if (verdict.status === 'rejected')
    throw new DocumentLoadError(verdict.reason);
  const bytes = await file.arrayBuffer();
  const fingerprint = await fingerprintBytes(bytes);
  const common = {
    fileName: file.name,
    kind: verdict.kind,
    byteLength: file.size,
    fingerprint,
  };
  if (verdict.kind === 'pdf') {
    try {
      const pdf = await openPdf(bytes);
      return {
        ...common,
        pdf,
        pages: pdf.pages,
        pageCount: pdf.pageCount,
        text: recognizeTextLayer(pdf.textPages, { totalPages: pdf.pageCount }),
      };
    } catch (error) {
      throw new DocumentLoadError(
        error instanceof PdfPasswordError ? 'password' : 'failed',
      );
    }
  }
  try {
    const image = await openImage(
      new Blob([bytes], { type: `image/${verdict.kind}` }),
    );
    return { ...common, image, pages: image.pages, pageCount: 1 };
  } catch (error) {
    throw new DocumentLoadError(
      error instanceof ImageTooLargeError ? 'image-too-large' : 'failed',
    );
  }
}

type Tool =
  | { kind: 'select' }
  | { kind: 'calibrate' }
  | { kind: 'measure'; field: NumericRoofField };

const LENGTH_FIELDS: readonly NumericRoofField[] = NUMERIC_ROOF_FIELDS.filter(
  (field) => field !== 'pitch',
);

function displayNumber(value: number, digits: number) {
  return String(Number(value.toFixed(digits)));
}

export function DocumentImportWorkspace({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (template: RoofTemplateSpec, name: string) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const m = importCopy(i18n.language);
  const unit = useAssembly((state) => state.unit);
  const fieldLabel = (field: NumericRoofField) =>
    t(`assembly.creator.field.${field}`);

  const [loading, setLoading] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [doc, setDoc] = useState<LoadedDocument>();
  const [decisions, setDecisions] = useState<ImportDecisions>(EMPTY_DECISIONS);
  const [calibration, setCalibration] = useState<ScaleCalibration>();
  const [manual, setManual] = useState<ManualMeasurementInput[]>([]);
  const [tool, setTool] = useState<Tool>({ kind: 'select' });
  const [pending, setPending] = useState<PagePoint[]>([]);
  const [knownLength, setKnownLength] = useState('');
  const [calibrationError, setCalibrationError] = useState<string>();
  const [activeField, setActiveField] = useState<NumericRoofField>();
  const [focusId, setFocusId] = useState<string>();
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [inputs, setInputs] = useState<
    Partial<Record<NumericRoofField, string>>
  >({});
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [viewerWidth, setViewerWidth] = useState(800);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const loadToken = useRef(0);
  const submitting = useRef(false);

  const base = useMemo(() => createDefaultProjectDocument().project.roof, []);
  const defaults = useMemo((): Omit<RoofStartParameters, 'roofType'> => {
    const values = projectStartValuesFromTemplate(base);
    return {
      buildingLengthMm: values.buildingLengthMm,
      buildingWidthMm: values.buildingWidthMm,
      pitchDeg: values.pitchDeg,
      eaveOverhangMm: values.eaveOverhangMm,
      rafterSpacingMm: values.rafterSpacingMm,
      rafterWidthMm: values.rafterWidthMm ?? base.rafterSection.widthMm,
      rafterDepthMm: values.rafterDepthMm ?? base.rafterSection.depthMm,
    };
  }, [base]);

  useEffect(() => heading.current?.focus(), []);
  // Closing the importer ends the parser worker as well.
  useEffect(
    () => () => {
      void releasePdfRuntime();
    },
    [],
  );
  // Release the parser, worker and bitmap whenever the document changes.
  useEffect(
    () => () => {
      void doc?.pdf?.close();
      doc?.image?.close();
    },
    [doc],
  );

  useEffect(() => {
    const element = viewer.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewerWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [doc]);

  const pageInfo = doc?.pages.find((page) => page.page === pageNumber);
  const cssScale = pageInfo
    ? Math.max(0.1, ((viewerWidth - 24) / pageInfo.width) * zoom)
    : 1;

  useEffect(() => {
    if (!doc || !canvas.current) return;
    if (doc.pdf)
      void doc.pdf.render(pageNumber, canvas.current, cssScale).catch(() => {
        /* A failed preview leaves the review usable. */
      });
    else doc.image?.render(canvas.current, cssScale);
  }, [doc, pageNumber, cssScale]);

  const source = useMemo(
    () =>
      doc && {
        fileName: doc.fileName,
        kind: doc.kind,
        byteLength: doc.byteLength,
        pageCount: doc.pageCount,
        pages: doc.pages,
      },
    [doc],
  );
  const manualResult = useMemo(
    () =>
      calibration && manual.length
        ? manualMeasurementResult(calibration, manual)
        : undefined,
    [calibration, manual],
  );
  const draft = useMemo(
    () =>
      source
        ? deriveImportedRoofDraft({
            source,
            results: [
              ...(doc?.text ? [doc.text] : []),
              ...(manualResult ? [manualResult] : []),
            ],
            decisions,
          })
        : undefined,
    [decisions, doc?.text, manualResult, source],
  );
  const mapping = useMemo(
    () => (draft ? mapDraftToRoofStart(draft, defaults) : undefined),
    [defaults, draft],
  );
  const template = useMemo(() => {
    if (mapping?.status !== 'ready') return undefined;
    try {
      return createProjectStartTemplate(mapping.values, base);
    } catch {
      return undefined;
    }
  }, [base, mapping]);
  /** The model forming while the user reviews — never the confirmed one. */
  const previewTemplate = useMemo(() => {
    if (template) return template;
    const roofType = draft?.roofType.value;
    if (!draft || !roofType) return undefined;
    if (
      REQUIRED_ROOF_FIELDS.some(
        (field) => draft.fields[field].value === undefined,
      )
    )
      return undefined;
    const values = { ...defaults };
    for (const field of NUMERIC_ROOF_FIELDS) {
      const value = draft.fields[field].value;
      if (value !== undefined) values[START_PARAMETER_OF[field]] = value;
    }
    try {
      return createProjectStartTemplate({ roofType, ...values }, base);
    } catch {
      return undefined;
    }
  }, [base, defaults, draft, template]);

  const measurementById = useMemo(
    () =>
      new Map(
        (draft?.measurements ?? []).map((measurement) => [
          measurement.id,
          measurement,
        ]),
      ),
    [draft],
  );

  function update(next: ImportDecisions) {
    // Any change to the reviewed values revokes the final review.
    setReviewed(false);
    setCreateError(undefined);
    setDecisions(next);
  }

  function reset() {
    setDecisions(EMPTY_DECISIONS);
    setCalibration(undefined);
    setManual([]);
    setTool({ kind: 'select' });
    setPending([]);
    setInputs({});
    setActiveField(undefined);
    setFocusId(undefined);
    setPageNumber(1);
    setZoom(1);
    setReviewed(false);
    setCreateError(undefined);
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const token = (loadToken.current += 1);
    reset();
    setDoc(undefined);
    setLoadError(undefined);
    setLoading(
      file.name.toLowerCase().endsWith('.pdf') ? m.reading : m.loading,
    );
    try {
      const loaded = await loadDocument(file);
      if (token !== loadToken.current) {
        void loaded.pdf?.close();
        loaded.image?.close();
        return;
      }
      setDoc(loaded);
      const first = loaded.text?.measurements.find(
        (measurement) => measurement.region,
      );
      if (first?.region) setPageNumber(first.region.page);
    } catch (error) {
      if (token !== loadToken.current) return;
      const reason =
        error instanceof DocumentLoadError ? error.reason : 'failed';
      setLoadError(
        reason === 'password'
          ? m.password
          : reason === 'image-too-large'
            ? m.imageTooLarge
            : reason === 'failed'
              ? m.failed
              : m.rejected[reason],
      );
    } finally {
      if (token === loadToken.current) setLoading(undefined);
    }
  }

  function scrollToRegion(region: SourceRegion | undefined) {
    if (!region) return;
    setPageNumber(region.page);
    requestAnimationFrame(() => {
      const element = viewer.current;
      if (!element) return;
      element.scrollTo({
        left: Math.max(0, region.box.x * cssScale - element.clientWidth / 2),
        top: Math.max(0, region.box.y * cssScale - element.clientHeight / 3),
        behavior: 'smooth',
      });
    });
  }

  function scrollToMeasurement(measurement: RecognizedMeasurement | undefined) {
    if (!measurement?.region) return;
    setFocusId(measurement.id);
    scrollToRegion(measurement.region);
  }

  function activate(field: NumericRoofField) {
    setActiveField(field);
    const state = draft?.fields[field];
    scrollToMeasurement(
      state?.measurementId
        ? measurementById.get(state.measurementId)
        : undefined,
    );
  }

  function pagePoint(event: React.MouseEvent<SVGSVGElement>): PagePoint {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      page: pageNumber,
      x: ((event.clientX - rect.left) / rect.width) * (pageInfo?.width ?? 1),
      y: ((event.clientY - rect.top) / rect.height) * (pageInfo?.height ?? 1),
    };
  }

  function onPageClick(event: React.MouseEvent<SVGSVGElement>) {
    if (tool.kind === 'select') return;
    const point = pagePoint(event);
    const points = [...pending, point];
    if (points.length < 2) {
      setPending(points);
      return;
    }
    const [from, to] = points as [PagePoint, PagePoint];
    if (tool.kind === 'calibrate') {
      setPending(points);
      setCalibrationError(undefined);
      return;
    }
    setPending([]);
    if (!calibration || calibration.page !== pageNumber) {
      setCalibrationError(m.needCalibration);
      return;
    }
    const id = `manual:${tool.field}:${manual.length + 1}`;
    setManual([...manual, { id, field: tool.field, from, to }]);
    const nextInputs = { ...inputs };
    delete nextInputs[tool.field];
    setInputs(nextInputs);
    update(chooseMeasurement(decisions, tool.field, id));
    setActiveField(tool.field);
    setTool({ kind: 'select' });
  }

  function applyCalibration() {
    const [from, to] = pending;
    const value = parseDecimal(knownLength);
    if (!from || !to || value === null) {
      setCalibrationError(m.calibrationRejected['invalid-length']);
      return;
    }
    const result = calibrateFromPoints(from, to, toMillimetres(value, unit));
    if (result.status === 'rejected') {
      setCalibrationError(m.calibrationRejected[result.reason]);
      return;
    }
    setCalibration(result.calibration);
    setCalibrationError(undefined);
    setPending([]);
    setKnownLength('');
    setTool({ kind: 'select' });
    setReviewed(false);
  }

  function applyDrawingScale() {
    if (!draft?.scale || !pageInfo) return;
    const scale = calibrateFromDrawingScale(
      pageNumber,
      pageInfo.unit,
      draft.scale.denominator,
    );
    if (!scale) return;
    setCalibration(scale);
    setCalibrationError(undefined);
    setPending([]);
    setReviewed(false);
  }

  function onRegionClick(measurement: RecognizedMeasurement) {
    if (tool.kind !== 'select' || !draft) return;
    setFocusId(measurement.id);
    const target = activeField ?? measurement.field;
    if (!target) return;
    const state = draft.fields[target];
    const candidate =
      state.measurementId === measurement.id ||
      state.alternatives.includes(measurement.id);
    if (!candidate) {
      if (measurement.field) setActiveField(measurement.field);
      return;
    }
    const nextInputs = { ...inputs };
    delete nextInputs[target];
    setInputs(nextInputs);
    update(chooseMeasurement(decisions, target, measurement.id));
    setActiveField(target);
  }

  function displayValue(field: NumericRoofField, value: number) {
    return field === 'pitch'
      ? displayNumber(value, 2)
      : displayNumber(fromMillimetres(value, unit), 4);
  }

  function formatWithUnit(field: NumericRoofField, value: number) {
    return `${displayValue(field, value).replace('.', i18n.language.startsWith('pl') ? ',' : '.')} ${field === 'pitch' ? '°' : unit}`;
  }

  function typeValue(field: NumericRoofField, raw: string) {
    setInputs({ ...inputs, [field]: raw });
    if (!raw.trim()) {
      update(enterValue(decisions, field, undefined));
      return;
    }
    const value = parseDecimal(raw);
    if (value === null) return;
    update(
      enterValue(
        decisions,
        field,
        field === 'pitch' ? value : toMillimetres(value, unit),
      ),
    );
  }

  async function create() {
    if (!template || !reviewed || submitting.current || !doc) return;
    submitting.current = true;
    setBusy(true);
    setCreateError(undefined);
    try {
      await onCreate(
        template,
        m.projectName(doc.fileName.replace(/\.[^.]+$/, '')),
      );
    } catch {
      setCreateError(m.createFailed);
      setBusy(false);
      submitting.current = false;
    }
  }

  // File → Recognition → Review → Project; the review is current until the
  // mapping is ready and the user ticked the final check.
  const step = !doc ? 0 : mapping?.status === 'ready' && reviewed ? 3 : 2;
  const textCount =
    doc?.text?.measurements.filter((measurement) => measurement.field).length ??
    0;

  return (
    <div className="dimp-layer" data-testid="document-import">
      <section
        className="dimp-workspace"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dimp-title"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          if (tool.kind !== 'select' || pending.length) {
            setTool({ kind: 'select' });
            setPending([]);
          } else onClose();
        }}
      >
        <header className="dimp-header">
          <div>
            <h2 id="dimp-title" ref={heading} tabIndex={-1}>
              {m.title}
            </h2>
            <span>{m.subtitle}</span>
          </div>
          <ol className="dimp-steps" aria-label={m.title}>
            {m.steps.map((label, index) => (
              <li
                key={label}
                data-state={
                  index < step ? 'done' : index === step ? 'current' : 'todo'
                }
                aria-current={index === step ? 'step' : undefined}
              >
                <span>{index < step ? <Check size={12} /> : index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="dimp-close"
            aria-label={m.close}
            title={m.close}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <input
          ref={fileInput}
          className="dimp-file"
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          data-testid="document-import-file"
          onChange={(event) => {
            void chooseFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        {!doc ? (
          <div
            className={`dimp-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void chooseFile(event.dataTransfer.files[0]);
            }}
          >
            <FileUp size={40} aria-hidden="true" />
            <h3>{m.dropTitle}</h3>
            <p>{m.dropHint}</p>
            <button
              type="button"
              className="dimp-primary"
              onClick={() => fileInput.current?.click()}
              disabled={!!loading}
            >
              {loading ?? m.choose}
            </button>
            <small>{m.limits}</small>
            <p className="dimp-privacy">{m.privacy}</p>
            {loadError && (
              <p className="dimp-error" role="alert">
                {loadError}
              </p>
            )}
          </div>
        ) : (
          <div className="dimp-body">
            <section className="dimp-document" aria-label={m.document}>
              <div className="dimp-toolbar">
                <div className="dimp-group">
                  <button
                    type="button"
                    aria-label={m.previousPage}
                    disabled={pageNumber <= 1}
                    onClick={() => setPageNumber(pageNumber - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span data-testid="document-import-page">
                    {m.page(pageNumber, doc.pages.length)}
                  </span>
                  <button
                    type="button"
                    aria-label={m.nextPage}
                    disabled={pageNumber >= doc.pages.length}
                    onClick={() => setPageNumber(pageNumber + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="dimp-group">
                  <button
                    type="button"
                    aria-label={m.zoomOut}
                    onClick={() => setZoom(Math.max(0.5, zoom / 1.25))}
                  >
                    <Minus size={16} />
                  </button>
                  <button type="button" onClick={() => setZoom(1)}>
                    {m.fit}
                  </button>
                  <button
                    type="button"
                    aria-label={m.zoomIn}
                    onClick={() => setZoom(Math.min(6, zoom * 1.25))}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <div
                  className="dimp-group"
                  role="group"
                  aria-label={m.toolSelect}
                >
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'select'}
                    onClick={() => {
                      setTool({ kind: 'select' });
                      setPending([]);
                    }}
                  >
                    <Crosshair size={16} aria-hidden="true" />
                    {m.toolSelect}
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'calibrate'}
                    data-testid="document-import-calibrate"
                    onClick={() => {
                      setTool({ kind: 'calibrate' });
                      setPending([]);
                    }}
                  >
                    <Ruler size={16} aria-hidden="true" />
                    {m.toolCalibrate}
                  </button>
                  {draft?.scale && pageInfo?.unit === 'pt' && (
                    <button
                      type="button"
                      data-testid="document-import-drawing-scale"
                      onClick={applyDrawingScale}
                    >
                      {m.useDrawingScale(draft.scale.denominator)}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="dimp-other"
                  onClick={() => fileInput.current?.click()}
                >
                  {m.other}
                </button>
              </div>
              <p className="dimp-hint" role="status">
                {tool.kind === 'calibrate'
                  ? m.toolHintCalibrate
                  : tool.kind === 'measure'
                    ? m.toolHintMeasure(fieldLabel(tool.field))
                    : m.toolHintSelect}
                {calibration && (
                  <strong>
                    {' · '}
                    {m.calibrated(
                      calibration.source === 'drawing-scale'
                        ? m.calibratedByDrawing(
                            calibration.scaleDenominator ?? 1,
                          )
                        : m.calibratedBySegment(
                            formatWithUnit(
                              'buildingLength',
                              calibration.knownLengthMm ?? 0,
                            ),
                          ),
                    )}
                  </strong>
                )}
              </p>
              {tool.kind === 'calibrate' && pending.length === 2 && (
                <div className="dimp-calibration">
                  <label>
                    {m.knownLength}
                    <span className="dimp-input">
                      <input
                        inputMode="decimal"
                        value={knownLength}
                        autoFocus
                        data-testid="document-import-known-length"
                        onChange={(event) => setKnownLength(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') applyCalibration();
                        }}
                      />
                      <small>{unit}</small>
                    </span>
                  </label>
                  <button
                    type="button"
                    className="dimp-primary"
                    onClick={applyCalibration}
                  >
                    {m.applyCalibration}
                  </button>
                </div>
              )}
              {calibrationError && (
                <p className="dimp-error" role="alert">
                  {calibrationError}
                </p>
              )}
              <div className="dimp-viewer" ref={viewer} data-tool={tool.kind}>
                {pageInfo && (
                  <div
                    className="dimp-page"
                    style={{
                      width: pageInfo.width * cssScale,
                      height: pageInfo.height * cssScale,
                    }}
                  >
                    <canvas ref={canvas} aria-hidden="true" />
                    <svg
                      viewBox={`0 0 ${pageInfo.width} ${pageInfo.height}`}
                      preserveAspectRatio="none"
                      onClick={onPageClick}
                      data-testid="document-import-overlay"
                      aria-label={m.document}
                      role="img"
                    >
                      {draft?.measurements
                        .filter(
                          (measurement) =>
                            measurement.region?.page === pageNumber &&
                            measurement.mode !== 'manual',
                        )
                        .map((measurement) => {
                          const box = measurement.region!.box;
                          const pad = 2;
                          const current =
                            activeField !== undefined &&
                            draft.fields[activeField].measurementId ===
                              measurement.id;
                          return (
                            <rect
                              key={measurement.id}
                              className="dimp-region"
                              data-confidence={measurement.confidence}
                              data-focused={
                                focusId === measurement.id ||
                                current ||
                                undefined
                              }
                              data-measurement={measurement.raw.text}
                              x={box.x - pad}
                              y={box.y - pad}
                              width={box.width + pad * 2}
                              height={box.height + pad * 2}
                              onClick={(event) => {
                                event.stopPropagation();
                                onRegionClick(measurement);
                              }}
                            >
                              <title>
                                {measurement.label?.text
                                  ? `${measurement.label.text} ${measurement.raw.text}`
                                  : measurement.raw.text}
                              </title>
                            </rect>
                          );
                        })}
                      {draft?.segments
                        .filter((segment) => segment.page === pageNumber)
                        .map((segment) => (
                          <line
                            key={segment.id}
                            className={`dimp-segment role-${segment.role}`}
                            x1={segment.from.x}
                            y1={segment.from.y}
                            x2={segment.to.x}
                            y2={segment.to.y}
                          />
                        ))}
                      {pending.map((point, index) => (
                        <circle
                          key={index}
                          className="dimp-point"
                          cx={point.x}
                          cy={point.y}
                          r={4 / cssScale}
                        />
                      ))}
                      {pending.length === 2 && (
                        <line
                          className="dimp-segment role-pending"
                          x1={pending[0]!.x}
                          y1={pending[0]!.y}
                          x2={pending[1]!.x}
                          y2={pending[1]!.y}
                        />
                      )}
                    </svg>
                  </div>
                )}
              </div>
            </section>
            {draft && (
              <section
                className="dimp-review"
                aria-label={m.review}
                data-testid="document-import-review"
              >
                <h3>{m.review}</h3>
                <details className="dimp-engines">
                  <summary>
                    <ScanLine size={15} aria-hidden="true" />
                    {doc.text
                      ? doc.text.warnings.some(
                          (w) => w.code === 'no-text-layer',
                        )
                        ? m.engineNoText
                        : m.engineText(textCount)
                      : m.engineManual}
                  </summary>
                  <ul>
                    <li data-available="true">
                      {doc.text ? m.engineText(textCount) : m.engineNoText}
                    </li>
                    <li data-available="true">{m.engineManual}</li>
                    <li data-available="false">{m.engineOcr}</li>
                    <li data-available="false">{m.engineAi}</li>
                  </ul>
                </details>
                <RoofTypeRow
                  draft={draft}
                  copy={m}
                  onChange={(roofType) =>
                    update({ ...decisions, roofType, roofTypeConfirmed: true })
                  }
                  onConfirm={() =>
                    update({ ...decisions, roofTypeConfirmed: true })
                  }
                  onShow={() => scrollToRegion(draft.roofType.detected?.region)}
                />
                <div className="dimp-row dimp-unit-row">
                  <span>{m.documentUnit}</span>
                  <select
                    value={
                      decisions.documentUnit ?? draft.documentUnit?.unit ?? ''
                    }
                    data-testid="document-import-unit"
                    onChange={(event) =>
                      update({
                        ...decisions,
                        documentUnit:
                          (event.target.value as 'mm' | 'cm' | 'm') ||
                          undefined,
                      })
                    }
                  >
                    <option value="">{m.unitNone}</option>
                    <option value="mm">mm</option>
                    <option value="cm">cm</option>
                    <option value="m">m</option>
                  </select>
                  {draft.documentUnit?.basis === 'document' && (
                    <small>{m.unitFromDocument(draft.documentUnit.text)}</small>
                  )}
                  {draft.scale && (
                    <small>
                      {m.scale}: 1:{draft.scale.denominator}
                    </small>
                  )}
                </div>
                <ul className="dimp-fields">
                  {NUMERIC_ROOF_FIELDS.map((field) => {
                    const state = draft.fields[field];
                    const measurement = state.measurementId
                      ? measurementById.get(state.measurementId)
                      : undefined;
                    return (
                      <FieldRow
                        key={field}
                        field={field}
                        state={state}
                        measurement={measurement}
                        alternatives={state.alternatives
                          .map((id) => measurementById.get(id))
                          .filter(
                            (item): item is RecognizedMeasurement => !!item,
                          )}
                        copy={m}
                        label={fieldLabel(field)}
                        unitLabel={field === 'pitch' ? '°' : unit}
                        required={REQUIRED_ROOF_FIELDS.includes(field)}
                        active={activeField === field}
                        inputValue={
                          inputs[field] ??
                          (state.value === undefined
                            ? ''
                            : displayValue(field, state.value))
                        }
                        defaultText={formatWithUnit(
                          field,
                          defaults[START_PARAMETER_OF[field]],
                        )}
                        formatValue={(value) => formatWithUnit(field, value)}
                        canMeasure={
                          LENGTH_FIELDS.includes(field) &&
                          calibration?.page === pageNumber
                        }
                        onActivate={() => activate(field)}
                        onType={(raw) => typeValue(field, raw)}
                        onChoose={(id) => {
                          const next = { ...inputs };
                          delete next[field];
                          setInputs(next);
                          update(chooseMeasurement(decisions, field, id));
                          scrollToMeasurement(measurementById.get(id));
                        }}
                        onConfirm={() =>
                          update(confirmField(decisions, draft, field))
                        }
                        onMeasure={() => {
                          setTool({ kind: 'measure', field });
                          setPending([]);
                          setActiveField(field);
                        }}
                      />
                    );
                  })}
                </ul>
                {draft.warnings.length > 0 && (
                  <section className="dimp-warnings" aria-label={m.warnings}>
                    <h4>{m.warnings}</h4>
                    <ul>
                      {draft.warnings.map((warning, index) => (
                        <li key={index} data-code={warning.code}>
                          <AlertTriangle size={14} aria-hidden="true" />
                          {m.warning(warning, fieldLabel)}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                <section className="dimp-preview" aria-label={m.preview}>
                  <h4>{m.preview}</h4>
                  <RoofPlanPreview
                    template={previewTemplate}
                    label={m.preview}
                    invalidLabel={m.previewEmpty}
                  />
                  <p>{m.construction}</p>
                </section>
                <p className="dimp-limitation">{m.limitation}</p>
                {mapping?.status === 'blocked' && (
                  <section
                    className="dimp-blockers"
                    data-testid="document-import-blockers"
                  >
                    <h4>{m.blockers}</h4>
                    <ul>
                      {mapping.blockers.map((blocker, index) => (
                        <li key={index}>{m.blocker(blocker, fieldLabel)}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {mapping?.status === 'ready' && !template && (
                  <p className="dimp-error" role="alert">
                    {m.invalidTemplate}
                  </p>
                )}
                <label className="dimp-check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={!template || busy}
                    data-testid="document-import-reviewed"
                    onChange={(event) => setReviewed(event.target.checked)}
                  />
                  {m.reviewCheck}
                </label>
                {createError && (
                  <p className="dimp-error" role="alert">
                    {createError}
                  </p>
                )}
                <button
                  type="button"
                  className="dimp-primary dimp-create"
                  data-testid="document-import-create"
                  disabled={!template || !reviewed || busy}
                  onClick={() => void create()}
                >
                  {busy ? m.creating : m.create}
                </button>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function RoofTypeRow({
  draft,
  copy: m,
  onChange,
  onConfirm,
  onShow,
}: {
  draft: ImportedRoofDraftV1;
  copy: ImportCopy;
  onChange: (value: 'gable' | 'hip') => void;
  onConfirm: () => void;
  onShow: () => void;
}) {
  const roof = draft.roofType;
  return (
    <div className="dimp-roof" data-testid="document-import-roof-type">
      <span className="dimp-field-label">
        {m.roofType} <small>{m.required}</small>
      </span>
      <div className="dimp-segmented" role="group" aria-label={m.roofType}>
        {(['gable', 'hip'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={roof.value === value}
            onClick={() => onChange(value)}
          >
            {m[value]}
          </button>
        ))}
      </div>
      {roof.detected && (
        <button type="button" className="dimp-source" onClick={onShow}>
          <MapPin size={13} aria-hidden="true" />
          {roof.detected.value === 'unsupported'
            ? m.unsupportedRoof(roof.detected.text)
            : m.detectedRoof(roof.detected.text)}
        </button>
      )}
      {roof.value && roof.requiresConfirmation && !roof.confirmed && (
        <button type="button" className="dimp-confirm" onClick={onConfirm}>
          {m.confirmRoof}
        </button>
      )}
      {roof.value && roof.confirmed && (
        <span className="dimp-confirmed">
          <Check size={13} aria-hidden="true" />
          {m.confirmed}
        </span>
      )}
    </div>
  );
}

function FieldRow({
  field,
  state,
  measurement,
  alternatives,
  copy: m,
  label,
  unitLabel,
  required,
  active,
  inputValue,
  defaultText,
  formatValue,
  canMeasure,
  onActivate,
  onType,
  onChoose,
  onConfirm,
  onMeasure,
}: {
  field: NumericRoofField;
  state: DraftField;
  measurement?: RecognizedMeasurement;
  alternatives: RecognizedMeasurement[];
  copy: ImportCopy;
  label: string;
  unitLabel: string;
  required: boolean;
  active: boolean;
  inputValue: string;
  defaultText: string;
  formatValue: (value: number) => string;
  canMeasure: boolean;
  onActivate: () => void;
  onType: (raw: string) => void;
  onChoose: (id: string) => void;
  onConfirm: () => void;
  onMeasure: () => void;
}) {
  const status =
    state.status === 'conflict'
      ? m.status.conflict
      : state.status === 'user-entered'
        ? m.status.userEntered
        : state.status === 'missing'
          ? required
            ? m.status.missing
            : m.status.defaulted(defaultText)
          : state.confidence
            ? m.confidence[state.confidence]
            : '';
  const tone =
    state.status === 'conflict'
      ? 'danger'
      : state.status === 'user-entered'
        ? 'user'
        : state.status === 'missing'
          ? required
            ? 'danger'
            : 'muted'
          : state.confidence === 'high'
            ? 'ok'
            : 'attention';
  return (
    <li
      className="dimp-field"
      data-field={field}
      data-active={active || undefined}
      data-status={state.status}
      onFocus={onActivate}
    >
      <div className="dimp-field-head">
        <label className="dimp-field-label" htmlFor={`dimp-${field}`}>
          {label}
          {required && <small>{m.required}</small>}
        </label>
        <span className="dimp-badge" data-tone={tone}>
          {tone === 'ok' ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <CircleDashed size={12} aria-hidden="true" />
          )}
          {status}
        </span>
      </div>
      <div className="dimp-field-body">
        <span className="dimp-input">
          <input
            id={`dimp-${field}`}
            inputMode="decimal"
            value={inputValue}
            data-testid={`document-import-${field}`}
            aria-invalid={state.status === 'conflict' || undefined}
            onChange={(event) => onType(event.target.value)}
          />
          <small>{unitLabel}</small>
        </span>
        {state.value !== undefined &&
          state.requiresConfirmation &&
          !state.confirmed && (
            <button
              type="button"
              className="dimp-confirm"
              data-testid={`document-import-confirm-${field}`}
              onClick={onConfirm}
            >
              {m.confirm}
            </button>
          )}
        {state.confirmed && state.status !== 'user-entered' && (
          <span className="dimp-confirmed">
            <Check size={13} aria-hidden="true" />
            {m.confirmed}
          </span>
        )}
        {field !== 'pitch' && (
          <button
            type="button"
            className="dimp-measure"
            disabled={!canMeasure}
            title={canMeasure ? m.measure : m.needCalibration}
            onClick={onMeasure}
          >
            <Ruler size={14} aria-hidden="true" />
            {m.measure}
          </button>
        )}
      </div>
      {measurement && state.status !== 'user-entered' && (
        <button type="button" className="dimp-source" onClick={onActivate}>
          <MapPin size={13} aria-hidden="true" />
          {measurement.region
            ? `${m.pageShort(measurement.region.page)} · `
            : ''}
          „{measurement.label?.text ? `${measurement.label.text} ` : ''}
          {measurement.raw.text}”
          {state.unitBasis && <em> — {m.basis[state.unitBasis]}</em>}
        </button>
      )}
      {alternatives.length > 0 && (
        <select
          className="dimp-alternatives"
          value=""
          aria-label={m.alternatives(alternatives.length)}
          onChange={(event) =>
            event.target.value && onChoose(event.target.value)
          }
        >
          <option value="">{m.alternatives(alternatives.length)}</option>
          {alternatives.map((alternative) => (
            <option key={alternative.id} value={alternative.id}>
              {alternative.region
                ? `${m.pageShort(alternative.region.page)} · `
                : ''}
              {alternative.raw.text}
              {alternative.valueMm !== undefined
                ? ` → ${formatValue(alternative.valueMm)}`
                : ''}
            </option>
          ))}
        </select>
      )}
    </li>
  );
}
