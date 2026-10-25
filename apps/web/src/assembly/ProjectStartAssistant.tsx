import { useMemo, useRef, useState } from 'react';
import type { ProjectSummary } from '@cieslacalc/project-core';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  DraftingCompass,
  FileScan,
  FileUp,
  FolderOpen,
  PencilRuler,
  Sparkles,
  Triangle,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  fromMillimetres,
  roofTemplateFrameMm,
  roofTemplateSpanMm,
  toMillimetres,
  type AsymmetricGableSeatRefusal,
} from '@cieslacalc/roof-math';
import type {
  RidgeConnectionType,
  RoofTemplateSpec,
} from '@cieslacalc/timber-model';
import { parseDecimal } from '../format';
import {
  ParameterIllustration,
  type ParameterIllustrationKind,
} from './ParameterIllustration';
import {
  PROJECT_EXAMPLES,
  projectExampleDocument,
  projectExampleFacts,
  type ProjectExampleId,
} from './project-examples';
import {
  createProjectStartTemplate,
  deriveProjectStartReadiness,
  projectStartSeatRefusal,
  projectStartValuesFromTemplate,
  PROJECT_START_LIMITS,
  validateProjectStart,
  type ProjectStartField,
  type ProjectStartIssue,
  type ProjectStartValues,
} from './project-start';
import { useAssembly } from './store';
import { workbenchProjectResolver } from './workbench-project';
import { ROOF_FAMILY_LABEL } from './roof-family';
import { RoofSectionPreview } from './RoofSectionPreview';

/** VNext-10: `structure` adds a roof structure to the open project. */
export type ProjectStartMode = 'new' | 'quick' | 'edit' | 'structure';

/** One saved project: its name first, then when it last changed. */
function RecentProjectButton({
  project,
  disabled,
  onOpen,
}: {
  project: ProjectSummary;
  disabled: boolean;
  onOpen: () => void;
}) {
  const { t, i18n } = useTranslation();
  const updated = new Date(project.updatedAt);
  const date = Number.isNaN(updated.getTime())
    ? undefined
    : new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(updated);
  return (
    <button
      type="button"
      className="a-start-project"
      disabled={disabled}
      onClick={onOpen}
    >
      <FolderOpen size={18} aria-hidden="true" />
      <span className="a-start-project-name">{project.name}</span>
      {date && (
        <span className="a-start-project-date">
          {t('assembly.journey.start.updated', { date })}
        </span>
      )}
      <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}
type Stage = 'choose' | 'examples' | 1 | 2 | 3 | 4;

const MONO_PITCH_START_PITCH = '15';

/** VNext-9: the Creator's fields — the shared ones and an asymmetric gable's second pitch. */
type CreatorField = ProjectStartField | 'rightPitch';
type CreatorIssue = Omit<ProjectStartIssue, 'field' | 'code'> & {
  field: CreatorField;
  /** VNext-9: or the domain's reason two pitches make no right rafter. */
  code: ProjectStartIssue['code'] | AsymmetricGableSeatRefusal;
};
const SEAT_REFUSALS: ReadonlySet<CreatorIssue['code']> = new Set([
  'right_seat_not_positive',
  'right_seat_exceeds_plate',
]);

interface Draft {
  roofType: RoofTemplateSpec['type'];
  buildingLength: string;
  buildingWidth: string;
  pitch: string;
  rightPitch: string;
  eave: string;
  spacing: string;
  rafterWidth: string;
  rafterDepth: string;
  structureSystem: 'rafter' | 'rafter-collar-tie';
  ridgeConnection: RidgeConnectionType;
}

const LENGTH_FIELDS: ReadonlySet<CreatorField> = new Set([
  'buildingLength',
  'buildingWidth',
  'eave',
  'spacing',
  'rafterWidth',
  'rafterDepth',
]);

const STEP_FIELDS: Record<1 | 2 | 3, CreatorField[]> = {
  1: ['buildingLength', 'buildingWidth'],
  2: ['pitch', 'rightPitch', 'eave'],
  3: ['spacing', 'rafterWidth', 'rafterDepth'],
};

const FIELD_ILLUSTRATION: Record<CreatorField, ParameterIllustrationKind> = {
  buildingLength: 'building-length',
  buildingWidth: 'building-width',
  pitch: 'pitch',
  rightPitch: 'pitch',
  eave: 'eave',
  spacing: 'rafter-spacing',
  rafterWidth: 'rafter-section',
  rafterDepth: 'rafter-section',
};

const QUICK_CONFIRMED: readonly ProjectStartField[] = [
  'buildingWidth',
  'pitch',
  'eave',
];

/** Rounded text for read-only facts; never used for an editable draft. */
function display(valueMm: number, unit: 'mm' | 'cm' | 'm') {
  return String(Number(fromMillimetres(valueMm, unit).toFixed(4)));
}

/** Exact editable value: a confirmed Quick value must round-trip unchanged. */
function exact(valueMm: number, unit: 'mm' | 'cm' | 'm') {
  return String(fromMillimetres(valueMm, unit));
}

function initialDraft(
  template: RoofTemplateSpec,
  unit: 'mm' | 'cm' | 'm',
): Draft {
  const values = projectStartValuesFromTemplate(template);
  return {
    roofType: values.roofType,
    buildingLength: exact(values.buildingLengthMm, unit),
    buildingWidth: exact(values.buildingWidthMm, unit),
    pitch: String(values.pitchDeg),
    rightPitch: String(values.rightPitchDeg ?? values.pitchDeg),
    eave: exact(values.eaveOverhangMm, unit),
    spacing: exact(values.rafterSpacingMm, unit),
    rafterWidth: exact(values.rafterWidthMm!, unit),
    rafterDepth: exact(values.rafterDepthMm!, unit),
    structureSystem: values.structureSystem ?? 'rafter',
    ridgeConnection: values.ridgeConnection ?? 'ridge-board',
  };
}

/**
 * Plan view drawn from the resolved skeleton of the draft — no own formulas.
 * Shared by the Creator and the document import confirmation.
 */
export function RoofPlanPreview({
  template,
  label,
  invalidLabel,
}: {
  template?: RoofTemplateSpec;
  label: string;
  invalidLabel: string;
}) {
  const projection = useMemo(() => {
    if (!template) return undefined;
    try {
      return workbenchProjectResolver.resolve(template);
    } catch {
      return undefined;
    }
  }, [template]);
  if (!template || !projection)
    return (
      <div className="a-start-preview-empty" role="status">
        {invalidLabel}
      </div>
    );
  // Plan: building length runs horizontally (world y), width vertically (x).
  const members = projection.skeleton.members.filter(
    (member) => member.kind !== 'collar-tie',
  );
  const guides = projection.skeleton.guides ?? [];
  const points = [
    ...members.flatMap((member) => [member.from, member.to]),
    ...guides.flatMap((guide) => guide.points),
  ];
  const minX = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.y));
  const minY = Math.min(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.x));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06;
  return (
    <svg
      className="a-start-plan"
      data-testid="project-start-plan"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="xMidYMid meet"
    >
      {guides.map((guide) => (
        <polygon
          key={guide.id}
          className="plan-plane"
          points={guide.points
            .map((point) => `${point.y},${point.x}`)
            .join(' ')}
        />
      ))}
      <rect
        className="plan-building"
        x={0}
        // Each family's own frame (ADR-016): centred on a ridge, from the
        // low plate of a mono-pitch roof, off centre on an asymmetric gable.
        y={roofTemplateFrameMm(template).leftMm}
        width={template.buildingLengthMm}
        height={roofTemplateSpanMm(template)}
      />
      {members
        .filter((member) => member.kind !== 'wall-plate')
        .map((member) => (
          <line
            key={member.id}
            className={`plan-member kind-${member.kind}`}
            x1={member.from.y}
            y1={member.from.x}
            x2={member.to.y}
            y2={member.to.x}
          />
        ))}
    </svg>
  );
}

export function ProjectStartAssistant({
  mode,
  template,
  onSubmit,
  onClose,
  onExample,
  onAdvanced,
  onQuick,
  onBeginProject,
  onImportIfc,
  onImportCad,
  onMonoPitch,
  onImportDocument,
  onOpenArchive,
  onOpenFile,
  projects = [],
  onOpenProject,
}: {
  onQuick?: () => void;
  onBeginProject?: () => void;
  onImportIfc?: () => void;
  /** VNext-4: CAD (DXF) or BIM (IFC) import. */
  onImportCad?: () => void;
  /** VNext-7B-3: the mono-pitch roof workspace (no project yet). */
  onMonoPitch?: () => void;
  /**
   * VNext-4: any file — a saved project, PDF, photo, DXF or IFC — routed
   * by its bytes. Rejects with an Error whose message is shown.
   */
  onOpenFile?: (file: File) => Promise<void>;
  /** VNext: PDF/photo document import. */
  onImportDocument?: () => void;
  /** Opens a saved `.cieslacalc.json` archive as a project. */
  onOpenArchive?: (contents: string) => Promise<void>;
  projects?: readonly ProjectSummary[];
  onOpenProject?: (id: string) => Promise<void>;
  mode: ProjectStartMode;
  template: RoofTemplateSpec;
  onSubmit: (template: RoofTemplateSpec) => void | Promise<void>;
  onClose?: () => void;
  onExample?: (id: ProjectExampleId) => void | Promise<void>;
  onAdvanced?: () => void | Promise<void>;
}) {
  const state = useAssembly();
  const unit = state.unit;
  const { t, i18n } = useTranslation();
  const [stage, setStage] = useState<Stage>(mode === 'new' ? 'choose' : 1);
  /**
   * VNext-12: the preview follows the step — the plan while the building is
   * sized, the cross-section while pitch, overhang and structure are chosen
   * — unless the user picks a view on this step.
   */
  const [previewChoice, setPreviewChoice] = useState<{
    stage: Stage;
    view: 'plan' | 'section';
  }>();
  const previewView =
    previewChoice?.stage === stage
      ? previewChoice.view
      : stage === 1
        ? 'plan'
        : 'section';
  const [draft, setDraft] = useState(() => initialDraft(template, unit));
  /**
   * VNext-8: each family's starting pitch. A mono-pitch roof starts at the
   * 15° of docs/domain/MONO_PITCH_ROOF.md, not at a gable's pitch; a pitch
   * the user typed is never replaced by switching the family.
   */
  const familyPitch = (type: Draft['roofType']) =>
    type === 'mono-pitch' && template.type !== 'mono-pitch'
      ? MONO_PITCH_START_PITCH
      : String(projectStartValuesFromTemplate(template).pitchDeg);
  const [confirmed, setConfirmed] = useState<Set<CreatorField>>(
    () => new Set(mode === 'quick' ? QUICK_CONFIRMED : []),
  );
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const archiveInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const openFile = (file: File) => {
    setBusy(true);
    setError('');
    const opening = onOpenFile
      ? onOpenFile(file)
      : file.text().then((contents) => onOpenArchive?.(contents));
    void opening
      .catch((cause: unknown) =>
        setError(
          onOpenFile && cause instanceof Error && cause.message
            ? cause.message
            : t('assembly.journey.start.openFileError'),
        ),
      )
      .finally(() => setBusy(false));
  };
  const acceptsDrop = stage === 'choose' && !!(onOpenFile || onOpenArchive);

  const numbers = useMemo(() => {
    const read = (field: CreatorField) => {
      const value = parseDecimal(draft[field]);
      if (value === null) return null;
      return LENGTH_FIELDS.has(field) ? toMillimetres(value, unit) : value;
    };
    return {
      roofType: draft.roofType,
      buildingLength: read('buildingLength'),
      buildingWidth: read('buildingWidth'),
      pitch: read('pitch'),
      rightPitch: read('rightPitch'),
      eave: read('eave'),
      spacing: read('spacing'),
      rafterWidth: read('rafterWidth'),
      rafterDepth: read('rafterDepth'),
    };
  }, [draft, unit]);

  const inputIssues = useMemo((): CreatorIssue[] => {
    // The second pitch exists only on an asymmetric gable.
    const asymmetric = draft.roofType === 'asymmetric-gable';
    const fields = [...STEP_FIELDS[1], ...STEP_FIELDS[2], ...STEP_FIELDS[3]];
    const shared = validateProjectStart(
      numbers,
      fields.filter((name): name is ProjectStartField => name !== 'rightPitch'),
    );
    if (!asymmetric) return shared;
    const value = numbers.rightPitch;
    const { min, max } = PROJECT_START_LIMITS.pitch;
    return [
      ...shared,
      ...(value === null || value === undefined
        ? [{ field: 'rightPitch' as const, code: 'required' as const }]
        : value < min || value > max
          ? [{ field: 'rightPitch' as const, code: 'range' as const, min, max }]
          : []),
    ];
  }, [draft.roofType, numbers]);
  /** The roof about to be created, or the domain's reason it cannot be. */
  const candidate = useMemo((): {
    template?: RoofTemplateSpec;
    refusal?: AsymmetricGableSeatRefusal;
  } => {
    if (inputIssues.length) return {};
    const values: ProjectStartValues = {
      roofType: draft.roofType,
      buildingLengthMm: numbers.buildingLength!,
      buildingWidthMm: numbers.buildingWidth!,
      pitchDeg: numbers.pitch!,
      ...(draft.roofType === 'asymmetric-gable'
        ? { rightPitchDeg: numbers.rightPitch! }
        : {}),
      eaveOverhangMm: numbers.eave!,
      rafterSpacingMm: numbers.spacing!,
      rafterWidthMm: numbers.rafterWidth!,
      rafterDepthMm: numbers.rafterDepth!,
      structureSystem:
        draft.roofType === 'gable' ? draft.structureSystem : undefined,
      ridgeConnection: draft.ridgeConnection,
    };
    try {
      return { template: createProjectStartTemplate(values, template) };
    } catch {
      const refusal = projectStartSeatRefusal(values, template);
      return refusal ? { refusal } : {};
    }
  }, [inputIssues.length, draft, numbers, template]);
  const allIssues = useMemo(
    (): CreatorIssue[] =>
      candidate.refusal
        ? [...inputIssues, { field: 'rightPitch', code: candidate.refusal }]
        : inputIssues,
    [candidate.refusal, inputIssues],
  );
  const nextTemplate = candidate.template;
  /** The roof the review describes: the one about to be created. */
  const reviewTemplate = nextTemplate ?? template;
  const readiness = useMemo(
    () =>
      stage === 4 && nextTemplate
        ? deriveProjectStartReadiness(nextTemplate)
        : undefined,
    [nextTemplate, stage],
  );

  const issuesFor = (step: 1 | 2 | 3) =>
    allIssues.filter((issue) => STEP_FIELDS[step].includes(issue.field));
  const issueText = (issue: CreatorIssue) => {
    const length = LENGTH_FIELDS.has(issue.field);
    const format = (value: number) =>
      length
        ? `${new Intl.NumberFormat(i18n.language).format(fromMillimetres(value, unit))}`
        : String(value);
    if (SEAT_REFUSALS.has(issue.code))
      return t(`assembly.seatRefusal.${issue.code}`);
    return t(`assembly.creator.issue.${issue.code}`, {
      min: issue.min === undefined ? '' : format(issue.min),
      max: issue.max === undefined ? '' : format(issue.max),
      unit: length ? unit : '°',
    });
  };

  const setField = (field: keyof Draft, value: string) => {
    setError('');
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const field = (name: CreatorField, withIllustration = true) => {
    const step = (Object.keys(STEP_FIELDS) as unknown as Array<1 | 2 | 3>).find(
      (key) => STEP_FIELDS[key].includes(name),
    )!;
    // Two pitches read as left and right, as in the workbench (VNext-9).
    const label = t(
      `assembly.creator.field.${name === 'pitch' && draft.roofType === 'asymmetric-gable' ? 'leftPitch' : name}`,
    );
    const issue = attempted.has(Number(step))
      ? allIssues.find((candidate) => candidate.field === name)
      : allIssues.find(
          (candidate) =>
            candidate.field === name && candidate.code !== 'required',
        );
    const length = LENGTH_FIELDS.has(name);
    if (confirmed.has(name))
      return (
        <div className="a-start-confirmed" data-confirmed-field={name}>
          <Check size={16} aria-hidden="true" />
          <span>
            <small>{label}</small>
            <strong>
              {draft[name]} {length ? unit : '°'}
            </strong>
          </span>
          <small className="a-start-confirmed-source">
            {t('assembly.creator.fromQuick')}
          </small>
          <button
            type="button"
            className="a-link-button"
            onClick={() =>
              setConfirmed((current) => {
                const next = new Set(current);
                next.delete(name);
                return next;
              })
            }
          >
            {t('assembly.creator.change')}
          </button>
        </div>
      );
    return (
      <label
        className="a-start-field"
        data-invalid={issue ? 'true' : undefined}
      >
        {withIllustration && (
          <ParameterIllustration
            kind={FIELD_ILLUSTRATION[name]}
            label={t(`assembly.creator.illustration.${name}`)}
          />
        )}
        <span className="a-start-field-body">
          <span className="a-start-field-label">{label}</span>
          <small className="a-start-field-help">
            {t(`assembly.creator.help.${name}`)}
          </small>
          <span className="a-start-input">
            <input
              data-project-start-field={name}
              aria-label={`${label} — ${t('assembly.projectStart.title')}`}
              aria-invalid={issue ? true : undefined}
              inputMode="decimal"
              value={draft[name]}
              onChange={(event) => setField(name, event.target.value)}
            />
            <small>{length ? unit : '°'}</small>
          </span>
          {issue && (
            <small className="a-start-issue" role="alert">
              {issueText(issue)}
            </small>
          )}
        </span>
      </label>
    );
  };

  const choice = <T extends string>(
    legend: string,
    value: T,
    options: ReadonlyArray<{
      value: T;
      label: string;
      hint?: string;
      illustration: ParameterIllustrationKind;
    }>,
    onChange: (value: T) => void,
    name: string,
  ) => (
    <fieldset className="a-start-choice" data-choice={name}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          data-choice-value={option.value}
          onClick={() => onChange(option.value)}
        >
          <ParameterIllustration
            kind={option.illustration}
            label={option.label}
          />
          <strong>{option.label}</strong>
          {option.hint && <small>{option.hint}</small>}
          {value === option.value && (
            <Check
              className="a-start-choice-check"
              size={16}
              aria-hidden="true"
            />
          )}
        </button>
      ))}
    </fieldset>
  );

  const goNext = () => {
    if (typeof stage !== 'number' || stage === 4) return;
    setAttempted((current) => new Set(current).add(stage));
    if (issuesFor(stage as 1 | 2 | 3).length) return;
    setStage((stage + 1) as Stage);
  };
  const goBack = () => {
    if (stage === 1 || stage === 'examples')
      setStage(mode === 'new' ? 'choose' : 1);
    else if (typeof stage === 'number') setStage((stage - 1) as Stage);
  };
  const run = (action: () => void | Promise<void>) => {
    setBusy(true);
    setError('');
    Promise.resolve()
      .then(action)
      .catch(() => setError(t('assembly.projectStart.saveError')))
      .finally(() => setBusy(false));
  };
  const submit = () => {
    if (!nextTemplate) {
      setAttempted(new Set([1, 2, 3]));
      const firstInvalid = ([1, 2, 3] as const).find(
        (step) => issuesFor(step).length,
      );
      if (firstInvalid) setStage(firstInvalid);
      else setError(t('assembly.projectStart.invalid'));
      return;
    }
    run(() => onSubmit(nextTemplate));
  };

  const steps = [1, 2, 3, 4] as const;
  const title =
    stage === 'choose'
      ? t('assembly.creator.start.title')
      : stage === 'examples'
        ? t('assembly.creator.examples.title')
        : t(`assembly.creator.step.${stage}`);

  return (
    <div
      className={`a-project-start-layer${dragging ? ' is-dragging' : ''}`}
      data-testid="project-start-assistant"
      onDragEnter={(event) => {
        if (!acceptsDrop) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (acceptsDrop) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        if (!acceptsDrop) return;
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) openFile(file);
      }}
    >
      <section
        className="a-project-start is-v37"
        role="dialog"
        aria-modal="true"
        aria-label={t('assembly.projectStart.title')}
        data-stage={stage}
      >
        <header className="a-start-header">
          <div>
            <small>{t(`assembly.projectStart.mode.${mode}`)}</small>
            <h2>{title}</h2>
          </div>
          {typeof stage === 'number' && (
            <ol
              className="a-start-steps"
              aria-label={t('assembly.creator.progress', { step: stage })}
            >
              {steps.map((step) => (
                <li
                  key={step}
                  data-state={
                    step === stage ? 'current' : step < stage ? 'done' : 'todo'
                  }
                  aria-current={step === stage ? 'step' : undefined}
                >
                  <span>{step < stage ? <Check size={12} /> : step}</span>
                  <small>{t(`assembly.creator.step.${step}`)}</small>
                </li>
              ))}
            </ol>
          )}
          {onClose && (
            <button
              className="a-icon"
              aria-label={t('assembly.projectStart.close')}
              title={t('assembly.projectStart.close')}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          )}
        </header>

        {stage === 'choose' && (
          <div className="a-start-paths is-grouped">
            {/* VNext-12: three ways in, each named — a project, a file, or a
                quick calculation with no project. */}
            <section
              className="a-start-group"
              aria-labelledby="start-group-project"
            >
              <h3 id="start-group-project">
                {t('assembly.journey.start.group.project')}
              </h3>
              <button
                type="button"
                className="a-start-path is-primary"
                data-start-path="guided"
                data-testid="project-start-guided"
                onClick={() => {
                  onBeginProject?.();
                  setStage(1);
                }}
              >
                <Sparkles size={24} aria-hidden="true" />
                <strong>{t('assembly.journey.start.new')}</strong>
                <span>{t('assembly.journey.start.newHint')}</span>
              </button>
              <button
                type="button"
                className="a-start-path"
                data-start-path="example"
                data-testid="project-start-examples"
                onClick={() => setStage('examples')}
              >
                <BookOpen size={24} aria-hidden="true" />
                <strong>{t('assembly.creator.start.example.title')}</strong>
                <span>{t('assembly.creator.start.example.text')}</span>
              </button>
            </section>
            <section
              className="a-start-group"
              aria-labelledby="start-group-file"
            >
              <h3 id="start-group-file">
                {t('assembly.journey.start.group.file')}
              </h3>
              {onImportDocument && (
                <button
                  type="button"
                  className="a-start-path"
                  data-testid="project-start-document"
                  onClick={onImportDocument}
                >
                  <FileScan size={24} aria-hidden="true" />
                  <strong>{t('assembly.journey.start.document')}</strong>
                  <span>{t('assembly.journey.start.documentHint')}</span>
                </button>
              )}
              {onImportCad ? (
                <button
                  type="button"
                  className="a-start-path"
                  data-testid="project-start-cad"
                  onClick={onImportCad}
                >
                  <DraftingCompass size={24} aria-hidden="true" />
                  <strong>{t('assembly.journey.start.cad')}</strong>
                  <span>{t('assembly.journey.start.cadHint')}</span>
                </button>
              ) : (
                onImportIfc && (
                  <button
                    type="button"
                    className="a-start-path"
                    data-testid="project-start-ifc"
                    onClick={onImportIfc}
                  >
                    <BookOpen size={24} aria-hidden="true" />
                    <strong>{t('assembly.journey.start.ifc')}</strong>
                    <span>{t('assembly.journey.start.ifcHint')}</span>
                  </button>
                )
              )}
            </section>
            {(onQuick || onMonoPitch) && (
              <section
                className="a-start-group"
                aria-labelledby="start-group-quick"
              >
                <h3 id="start-group-quick">
                  {t('assembly.journey.start.group.quick')}
                </h3>
                {onQuick && (
                  <button
                    type="button"
                    className="a-start-path"
                    data-testid="project-start-quick"
                    onClick={onQuick}
                  >
                    <PencilRuler size={24} aria-hidden="true" />
                    <strong>{t('assembly.journey.start.quick')}</strong>
                    <span>{t('assembly.journey.start.quickHint')}</span>
                  </button>
                )}
                {onMonoPitch && (
                  <button
                    type="button"
                    className="a-start-path"
                    data-testid="project-start-mono-pitch"
                    onClick={onMonoPitch}
                  >
                    <Triangle size={24} aria-hidden="true" />
                    <strong>{t('assembly.journey.start.monoPitch')}</strong>
                    <span>{t('assembly.journey.start.monoPitchHint')}</span>
                  </button>
                )}
              </section>
            )}
            {acceptsDrop && (
              <p
                className="a-start-drop-hint"
                data-testid="project-start-drop-hint"
              >
                <FileUp size={16} aria-hidden="true" />
                {t(
                  onOpenFile
                    ? 'assembly.journey.start.dropAny'
                    : 'assembly.journey.start.dropProject',
                )}
              </p>
            )}
            <section
              className={`a-start-recent${projects.length ? ' has-projects' : ''}`}
            >
              <h3>{t('assembly.journey.start.recent')}</h3>
              <p>
                {t(
                  projects.length
                    ? 'assembly.journey.start.recentHint'
                    : 'assembly.journey.start.empty',
                )}
              </p>
              <div className="a-start-recent-list">
                {projects.slice(0, 3).map((project) => (
                  <RecentProjectButton
                    key={project.id}
                    project={project}
                    disabled={busy}
                    onOpen={() =>
                      onOpenProject && run(() => onOpenProject(project.id))
                    }
                  />
                ))}
              </div>
              {(onOpenArchive || onOpenFile) && (
                <>
                  <button
                    type="button"
                    className="a-link-button a-start-open-file"
                    data-testid="project-start-open-file"
                    disabled={busy}
                    onClick={() => archiveInput.current?.click()}
                  >
                    <FolderOpen size={16} aria-hidden="true" />
                    {t(
                      onOpenFile
                        ? 'assembly.journey.start.openAnyFile'
                        : 'assembly.journey.start.openFile',
                    )}
                  </button>
                  <input
                    ref={archiveInput}
                    type="file"
                    hidden
                    accept={
                      onOpenFile
                        ? '.cieslacalc.json,.json,.pdf,.png,.jpg,.jpeg,.webp,.dxf,.ifc'
                        : '.json,.cieslacalc.json,application/json'
                    }
                    aria-label={t(
                      onOpenFile
                        ? 'assembly.journey.start.openAnyFile'
                        : 'assembly.journey.start.openFile',
                    )}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) openFile(file);
                    }}
                  />
                </>
              )}
              {projects.length > 3 && (
                <details data-testid="start-all-projects">
                  <summary>
                    {t('assembly.journey.start.all')} ({projects.length})
                  </summary>
                  <div className="a-start-recent-list">
                    {projects.map((project) => (
                      <RecentProjectButton
                        key={project.id}
                        project={project}
                        disabled={busy}
                        onOpen={() =>
                          onOpenProject && run(() => onOpenProject(project.id))
                        }
                      />
                    ))}
                  </div>
                </details>
              )}
            </section>
            <details className="a-start-secondary">
              <summary>{t('assembly.journey.start.more')}</summary>
              <button
                type="button"
                className="a-start-path"
                data-start-path="advanced"
                data-testid="project-start-advanced"
                disabled={busy}
                onClick={() => onAdvanced && run(onAdvanced)}
              >
                <PencilRuler size={24} aria-hidden="true" />
                <strong>{t('assembly.creator.start.advanced.title')}</strong>
                <span>{t('assembly.creator.start.advanced.text')}</span>
              </button>
            </details>
            {error && <p role="alert">{error}</p>}
          </div>
        )}

        {stage === 'examples' && (
          <div className="a-start-examples">
            <p className="a-start-disclaimer" role="note">
              <AlertTriangle size={15} aria-hidden="true" />
              {t('assembly.creator.examples.disclaimer')}{' '}
              {t('assembly.creator.examples.createsNew')}
            </p>
            <div className="a-start-example-grid">
              {PROJECT_EXAMPLES.map((example) => {
                const facts = projectExampleFacts(
                  projectExampleDocument(example.id),
                );
                return (
                  <article key={example.id} data-example={example.id}>
                    <ParameterIllustration
                      kind={example.illustration}
                      label={t(
                        `assembly.creator.examples.item.${example.id}.title`,
                      )}
                      size="large"
                    />
                    <h3>
                      {t(`assembly.creator.examples.item.${example.id}.title`)}
                    </h3>
                    <p>
                      {t(`assembly.creator.examples.item.${example.id}.shows`)}
                    </p>
                    <dl>
                      <div>
                        <dt>{t('assembly.creator.field.buildingLength')}</dt>
                        <dd>
                          {display(facts.buildingLengthMm, unit)} {unit}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('assembly.creator.field.buildingWidth')}</dt>
                        <dd>
                          {display(facts.buildingWidthMm, unit)} {unit}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('assembly.creator.field.pitch')}</dt>
                        <dd>{facts.pitchDeg}°</dd>
                      </div>
                      {facts.structureCount > 1 && (
                        <div>
                          <dt>{t('assembly.structures.title')}</dt>
                          <dd>{facts.structureCount}</dd>
                        </div>
                      )}
                    </dl>
                    <button
                      type="button"
                      className="a-button a-primary"
                      data-testid={`project-example-${example.id}`}
                      disabled={busy}
                      onClick={() =>
                        onExample && run(() => onExample(example.id))
                      }
                    >
                      {t('assembly.creator.examples.open')}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        )}

        {typeof stage === 'number' && (
          <div className="a-start-body">
            <form
              className="a-start-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (stage === 4) submit();
                else goNext();
              }}
            >
              {stage === 1 && (
                <>
                  {choice(
                    t('assembly.projectStart.roofType'),
                    draft.roofType,
                    [
                      {
                        value: 'gable',
                        label: t('assembly.gableRoof'),
                        hint: t('assembly.projectStart.roofHint.gable'),
                        illustration: 'gable',
                      },
                      {
                        value: 'hip',
                        label: t('assembly.hipRoof'),
                        hint: t('assembly.projectStart.roofHint.hip'),
                        illustration: 'hip',
                      },
                      {
                        value: 'mono-pitch',
                        label: t('assembly.monoPitchRoof'),
                        hint: t('assembly.projectStart.roofHint.mono-pitch'),
                        illustration: 'mono-pitch',
                      },
                      {
                        value: 'asymmetric-gable',
                        label: t('assembly.asymmetricGableRoof'),
                        hint: t(
                          'assembly.projectStart.roofHint.asymmetric-gable',
                        ),
                        illustration: 'asymmetric-gable',
                      },
                    ],
                    (roofType) =>
                      setDraft((current) => {
                        const pitch =
                          current.pitch === familyPitch(current.roofType)
                            ? familyPitch(roofType)
                            : current.pitch;
                        // An asymmetric gable starts visibly asymmetric: the
                        // second plane 15° flatter, unless already typed.
                        const flatter = Math.max(5, Number(pitch) - 15);
                        return {
                          ...current,
                          roofType,
                          pitch,
                          ...(roofType === 'asymmetric-gable' &&
                          current.rightPitch === current.pitch &&
                          Number.isFinite(flatter)
                            ? { rightPitch: String(flatter) }
                            : {}),
                        };
                      }),
                    'roof-type',
                  )}
                  {field('buildingLength')}
                  {field('buildingWidth')}
                </>
              )}
              {stage === 2 && (
                <>
                  {field('pitch')}
                  {draft.roofType === 'asymmetric-gable' && field('rightPitch')}
                  {field('eave')}
                  <details className="a-start-more">
                    <summary>{t('assembly.creator.learnMore')}</summary>
                    <p>{t('assembly.creator.more.geometry')}</p>
                  </details>
                </>
              )}
              {stage === 3 && (
                <>
                  <p className="a-journey-feedback" role="status">
                    {t('assembly.journey.start.geometryDone')}
                  </p>
                  {field('spacing')}
                  <div className="a-start-section-pair">
                    <ParameterIllustration
                      kind="rafter-section"
                      label={t('assembly.creator.illustration.rafterWidth')}
                    />
                    <div>
                      {field('rafterWidth', false)}
                      {field('rafterDepth', false)}
                    </div>
                  </div>
                  {draft.roofType === 'gable' &&
                    choice(
                      t('assembly.creator.field.structure'),
                      draft.structureSystem,
                      [
                        {
                          value: 'rafter',
                          label: t('assembly.rafterSystem'),
                          hint: t('assembly.creator.choiceHint.rafter'),
                          illustration: 'rafter-system',
                        },
                        {
                          value: 'rafter-collar-tie',
                          label: t('assembly.rafterCollarTieSystem'),
                          hint: t('assembly.creator.choiceHint.collarTie'),
                          illustration: 'collar-tie',
                        },
                      ],
                      (structureSystem) =>
                        setDraft((current) => ({
                          ...current,
                          structureSystem,
                        })),
                      'structure',
                    )}
                  {draft.roofType === 'gable' &&
                    choice(
                      t('assembly.ridgeConnection'),
                      draft.ridgeConnection,
                      [
                        {
                          value: 'ridge-board',
                          label: t('assembly.ridgeBoardConnection'),
                          hint: t('assembly.creator.choiceHint.ridgeBoard'),
                          illustration: 'ridge-board',
                        },
                        {
                          value: 'direct-meeting',
                          label: t('assembly.directMeetingConnection'),
                          hint: t('assembly.creator.choiceHint.directMeeting'),
                          illustration: 'direct-meeting',
                        },
                        {
                          value: 'half-lap',
                          label: t('assembly.halfLapConnection'),
                          hint: t('assembly.creator.choiceHint.halfLap'),
                          illustration: 'half-lap',
                        },
                      ],
                      (ridgeConnection) =>
                        setDraft((current) => ({
                          ...current,
                          ridgeConnection,
                        })),
                      'ridge-connection',
                    )}
                  {draft.roofType === 'gable' &&
                    draft.ridgeConnection === 'half-lap' && (
                      <p className="a-start-note" role="note">
                        <AlertTriangle size={15} aria-hidden="true" />
                        {t('assembly.halfLapUnresolvedNote')}
                      </p>
                    )}
                </>
              )}
              {stage === 4 && (
                <div
                  className="a-start-review"
                  data-testid="project-start-review"
                >
                  <p className="a-journey-feedback" role="status">
                    {t(
                      readiness?.k1Cutting === 'ready'
                        ? 'assembly.journey.start.structureDone'
                        : 'assembly.journey.next.construction.title',
                    )}
                  </p>
                  <dl className="a-start-summary">
                    {(
                      [
                        ['roofType', t(ROOF_FAMILY_LABEL[draft.roofType])],
                        [
                          'buildingLength',
                          `${draft.buildingLength} × ${draft.buildingWidth} ${unit}`,
                        ],
                        [
                          'pitch',
                          draft.roofType === 'asymmetric-gable'
                            ? `${draft.pitch}° / ${draft.rightPitch}°`
                            : `${draft.pitch}°`,
                        ],
                        ['eave', `${draft.eave} ${unit}`],
                        ['spacing', `≤ ${draft.spacing} ${unit}`],
                        [
                          'rafterWidth',
                          `${draft.rafterWidth} × ${draft.rafterDepth} ${unit}`,
                        ],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key}>
                        <dt>{t(`assembly.creator.summary.${key}`)}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <section
                    className="a-start-readiness"
                    aria-label={t('assembly.creator.review.readiness')}
                  >
                    <h3>{t('assembly.creator.review.readiness')}</h3>
                    {readiness ? (
                      <ul>
                        {(
                          ['geometry', 'construction', 'k1Cutting'] as const
                        ).map((key) => (
                          <li
                            key={key}
                            data-readiness={key}
                            data-state={readiness[key]}
                          >
                            {readiness[key] === 'ready' ? (
                              <CircleCheck size={17} aria-hidden="true" />
                            ) : (
                              <AlertTriangle size={17} aria-hidden="true" />
                            )}
                            <strong>
                              {t(`assembly.creator.review.${key}`)}
                            </strong>
                            <span>
                              {t(
                                `assembly.creator.review.state.${readiness[key]}`,
                              )}
                            </span>
                          </li>
                        ))}
                        {readiness.notes.map((note) => (
                          <li key={note} data-state="note" data-note={note}>
                            <AlertTriangle size={17} aria-hidden="true" />
                            <span>
                              {t(`assembly.creator.review.note.${note}`)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p role="alert">{t('assembly.projectStart.invalid')}</p>
                    )}
                  </section>
                  <details className="a-start-more" open>
                    <summary>
                      {t('assembly.creator.review.assumptions')}
                    </summary>
                    <ul className="a-start-assumptions">
                      <li>
                        {t('assembly.creator.review.wallPlate', {
                          value:
                            reviewTemplate.type === 'mono-pitch'
                              ? `${display(reviewTemplate.lowSupport.widthMm, unit)} × ${display(reviewTemplate.lowSupport.heightMm, unit)} ${unit}`
                              : `${display(reviewTemplate.wallPlate.section.widthMm, unit)} × ${display(reviewTemplate.wallPlate.section.heightMm, unit)} ${unit}`,
                        })}
                      </li>
                      {reviewTemplate.type !== 'mono-pitch' &&
                        draft.ridgeConnection === 'ridge-board' && (
                          <li>
                            {t('assembly.creator.review.ridgeBoard', {
                              value: `${display(reviewTemplate.ridge.thicknessMm, unit)} ${unit}`,
                            })}
                          </li>
                        )}
                      <li>{t('assembly.creator.review.spacingMode')}</li>
                      <li>{t('assembly.creator.review.editLater')}</li>
                      <li>{t('assembly.structural')}</li>
                    </ul>
                  </details>
                </div>
              )}
              {error && (
                <p className="a-project-start-error" role="alert">
                  {error}
                </p>
              )}
              <footer className="a-start-footer">
                {(stage !== 1 || mode === 'new') && (
                  <button
                    type="button"
                    className="a-button a-ghost"
                    data-testid="project-start-back"
                    onClick={goBack}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    {stage === 1
                      ? t('assembly.creator.backToStart')
                      : t('assembly.creator.back')}
                  </button>
                )}
                <span className="a-start-footer-spacer" />
                {stage === 4 ? (
                  <button
                    type="submit"
                    className="a-button a-primary"
                    data-testid="project-start-submit"
                    disabled={busy || !nextTemplate}
                  >
                    {t(`assembly.projectStart.submit.${mode}`)}
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="a-button a-primary"
                    data-testid="project-start-next"
                  >
                    {t('assembly.creator.next')}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                )}
              </footer>
            </form>
            <aside className="a-start-preview">
              <span>{t('assembly.creator.preview.title')}</span>
              <div
                className="a-start-preview-views"
                role="group"
                aria-label={t('assembly.creator.preview.views')}
              >
                {(['plan', 'section'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    aria-pressed={previewView === view}
                    data-preview-view={view}
                    onClick={() => setPreviewChoice({ stage, view })}
                  >
                    {t(`assembly.creator.preview.${view}`)}
                  </button>
                ))}
              </div>
              {previewView === 'plan' ? (
                <RoofPlanPreview
                  template={nextTemplate}
                  label={t('assembly.creator.preview.label')}
                  invalidLabel={t('assembly.creator.preview.invalid')}
                />
              ) : (
                <RoofSectionPreview
                  template={nextTemplate}
                  label={t('assembly.creator.preview.sectionLabel')}
                  invalidLabel={t('assembly.creator.preview.invalid')}
                  widthLabel={`${draft.buildingWidth} ${unit}`}
                />
              )}
              <strong>
                {t(ROOF_FAMILY_LABEL[draft.roofType])} · {draft.buildingLength}{' '}
                × {draft.buildingWidth} {unit}
              </strong>
              <p>
                {t(
                  previewView === 'plan'
                    ? 'assembly.creator.preview.hint'
                    : 'assembly.creator.preview.sectionHint',
                )}
              </p>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}
