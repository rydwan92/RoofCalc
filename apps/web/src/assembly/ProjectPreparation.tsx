import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronUp,
  Circle,
  CircleDashed,
  Clock3,
  FileText,
  Minus,
  PencilRuler,
  X,
  XCircle,
} from 'lucide-react';
import type { LengthUnit } from '@cieslacalc/roof-math';
import { formatLength } from '../format';
import type { JourneyAction } from './project-journey';
import type {
  ImportIntakeReport,
  IntakeReview,
  IntakeValueKey,
  PreparationGroup,
  PreparationState,
  ProjectPreparation,
} from './project-preparation';
import './preparation.css';

/**
 * VNext-6 "Przygotowanie projektu": one compact card after an import (and
 * on demand) that shows the five things a roof job needs and ONE next
 * step. Presentation only — every state comes from
 * `deriveProjectPreparation`, every button opens an existing editor.
 */

function StateIcon({ state }: { state: PreparationState }) {
  if (state === 'done') return <CheckCircle2 size={17} aria-hidden="true" />;
  if (state === 'todo') return <XCircle size={17} aria-hidden="true" />;
  if (state === 'check' || state === 'partial')
    return <CircleDashed size={17} aria-hidden="true" />;
  if (state === 'waiting') return <Clock3 size={17} aria-hidden="true" />;
  return <Circle size={17} aria-hidden="true" />;
}

export function ProjectPreparationCard({
  preparation,
  intake,
  unit,
  collapsed,
  onAction,
  onRevealField,
  onConfirmDefaults,
  onDetailed,
  onCollapse,
  onExpand,
  onClose,
}: {
  preparation: ProjectPreparation;
  intake?: ImportIntakeReport;
  unit: LengthUnit;
  collapsed: boolean;
  /** Runs a journey action (opens the existing editor). */
  onAction: (action: JourneyAction, reason?: 'intake-defaults') => void;
  /** VNext-6.1: opens the exact numeric input of one start value. */
  onRevealField: (key: IntakeValueKey) => void;
  /** VNext-6.1: the explicit confirmation of the values shown. */
  onConfirmDefaults: () => void;
  /** The full Creator with every parameter. */
  onDetailed: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  /** "Potwierdź…" from the pill: expand, then put focus on the button. */
  const [focusConfirm, setFocusConfirm] = useState(false);
  useEffect(() => {
    if (collapsed) return;
    if (focusConfirm) {
      confirmButton.current?.focus();
      confirmButton.current?.scrollIntoView({ block: 'nearest' });
      setFocusConfirm(false);
    } else heading.current?.focus();
    // Focus follows the expansion only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);
  const total = preparation.groups.length;
  const next = preparation.next;
  const nextLabel = next
    ? next.reason === 'intake-defaults'
      ? t('assembly.preparation.checkDefaults')
      : next.reason === 'intake-confirm'
        ? t('assembly.preparation.confirmDefaults')
        : t(`assembly.readiness.action.${next.action.action}`)
    : t('assembly.readiness.action.open-documents');
  const runNext = () => {
    if (next?.reason === 'intake-confirm') {
      if (collapsed) {
        setFocusConfirm(true);
        onExpand();
      } else confirmButton.current?.focus();
      return;
    }
    if (next)
      onAction(
        next.action,
        next.reason === 'intake-defaults' ? 'intake-defaults' : undefined,
      );
    else onAction({ action: 'open-documents' });
  };
  const formatValue = (key: IntakeValueKey, value: number) =>
    key === 'pitch'
      ? `${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(value)}°`
      : `${formatLength(value, unit, i18n.language)} ${unit}`;
  const fieldList = (keys: readonly string[]) =>
    keys.map((key) => t(`assembly.creator.field.${key}`)).join(', ');

  if (collapsed)
    return (
      <div
        className="a-prep is-collapsed"
        data-testid="project-preparation"
        data-collapsed="true"
      >
        <button
          type="button"
          className="a-prep-pill"
          data-testid="project-preparation-expand"
          aria-label={t('assembly.preparation.expand')}
          onClick={onExpand}
        >
          <ChevronUp size={16} aria-hidden="true" />
          <strong>{t('assembly.preparation.title')}</strong>
          <span>
            {t('assembly.preparation.progress', {
              done: preparation.done,
              total,
            })}
          </span>
        </button>
        <button
          type="button"
          className="a-prep-pill-next"
          data-testid="project-preparation-next"
          onClick={runNext}
        >
          {nextLabel}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="a-prep-icon"
          aria-label={t('assembly.preparation.close')}
          title={t('assembly.preparation.close')}
          onClick={onClose}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>
    );

  return (
    <section
      className="a-prep"
      data-testid="project-preparation"
      aria-labelledby="a-prep-title"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onCollapse();
      }}
    >
      <header className="a-prep-header">
        <div>
          <small>{t('assembly.preparation.title')}</small>
          <h2 id="a-prep-title" ref={heading} tabIndex={-1}>
            {intake
              ? t('assembly.preparation.fromDocument', {
                  file: intake.fileName,
                })
              : t('assembly.preparation.title')}
          </h2>
          <p>
            {t('assembly.preparation.progress', {
              done: preparation.done,
              total,
            })}
          </p>
        </div>
        <div className="a-prep-header-actions">
          <button
            type="button"
            className="a-prep-icon"
            aria-label={t('assembly.preparation.collapse')}
            title={t('assembly.preparation.collapse')}
            onClick={onCollapse}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="a-prep-icon"
            aria-label={t('assembly.preparation.close')}
            title={t('assembly.preparation.close')}
            data-testid="project-preparation-close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {preparation.intake && intake && (
        <dl className="a-prep-intake" data-testid="project-preparation-intake">
          {preparation.intake.fromDocument.length > 0 && (
            <div data-source="document">
              <dt>{t('assembly.preparation.intake.document')}</dt>
              <dd>{fieldList(preparation.intake.fromDocument)}</dd>
            </div>
          )}
          {preparation.intake.entered.length > 0 && (
            <div data-source="user">
              <dt>{t('assembly.preparation.intake.entered')}</dt>
              <dd>{fieldList(preparation.intake.entered)}</dd>
            </div>
          )}
          {preparation.intake.review && (
            <DefaultsReview
              review={preparation.intake.review}
              formatValue={formatValue}
              confirmButton={confirmButton}
              onReveal={onRevealField}
              onConfirm={onConfirmDefaults}
            />
          )}
          <p className="a-prep-read">
            {[
              intake.pagesRead !== undefined &&
                t('assembly.preparation.intake.pages', {
                  count: intake.pagesRead,
                }),
              !!intake.pagesSkipped &&
                t('assembly.preparation.intake.skipped', {
                  count: intake.pagesSkipped,
                }),
              intake.readMs !== undefined &&
                t('assembly.preparation.intake.read', {
                  ms: new Intl.NumberFormat(i18n.language).format(
                    intake.readMs,
                  ),
                }),
              t('assembly.preparation.intake.local'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </dl>
      )}

      <ol className="a-prep-groups">
        {preparation.groups.map((group) => (
          <GroupRow
            key={group.key}
            group={group}
            onOpen={() => onAction(group.action)}
            prices={group.key === 'materials' ? preparation.prices : undefined}
          />
        ))}
      </ol>

      <ul
        className="a-prep-documents"
        aria-label={t('assembly.preparation.documents')}
      >
        {preparation.documents.map((document) => (
          <li
            key={document.kind}
            data-state={document.state}
            data-testid={`project-preparation-document-${document.kind}`}
          >
            <FileText size={14} aria-hidden="true" />
            {t(`assembly.preparation.documentKind.${document.kind}`)}
            <span>
              {t(`assembly.preparation.documentState.${document.state}`)}
            </span>
          </li>
        ))}
      </ul>

      <footer className="a-prep-footer">
        <p>{t('assembly.preparation.express')}</p>
        <div>
          <button
            type="button"
            className="a-button a-primary"
            data-testid="project-preparation-next"
            data-action={next?.action.action ?? 'open-documents'}
            onClick={runNext}
          >
            {t('assembly.preparation.next', { action: nextLabel })}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="a-button"
            data-testid="project-preparation-detailed"
            onClick={onDetailed}
          >
            <PencilRuler size={15} aria-hidden="true" />
            {t('assembly.preparation.detailed')}
          </button>
        </div>
        <small>{t('assembly.journey.overviewHint')}</small>
      </footer>
    </section>
  );
}

/**
 * VNext-6.1: the values RoofCalc defaulted, with their CURRENT value, what
 * happened to each, a way to the exact input and one explicit confirmation
 * of exactly these values. Looking is not confirming.
 */
function DefaultsReview({
  review,
  formatValue,
  confirmButton,
  onReveal,
  onConfirm,
}: {
  review: IntakeReview;
  formatValue: (key: IntakeValueKey, value: number) => string;
  confirmButton: React.RefObject<HTMLButtonElement | null>;
  onReveal: (key: IntakeValueKey) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="a-prep-defaults"
      data-source="default"
      data-status={review.status}
      data-testid="project-preparation-defaults"
    >
      <dt>
        {review.status === 'reviewed'
          ? t('assembly.preparation.intake.reviewed')
          : t('assembly.preparation.intake.defaults')}
      </dt>
      <dd>
        <ul>
          {review.fields.map((field) => (
            <li
              key={field.key}
              data-state={field.state}
              data-testid={`project-preparation-default-${field.key}`}
            >
              <span>
                {t(`assembly.creator.field.${field.key}`)}:{' '}
                <strong>{formatValue(field.key, field.value)}</strong>
              </span>
              <small>
                {t(`assembly.preparation.fieldState.${field.state}`)}
              </small>
              <button
                type="button"
                className="a-link-button"
                onClick={() => onReveal(field.key)}
              >
                {t('assembly.preparation.showField')}
              </button>
            </li>
          ))}
        </ul>
        {review.pending.length > 0 ? (
          <button
            ref={confirmButton}
            type="button"
            className="a-button a-prep-confirm"
            data-testid="project-preparation-confirm-defaults"
            onClick={onConfirm}
          >
            <Check size={15} aria-hidden="true" />
            {t('assembly.preparation.confirmValues', {
              count: review.pending.length,
            })}
          </button>
        ) : (
          <p className="a-prep-confirmed" role="status">
            <Check size={14} aria-hidden="true" />
            {t('assembly.preparation.allConfirmed')}
          </p>
        )}
      </dd>
    </div>
  );
}

function GroupRow({
  group,
  onOpen,
  prices,
}: {
  group: PreparationGroup;
  onOpen: () => void;
  prices?: ProjectPreparation['prices'];
}) {
  const { t } = useTranslation();
  return (
    <li
      className="a-prep-group"
      data-group={group.key}
      data-state={group.state}
      data-testid={`project-preparation-${group.key}`}
    >
      <StateIcon state={group.state} />
      <div>
        <strong>{t(`assembly.preparation.group.${group.key}`)}</strong>
        <span>
          {group.defaultsToCheck
            ? t('assembly.preparation.state.defaults')
            : group.state === 'waiting' && group.waitingFor
              ? t('assembly.preparation.state.waitingFor', {
                  group: t(`assembly.preparation.group.${group.waitingFor}`),
                })
              : group.available && group.state !== 'done'
                ? t('assembly.preparation.state.available', group.available)
                : t(`assembly.preparation.state.${group.state}`)}
          {group.open > 0 &&
            group.state !== 'done' &&
            ` · ${t('assembly.preparation.open', { count: group.open })}`}
        </span>
        {group.summary && <small>{group.summary}</small>}
        {prices && (
          <small data-testid="project-preparation-prices">
            {t('assembly.preparation.prices', prices)}
          </small>
        )}
      </div>
      {group.state !== 'waiting' && (
        <button type="button" className="a-link-button" onClick={onOpen}>
          {t('assembly.preparation.openEditor')}
        </button>
      )}
    </li>
  );
}
