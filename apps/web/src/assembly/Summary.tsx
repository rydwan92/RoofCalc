import { useTranslation } from 'react-i18next';
import { datumDisplayLabel } from '@cieslacalc/drawing-engine';
import { formatLength, formatNumber } from '../format';
import { useAssembly } from './store';
import type { Calculation } from './Inputs';
import type { ResolvedRafterSpacing } from '@cieslacalc/timber-model';

export function Results({
  result,
  rafterSpacing,
}: {
  result: Calculation | null;
  rafterSpacing?: ResolvedRafterSpacing;
}) {
  const { t, i18n } = useTranslation(),
    state = useAssembly(),
    unit = state.unit;
  const length = (n?: number) =>
    n === undefined ? '—' : formatLength(n, unit, i18n.language);
  const joint = result?.plan.joints[0],
    ridge = result?.plan.endCuts.find((c) => c.end === 'ridge');
  return (
    <div className="a-results" aria-live="polite">
      <div className="a-main-result">
        <span>{t('assembly.stock')}</span>
        <strong data-testid="stock-length">
          {length(result?.plan.minimumStockLengthMm)}{' '}
          <small>{unit}</small>
        </strong>
        <p>{t('assembly.stockNote')}</p>
      </div>
      <div>
        <span>{t('assembly.reference')}</span>
        <strong>
          {length(result?.plan.referenceLengthMm)} <small>{unit}</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.toNotch')}</span>
        <strong>
          {length(joint?.stationMm)} <small>{unit}</small>
        </strong>
      </div>
      <div>
        <span>
          {t('assembly.seat')} / {t('assembly.notchDepth')}
        </span>
        <strong data-testid="seat-depth">
          {length(joint?.seatLengthMm)} / {length(joint?.normalDepthMm)}{' '}
          <small>{unit}</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.ridgeAngle')}</span>
        <strong>
          {ridge ? formatNumber(ridge.angleToMemberDeg, i18n.language) : '—'}
          <small>°</small>
        </strong>
      </div>
      {rafterSpacing && (
        <button
          className="a-result-action"
          onClick={() => state.select(state.spec.member.id)}
        >
          <span>{t('assembly.rafterPairs')}</span>
          <strong>{rafterSpacing.stations.length}</strong>
        </button>
      )}
      {rafterSpacing && (
        <div>
          <span>{t('assembly.actualSpacing')}</span>
          <strong>
            {length(rafterSpacing.actualSpacingMm)} <small>{unit}</small>
          </strong>
        </div>
      )}
    </div>
  );
}
export function Fabrication({
  result,
  expanded,
}: {
  result: Calculation;
  expanded: boolean;
}) {
  const { t, i18n } = useTranslation(),
    state = useAssembly();
  const { plan } = result;
  const length = (n: number) => formatLength(n, state.unit, i18n.language);
  const labels = new Map(
    plan.datums.map((d, i) => [d.id, datumDisplayLabel(i)]),
  );
  return (
    <section className="a-fabrication" aria-label={t('assembly.fabrication')}>
      <header>
        <h2>{t('assembly.member')}</h2>
        <span>
          {length(plan.section.widthMm)} × {length(plan.section.depthMm)}{' '}
          {state.unit}
        </span>
      </header>
      <div className="a-joint-cards">
        {plan.joints.map((joint, i) => (
          <button
            key={joint.id}
            className="a-joint-card"
            onClick={() => {
              state.setMode('builder');
              state.select(joint.id);
            }}
          >
            <strong>
              Z{i + 1} ·{' '}
              {t(
                `assembly.${state.spec.supports.find((s) => s.id === joint.supportId)!.kind}`,
              )}
            </strong>
            <b>
              {length(joint.stationMm)} {state.unit}
            </b>
            <small>
              {t('assembly.station', {
                datum: labels.get(plan.referenceDatumId),
              })}
            </small>
            <span>
              {t('assembly.seat')}: {length(joint.seatLengthMm)} {state.unit}
            </span>
            <span>
              {t('assembly.notchDepth')}: {length(joint.normalDepthMm)}{' '}
              {state.unit}
            </span>
          </button>
        ))}
        <button
          className="a-joint-card"
          onClick={() => {
            state.setMode('builder');
            state.select('cut:ridge');
          }}
        >
          <strong>K1 · {t('assembly.ridge')}</strong>
          <b>
            {formatNumber(
              plan.endCuts.find((c) => c.end === 'ridge')!.angleToMemberDeg,
              i18n.language,
            )}
            °
          </b>
          <small>{t('assembly.cutAngle')}</small>
        </button>
      </div>
      {expanded && (
        <>
          <h3>{t('assembly.fabrication')}</h3>
          <ol>
            {plan.steps.map((step, i) => (
              <li
                key={`${step.operationId}/${step.action}`}
                data-operation={step.operationId}
              >
                <span className="a-step-number">{i + 1}</span>
                <p>
                  {step.action === 'check-depth'
                    ? t('assembly.checkDepth', {
                        depth: length(step.normalDepthMm),
                        remaining: length(step.remainingDepthMm),
                        unit: state.unit,
                      })
                    : t(
                        `assembly.${step.action === 'mark-plumb' ? 'markPlumb' : 'markSeat'}`,
                        {
                          from: labels.get(step.from),
                          to: labels.get(step.target),
                          distance: length(step.distanceMm),
                          seat:
                            step.seatLengthMm === undefined
                              ? ''
                              : length(step.seatLengthMm),
                          angle: formatNumber(step.angleDeg, i18n.language),
                          unit: state.unit,
                        },
                      )}
                </p>
              </li>
            ))}
          </ol>
          <div className="a-datums">
            {plan.datums.map((d) => (
              <span key={d.id}>
                <b>{labels.get(d.id)}</b>{' '}
                {d.semanticRole === 'member-start'
                  ? t('assembly.overhang')
                  : d.semanticRole === 'member-end'
                    ? t('assembly.ridge')
                    : `${t(`assembly.${state.spec.supports.find((s) => s.id === d.entityId)!.kind}`)} · ${d.semanticRole === 'support-heel' ? t('assembly.notch') : t('assembly.seat')}`}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
