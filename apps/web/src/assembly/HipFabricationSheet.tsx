import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ResolvedHipRafter } from '@cieslacalc/timber-model';
import { formatLength, formatNumber } from '../format';
import { useAssembly } from './store';

export function HipFabricationSheet({
  hip,
  compact = false,
  onBack,
}: {
  hip: ResolvedHipRafter;
  compact?: boolean;
  onBack?: () => void;
}) {
  const state = useAssembly(),
    { t, i18n } = useTranslation();
  const value = hip.result;
  const length = (millimetres: number) =>
    `${formatLength(millimetres, state.unit, i18n.language)} ${state.unit}`;
  const angle = (degrees: number) => `${formatNumber(degrees, i18n.language)}°`;
  const planFaceRatio = Math.min(
    0.22,
    value.ridgePlanDeductionMm / Math.max(value.planRunMm, 1),
  );
  const ridgeFaceX = 250 - 200 * planFaceRatio;
  const ridgeFaceY = 40 + 130 * planFaceRatio;
  const wallRatio =
    value.tailPlanRunMm / Math.max(value.planRunMm + value.tailPlanRunMm, 1);
  const wallX = 50 + 200 * wallRatio;
  const wallY = 170 - 130 * wallRatio;
  const elevationWidth = 210;
  const elevationHeight = Math.min(
    125,
    (value.commonRiseMm / Math.max(value.planRunMm, 1)) * elevationWidth,
  );
  return (
    <section
      className={`a-hip-sheet ${compact ? 'is-compact' : ''}`}
      aria-label={t('assembly.hipFabrication')}
      data-testid="hip-fabrication-sheet"
    >
      <header>
        <div>
          <span>H1</span>
          <h2>{t('assembly.hipRafter')}</h2>
          <p>{t('assembly.hipSheetHint')}</p>
        </div>
        <strong>
          {length(hip.spec.section.widthMm)} ×{' '}
          {length(hip.spec.section.depthMm)}
        </strong>
      </header>
      {onBack && (
        <button className="a-button a-back" onClick={onBack}>
          <ArrowLeft size={16} />
          {t('assembly.backToSkeleton')}
        </button>
      )}
      <div className="a-hip-views">
        <figure>
          <figcaption>{t('assembly.hipPlanView')}</figcaption>
          <svg
            viewBox="0 0 320 210"
            role="img"
            aria-label={t('assembly.hipPlanView')}
          >
            <path className="h-guide" d="M50 40 V170 H250" />
            <path className="h-member" d="M50 170 L250 40" />
            {value.tailPlanRunMm > 0 && (
              <path className="h-tail" d={`M50 170 L${wallX} ${wallY}`} />
            )}
            <path className="h-center" d="M250 18 V62" />
            <path
              className="h-face"
              d={`M${ridgeFaceX - 10} ${ridgeFaceY - 15} L${ridgeFaceX + 10} ${ridgeFaceY + 15}`}
            />
            <circle className="h-point" cx="50" cy="170" r="4" />
            <circle className="h-wall-point" cx={wallX} cy={wallY} r="4" />
            <circle className="h-point" cx="250" cy="40" r="4" />
            <text x="52" y="184">
              {t('assembly.outerEave')}
            </text>
            <text x={wallX + 7} y={wallY + 5}>
              {t('assembly.wallCorner')}
            </text>
            <text x="253" y="29">
              {t('assembly.ridgeAxis')}
            </text>
            <text x="125" y="116">
              H1 · 45°
            </text>
            <text x="52" y="194">
              R = {length(hip.spec.commonRunMm)}
            </text>
          </svg>
          <dl>
            <div>
              <dt>{t('assembly.hipPlanRun')}</dt>
              <dd>{length(value.planRunMm)}</dd>
            </div>
            <div>
              <dt>{t('assembly.ridgePlanDeduction')}</dt>
              <dd>{length(value.ridgePlanDeductionMm)}</dd>
            </div>
          </dl>
        </figure>
        <figure>
          <figcaption>{t('assembly.hipElevation')}</figcaption>
          <svg
            viewBox="0 0 320 210"
            role="img"
            aria-label={t('assembly.hipElevation')}
          >
            <path className="h-guide" d="M45 170 H275" />
            <path
              className="h-member"
              d={`M55 170 L${55 + elevationWidth} ${170 - elevationHeight}`}
            />
            <path
              className="h-guide"
              d={`M${55 + elevationWidth} 170 V${170 - elevationHeight}`}
            />
            <path
              className="h-face"
              d={`M${55 + elevationWidth - 8} ${170 - elevationHeight - 14} L${55 + elevationWidth + 8} ${170 - elevationHeight + 14}`}
            />
            <path
              className="h-seat"
              d={`M${55 + elevationWidth * wallRatio - 16} ${170 - elevationHeight * wallRatio} H${55 + elevationWidth * wallRatio + 18}`}
            />
            <text x="62" y="192">
              {t('assembly.hipPlanBasis')}
            </text>
            <text x="165" y="112">
              {angle(value.hipSlopeDeg)}
            </text>
            <text x="238" y="181">
              h = {length(value.commonRiseMm)}
            </text>
          </svg>
          <dl>
            <div>
              <dt>{t('assembly.hipTheoreticalLength')}</dt>
              <dd>{length(value.totalTheoreticalLineLengthMm)}</dd>
            </div>
            <div>
              <dt>{t('assembly.hipPhysicalLength')}</dt>
              <dd>{length(value.outerEaveToRidgeFaceMm)}</dd>
            </div>
            <div>
              <dt>{t('assembly.hipSlope')}</dt>
              <dd>{angle(value.hipSlopeDeg)}</dd>
            </div>
            <div>
              <dt>{t('assembly.hipPlumb')}</dt>
              <dd>{angle(value.plumbToMemberDeg)}</dd>
            </div>
            <div>
              <dt>{t('assembly.hipSeat')}</dt>
              <dd>{angle(value.seatToMemberDeg)}</dd>
            </div>
          </dl>
        </figure>
        <figure>
          <figcaption>{t('assembly.hipCutDetail')}</figcaption>
          <svg
            viewBox="0 0 320 210"
            role="img"
            aria-label={t('assembly.hipCutDetail')}
          >
            <rect
              className="h-timber"
              x="42"
              y="52"
              width="236"
              height="106"
              rx="3"
            />
            <g transform={`rotate(${-value.cheekAngleDeg} 230 105)`}>
              <path className="h-face" d="M230 42 V168" />
            </g>
            <path className="h-center" d="M160 52 V158" />
            <path className="h-backing" d="M70 145 L105 110 L140 145" />
            <text x="174" y="83">
              {angle(value.cheekAngleDeg)}
            </text>
            <text x="64" y="174">
              {angle(value.backingAngleDeg)}
            </text>
            <text x="145" y="190">
              {t('assembly.doubleCheek')}
            </text>
          </svg>
          <dl>
            <div>
              <dt>{t('assembly.hipCheek')}</dt>
              <dd>{angle(value.cheekAngleDeg)}</dd>
            </div>
            <div>
              <dt>{t('assembly.hipBacking')}</dt>
              <dd>{angle(value.backingAngleDeg)}</dd>
            </div>
            <div>
              <dt>{t('assembly.ridgeAxisDeduction')}</dt>
              <dd>{length(value.ridgeAxisDeductionMm)}</dd>
            </div>
          </dl>
        </figure>
      </div>
      <p className="a-hip-reference">{t('assembly.hipAngleReferences')}</p>
    </section>
  );
}
