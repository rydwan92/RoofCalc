import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Crosshair,
  FileText,
  FileUp,
  MapPin,
  Minus,
  Plus,
  Ruler,
  ScanLine,
  Sigma,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react';
import { resolveMonoPitchRoofSystem } from '@cieslacalc/calculator-core';
import { fromMillimetres, toMillimetres } from '@cieslacalc/roof-math';
import type { RoofTemplateSpec } from '@cieslacalc/timber-model';
import {
  calibrateFromDrawingScale,
  calibrateFromPoints,
  chooseMeasurement,
  classifyDocumentBytes,
  confirmField,
  conflictingReadings,
  deriveImportedRoofDraft,
  DOCUMENT_IMPORT_LIMITS,
  EMPTY_DECISIONS,
  enterValue,
  fieldProvenance,
  manualMeasurementResult,
  mapDraftToRoofStart,
  measurementValueSource,
  NUMERIC_ROOF_FIELDS,
  recognizeTextLayer,
  recognizeVectorGeometry,
  REQUIRED_ROOF_FIELDS,
  START_PARAMETER_OF,
  suggestPageRoles,
  summarizeIntake,
  transcribeDimension,
  transcriptionResult,
  type DocumentPageInfo,
  type DocumentPageRole,
  type IntakeNextStep,
  type PageRoleSuggestion,
  type DraftRelation,
  type DocumentSourceKind,
  type DraftField,
  type ImportDecisions,
  type ImportedRoofDraftV1,
  type IngestionRejection,
  type ManualMeasurementInput,
  type NumericRoofField,
  type PageBox,
  type PagePoint,
  type RecognitionResult,
  type RecognizedMeasurement,
  type RoofStartParameters,
  IMPORT_ROOF_TYPES,
  type ImportRoofType,
  type ValueProvenance,
  type ScaleCalibration,
  type SourceRegion,
  type TranscriptionError,
  type TranscriptionTarget,
} from '@cieslacalc/document-import-core';
import { parseDecimal } from '../format';
import { createDefaultProjectDocument, useAssembly } from '../assembly/store';
import {
  createProjectStartTemplate,
  projectStartValuesFromTemplate,
} from '../assembly/project-start';
import { RoofPlanPreview } from '../assembly/ProjectStartAssistant';
import {
  monoPitchDraftFromImport,
  monoPitchDraftIssues,
  monoPitchImportDefaults,
  monoPitchSystemInput,
  type MonoPitchDraft,
  type MonoPitchImportOrigin,
} from '../mono-pitch/mono-pitch-draft';
import { MonoPitchSection } from '../mono-pitch/MonoPitchSection';
import type { ImportIntakeReport } from '../assembly/project-preparation';
import { importCopy, type ImportCopy } from './copy';
import {
  fetchSampleDocument,
  SAMPLE_DOCUMENTS,
  type SampleDocument,
} from './samples';
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
  vector?: RecognitionResult;
  pdf?: OpenedPdf;
  image?: OpenedImage;
  /** VNext-6: time spent reading on this device (open + recognition), ms. */
  readMs: number;
  /** VNext-6: suggested role of every analysed page (from page titles). */
  roles: PageRoleSuggestion[];
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
  const started = performance.now();
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
      const text = recognizeTextLayer(pdf.textPages, {
        totalPages: pdf.pageCount,
      });
      const vector = recognizeVectorGeometry({
        pages: pdf.pages.map((page) => ({
          ...page,
          segments: pdf.segments.filter((item) => item.page === page.page),
        })),
        scale: text.scale,
        written: text.measurements,
      });
      return {
        ...common,
        pdf,
        pages: pdf.pages,
        pageCount: pdf.pageCount,
        text,
        vector,
        roles: suggestPageRoles({
          pages: pdf.textPages,
          results: [text, vector],
        }),
        readMs: Math.round(performance.now() - started),
      };
    } catch (error) {
      // The technical reason only (never document content), for support.
      console.warn('RoofCalc document import: PDF could not be read', error);
      throw new DocumentLoadError(
        error instanceof PdfPasswordError ? 'password' : 'failed',
      );
    }
  }
  try {
    const image = await openImage(
      new Blob([bytes], { type: `image/${verdict.kind}` }),
    );
    return {
      ...common,
      image,
      pages: image.pages,
      pageCount: 1,
      roles: [],
      readMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    throw new DocumentLoadError(
      error instanceof ImageTooLargeError ? 'image-too-large' : 'failed',
    );
  }
}

type Tool =
  | { kind: 'select' }
  | { kind: 'transcribe' }
  | { kind: 'calibrate' }
  | { kind: 'measure'; field: NumericRoofField };

const LENGTH_FIELDS: readonly NumericRoofField[] = NUMERIC_ROOF_FIELDS.filter(
  (field) => field !== 'pitch',
);

/** What a transcribed dimension can mean, in the order a plan is read. */
const TRANSCRIPTION_TARGETS: readonly TranscriptionTarget[] = [
  'buildingLength',
  'buildingWidth',
  'pitch',
  'eave',
  'spacing',
  'rafterSection',
];

/** A framed region on the page while the user types what it says. */
interface PendingFrame {
  page: number;
  box: PageBox;
}

/** A click without a drag frames this share of the page around the point. */
const CLICK_FRAME = { width: 0.08, height: 0.035 };

/** A page has no usable text: a photo, a scan or a scanned PDF page. */
function isRasterPage(doc: LoadedDocument, page: number): boolean {
  if (!doc.pdf) return true;
  const text = doc.pdf.textPages.find((item) => item.page === page);
  return !text?.items.some((item) => item.text.trim());
}

function displayNumber(value: number, digits: number) {
  return String(Number(value.toFixed(digits)));
}

export function DocumentImportWorkspace({
  initialFile,
  onClose,
  onCreate,
  onOpenMonoPitch,
}: {
  /** VNext-4: a file already chosen elsewhere (universal file opening). */
  initialFile?: File;
  onClose: () => void;
  onCreate: (
    template: RoofTemplateSpec,
    name: string,
    /** VNext-6: what the document gave — for the preparation card. */
    intake: ImportIntakeReport,
  ) => Promise<void>;
  /**
   * VNext-7C: a reviewed mono-pitch roof opens its calculation (no project
   * format yet, ADR-015). Without it a mono-pitch draft cannot be finished.
   */
  onOpenMonoPitch?: (initial: {
    draft: MonoPitchDraft;
    origin: MonoPitchImportOrigin;
  }) => void;
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
  // Dimension-first transcription of a scan or photo.
  /** One entry per framed dimension; a section pair yields two readings. */
  const [transcriptions, setTranscriptions] = useState<
    { id: string; measurements: RecognizedMeasurement[] }[]
  >([]);
  const [frame, setFrame] = useState<PendingFrame>();
  const [framing, setFraming] = useState(false);
  const [transcribeText, setTranscribeText] = useState('');
  const [transcribeTarget, setTranscribeTarget] = useState<
    TranscriptionTarget | ''
  >('');
  const [transcribeError, setTranscribeError] = useState<TranscriptionError>();
  const frameStart = useRef<PagePoint | undefined>(undefined);
  const transcriptionCount = useRef(0);
  const zoomCanvas = useRef<HTMLCanvasElement>(null);
  const transcribeInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewPanel = useRef<HTMLElement>(null);
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
        fingerprint: doc.fingerprint,
        pages: doc.pages,
      },
    [doc],
  );
  /**
   * VNext-6: with pages set aside, the text layer is read again from the
   * remaining pages, so a unit, scale or roof type written elsewhere in the
   * document still applies (the core also drops readings of those pages).
   */
  const excludedPages = decisions.excludedPages;
  const engines = useMemo(() => {
    if (!doc?.pdf || !excludedPages?.length)
      return { text: doc?.text, vector: doc?.vector };
    const pdf = doc.pdf;
    const kept = (page: number) => !excludedPages.includes(page);
    const text = recognizeTextLayer(
      pdf.textPages.filter((page) => kept(page.page)),
      {
        totalPages:
          pdf.pageCount -
          excludedPages.filter((page) => page <= pdf.textPages.length).length,
      },
    );
    return {
      text,
      vector: recognizeVectorGeometry({
        pages: pdf.pages
          .filter((page) => kept(page.page))
          .map((page) => ({
            ...page,
            segments: pdf.segments.filter((item) => item.page === page.page),
          })),
        scale: text.scale,
        written: text.measurements,
      }),
    };
  }, [doc, excludedPages]);
  const manualResult = useMemo(
    () =>
      calibration && manual.length
        ? manualMeasurementResult(calibration, manual)
        : undefined,
    [calibration, manual],
  );
  const transcribed = useMemo(
    () =>
      transcriptions.length
        ? transcriptionResult(
            transcriptions.flatMap((entry) => entry.measurements),
          )
        : undefined,
    [transcriptions],
  );
  const draft = useMemo(
    () =>
      source
        ? deriveImportedRoofDraft({
            source,
            results: [
              ...(engines.text ? [engines.text] : []),
              ...(transcribed ? [transcribed] : []),
              ...(engines.vector ? [engines.vector] : []),
              ...(manualResult ? [manualResult] : []),
            ],
            decisions,
          })
        : undefined,
    [decisions, engines, manualResult, source, transcribed],
  );
  const chainOf = useMemo(() => {
    const byTotal = new Map<
      string,
      Extract<DraftRelation, { kind: 'dimension-chain' }>
    >();
    const members = new Map<string, 'total' | 'part'>();
    for (const relation of draft?.relations ?? [])
      if (relation.kind === 'dimension-chain') {
        byTotal.set(relation.totalMeasurementId, relation);
        members.set(relation.totalMeasurementId, 'total');
        for (const id of relation.partMeasurementIds)
          if (!members.has(id)) members.set(id, 'part');
      }
    return { byTotal, members };
  }, [draft?.relations]);
  const rasterPage = !!doc && isRasterPage(doc, pageNumber);
  const monoPitch = draft?.roofType.value === 'mono-pitch';
  /** The labelled defaults of the calculation this roof goes to. */
  const startDefaults = monoPitch ? monoPitchImportDefaults : defaults;
  const mapping = useMemo(
    () => (draft ? mapDraftToRoofStart(draft, startDefaults) : undefined),
    [startDefaults, draft],
  );
  const template = useMemo(() => {
    if (mapping?.status !== 'ready') return undefined;
    const { roofType } = mapping.values;
    if (roofType === 'mono-pitch') return undefined;
    try {
      return createProjectStartTemplate({ ...mapping.values, roofType }, base);
    } catch {
      return undefined;
    }
  }, [base, mapping]);
  /** VNext-7C: the inputs a reviewed mono-pitch roof opens its calculation with. */
  const monoPitchStart = useMemo(() => {
    if (mapping?.status !== 'ready' || mapping.values.roofType !== 'mono-pitch')
      return undefined;
    const start = monoPitchDraftFromImport(mapping.values, mapping.provenance);
    return Object.keys(monoPitchDraftIssues(start.draft)).length
      ? undefined
      : start;
  }, [mapping]);
  const ready = !!template || (!!monoPitchStart && !!onOpenMonoPitch);
  /** The mono-pitch section forming during the review (the shared solver). */
  const monoPitchPreview = useMemo(() => {
    if (!draft || draft.roofType.value !== 'mono-pitch') return undefined;
    const values = { ...monoPitchImportDefaults };
    const provenance = {} as Record<NumericRoofField, ValueProvenance>;
    for (const field of NUMERIC_ROOF_FIELDS) {
      const value = draft.fields[field].value;
      if (value === undefined && REQUIRED_ROOF_FIELDS.includes(field))
        return undefined;
      if (value !== undefined) values[START_PARAMETER_OF[field]] = value;
      provenance[field] = value === undefined ? 'roofcalc-default' : 'document';
    }
    const preview = monoPitchDraftFromImport(values, provenance).draft;
    if (Object.keys(monoPitchDraftIssues(preview)).length) return undefined;
    try {
      return resolveMonoPitchRoofSystem(monoPitchSystemInput(preview));
    } catch {
      return undefined;
    }
  }, [draft]);
  /** The model forming while the user reviews — never the confirmed one. */
  const previewTemplate = useMemo(() => {
    if (template) return template;
    const roofType = draft?.roofType.value;
    if (!draft || !roofType || roofType === 'mono-pitch') return undefined;
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
    setTranscriptions([]);
    setFrame(undefined);
    setFraming(false);
    setTranscribeText('');
    setTranscribeTarget('');
    setTranscribeError(undefined);
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

  const initialLoaded = useRef(false);
  useEffect(() => {
    if (!initialFile || initialLoaded.current) return;
    initialLoaded.current = true;
    void chooseFile(initialFile);
    // Once, for the file the workspace was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  async function openSample(sample: SampleDocument) {
    setLoadError(undefined);
    setLoading(m.loading);
    try {
      await chooseFile(await fetchSampleDocument(sample));
    } catch {
      setLoading(undefined);
      setLoadError(m.sampleFailed);
    }
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
      // VNext-6: open a multi-page design on its roof plan, else on the
      // page that names the most roof parameters.
      const plan =
        loaded.roles.find(
          (role) => role.role === 'roof-plan' && role.fields.length,
        ) ??
        [...loaded.roles]
          .filter((role) => role.fields.length)
          .sort((a, b) => b.fields.length - a.fields.length)[0];
      if (plan) setPageNumber(plan.page);
      else if (first?.region) setPageNumber(first.region.page);
      // A scan or photo has nothing to point at: start by reading the
      // dimensions written on it.
      if (isRasterPage(loaded, first?.region?.page ?? 1))
        setTool({ kind: 'transcribe' });
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

  /* ---------------------- transcription (dimension-first) -------------- */

  function frameBetween(a: PagePoint, b: PagePoint): PendingFrame {
    return {
      page: a.page,
      box: {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(b.x - a.x),
        height: Math.abs(b.y - a.y),
      },
    };
  }

  function onFrameStart(event: React.PointerEvent<SVGSVGElement>) {
    if (tool.kind !== 'transcribe' || event.button !== 0) return;
    const point = pagePoint(event);
    frameStart.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFraming(true);
    setFrame(frameBetween(point, point));
    setTranscribeError(undefined);
  }

  function onFrameMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!framing || !frameStart.current) return;
    setFrame(frameBetween(frameStart.current, pagePoint(event)));
  }

  function onFrameEnd(event: React.PointerEvent<SVGSVGElement>) {
    if (!framing || !frameStart.current || !pageInfo) return;
    const start = frameStart.current;
    const end = pagePoint(event);
    frameStart.current = undefined;
    setFraming(false);
    let next = frameBetween(start, end);
    // A click (or a tiny drag) frames a typical dimension around the point.
    if (
      next.box.width < pageInfo.width * 0.01 &&
      next.box.height < pageInfo.height * 0.01
    ) {
      const width = pageInfo.width * CLICK_FRAME.width;
      const height = pageInfo.height * CLICK_FRAME.height;
      next = {
        page: start.page,
        box: {
          x: Math.max(0, start.x - width / 2),
          y: Math.max(0, start.y - height / 2),
          width,
          height,
        },
      };
    }
    setFrame(next);
    // Suggest the meaning only for a field the user is filling in — one
    // that is still empty — never the field just answered.
    if (
      !transcribeTarget &&
      activeField &&
      draft?.fields[activeField].value === undefined
    )
      setTranscribeTarget(
        activeField === 'rafterWidth' || activeField === 'rafterDepth'
          ? 'rafterSection'
          : activeField,
      );
    requestAnimationFrame(() => transcribeInput.current?.focus());
  }

  // The framed region, magnified from the rendered page, beside the input.
  useEffect(() => {
    const target = zoomCanvas.current;
    const source = canvas.current;
    if (!frame || framing || !target || !source || !pageInfo) return;
    const sx = (frame.box.x / pageInfo.width) * source.width;
    const sy = (frame.box.y / pageInfo.height) * source.height;
    const sw = Math.max(1, (frame.box.width / pageInfo.width) * source.width);
    const sh = Math.max(
      1,
      (frame.box.height / pageInfo.height) * source.height,
    );
    const scale = Math.min(320 / sw, 120 / sh, 6);
    target.width = Math.max(1, Math.round(sw * scale));
    target.height = Math.max(1, Math.round(sh * scale));
    const context = target.getContext('2d');
    context?.drawImage(
      source,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      target.width,
      target.height,
    );
  }, [frame, framing, pageInfo]);

  function cancelTranscription() {
    setFrame(undefined);
    setFraming(false);
    setTranscribeText('');
    setTranscribeError(undefined);
  }

  function saveTranscription() {
    if (!frame) return;
    transcriptionCount.current += 1;
    const id = `transcription:${transcriptionCount.current}`;
    const outcome = transcribeDimension({
      id,
      page: frame.page,
      box: frame.box,
      text: transcribeText,
      ...(transcribeTarget ? { target: transcribeTarget } : {}),
    });
    if (!outcome.ok) {
      setTranscribeError(outcome.error);
      return;
    }
    setTranscriptions([
      ...transcriptions,
      { id, measurements: outcome.measurements },
    ]);
    // A transcription for a field is the reading the user chose for it.
    let next = decisions;
    const nextInputs = { ...inputs };
    for (const measurement of outcome.measurements)
      if (measurement.field) {
        next = chooseMeasurement(next, measurement.field, measurement.id);
        delete nextInputs[measurement.field];
      }
    setInputs(nextInputs);
    update(next);
    const assigned = outcome.measurements[0]?.field;
    if (assigned) setActiveField(assigned);
    setFocusId(outcome.measurements[0]?.id);
    setFrame(undefined);
    setTranscribeText('');
    setTranscribeTarget('');
    setTranscribeError(undefined);
  }

  function removeTranscription(id: string) {
    setTranscriptions(transcriptions.filter((entry) => entry.id !== id));
    setReviewed(false);
  }

  function onPageClick(event: React.MouseEvent<SVGSVGElement>) {
    if (tool.kind === 'select' || tool.kind === 'transcribe') return;
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
    if (monoPitchStart && onOpenMonoPitch) {
      if (!reviewed || !doc || submitting.current) return;
      submitting.current = true;
      onOpenMonoPitch({
        draft: monoPitchStart.draft,
        origin: { fileName: doc.fileName, fields: monoPitchStart.fields },
      });
      return;
    }
    if (
      !template ||
      !reviewed ||
      submitting.current ||
      !doc ||
      mapping?.status !== 'ready'
    )
      return;
    submitting.current = true;
    setBusy(true);
    setCreateError(undefined);
    const skipped = decisions.excludedPages?.length ?? 0;
    try {
      await onCreate(
        template,
        m.projectName(doc.fileName.replace(/\.[^.]+$/, '')),
        {
          source: doc.kind === 'pdf' ? 'pdf' : 'image',
          fileName: doc.fileName,
          fingerprint: doc.fingerprint,
          values: { ...mapping.provenance },
          pagesRead: doc.pages.length - skipped,
          pagesSkipped: skipped,
          readMs: doc.readMs,
        },
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
  const intakeSummary = useMemo(
    () => (draft ? summarizeIntake(draft, { reviewed }) : undefined),
    [draft, reviewed],
  );

  /** VNext-6: takes the user to exactly the control the next step needs. */
  function goTo(next: IntakeNextStep) {
    const panel = reviewPanel.current;
    const reveal = (element: Element | null | undefined) => {
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (element instanceof HTMLElement) element.focus();
    };
    switch (next.kind) {
      case 'unsupported-roof':
      case 'choose-roof-type':
      case 'confirm-roof-type': {
        const row = panel?.querySelector(
          '[data-testid="document-import-roof-type"]',
        );
        reveal(
          next.kind === 'confirm-roof-type'
            ? row?.querySelector('.dimp-confirm')
            : row?.querySelector('button'),
        );
        scrollToRegion(draft?.roofType.detected?.region);
        return;
      }
      case 'resolve-conflict':
      case 'enter-value':
      case 'confirm-value': {
        activate(next.field);
        requestAnimationFrame(() => {
          const row = panel?.querySelector(`[data-field="${next.field}"]`);
          reveal(
            next.kind === 'confirm-value'
              ? row?.querySelector('.dimp-confirm')
              : next.kind === 'resolve-conflict'
                ? row?.querySelector('.dimp-conflict-option')
                : row?.querySelector('input'),
          );
        });
        return;
      }
      case 'final-review':
        reveal(
          panel?.querySelector('[data-testid="document-import-reviewed"]'),
        );
        return;
      case 'create':
        void create();
    }
  }

  function togglePage(page: number) {
    const excluded = decisions.excludedPages ?? [];
    update({
      ...decisions,
      excludedPages: excluded.includes(page)
        ? excluded.filter((item) => item !== page)
        : [...excluded, page].sort((a, b) => a - b),
    });
  }
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
            <div
              className="dimp-samples"
              role="group"
              aria-label={m.samplesTitle}
              data-testid="document-import-samples"
            >
              <span>{m.samplesTitle}</span>
              <div>
                {SAMPLE_DOCUMENTS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    data-testid={`document-import-sample-${sample.id}`}
                    disabled={!!loading}
                    onClick={() => void openSample(sample)}
                  >
                    <FileText size={15} aria-hidden="true" />
                    {m.sample[sample.id]}
                  </button>
                ))}
              </div>
              <small>{m.samplesHint}</small>
            </div>
            <p className="dimp-privacy">{m.privacy}</p>
            {loadError && (
              <p className="dimp-error" role="alert">
                {loadError}
              </p>
            )}
          </div>
        ) : (
          <div className="dimp-body">
            {/* VNext-6: one grid item — top of the review column on a
                desktop, pinned above the document on a phone. */}
            {intakeSummary && (
              <IntakeSummaryBar
                summary={intakeSummary}
                copy={m}
                fieldLabel={fieldLabel}
                onNext={goTo}
              />
            )}
            <section className="dimp-document" aria-label={m.document}>
              {doc.pages.length > 1 && doc.roles.length > 0 && (
                <PageNavigator
                  doc={doc}
                  current={pageNumber}
                  excluded={decisions.excludedPages ?? []}
                  corrections={decisions.pageRoles ?? {}}
                  copy={m}
                  onSelect={setPageNumber}
                  onToggle={togglePage}
                  onRole={(page, role) =>
                    setDecisions({
                      ...decisions,
                      pageRoles: { ...decisions.pageRoles, [page]: role },
                    })
                  }
                />
              )}
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
                  className="dimp-group dimp-group-reading"
                  role="group"
                  aria-label={m.readingGroup}
                >
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'select'}
                    onClick={() => {
                      setTool({ kind: 'select' });
                      setPending([]);
                      cancelTranscription();
                    }}
                  >
                    <Crosshair size={16} aria-hidden="true" />
                    {m.toolSelect}
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'transcribe'}
                    data-testid="document-import-transcribe"
                    onClick={() => {
                      setTool({ kind: 'transcribe' });
                      setPending([]);
                    }}
                  >
                    <TextCursorInput size={16} aria-hidden="true" />
                    {m.toolTranscribe}
                  </button>
                </div>
                <div
                  className="dimp-group dimp-group-scale"
                  role="group"
                  aria-label={m.scaleGroup}
                  title={m.scaleGroup}
                >
                  <button
                    type="button"
                    aria-pressed={tool.kind === 'calibrate'}
                    data-testid="document-import-calibrate"
                    onClick={() => {
                      setTool({ kind: 'calibrate' });
                      setPending([]);
                      cancelTranscription();
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
                    : tool.kind === 'transcribe'
                      ? m.toolHintTranscribe
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
              {frame && !framing && (
                <form
                  className="dimp-transcribe"
                  data-testid="document-import-transcription"
                  aria-label={m.transcribeTitle}
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveTranscription();
                  }}
                >
                  <figure className="dimp-zoom">
                    <canvas ref={zoomCanvas} aria-hidden="true" />
                    <figcaption>{m.transcribeZoom}</figcaption>
                  </figure>
                  <div className="dimp-transcribe-fields">
                    <label>
                      {m.transcribeValue}
                      <span className="dimp-input">
                        <input
                          ref={transcribeInput}
                          value={transcribeText}
                          placeholder={m.transcribeValueHint}
                          data-testid="document-import-transcription-value"
                          aria-invalid={!!transcribeError || undefined}
                          aria-describedby="dimp-transcribe-error"
                          onChange={(event) => {
                            setTranscribeText(event.target.value);
                            setTranscribeError(undefined);
                          }}
                        />
                      </span>
                    </label>
                    <label>
                      {m.transcribeMeaning}
                      <select
                        value={transcribeTarget}
                        data-testid="document-import-transcription-target"
                        onChange={(event) =>
                          setTranscribeTarget(
                            event.target.value as TranscriptionTarget | '',
                          )
                        }
                      >
                        <option value="">{m.transcribeUnassigned}</option>
                        {TRANSCRIPTION_TARGETS.map((target) => (
                          <option key={target} value={target}>
                            {target === 'rafterSection'
                              ? m.rafterSection
                              : fieldLabel(target)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {transcribeError && (
                      <p
                        id="dimp-transcribe-error"
                        className="dimp-error"
                        role="alert"
                      >
                        {m.transcribeError[transcribeError]}
                      </p>
                    )}
                    <div className="dimp-transcribe-actions">
                      <button
                        type="submit"
                        className="dimp-primary"
                        data-testid="document-import-transcription-save"
                      >
                        {m.transcribeSave}
                      </button>
                      <button type="button" onClick={cancelTranscription}>
                        {m.transcribeCancel}
                      </button>
                    </div>
                  </div>
                </form>
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
                      onPointerDown={onFrameStart}
                      onPointerMove={onFrameMove}
                      onPointerUp={onFrameEnd}
                      data-testid="document-import-overlay"
                      aria-label={m.document}
                      role="img"
                    >
                      {draft?.measurements
                        .filter(
                          (measurement) =>
                            measurement.region?.page === pageNumber &&
                            measurement.mode !== 'manual' &&
                            // A pair transcription shares one frame.
                            !(
                              measurement.mode === 'transcription' &&
                              measurement.field === 'rafterDepth'
                            ),
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
                              data-mode={measurement.mode}
                              data-chain={chainOf.members.get(measurement.id)}
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
                      {frame?.page === pageNumber && (
                        <rect
                          className="dimp-frame"
                          data-testid="document-import-frame"
                          x={frame.box.x}
                          y={frame.box.y}
                          width={frame.box.width}
                          height={frame.box.height}
                        />
                      )}
                    </svg>
                  </div>
                )}
              </div>
            </section>
            {draft && (
              <section
                ref={reviewPanel}
                className="dimp-review"
                aria-label={m.review}
                data-testid="document-import-review"
              >
                <h3>{m.review}</h3>
                <p className="dimp-principle">
                  <Sigma size={14} aria-hidden="true" />
                  {m.dimensionFirst}
                </p>
                {rasterPage && (
                  <p
                    className="dimp-raster-notice"
                    data-testid="document-import-raster-notice"
                  >
                    <TextCursorInput size={16} aria-hidden="true" />
                    {m.rasterNotice}
                  </p>
                )}
                <details className="dimp-engines">
                  <summary>
                    <ScanLine size={15} aria-hidden="true" />
                    {doc.text &&
                    !doc.text.warnings.some((w) => w.code === 'no-text-layer')
                      ? m.engineText(textCount)
                      : m.engineTranscription}
                  </summary>
                  <ul>
                    <li data-available="true">
                      {doc.text ? m.engineText(textCount) : m.engineNoText}
                    </li>
                    {doc.kind === 'pdf' && (
                      <li data-available="true">
                        {m.engineVector(
                          !!doc.vector?.segments?.some(
                            (segment) => segment.role === 'outline',
                          ),
                        )}
                      </li>
                    )}
                    <li data-available="true">{m.engineTranscription}</li>
                    <li data-available="true">{m.engineManual}</li>
                    <li data-available="false">{m.engineOcr}</li>
                    <li data-available="false">{m.engineAi}</li>
                    <li data-testid="document-import-read-time">
                      {m.readTime(
                        new Intl.NumberFormat(i18n.language).format(doc.readMs),
                      )}
                    </li>
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
                {transcriptions.length > 0 && (
                  <section
                    className="dimp-transcriptions"
                    data-testid="document-import-transcriptions"
                  >
                    <h4>{m.transcriptions(transcriptions.length)}</h4>
                    <ul>
                      {transcriptions.map((entry) => {
                        const [first] = entry.measurements;
                        if (!first) return null;
                        const meaning =
                          entry.measurements.length > 1
                            ? m.rafterSection
                            : first.field
                              ? fieldLabel(first.field)
                              : m.unassigned;
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              className="dimp-source"
                              onClick={() => scrollToMeasurement(first)}
                            >
                              <MapPin size={13} aria-hidden="true" />
                              <strong>{first.raw.text}</strong> — {meaning}
                              {chainOf.members.get(first.id) && (
                                <span className="dimp-chain-tag">
                                  <Sigma size={11} aria-hidden="true" />
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              className="dimp-icon"
                              aria-label={`${m.removeTranscription}: ${first.raw.text}`}
                              title={m.removeTranscription}
                              onClick={() => removeTranscription(entry.id)}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
                <ul className="dimp-fields">
                  {NUMERIC_ROOF_FIELDS.map((field) => {
                    const state = draft.fields[field];
                    const measurement = state.measurementId
                      ? measurementById.get(state.measurementId)
                      : undefined;
                    const chain = state.measurementId
                      ? chainOf.byTotal.get(state.measurementId)
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
                        conflict={conflictingReadings(draft, field)}
                        provenance={fieldProvenance(draft, field)}
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
                          startDefaults[START_PARAMETER_OF[field]],
                        )}
                        formatValue={(value) => formatWithUnit(field, value)}
                        canMeasure={
                          LENGTH_FIELDS.includes(field) &&
                          calibration?.page === pageNumber
                        }
                        chain={
                          chain && measurement
                            ? {
                                parts: chain.partMeasurementIds
                                  .map(
                                    (id) => measurementById.get(id)?.raw.text,
                                  )
                                  .filter(Boolean)
                                  .join(' + '),
                                total: measurement.raw.text,
                              }
                            : undefined
                        }
                        crossCheck={(() => {
                          const relation = draft.relations.find(
                            (item) =>
                              item.kind === 'scale-cross-check' &&
                              item.measurementId === state.measurementId,
                          );
                          return relation?.kind === 'scale-cross-check' &&
                            draft.scale
                            ? {
                                deviationRatio: relation.deviationRatio,
                                denominator: draft.scale.denominator,
                              }
                            : undefined;
                        })()}
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
                  {monoPitch ? (
                    monoPitchPreview ? (
                      <div
                        className="dimp-mono-preview"
                        data-testid="document-import-mono-preview"
                        aria-label={m.monoPitchPreview}
                      >
                        <MonoPitchSection
                          assembly={
                            monoPitchPreview.framing.calculation.assembly
                          }
                          unit={unit}
                        />
                      </div>
                    ) : (
                      <p className="dimp-preview-empty">{m.previewEmpty}</p>
                    )
                  ) : (
                    <RoofPlanPreview
                      template={previewTemplate}
                      label={m.preview}
                      invalidLabel={m.previewEmpty}
                    />
                  )}
                  <p>{monoPitch ? m.monoPitchConstruction : m.construction}</p>
                </section>
                <p className="dimp-limitation">{m.limitation}</p>
                {mapping?.status === 'blocked' && (
                  <section
                    className="dimp-blockers"
                    data-testid="document-import-blockers"
                  >
                    <h4>{monoPitch ? m.monoPitchBlockers : m.blockers}</h4>
                    <ul>
                      {mapping.blockers.map((blocker, index) => (
                        <li key={index}>{m.blocker(blocker, fieldLabel)}</li>
                      ))}
                    </ul>
                  </section>
                )}
                {mapping?.status === 'ready' && !ready && (
                  <p className="dimp-error" role="alert">
                    {m.invalidTemplate}
                  </p>
                )}
                <label className="dimp-check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={!ready || busy}
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
                  disabled={!ready || !reviewed || busy}
                  onClick={() => void create()}
                >
                  {busy ? m.creating : monoPitch ? m.openMonoPitch : m.create}
                </button>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** VNext-6: every page with its role, readings and a way to set it aside. */
function PageNavigator({
  doc,
  current,
  excluded,
  corrections,
  copy: m,
  onSelect,
  onToggle,
  onRole,
}: {
  doc: LoadedDocument;
  current: number;
  excluded: readonly number[];
  corrections: Readonly<Partial<Record<number, DocumentPageRole>>>;
  copy: ImportCopy;
  onSelect: (page: number) => void;
  onToggle: (page: number) => void;
  onRole: (page: number, role: DocumentPageRole) => void;
}) {
  const canvases = useRef(new Map<number, HTMLCanvasElement>());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const page of doc.pages) {
        const canvas = canvases.current.get(page.page);
        if (cancelled || !canvas || !doc.pdf) return;
        await doc.pdf.thumbnail(page.page, canvas, 76).catch(() => undefined);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);
  const role = doc.roles.find((item) => item.page === current);
  const skipped = excluded.includes(current);
  return (
    <div className="dimp-pages" data-testid="document-import-pages">
      <ol aria-label={m.pages}>
        {doc.roles.map((item) => {
          const effective = corrections[item.page] ?? item.role;
          const off = excluded.includes(item.page);
          return (
            <li key={item.page}>
              <button
                type="button"
                aria-current={item.page === current ? 'page' : undefined}
                aria-label={m.pageButton(
                  item.page,
                  m.pageRole[effective],
                  item.readings,
                  off,
                )}
                data-role={effective}
                data-skipped={off || undefined}
                data-testid={`document-import-page-${item.page}`}
                onClick={() => onSelect(item.page)}
              >
                <canvas
                  ref={(element) => {
                    if (element) canvases.current.set(item.page, element);
                  }}
                  aria-hidden="true"
                />
                <span className="dimp-page-number">{item.page}</span>
                <span className="dimp-page-role">{m.pageRole[effective]}</span>
                {item.fields.length > 0 && (
                  <span className="dimp-page-count" aria-hidden="true">
                    {item.fields.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      {role && (
        <div className="dimp-page-meta" data-testid="document-import-page-meta">
          <label>
            {m.pageRoleLabel}
            <select
              value={corrections[current] ?? role.role}
              data-testid="document-import-page-role"
              onChange={(event) =>
                onRole(current, event.target.value as DocumentPageRole)
              }
            >
              {(
                [
                  'roof-plan',
                  'framing-plan',
                  'section',
                  'floor-plan',
                  'elevation',
                  'schedule',
                  'unknown',
                ] as const
              ).map((value) => (
                <option key={value} value={value}>
                  {m.pageRole[value]}
                </option>
              ))}
            </select>
          </label>
          {role.evidence && corrections[current] === undefined && (
            <small>{m.pageRoleFrom(role.evidence.text)}</small>
          )}
          <small>
            {skipped ? m.pageSkippedHint : m.pageReadings(role.readings)}
          </small>
          <button
            type="button"
            className="dimp-page-skip"
            aria-pressed={skipped}
            data-testid="document-import-page-skip"
            onClick={() => onToggle(current)}
          >
            {skipped ? m.pageInclude : m.pageSkip}
          </button>
        </div>
      )}
    </div>
  );
}

/** VNext-6: what was read, what is left, and ONE next step. */
function IntakeSummaryBar({
  summary,
  copy: m,
  fieldLabel,
  onNext,
}: {
  summary: ReturnType<typeof summarizeIntake>;
  copy: ImportCopy;
  fieldLabel: (field: NumericRoofField) => string;
  onNext: (step: IntakeNextStep) => void;
}) {
  const { counts } = summary;
  return (
    <section
      className="dimp-intake"
      aria-label={m.intakeTitle}
      data-testid="document-import-intake"
    >
      <div className="dimp-intake-counts">
        <strong data-testid="document-import-settled">
          {m.intakeSettled(counts.settled, counts.total)}
        </strong>
        {counts.toConfirm > 0 && (
          <span data-tone="attention">
            {m.intakeToConfirm(counts.toConfirm)}
          </span>
        )}
        {counts.missing > 0 && (
          <span data-tone="danger">{m.intakeMissing(counts.missing)}</span>
        )}
        {counts.defaulted > 0 && (
          <span data-tone="muted">{m.intakeDefaulted(counts.defaulted)}</span>
        )}
        {counts.unsupported > 0 && (
          <span data-tone="danger">{m.intakeUnsupported}</span>
        )}
      </div>
      <ol className="dimp-intake-items">
        {summary.items.map((item) => (
          <li
            key={item.key}
            data-state={item.state}
            title={`${item.key === 'roofType' ? m.roofType : fieldLabel(item.key)}: ${m.intakeItem[item.state]}`}
          >
            <span className="dimp-visually-hidden">
              {item.key === 'roofType' ? m.roofType : fieldLabel(item.key)}:{' '}
              {m.intakeItem[item.state]}
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="dimp-primary dimp-intake-next"
        data-testid="document-import-next"
        data-step={summary.next.kind}
        onClick={() => onNext(summary.next)}
      >
        <small>{m.intakeNext}</small>
        <span>{m.intakeStep(summary.next, fieldLabel)}</span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
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
  onChange: (value: ImportRoofType) => void;
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
        {IMPORT_ROOF_TYPES.map((value) => (
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
  conflict,
  provenance,
  copy: m,
  label,
  unitLabel,
  required,
  active,
  inputValue,
  defaultText,
  formatValue,
  canMeasure,
  chain,
  crossCheck,
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
  /** VNext-3: the disagreeing readings, side by side (empty if none). */
  conflict: readonly RecognizedMeasurement[];
  /** VNext-6: where the value came from (document, page, engine). */
  provenance: ReturnType<typeof fieldProvenance>;
  copy: ImportCopy;
  label: string;
  unitLabel: string;
  required: boolean;
  active: boolean;
  inputValue: string;
  defaultText: string;
  formatValue: (value: number) => string;
  canMeasure: boolean;
  /** Written parts that add up to this written overall dimension. */
  chain?: { parts: string; total: string };
  /** Written value compared with the same line drawn at scale. */
  crossCheck?: { deviationRatio: number; denominator: number };
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
          {measurement.mode === 'vector-geometry' ? (
            m.drawnSource
          ) : (
            <>
              {measurement.mode === 'transcription' &&
                `${m.transcribedSource}: `}
              „{measurement.label?.text ? `${measurement.label.text} ` : ''}
              {measurement.raw.text}”
              {measurementValueSource(measurement) === 'scaled' &&
                ` — ${m.scaledSource}`}
            </>
          )}
          {state.unitBasis && state.unitBasis !== 'calibrated' && (
            <em> — {m.basis[state.unitBasis]}</em>
          )}
        </button>
      )}
      {provenance.engine && state.status !== 'user-entered' && (
        <details
          className="dimp-provenance"
          data-testid={`document-import-provenance-${field}`}
        >
          <summary>{m.provenance}</summary>
          <ul>
            {provenance.documentFingerprint && (
              <li>{m.provenanceDocument(provenance.documentFingerprint)}</li>
            )}
            {provenance.page !== undefined && (
              <li>{m.pageShort(provenance.page)}</li>
            )}
            <li>{m.provenanceEngine[provenance.engine.mode]}</li>
            {provenance.unitBasis && <li>{m.basis[provenance.unitBasis]}</li>}
            {provenance.confidence && (
              <li>{m.confidence[provenance.confidence]}</li>
            )}
            {provenance.alternatives.length > 0 && (
              <li>{m.alternatives(provenance.alternatives.length)}</li>
            )}
            {provenance.warnings.length > 0 && (
              <li>{m.provenanceWarnings(provenance.warnings.length)}</li>
            )}
          </ul>
        </details>
      )}
      {chain && state.status !== 'user-entered' && (
        <small
          className="dimp-chain"
          data-testid={`document-import-chain-${field}`}
        >
          <Sigma size={12} aria-hidden="true" />
          {m.chainEvidence(chain.parts, chain.total)}
          <Check size={12} aria-hidden="true" />
        </small>
      )}
      {crossCheck && state.status !== 'user-entered' && (
        <small
          className="dimp-cross-check"
          data-agrees={crossCheck.deviationRatio <= 0.02 || undefined}
          data-testid={`document-import-cross-check-${field}`}
        >
          {crossCheck.deviationRatio <= 0.02 ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <AlertTriangle size={12} aria-hidden="true" />
          )}
          {(crossCheck.deviationRatio <= 0.02
            ? m.crossCheckMatch
            : m.crossCheckMismatch)(
            crossCheck.denominator,
            `${(crossCheck.deviationRatio * 100).toFixed(1).replace('.', ',')} %`,
          )}
        </small>
      )}
      {conflict.length > 1 && (
        <div
          className="dimp-conflict"
          role="group"
          aria-label={m.conflictPick}
          data-testid={`document-import-conflict-${field}`}
        >
          <small>
            <AlertTriangle size={12} aria-hidden="true" />
            {m.conflictPick}
          </small>
          <div>
            {conflict.map((reading) => {
              const value =
                reading.quantity === 'angle'
                  ? reading.valueDeg
                  : reading.valueMm;
              return (
                <button
                  key={reading.id}
                  type="button"
                  className="dimp-conflict-option"
                  onClick={() => onChoose(reading.id)}
                >
                  <strong>
                    {value === undefined
                      ? reading.raw.text
                      : formatValue(value)}
                  </strong>
                  <small>
                    {reading.region
                      ? `${m.pageShort(reading.region.page)} · `
                      : ''}
                    „{reading.raw.text}”
                  </small>
                </button>
              );
            })}
          </div>
        </div>
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
