import { useTranslation } from 'react-i18next';
import type {
  ProjectWorkflow,
  ProjectWorkflowAction,
} from './project-workflow';

export function ProjectWorkflowStrip({
  workflow,
  onAction,
}: {
  workflow: ProjectWorkflow;
  onAction: (action: ProjectWorkflowAction) => void;
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
              {stage.count ?? t(`assembly.workflow.status.${stage.status}`)}
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
    </section>
  );
}

export interface ProjectSummaryFacts {
  roofType: 'gable' | 'hip';
  netRoofAreaMm2: number;
  timberCount: number;
  timberFamilies: Array<{ familyKey: string; quantity: number }>;
  openingCount: number;
  enabledLayerCount: number;
  coveringCount: number;
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
  const area = new Intl.NumberFormat(i18n.language, {
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
            {area} m² · {t('assembly.netGeometric')}
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
            {facts.coveringCount > 0
              ? t('assembly.workflow.status.complete')
              : t('assembly.workflow.status.incomplete')}
          </strong>
          <p>
            {facts.coveringPositionCount > 0
              ? t('assembly.workflow.positions', {
                  count: facts.coveringPositionCount,
                })
              : facts.coveringRunCount > 0
                ? t('assembly.workflow.runs', { count: facts.coveringRunCount })
                : t('assembly.workflow.coveringDescription')}
          </p>
          {facts.coveringCount > 0 && (
            <button
              type="button"
              className="a-link-button"
              onClick={onOpenCovering}
            >
              {t('assembly.workflow.action.reviewCovering')}
            </button>
          )}
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
          <p>{t('assembly.workflow.k1Description')}</p>
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
