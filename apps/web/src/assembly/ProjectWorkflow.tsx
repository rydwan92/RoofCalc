import { useTranslation } from 'react-i18next';
import type {
  ProjectWorkflow,
  ProjectWorkflowAction,
} from './project-workflow';
import type { ProjectGuidanceItem } from './project-guidance';

export function ProjectWorkflowStrip({
  workflow,
  guidance,
  onAction,
}: {
  workflow: ProjectWorkflow;
  guidance: readonly ProjectGuidanceItem[];
  onAction: (action: ProjectWorkflowAction | 'openExport') => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      className="a-project-workflow"
      aria-label={t('assembly.workflow.title')}
    >
      <div className="a-project-workflow-heading">
        <strong>{t('assembly.workflow.title')}</strong>
        <span>
          {t('assembly.workflow.progress', {
            count: workflow.completeCount,
            total: workflow.stages.length,
          })}
        </span>
      </div>
      <ol className="a-project-stages" data-testid="project-workflow">
        {workflow.stages.map((stage, index) => (
          <li key={stage.id} data-stage={stage.id} data-status={stage.status}>
            <span className="a-project-stage-index">{index + 1}</span>
            <span>{t(`assembly.workflow.stage.${stage.id}`)}</span>
            <small>
              {stage.count !== undefined && `${stage.count} · `}
              {t(`assembly.workflow.status.${stage.status}`)}
            </small>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="a-button a-primary a-project-next"
        data-testid="project-next-action"
        onClick={() => onAction(workflow.nextAction)}
      >
        {t(`assembly.workflow.action.${workflow.nextAction}`)}
        <span aria-hidden="true">→</span>
      </button>
      <div className="a-project-guidance" data-testid="project-guidance">
        <div className="a-project-guidance-heading">
          <strong>{t('assembly.guidance.title')}</strong>
          {guidance.length > 2 && (
            <small>
              {t('assembly.guidance.more', { count: guidance.length - 2 })}
            </small>
          )}
        </div>
        {guidance.slice(0, 2).map((item) => (
          <article
            key={item.kind}
            data-severity={item.severity}
            data-guidance={item.kind}
          >
            <div>
              <strong>{t(`assembly.guidance.item.${item.kind}.title`)}</strong>
              <p>{t(`assembly.guidance.item.${item.kind}.description`)}</p>
            </div>
            {item.action && (
              <button
                className="a-link-button"
                onClick={() => onAction(item.action!)}
              >
                {t(`assembly.guidance.item.${item.kind}.action`)}
              </button>
            )}
          </article>
        ))}
        {guidance.length > 2 && (
          <details>
            <summary>{t('assembly.guidance.showAll')}</summary>
            {guidance.slice(2).map((item) => (
              <article
                key={item.kind}
                data-severity={item.severity}
                data-guidance={item.kind}
              >
                <div>
                  <strong>
                    {t(`assembly.guidance.item.${item.kind}.title`)}
                  </strong>
                  <p>{t(`assembly.guidance.item.${item.kind}.description`)}</p>
                </div>
                {item.action && (
                  <button
                    className="a-link-button"
                    onClick={() => onAction(item.action!)}
                  >
                    {t(`assembly.guidance.item.${item.kind}.action`)}
                  </button>
                )}
              </article>
            ))}
          </details>
        )}
      </div>
    </section>
  );
}

export interface ProjectSummaryFacts {
  roofType: 'gable' | 'hip';
  netRoofAreaMm2?: number;
  timberCount: number;
  timberFamilies: Array<{ familyKey: string; quantity: number }>;
  openingCount: number;
  enabledLayerCount: number;
  coveringCount: number;
  coveringStatus: ProjectWorkflow['stages'][number]['status'];
  coveringPositionCount: number;
  coveringRunCount: number;
  k1Ready: boolean;
}

export function ProjectSummary({
  facts,
  onOpenCutting,
  onOpenCovering,
}: {
  facts: ProjectSummaryFacts;
  onOpenCutting: () => void;
  onOpenCovering: () => void;
}) {
  const { t, i18n } = useTranslation();
  const area =
    facts.netRoofAreaMm2 === undefined
      ? undefined
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 2,
        }).format(facts.netRoofAreaMm2 / 1_000_000);
  return (
    <section className="a-project-summary" data-testid="project-summary">
      <header>
        <small>{t('assembly.workflow.title')}</small>
        <h2>{t('assembly.workflow.summaryTitle')}</h2>
        <p>{t('assembly.workflow.summaryDescription')}</p>
      </header>
      <div className="a-project-summary-grid">
        <article>
          <span>{t('assembly.workflow.roof')}</span>
          <strong>{t(`assembly.${facts.roofType}Roof`)}</strong>
          <p>
            {area === undefined
              ? t('assembly.workflow.roofAreaUnavailable')
              : `${area} m² · ${t('assembly.netGeometric')}`}
          </p>
        </article>
        <article>
          <span>{t('assembly.workflow.timber')}</span>
          <strong>
            {facts.timberCount} {t('assembly.piecesShort')}
          </strong>
          <p>
            {facts.timberFamilies
              .map(({ familyKey, quantity }) => `${familyKey} ${quantity}`)
              .join(' · ')}
          </p>
        </article>
        <article>
          <span>{t('assembly.workflow.stage.openings')}</span>
          <strong>{facts.openingCount}</strong>
          <p>{t('assembly.workflow.openingsDescription')}</p>
        </article>
        <article>
          <span>{t('assembly.workflow.stage.layers')}</span>
          <strong>{facts.enabledLayerCount}</strong>
          <p>{t('assembly.workflow.layersDescription')}</p>
        </article>
        <article>
          <span>{t('assembly.workflow.stage.covering')}</span>
          <strong>
            {t(`assembly.workflow.status.${facts.coveringStatus}`)}
          </strong>
          <p>
            {facts.coveringPositionCount > 0
              ? t('assembly.workflow.positions', {
                  count: facts.coveringPositionCount,
                })
              : facts.coveringRunCount > 0
                ? t('assembly.workflow.runs', { count: facts.coveringRunCount })
                : t(
                    facts.coveringCount > 0
                      ? 'assembly.workflow.reviewCoveringDescription'
                      : 'assembly.workflow.coveringDescription',
                  )}
          </p>
          <button
            type="button"
            className="a-link-button"
            onClick={onOpenCovering}
          >
            {t(
              facts.coveringCount > 0
                ? 'assembly.workflow.action.reviewCovering'
                : 'assembly.workflow.action.addCovering',
            )}
          </button>
        </article>
        <article className="a-project-cutting-card" data-ready={facts.k1Ready}>
          <span>{t('assembly.workflow.stage.cutting')}</span>
          <strong>
            {t(
              facts.k1Ready
                ? 'assembly.workflow.k1Ready'
                : 'assembly.workflow.k1Unavailable',
            )}
          </strong>
          <p>
            {t(
              facts.k1Ready
                ? 'assembly.workflow.k1Description'
                : 'assembly.workflow.k1UnavailableDescription',
            )}
          </p>
          {facts.k1Ready && (
            <button
              type="button"
              className="a-button a-primary"
              data-testid="summary-k1-cutting-cta"
              onClick={onOpenCutting}
            >
              {t('assembly.workflow.action.planK1')}
            </button>
          )}
        </article>
      </div>
      <p className="a-schedule-boundary-note">
        {t('assembly.workflow.summaryBoundary')}
      </p>
    </section>
  );
}
