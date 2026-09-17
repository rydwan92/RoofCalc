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
  unit,
  onAction,
  onOpenPanel,
}: {
  readiness: ProjectReadiness;
  unit: LengthUnit;
  onAction: (action: ReadinessAction) => void;
  onOpenPanel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const primary = readiness.primary;
  const rest = readiness.issues.filter(
    (issue) => issue.id !== primary?.id && issue.severity !== 'info',
  ).length;
  const text = primary
    ? readinessIssueText(t, primary, unit, i18n.language)
    : undefined;
  return (
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
        aria-label={t('assembly.readiness.progressLabel', readiness.progress)}
        onClick={onOpenPanel}
      >
        <span className="a-readiness-dots" aria-hidden="true">
          {readiness.areas
            .filter((area) => area.counted)
            .map((area) => (
              <i key={area.area} data-state={area.state} />
            ))}
        </span>
        {t('assembly.readiness.progress', readiness.progress)}
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
            <strong>{text.title}</strong>
            <span>{text.description}</span>
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
        {primary?.action && (
          <button
            type="button"
            className="a-button a-primary"
            data-testid="project-next-action"
            data-readiness-action={primary.action}
            onClick={() => onAction(primary.action!)}
          >
            {t(`assembly.readiness.action.${primary.action}`)}
          </button>
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

export function ProjectReadinessPanel({
  readiness,
  unit,
  onAction,
  onSafeRepair,
  onClose,
}: {
  readiness: ProjectReadiness;
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
