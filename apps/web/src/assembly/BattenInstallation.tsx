import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  resolveBattenLayout,
  roofPlaneIds,
  type BattenLayoutResult,
} from '@cieslacalc/roof-math';
import { resolvePrimaryCoveringAssignments } from '@cieslacalc/covering-core';
import type { BattenLayoutSpec } from '@cieslacalc/timber-model';
import { formatLength } from '../format';
import { useAssembly } from './store';
import {
  resolveBattenAutoComposition,
  type BattenAutoComposition,
} from './batten-composition';
import {
  evaluateBattenInstallation,
  type BattenInstallationDecision,
} from './batten-installation';
import { roofPlaneShortLabelKey } from './covering-presentation';

export function BattenInstallationDetails({
  decision,
  composition,
  result,
}: {
  decision: BattenInstallationDecision;
  composition: BattenAutoComposition;
  result: BattenLayoutResult;
}) {
  const { t, i18n } = useTranslation();
  const unit = useAssembly((state) => state.unit);
  const length = (value: number) =>
    `${formatLength(value, unit, i18n.language)} ${unit}`;
  const installation = composition.installation;
  return (
    <>
      <p
        className={`a-installation-status is-${decision.status}`}
        data-testid="batten-layout-status"
        data-status={decision.status}
      >
        {t(`assembly.installationStatus.${decision.status}`)}
      </p>
      <p
        className="a-installation-authority"
        data-testid="batten-decision-source"
      >
        {t(`assembly.decisionSource.${decision.gaugeSource}`)}
      </p>
      <p className="a-installation-authority">
        {t('assembly.battenEaveOffset')}:{' '}
        {length(decision.eaveReference.valueMm)} /{' '}
        {t('assembly.battenRidgeOffset')}:{' '}
        {length(decision.ridgeReference.valueMm)} ·{' '}
        {t('assembly.manualOwnership')}
      </p>
      {decision.issues.length > 0 && (
        <ul
          className="a-installation-issues"
          data-testid="batten-decision-issues"
        >
          {decision.issues.map((issue, index) => (
            <li key={`${issue.code}-${index}`} data-category={issue.category}>
              {t(`assembly.installationIssue.${issue.code}`)}
              {issue.actual !== undefined && Number.isFinite(issue.actual) && (
                <small>
                  {' · '}
                  {issue.code === 'below-minimum-pitch'
                    ? `${issue.actual}° < ${issue.required}°`
                    : length(issue.actual)}
                </small>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="a-layer-help" data-testid="batten-auto-readiness">
        <summary>{t('assembly.installationReadiness')}</summary>
        <p>
          {t(
            `assembly.installationQuality.${installation?.dataQuality ?? 'partial'}`,
          )}
        </p>
        <dl className="a-installation-facts">
          <div>
            <dt>{t('assembly.regularBattenAutomation')}</dt>
            <dd>
              {t(
                installation?.capability.regularGauge === 'available'
                  ? 'assembly.automationAvailable'
                  : 'assembly.automationUnavailable',
              )}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.battenEaveOffset')}</dt>
            <dd>
              {length(decision.eaveReference.valueMm)} ·{' '}
              {t('assembly.manualOwnership')}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.battenRidgeOffset')}</dt>
            <dd>
              {length(decision.ridgeReference.valueMm)} ·{' '}
              {t('assembly.manualOwnership')}
            </dd>
          </div>
          <div>
            <dt>{t('assembly.minimumPitch')}</dt>
            <dd>
              {installation?.mode?.minPitchDeg !== undefined
                ? `${installation.mode.minPitchDeg}°`
                : t('assembly.automationUnavailable')}
            </dd>
          </div>
        </dl>
        <p>{t('assembly.manualEdgeReferences')}</p>
      </details>
      {result.mode === 'auto-from-covering' &&
        result.planes.some((plane) => plane.autoPlan) && (
          <details
            className="a-layer-help"
            data-testid="batten-auto-explanation"
          >
            <summary>{t('assembly.howRoofCalcCalculated')}</summary>
            {result.planes.map(
              (plane) =>
                plane.autoPlan && (
                  <section key={plane.roofPlaneId}>
                    <strong>
                      {t(roofPlaneShortLabelKey(plane.roofPlaneId))}
                    </strong>
                    <dl className="a-installation-facts">
                      <div>
                        <dt>{t('assembly.regularBattenSpan')}</dt>
                        <dd>{length(plane.autoPlan.regularSpanMm)}</dd>
                      </div>
                      <div>
                        <dt>{t('assembly.allowedRange')}</dt>
                        <dd>
                          {length(plane.autoPlan.minimumGaugeMm)}–
                          {length(plane.autoPlan.maximumGaugeMm)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('assembly.battenTargetGauge')}</dt>
                        <dd>{length(plane.autoPlan.targetGaugeMm)}</dd>
                      </div>
                      <div>
                        <dt>{t('assembly.battenPossibleIntervals')}</dt>
                        <dd>
                          {plane.autoPlan.minimumIntervalCount}–
                          {plane.autoPlan.maximumIntervalCount}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('assembly.battenChosenIntervals')}</dt>
                        <dd>
                          {plane.autoPlan.intervalCount} /{' '}
                          {plane.autoPlan.courseCount}{' '}
                          {t('assembly.battenRows').toLowerCase()}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('assembly.actualBattenGauge')}</dt>
                        <dd>{length(plane.autoPlan.actualGaugeMm)}</dd>
                      </div>
                      <div>
                        <dt>{t('assembly.firstLastBattenReference')}</dt>
                        <dd>
                          {length(plane.autoPlan.firstStationMm)} /{' '}
                          {length(plane.autoPlan.lastStationMm)}
                        </dd>
                      </div>
                    </dl>
                  </section>
                ),
            )}
            <p>
              {t(
                result.planes.every(
                  (plane) =>
                    !plane.autoPlan ||
                    plane.autoPlan.targetSource === 'range-midpoint',
                )
                  ? 'assembly.battenMidpointReason'
                  : 'assembly.battenPreferredReason',
              )}
            </p>
          </details>
        )}
    </>
  );
}

/**
 * Preview and apply Auto on the layer's own scope.
 *
 * V43B root-cause fix: this action used to copy the covering assignment's
 * current plane list into the batten layer. A tile first added to one plane
 * then froze the batten layer on that plane even after the tile was assigned
 * to the whole roof (a hip showed ~27 % of its real batten length). Repair
 * changes only the gauge owner; plane scope is the layer's own intent.
 */
export function BattenAutoRepair({ layout }: { layout: BattenLayoutSpec }) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const preview = useMemo(() => {
    const next = {
      ...layout,
      enabled: true,
      mode: 'auto-from-covering' as const,
    };
    const assignments = state.projectDocument.project.coverings;
    const composition = resolveBattenAutoComposition({
      layout: next,
      assignments,
      ownership: resolvePrimaryCoveringAssignments(assignments),
      roofPlaneIds: roofPlaneIds(state.template),
      roofPitchDeg: state.template.pitchDeg,
    });
    const result = resolveBattenLayout({
      template: state.template,
      layout: next,
      features: state.projectDocument.project.features,
      autoSource: composition.source,
    });
    const decision = evaluateBattenInstallation({
      layout: next,
      result,
      composition,
    });
    return { next, result, decision };
  }, [
    layout,
    state.projectDocument.project.coverings,
    state.projectDocument.project.features,
    state.template,
  ]);
  if (
    (layout.mode ?? 'manual') !== 'manual' ||
    !['ready', 'partially-automatic'].includes(preview.decision.status)
  )
    return null;
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  return (
    <div className="a-batten-repair" data-testid="batten-repair-preview">
      <p>
        {length(layout.gaugeMm)} →{' '}
        {preview.result.planes
          .map(
            (plane) =>
              `${t(roofPlaneShortLabelKey(plane.roofPlaneId))}: ${length(plane.actualGaugeMm!)}`,
          )
          .join(' · ')}
        {' · '}
        {preview.result.battens.length} {t('assembly.battenRows').toLowerCase()}
      </p>
      <button
        className="a-button a-primary"
        onClick={() => state.setBattenLayout(preview.next)}
      >
        {t('assembly.fitBattensAutomatically')}
      </button>
    </div>
  );
}
