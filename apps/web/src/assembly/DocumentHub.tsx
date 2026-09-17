import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  ListTree,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LengthUnit } from '@cieslacalc/roof-math';
import type { ExportFacts } from './export-adapter';
import {
  DOCUMENT_SECTIONS,
  type ProjectReadiness,
  type ReadinessAction,
  type ReadinessArea,
  type ReadinessDocumentKind,
} from './project-readiness';
import { readinessIssueText } from './readiness-copy';

export type HubDocumentKind = ReadinessDocumentKind;

/** Section sets per document card; the V30 Document Engine renders them. */
export const HUB_DOCUMENT_SECTIONS = DOCUMENT_SECTIONS;

const ICON = { execution: FileText, cost: Wallet, materials: ListTree };

/** Areas whose readiness a document depends on (its preflight). */
const DOCUMENT_AREAS: Record<HubDocumentKind, ReadinessArea[]> = {
  execution: ['construction', 'covering', 'layers', 'execution'],
  materials: ['construction', 'covering', 'layers', 'materials'],
  cost: ['materials', 'cost'],
};

/**
 * V37 Documents destination, V47 document readiness. Every card states its
 * readiness before it is opened, lists a compact preflight of the areas it
 * depends on, and offers the direct fix for a blocker. Presentation only:
 * states come from `deriveProjectReadiness`, sections from the V30 engine.
 */
export function DocumentHub({
  facts,
  readiness,
  unit,
  onAction,
  onOpen,
  onMaterialCsv,
  onCostCsv,
}: {
  facts: ExportFacts;
  readiness: ProjectReadiness;
  unit: LengthUnit;
  onAction: (action: ReadinessAction) => void;
  onOpen: (kind: HubDocumentKind, mode: 'preview' | 'configure') => void;
  onMaterialCsv?: () => void;
  onCostCsv?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const materialCount = facts.materialRows?.length ?? 0;
  return (
    <section className="a-document-hub" data-testid="document-hub">
      <header>
        <small>{t('assembly.docs.eyebrow')}</small>
        <h2>{t('assembly.docs.title')}</h2>
        <p>{t('assembly.docs.description')}</p>
      </header>
      <div className="a-document-cards">
        {(['execution', 'materials', 'cost'] as const).map((kind) => {
          const Icon = ICON[kind];
          const document = readiness.documents[kind];
          const issues = [...document.blockerIds, ...document.warningIds]
            .map((id) => readiness.issues.find((issue) => issue.id === id))
            .filter((issue) => !!issue);
          const fix = issues.find(
            (issue) => issue.severity === 'blocker' && issue.action,
          );
          const csv =
            kind === 'materials'
              ? onMaterialCsv
              : kind === 'cost'
                ? onCostCsv
                : undefined;
          const statusLabel =
            document.state === 'ready'
              ? t('assembly.readiness.document.ready')
              : document.state === 'unavailable'
                ? t('assembly.readiness.document.unavailable')
                : document.state === 'blocked'
                  ? t('assembly.readiness.document.blocked', {
                      count: document.blockerIds.length,
                    })
                  : t('assembly.readiness.document.warning', {
                      count: document.warningIds.length,
                    });
          return (
            <article
              key={kind}
              data-document={kind}
              data-status={document.state}
              className="a-document-card"
            >
              <div className="a-document-card-head">
                <span className="a-document-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <div>
                  <h3>{t(`assembly.docs.${kind}.title`)}</h3>
                  <span
                    className="a-status-pill"
                    data-status={document.state}
                    data-testid={`document-status-${kind}`}
                  >
                    {document.state === 'ready' && (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    )}
                    {document.state === 'warning' && (
                      <AlertTriangle size={13} aria-hidden="true" />
                    )}
                    {document.state === 'blocked' && (
                      <XCircle size={13} aria-hidden="true" />
                    )}
                    {statusLabel}
                  </span>
                </div>
              </div>
              <p>{t(`assembly.docs.${kind}.summary`)}</p>
              <small className="a-document-sections">
                {kind === 'materials' && materialCount > 0
                  ? t('assembly.readiness.document.materialsCount', {
                      count: materialCount,
                    })
                  : t('assembly.readiness.document.sections', {
                      ready: document.readySections,
                      total: document.totalSections,
                    })}
              </small>
              {document.state !== 'unavailable' && (
                <details
                  className="a-document-preflight"
                  data-testid={`document-preflight-${kind}`}
                  open={document.state !== 'ready'}
                >
                  <summary>
                    {t('assembly.readiness.document.preflightTitle')}
                  </summary>
                  <ul>
                    {DOCUMENT_AREAS[kind].map((areaId) => {
                      const area = readiness.areas.find(
                        (item) => item.area === areaId,
                      );
                      if (!area) return null;
                      const docIssues = issues.filter(
                        (issue) => issue.area === areaId,
                      );
                      const state = docIssues.some(
                        (issue) => issue.severity === 'blocker',
                      )
                        ? 'blocked'
                        : docIssues.length
                          ? 'attention'
                          : area.state === 'not-applicable'
                            ? 'not-applicable'
                            : 'ready';
                      return (
                        <li key={areaId} data-state={state} data-area={areaId}>
                          <span aria-hidden="true">
                            {state === 'ready'
                              ? '✓'
                              : state === 'blocked'
                                ? '✕'
                                : state === 'attention'
                                  ? '⚠'
                                  : '—'}
                          </span>
                          <strong>
                            {t(`assembly.readiness.area.${areaId}`)}
                          </strong>
                          {docIssues[0] && (
                            <small>
                              {
                                readinessIssueText(
                                  t,
                                  docIssues[0],
                                  unit,
                                  i18n.language,
                                ).title
                              }
                            </small>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
              {kind === 'cost' && document.state === 'unavailable' && (
                <small className="a-document-empty">
                  {t('assembly.docs.cost.empty')}
                </small>
              )}
              <div className="a-document-actions">
                {fix?.action && (
                  <button
                    type="button"
                    className="a-button a-primary"
                    data-testid={`document-fix-${kind}`}
                    data-readiness-action={fix.action}
                    onClick={() => onAction(fix.action!)}
                  >
                    {t('assembly.readiness.document.fix')}:{' '}
                    {t(`assembly.readiness.action.${fix.action}`)}
                  </button>
                )}
                {kind === 'cost' && document.state === 'unavailable' ? (
                  <button
                    type="button"
                    className="a-button a-primary"
                    data-testid="document-open-cost"
                    onClick={() => onAction('open-cost')}
                  >
                    {t('assembly.readiness.action.open-cost')}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`a-button ${fix ? 'a-ghost' : 'a-primary'}`}
                    data-testid={`document-preview-${kind}`}
                    disabled={document.state === 'unavailable'}
                    onClick={() => onOpen(kind, 'preview')}
                  >
                    <Eye size={16} aria-hidden="true" />
                    {document.state === 'ready'
                      ? t('assembly.docs.preview')
                      : t('assembly.docs.previewWorking')}
                  </button>
                )}
                {kind === 'execution' && (
                  <button
                    type="button"
                    className="a-button a-ghost"
                    data-testid="document-configure-execution"
                    onClick={() => onOpen(kind, 'configure')}
                  >
                    {t('assembly.docs.configure')}
                  </button>
                )}
                {csv && (
                  <button
                    type="button"
                    className="a-button a-ghost"
                    data-testid={`document-csv-${kind}`}
                    onClick={csv}
                  >
                    <Download size={16} aria-hidden="true" />
                    {t('assembly.docs.csv')}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="a-schedule-boundary-note">{t('assembly.docs.boundary')}</p>
    </section>
  );
}
