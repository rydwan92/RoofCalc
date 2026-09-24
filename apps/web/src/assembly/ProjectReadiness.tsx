import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  Minus,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { LengthUnit } from '@cieslacalc/roof-math';
import type {
  ProjectReadiness,
  ReadinessAction,
  ReadinessAreaState,
  ReadinessIssue,
} from './project-readiness';
import { readinessIssueText, repairChangeText } from './readiness-copy';
import type {
  JourneyAction,
  JourneyStage,
  JourneyStageKey,
  ProjectJourney,
} from './project-journey';
import './readiness.css';

/**
 * V47 guided project readiness UI. Presentation only: every state, count and
 * action comes from `deriveProjectReadiness`. One primary item is visible;
 * everything else lives in a calm, on-demand "Sprawdzenie projektu" panel.
 */

function SeverityIcon({ severity }: { severity: ReadinessIssue['severity'] }) {
  if (severity === 'blocker') return <XCircle size={16} aria-hidden="true" />;
  if (severity === 'warning')
    return <AlertTriangle size={16} aria-hidden="true" />;
  return <Info size={16} aria-hidden="true" />;
}

function AreaIcon({ state }: { state: ReadinessAreaState }) {
  if (state === 'ready') return <CheckCircle2 size={16} aria-hidden="true" />;
  if (state === 'blocked') return <XCircle size={16} aria-hidden="true" />;
  if (state === 'attention')
    return <AlertTriangle size={16} aria-hidden="true" />;
  if (state === 'not-applicable') return <Minus size={16} aria-hidden="true" />;
  return <Circle size={16} aria-hidden="true" />;
}

export function ProjectReadinessBar({
  readiness,
  journey,
  unit,
  onAction,
  onJourneyAction,
  onOpenPanel,
  onOverview,
  currentStage,
}: {
  readiness: ProjectReadiness;
  /** V53: the one recommended next action and stage overview. */
  journey?: ProjectJourney;
  /** V53: the stage of the workspace the user is in (for "where am I"). */
  currentStage?: JourneyStageKey;
  unit: LengthUnit;
  onAction: (action: ReadinessAction) => void;
  onJourneyAction?: (action: JourneyAction) => void;
  onOpenPanel: () => void;
  onOverview?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const previous = useRef(journey?.overview);
  const [completed, setCompleted] = useState<string>();
  useEffect(() => {
    const newlyComplete = journey?.overview.find(
      (stage) =>
        stage.status === 'complete' &&
        previous.current?.some(
          (old) => old.key === stage.key && old.status !== 'complete',
        ),
    );
    previous.current = journey?.overview;
    if (!newlyComplete) return;
    setCompleted(newlyComplete.key);
  }, [journey?.overview]);
  useEffect(() => {
    if (!completed) return;
    const timer = setTimeout(() => setCompleted(undefined), 8000);
    return () => clearTimeout(timer);
  }, [completed]);
  const progress = journey
    ? {
        ready: journey.overview.filter((stage) => stage.status === 'complete')
          .length,
        total: journey.overview.length,
      }
    : readiness.progress;
  const recommended = journey?.recommended;
  const here = currentStage
    ? journey?.stages.find((stage) => stage.key === currentStage)
    : undefined;
  const hereOverview = journey?.overview.find(
    (stage) =>
      stage.key ===
      (currentStage === 'layers'
        ? 'covering'
        : currentStage === 'roof-system'
          ? 'materials'
          : currentStage),
  );
  const primary = journey ? recommended?.issue : readiness.primary;
  const rest = readiness.issues.filter(
    (issue) => issue.id !== primary?.id && issue.severity !== 'info',
  ).length;
  const text = primary
    ? readinessIssueText(t, primary, unit, i18n.language)
    : undefined;
  return (
    <>
      {journey && onJourneyAction && (
        <JourneyOverview
          journey={journey}
          currentStage={currentStage}
          onAction={onJourneyAction}
        />
      )}
      {completed &&
        journey?.overview.some(
          (stage) => stage.key === completed && stage.status === 'complete',
        ) && (
          <p className="a-journey-feedback" role="status">
            {t('assembly.journey.completed', {
              stage: t(`assembly.journey.overviewStage.${completed}`),
            })}
          </p>
        )}
      <section
        className="a-readiness-bar"
        aria-label={t('assembly.readiness.panelTitle')}
        data-testid="project-readiness-bar"
        data-state={primary?.severity ?? 'ready'}
      >
        <button
          type="button"
          className="a-readiness-progress"
          data-testid="project-progress"
          aria-label={t('assembly.readiness.progressLabel', progress)}
          onClick={onOpenPanel}
        >
          {here && (
            <span
              className="a-journey-here"
              data-testid="journey-here"
              data-state={here.state}
            >
              {here.state === 'ready' ? '✓ ' : ''}
              {t(`assembly.journey.stage.${here.key}`)} ·{' '}
              {hereOverview
                ? t(`assembly.journey.overviewStatus.${hereOverview.status}`)
                : t(`assembly.journey.state.${here.state}`)}
            </span>
          )}
          <span className="a-readiness-dots" aria-hidden="true">
            {journey
              ? journey.overview.map((stage) => (
                  <i
                    key={stage.key}
                    data-state={
                      stage.status === 'complete'
                        ? 'ready'
                        : stage.status === 'needs-action'
                          ? 'attention'
                          : 'pending'
                    }
                  />
                ))
              : readiness.areas
                  .filter((area) => area.counted)
                  .map((area) => <i key={area.area} data-state={area.state} />)}
          </span>
          {t('assembly.readiness.progress', progress)}
        </button>
        {primary && text ? (
          <div
            className="a-readiness-primary"
            data-testid="project-primary-issue"
            data-issue={primary.code}
            data-severity={primary.severity}
          >
            <SeverityIcon severity={primary.severity} />
            <div>
              {journey && (
                <small className="a-journey-now">
                  {t('assembly.journey.now')}
                </small>
              )}
              <strong>{text.title}</strong>
              <span>{text.description}</span>
            </div>
          </div>
        ) : recommended?.reasonKey ? (
          <div
            className="a-readiness-primary is-next"
            data-testid="project-journey-next"
            data-stage={recommended.stage}
          >
            <Circle size={16} aria-hidden="true" />
            <div>
              <small className="a-journey-now">
                {t('assembly.journey.now')}
              </small>
              <strong>
                {t(`assembly.journey.next.${recommended.reasonKey}.title`)}
              </strong>
              <span>
                {t(
                  `assembly.journey.next.${recommended.reasonKey}.description`,
                )}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="a-readiness-primary is-quiet"
            data-testid="project-all-ready"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            <strong>{t('assembly.readiness.allReady')}</strong>
          </div>
        )}
        <div className="a-readiness-actions">
          {onOverview && (
            <button
              type="button"
              className="a-button a-ghost"
              data-testid="project-overview-action"
              onClick={onOverview}
            >
              {t('assembly.workflow.summaryTitle')}
            </button>
          )}
          {recommended && onJourneyAction ? (
            <button
              type="button"
              className="a-button a-primary"
              data-testid="project-next-action"
              data-readiness-action={recommended.action}
              onClick={() => onJourneyAction(recommended)}
            >
              {t(`assembly.readiness.action.${recommended.action}`)}
            </button>
          ) : (
            primary?.action && (
              <button
                type="button"
                className="a-button a-primary"
                data-testid="project-next-action"
                data-readiness-action={primary.action}
                onClick={() => onAction(primary.action!)}
              >
                {t(`assembly.readiness.action.${primary.action}`)}
              </button>
            )
          )}
          {rest > 0 && (
            <button
              type="button"
              className="a-button a-readiness-more"
              data-testid="project-readiness-more"
              aria-label={t('assembly.readiness.moreLabel', { count: rest })}
              onClick={onOpenPanel}
            >
              {t('assembly.readiness.more', { count: rest })}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function IssueRow({
  issue,
  unit,
  onAction,
}: {
  issue: ReadinessIssue;
  unit: LengthUnit;
  onAction: (action: ReadinessAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const text = readinessIssueText(t, issue, unit, i18n.language);
  return (
    <li
      className="a-readiness-issue"
      data-severity={issue.severity}
      data-issue={issue.code}
    >
      <SeverityIcon severity={issue.severity} />
      <div>
        <strong>{text.title}</strong>
        <p>{text.description}</p>
        {(issue.action || issue.secondaryAction) && (
          <div className="a-readiness-issue-actions">
            {issue.action && (
              <button
                type="button"
                className={`a-button ${issue.severity === 'info' ? '' : 'a-primary'}`}
                data-readiness-action={issue.action}
                onClick={() => onAction(issue.action!)}
              >
                {t(`assembly.readiness.action.${issue.action}`)}
              </button>
            )}
            {issue.secondaryAction && (
              <button
                type="button"
                className="a-link-button"
                data-readiness-action={issue.secondaryAction}
                onClick={() => onAction(issue.secondaryAction!)}
              >
                {t(`assembly.readiness.action.${issue.secondaryAction}`)}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function JourneyStages({
  journey,
  onJourneyAction,
}: {
  journey: ProjectJourney;
  onJourneyAction: (action: JourneyAction) => void;
}) {
  const { t } = useTranslation();
  const open = (stage: JourneyStage) =>
    onJourneyAction(
      journey.recommended?.stage === stage.key
        ? journey.recommended
        : {
            action: stage.action,
            ...(stage.focus ? { focus: stage.focus } : {}),
          },
    );
  return (
    <section className="a-journey" data-testid="project-journey">
      <h3>
        {t('assembly.journey.title')}
        <small>{t('assembly.journey.counts', journey.counts)}</small>
      </h3>
      <ol>
        {journey.stages.map((stage) => {
          const recommended = journey.recommended?.stage === stage.key;
          return (
            <li
              key={stage.key}
              data-stage={stage.key}
              data-state={stage.state}
              data-recommended={recommended || undefined}
            >
              <button
                type="button"
                data-testid={`journey-stage-${stage.key}`}
                onClick={() => open(stage)}
              >
                <span className="a-journey-name">
                  {t(`assembly.journey.stage.${stage.key}`)}
                </span>
                <span className="a-journey-state">
                  {t(`assembly.journey.state.${stage.state}`)}
                </span>
                {stage.state === 'waiting' && stage.waitingFor ? (
                  <small>
                    {journey.stages.find(
                      (item) =>
                        item.state === 'waiting' &&
                        item.waitingFor === stage.waitingFor,
                    ) === stage
                      ? t(`assembly.journey.waiting.${stage.waitingFor}`)
                      : t('assembly.journey.waitingShort', {
                          stage: t(
                            `assembly.journey.stage.${stage.waitingFor}`,
                          ).toLowerCase(),
                        })}
                  </small>
                ) : stage.summary && stage.state === 'ready' ? (
                  <small>{stage.summary}</small>
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function ProjectReadinessPanel({
  readiness,
  journey,
  onJourneyAction,
  unit,
  onAction,
  onSafeRepair,
  onClose,
}: {
  readiness: ProjectReadiness;
  journey?: ProjectJourney;
  onJourneyAction?: (action: JourneyAction) => void;
  unit: LengthUnit;
  onAction: (action: ReadinessAction) => void;
  onSafeRepair: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [previewRepair, setPreviewRepair] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus();
  }, []);
  const safeCount = readiness.safeRepair.issueIds.length;
  return (
    <div className="a-readiness-layer">
      <button
        type="button"
        className="a-readiness-backdrop"
        aria-label={t('assembly.readiness.close')}
        onClick={onClose}
      />
      <section
        ref={dialog}
        className="a-readiness-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('assembly.readiness.panelTitle')}
        data-testid="project-readiness-panel"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header>
          <div>
            <h2>{t('assembly.readiness.panelTitle')}</h2>
            <p>{t('assembly.readiness.panelIntro')}</p>
          </div>
          <button type="button" className="a-button" onClick={onClose}>
            {t('assembly.readiness.close')}
          </button>
        </header>
        {journey && onJourneyAction && (
          <JourneyStages journey={journey} onJourneyAction={onJourneyAction} />
        )}
        {safeCount > 0 && (
          <div className="a-readiness-safe" data-testid="readiness-safe-repair">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <strong>{t('assembly.readiness.safeRepair.title')}</strong>
              {previewRepair ? (
                <>
                  <p>{t('assembly.readiness.safeRepair.preview')}</p>
                  <ul data-testid="readiness-safe-repair-preview">
                    {readiness.safeRepair.changes.map((change) => (
                      <li key={change.kind}>
                        {repairChangeText(t, change, unit, i18n.language)}
                      </li>
                    ))}
                  </ul>
                  <small>{t('assembly.readiness.safeRepair.excluded')}</small>
                  <div className="a-readiness-issue-actions">
                    <button
                      type="button"
                      className="a-button a-primary"
                      data-testid="readiness-safe-repair-apply"
                      onClick={() => {
                        setPreviewRepair(false);
                        onSafeRepair();
                      }}
                    >
                      {t('assembly.readiness.safeRepair.confirm')}
                    </button>
                    <button
                      type="button"
                      className="a-link-button"
                      onClick={() => setPreviewRepair(false)}
                    >
                      {t('assembly.readiness.safeRepair.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="a-button a-primary"
                  data-testid="readiness-safe-repair-open"
                  onClick={() => setPreviewRepair(true)}
                >
                  {t('assembly.readiness.safeRepair.button', {
                    count: safeCount,
                  })}
                </button>
              )}
            </div>
          </div>
        )}
        <ol className="a-readiness-areas">
          {readiness.areas.map((area) => {
            const issues = readiness.issues.filter(
              (issue) => issue.area === area.area,
            );
            return (
              <li key={area.area} data-area={area.area} data-state={area.state}>
                <div className="a-readiness-area-head">
                  <AreaIcon state={area.state} />
                  <strong>{t(`assembly.readiness.area.${area.area}`)}</strong>
                  {area.requirement === 'optional' && (
                    <small>{t('assembly.readiness.optional')}</small>
                  )}
                  <span>{t(`assembly.readiness.areaState.${area.state}`)}</span>
                </div>
                {issues.length === 0 &&
                  (area.state === 'attention' || area.state === 'blocked') && (
                    <p
                      className="a-readiness-inherited"
                      data-testid={`readiness-inherited-${area.area}`}
                    >
                      {t('assembly.readiness.inherited', {
                        areas: [
                          ...new Set(
                            readiness.issues
                              .filter(
                                (issue) =>
                                  issue.severity !== 'info' &&
                                  issue.affects.includes('materials'),
                              )
                              .map((issue) =>
                                t(`assembly.readiness.area.${issue.area}`),
                              ),
                          ),
                        ].join(', '),
                      })}
                    </p>
                  )}
                {issues.length > 0 && area.state !== 'not-applicable' && (
                  <ul>
                    {issues.map((issue) => (
                      <IssueRow
                        key={issue.id}
                        issue={issue}
                        unit={unit}
                        onAction={onAction}
                      />
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

/** V47 small after-action confirmation that reuses the project Undo. */
export function ActionFeedback({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo?: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 7000);
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);
  return (
    <div
      className="a-action-feedback"
      role="status"
      data-testid="action-feedback"
    >
      <CheckCircle2 size={16} aria-hidden="true" />
      <span>{message}</span>
      {onUndo && (
        <button
          type="button"
          className="a-link-button"
          data-testid="action-feedback-undo"
          onClick={() => {
            onUndo();
            onDismiss();
          }}
        >
          {t('assembly.readiness.feedback.undo')}
        </button>
      )}
      <button
        type="button"
        className="a-action-feedback-close"
        aria-label={t('assembly.readiness.feedback.dismiss')}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}

/** Shared by the compact workbench strip and the project overview. */
export function JourneyOverview({
  journey,
  currentStage,
  onAction,
  expanded = false,
}: {
  journey: ProjectJourney;
  currentStage?: JourneyStageKey;
  onAction: (action: JourneyAction) => void;
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const current =
    currentStage === 'layers'
      ? 'covering'
      : currentStage === 'roof-system'
        ? 'materials'
        : currentStage;
  return (
    <nav
      className={`a-journey-overview${expanded ? ' is-expanded' : ''}`}
      aria-label={t('assembly.journey.overview')}
      data-testid={expanded ? 'journey-dashboard' : 'journey-overview'}
    >
      <ol>
        {journey.overview.map((stage) => (
          <li key={stage.key} data-status={stage.status}>
            <button
              type="button"
              data-journey-step={stage.key}
              aria-current={current === stage.key ? 'step' : undefined}
              onClick={() => onAction(stage.target)}
            >
              <strong>
                {stage.status === 'complete' ? '✓ ' : ''}
                {t(`assembly.journey.overviewStage.${stage.key}`)}
              </strong>
              <span>
                {t(`assembly.journey.overviewStatus.${stage.status}`)}
              </span>
              {expanded && stage.summary && <small>{stage.summary}</small>}
            </button>
          </li>
        ))}
      </ol>
      {expanded && <p>{t('assembly.journey.overviewHint')}</p>}
    </nav>
  );
}
