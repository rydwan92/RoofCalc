import {
  Download,
  Eye,
  FileText,
  ListChecks,
  ListTree,
  Wallet,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { SectionKind } from '@cieslacalc/document-core';
import { createExportCandidates, type ExportFacts } from './export-adapter';

export type HubDocumentKind = 'execution' | 'cost' | 'materials';

/** Section sets per document card; the V30 Document Engine renders them. */
export const HUB_DOCUMENT_SECTIONS: Record<
  HubDocumentKind,
  readonly SectionKind[]
> = {
  execution: [
    'project-summary',
    'roof-overview',
    'member-schedule',
    'member-fabrication',
    'cutting-plan',
    'layers',
    'covering',
    'assumptions',
  ],
  cost: ['project-summary', 'cost-estimate'],
  materials: ['project-summary', 'material-list'],
};

const ICON = { execution: FileText, cost: Wallet, materials: ListTree };

export type HubDocumentStatus = 'ready' | 'partial' | 'unavailable';

export function hubDocumentStatus(
  kind: HubDocumentKind,
  candidates: ReturnType<typeof createExportCandidates>,
): { status: HubDocumentStatus; ready: number; total: number } {
  const sections = HUB_DOCUMENT_SECTIONS[kind];
  const ready = sections.filter((section) =>
    candidates.some(
      (candidate) =>
        candidate.kind === section &&
        candidate.readiness !== 'unavailable' &&
        !!candidate.section,
    ),
  ).length;
  // The summary section alone does not make a cost or material document.
  const core = sections.filter((section) => section !== 'project-summary');
  const coreReady = core.filter((section) =>
    candidates.some(
      (candidate) =>
        candidate.kind === section &&
        candidate.readiness !== 'unavailable' &&
        !!candidate.section,
    ),
  ).length;
  return {
    status:
      coreReady === 0
        ? 'unavailable'
        : ready === sections.length
          ? 'ready'
          : 'partial',
    ready,
    total: sections.length,
  };
}

/**
 * V37 Documents destination. Reuses the V30 engine through ExecutionExport;
 * owns no document logic and no persisted state.
 */
export function DocumentHub({
  facts,
  onOpen,
  onMaterialCsv,
  onCostCsv,
}: {
  facts: ExportFacts;
  onOpen: (kind: HubDocumentKind, mode: 'preview' | 'configure') => void;
  onMaterialCsv?: () => void;
  onCostCsv?: () => void;
}) {
  const { t } = useTranslation();
  const candidates = useMemo(() => createExportCandidates(facts), [facts]);
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
          const { status, ready, total } = hubDocumentStatus(kind, candidates);
          const csv =
            kind === 'materials'
              ? onMaterialCsv
              : kind === 'cost'
                ? onCostCsv
                : undefined;
          return (
            <article
              key={kind}
              data-document={kind}
              data-status={status}
              className="a-document-card"
            >
              <div className="a-document-card-head">
                <span className="a-document-icon" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <div>
                  <h3>{t(`assembly.docs.${kind}.title`)}</h3>
                  <span className="a-status-pill" data-status={status}>
                    {t(`assembly.docs.status.${status}`)}
                  </span>
                </div>
              </div>
              <p>{t(`assembly.docs.${kind}.summary`)}</p>
              <small className="a-document-sections">
                <ListChecks size={14} aria-hidden="true" />{' '}
                {t('assembly.docs.sections', { ready, total })}
              </small>
              {kind === 'cost' && status === 'unavailable' && (
                <small className="a-document-empty">
                  {t('assembly.docs.cost.empty')}
                </small>
              )}
              <div className="a-document-actions">
                <button
                  type="button"
                  className="a-button a-primary"
                  data-testid={`document-preview-${kind}`}
                  disabled={status === 'unavailable'}
                  onClick={() => onOpen(kind, 'preview')}
                >
                  <Eye size={16} aria-hidden="true" />
                  {t('assembly.docs.preview')}
                </button>
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
