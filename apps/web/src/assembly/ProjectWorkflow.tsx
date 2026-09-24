import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Scissors,
} from 'lucide-react';
import type { ProjectWorkflow } from './project-workflow';
import type { ProjectJourney, JourneyAction } from './project-journey';
import type { LengthUnit } from '@cieslacalc/roof-math';
import { journeyStageStatus, journeyStageTarget } from './ProjectReadiness';
import { readinessIssueText } from './readiness-copy';

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

/**
 * One project overview: every stage with the fact already derived for it,
 * its status and one way in. No own calculation — the journey summaries and
 * readiness issues are the only sources.
 */
export function ProjectSummary({
  facts,
  projectName,
  journey,
  onJourneyAction,
  unit,
  onOpenCutting,
}: {
  facts: ProjectSummaryFacts;
  projectName?: string;
  journey?: ProjectJourney;
  onJourneyAction?: (action: JourneyAction) => void;
  unit?: LengthUnit;
  onOpenCutting: () => void;
  /** Kept for callers; covering is reached through its stage row. */
  onOpenCovering?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const recommended = journey?.recommended;
  return (
    <section className="a-project-summary" data-testid="project-summary">
      <header className="a-overview-head">
        <div>
          <small>{t('assembly.journey.projectOverview')}</small>
          <h2>{projectName ?? t('assembly.workflow.summaryTitle')}</h2>
          {journey?.stages[0]?.summary && <p>{journey.stages[0].summary}</p>}
        </div>
        {recommended && onJourneyAction && (
          <button
            type="button"
            className="a-button a-primary a-overview-continue"
            data-testid="overview-continue"
            onClick={() => onJourneyAction(recommended)}
          >
            <span>
              <small>{t('assembly.journey.continue')}</small>
              {t(`assembly.readiness.action.${recommended.action}`)}
            </span>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </header>
      {journey && onJourneyAction && (
        <ol className="a-overview-stages" data-testid="journey-dashboard">
          {journey.stages.map((stage, index) => {
            const status = journeyStageStatus(stage);
            const issue =
              stage.issues.find((item) => item.severity === 'blocker') ??
              stage.issues.find((item) => item.severity === 'warning');
            const note = issue
              ? readinessIssueText(t, issue, unit ?? 'cm', i18n.language).title
              : stage.state === 'waiting' && stage.waitingFor
                ? journey.stages.find(
                    (item) =>
                      item.state === 'waiting' &&
                      item.waitingFor === stage.waitingFor,
                  ) === stage
                  ? t(`assembly.journey.waiting.${stage.waitingFor}`)
                  : t('assembly.journey.waitingShort', {
                      stage: t(
                        `assembly.journey.stage.${stage.waitingFor}`,
                      ).toLowerCase(),
                    })
                : undefined;
            return (
              <li
                key={stage.key}
                data-status={status}
                data-stage={stage.key}
                data-recommended={recommended?.stage === stage.key || undefined}
              >
                <span className="a-overview-index" aria-hidden="true">
                  {status === 'ready' ? (
                    <CheckCircle2 size={18} />
                  ) : status === 'attention' ? (
                    <AlertTriangle size={17} />
                  ) : (
                    index + 1
                  )}
                </span>
                <div className="a-overview-fact">
                  <strong>{t(`assembly.journey.stage.${stage.key}`)}</strong>
                  <span>
                    {stage.summary ||
                      t(`assembly.journey.state.${stage.state}`)}
                  </span>
                  {note && (
                    <small data-kind={issue ? 'issue' : 'waiting'}>
                      {note}
                    </small>
                  )}
                </div>
                {stage.key === 'construction' && facts.k1Ready && (
                  <button
                    type="button"
                    className="a-button a-overview-extra"
                    data-testid="summary-k1-cutting-cta"
                    onClick={onOpenCutting}
                  >
                    <Scissors size={15} aria-hidden="true" />
                    {t('assembly.workflow.action.planK1')}
                  </button>
                )}
                <button
                  type="button"
                  className="a-button a-overview-open"
                  data-journey-step={stage.key}
                  onClick={() =>
                    onJourneyAction(journeyStageTarget(journey, stage))
                  }
                >
                  {t('assembly.journey.open')}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="a-schedule-boundary-note">
        {t('assembly.workflow.summaryBoundary')}
      </p>
    </section>
  );
}
