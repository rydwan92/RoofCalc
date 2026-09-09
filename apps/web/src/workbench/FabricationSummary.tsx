import { ArrowRight, Info, Ruler, Scissors } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RafterWorkbenchResult } from '@cieslacalc/roof-math';
import { useWorkbench } from '../store';
import { formatLength, formatNumber } from '../format';

export function FabricationSummary({
  result,
}: {
  result: RafterWorkbenchResult | null;
}) {
  const { t, i18n } = useTranslation();
  const { unit, select, setView } = useWorkbench();
  const length = (mm: number) => formatLength(mm, unit, i18n.language);
  const measure = (mm: number) => `${length(mm)} ${unit}`;
  const angle = (deg: number) => `${formatNumber(deg, i18n.language)}°`;
  return (
    <section className="fabrication-section" aria-label={t('fabrication')}>
      <div className="fabrication-heading">
        <h2>
          <Ruler size={18} />
          {t('fabrication')}
        </h2>
        <span>{t('topEdge')}</span>
      </div>
      <div
        className="fabrication-metrics"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="primary-metric">
          <span>{t('referenceLength')}</span>
          <strong data-testid="total-length">
            {result ? length(result.member.referenceLengthMm) : '—'}
            <small>{unit}</small>
          </strong>
          <span>{t('topEdge')}</span>
        </div>
        <div className="metric">
          <span>{t('minimumStock')}</span>
          <strong>
            {result ? length(result.member.minimumStockLengthMm) : '—'}
            <small>{unit}</small>
          </strong>
          <p>{t('stockNote')}</p>
        </div>
        <button
          type="button"
          className="metric metric-link"
          onClick={() => {
            select('birdsmouth');
            setView('detail');
          }}
        >
          <span>
            {t('seat')} / {t('normalDepth')}
          </span>
          <strong data-testid="seat-depth-summary">
            {result
              ? `${length(result.notch.seatLengthMm)} / ${length(result.notch.normalDepthMm)}`
              : '—'}
            <small>{unit}</small>
          </strong>
          <span>
            {t('objects.birdsmouth')}
            <ArrowRight size={15} />
          </span>
        </button>
        <button
          type="button"
          className="metric metric-link"
          onClick={() => {
            select('ridge-cut');
            setView('detail');
          }}
        >
          <span>{t('objects.ridge-cut')}</span>
          <strong>{result ? angle(result.ridge.angleToMemberDeg) : '—'}</strong>
          <span>
            {t('ridgeDeduction')}{' '}
            {result ? measure(result.ridge.alongMemberDeductionMm) : '—'}
            <ArrowRight size={15} />
          </span>
        </button>
      </div>
      {result && (
        <>
          <div className="dimension-chain" aria-label={t('chain')}>
            {result.stations.slice(0, 3).map((station) => (
              <div key={station.id}>
                <span className="chain-letter">{station.from}</span>
                <span className="chain-track">
                  <span>{measure(station.distanceMm)}</span>
                  <i />
                </span>
                <span className="chain-letter">{station.to}</span>
              </div>
            ))}
          </div>
          <div className="fabrication-details">
            <div className="datum-definitions">
              <h3>{t('datum')}</h3>
              {result.member.datums.map((datum) => (
                <div key={datum.id}>
                  <span className="datum-badge">{datum.id}</span>
                  <span>{t(`datumLabels.${datum.id}`)}</span>
                </div>
              ))}
              <p>{t('datumNote')}</p>
            </div>
            <div className="marking-instructions">
              <h3>
                <Scissors size={15} />
                {t('steps')}
              </h3>
              <ol>
                {result.instructions.map((instruction) => (
                  <li key={instruction.id}>
                    {t(
                      instruction.action === 'mark-plumb'
                        ? 'markPlumb'
                        : 'markSeat',
                      {
                        from: instruction.from,
                        target: instruction.target,
                        distance: measure(instruction.stationMm),
                        angle: angle(instruction.angleDeg),
                        seat:
                          instruction.seatLengthMm === undefined
                            ? ''
                            : measure(instruction.seatLengthMm),
                      },
                    )}
                  </li>
                ))}
              </ol>
              <p>{t('angleNote')}</p>
            </div>
          </div>
          <div className="fabrication-note">
            <Info size={16} />
            <p>
              <strong>
                {t('removed')}:{' '}
                {formatNumber(
                  result.notch.removedDepthRatio * 100,
                  i18n.language,
                )}
                %.
              </strong>{' '}
              {t('structuralNote')}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
