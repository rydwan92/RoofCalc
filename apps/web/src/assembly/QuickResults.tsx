import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { calculateRidgeCut } from '@cieslacalc/roof-math';
import type { ResolvedHipRafter } from '@cieslacalc/timber-model';
import { formatAngle, formatLength } from '../format';
import { useAssembly } from './store';
import type { Calculation } from './Inputs';

/**
 * V44 Quick results: one dominant answer, a few highlightable cut facts and a
 * "Jak policzono?" disclosure. Presentation only — every number comes from the
 * already-resolved calculation; the disclosure restates the textbook relation
 * that `calculator-oracles.test.ts` verifies independently.
 */

export type QuickHighlight = 'length' | 'ridge' | 'birdsmouth' | 'eave';

export interface EvidenceRow {
  label: string;
  value: string;
  note?: string;
  result?: boolean;
}

/** Reusable compact calculation evidence. */
export function CalculationEvidence({
  rows,
  footnote,
  testId,
}: {
  rows: readonly EvidenceRow[];
  footnote?: ReactNode;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <details className="a-evidence" data-testid={testId}>
      <summary>{t('assembly.evidence.title')}</summary>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className={row.result ? 'is-result' : undefined}>
            <dt>{row.label}</dt>
            <dd>
              {row.value}
              {row.note && <small>{row.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
      {footnote && <p>{footnote}</p>}
    </details>
  );
}

function Fact({
  label,
  value,
  highlight,
  active,
  onHighlight,
  testId,
}: {
  label: string;
  value: ReactNode;
  highlight?: QuickHighlight;
  active?: QuickHighlight;
  onHighlight?: (value?: QuickHighlight) => void;
  testId?: string;
}) {
  const interactive = highlight && onHighlight;
  const content = (
    <>
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
    </>
  );
  return interactive ? (
    <button
      type="button"
      className="a-quick-fact"
      data-highlight={highlight}
      aria-pressed={active === highlight}
      onMouseEnter={() => onHighlight(highlight)}
      onMouseLeave={() => onHighlight(undefined)}
      onFocus={() => onHighlight(highlight)}
      onBlur={() => onHighlight(undefined)}
      onClick={() => onHighlight(highlight)}
    >
      {content}
    </button>
  ) : (
    <div className="a-quick-fact">{content}</div>
  );
}

export function QuickK1Result({
  result,
  highlight,
  onHighlight,
}: {
  result: Calculation;
  highlight?: QuickHighlight;
  onHighlight: (value?: QuickHighlight) => void;
}) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const unit = state.unit;
  const length = (mm: number) =>
    `${formatLength(mm, unit, i18n.language)} ${unit}`;
  const plan = result.plan;
  const joint = plan.joints[0];
  const ridge = plan.endCuts.find((cut) => cut.end === 'ridge');
  const { roof, member, ridge: ridgeSpec } = state.spec;
  const ridgeCut = calculateRidgeCut({
    runMm: roof.runMm,
    pitchDeg: roof.pitchDeg,
    depthMm: member.section.depthMm,
    thicknessMm: ridgeSpec.thicknessMm,
    connection: ridgeSpec.connection,
  });
  return (
    <section className="a-quick-result" aria-live="polite">
      <button
        type="button"
        className="a-quick-primary"
        data-highlight="length"
        aria-pressed={highlight === 'length'}
        onMouseEnter={() => onHighlight('length')}
        onMouseLeave={() => onHighlight(undefined)}
        onFocus={() => onHighlight('length')}
        onBlur={() => onHighlight(undefined)}
      >
        <strong data-testid="stock-length">
          {formatLength(plan.minimumStockLengthMm, unit, i18n.language)}{' '}
          <small>{unit}</small>
        </strong>
        <span>{t('assembly.stock')}</span>
        <small>{t('assembly.stockNote')}</small>
      </button>
      <div className="a-quick-facts">
        <Fact
          label={t('assembly.ridgeAngle')}
          value={
            ridge ? formatAngle(ridge.angleToMemberDeg, i18n.language) : '—'
          }
          highlight="ridge"
          active={highlight}
          onHighlight={onHighlight}
        />
        <Fact
          label={t('assembly.quickResult.birdsmouthSize')}
          value={
            joint
              ? `${formatLength(joint.seatLengthMm, unit, i18n.language)} × ${length(joint.normalDepthMm)}`
              : '—'
          }
          highlight="birdsmouth"
          active={highlight}
          onHighlight={onHighlight}
          testId="seat-depth"
        />
        <Fact
          label={t('assembly.toNotch')}
          value={joint ? length(joint.stationMm) : '—'}
          highlight="birdsmouth"
          active={highlight}
          onHighlight={onHighlight}
        />
        <Fact
          label={t('assembly.reference')}
          value={length(plan.referenceLengthMm)}
          highlight="length"
          active={highlight}
          onHighlight={onHighlight}
        />
        <Fact
          label={t('assembly.quickResult.eave')}
          value={length(roof.overhangMm)}
          highlight="eave"
          active={highlight}
          onHighlight={onHighlight}
        />
      </div>
      <CalculationEvidence
        testId="k1-evidence"
        rows={[
          { label: t('assembly.evidence.run'), value: length(roof.runMm) },
          {
            label: t('assembly.evidence.pitch'),
            value: formatAngle(roof.pitchDeg, i18n.language),
          },
          {
            label: t('assembly.evidence.eave'),
            value: length(roof.overhangMm),
          },
          {
            label: t('assembly.evidence.ridgeDeduction'),
            value: `− ${length(ridgeCut.horizontalDeductionMm)}`,
            note: t('assembly.evidence.ridgeDeductionNote'),
          },
          {
            label: t('assembly.reference'),
            value: length(plan.referenceLengthMm),
            note: t('assembly.evidence.topEdgeFormula'),
          },
          {
            label: t('assembly.evidence.plumbOffset'),
            value: `+ ${length(plan.minimumStockLengthMm - plan.referenceLengthMm)}`,
            note: t('assembly.evidence.plumbOffsetFormula', {
              depth: length(member.section.depthMm),
            }),
          },
          {
            label: t('assembly.quickResult.k1Length'),
            value: length(plan.minimumStockLengthMm),
            result: true,
          },
        ]}
        footnote={t('assembly.evidence.k1Footnote')}
      />
    </section>
  );
}

export function QuickH1Result({ hip }: { hip: ResolvedHipRafter }) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const unit = state.unit;
  const length = (mm: number) =>
    `${formatLength(mm, unit, i18n.language)} ${unit}`;
  const angle = (deg: number) => formatAngle(deg, i18n.language);
  const result = hip.result;
  const spec = hip.spec;
  return (
    <section className="a-quick-result" aria-live="polite">
      <div className="a-quick-primary">
        <strong data-testid="hip-physical-length">
          {formatLength(result.outerEaveToRidgeFaceMm, unit, i18n.language)}{' '}
          <small>{unit}</small>
        </strong>
        <span>{t('assembly.quickResult.h1Length')}</span>
        <small>{t('assembly.hipLengthNote')}</small>
      </div>
      <div className="a-quick-facts">
        <Fact
          label={t('assembly.hipTheoreticalLength')}
          value={
            <span data-testid="hip-theoretical-length">
              {length(result.totalTheoreticalLineLengthMm)}
            </span>
          }
        />
        <Fact
          label={t('assembly.hipPlanRun')}
          value={length(result.planRunMm)}
        />
        <Fact
          label={t('assembly.hipSlope')}
          value={angle(result.hipSlopeDeg)}
        />
        <Fact
          label={t('assembly.hipPlumb')}
          value={angle(result.plumbToMemberDeg)}
        />
        <Fact
          label={t('assembly.hipCheek')}
          value={angle(result.cheekAngleDeg)}
        />
        <Fact
          label={t('assembly.hipBacking')}
          value={angle(result.backingAngleDeg)}
        />
      </div>
      <CalculationEvidence
        testId="h1-evidence"
        rows={[
          {
            label: t('assembly.evidence.run'),
            value: length(spec.commonRunMm),
          },
          { label: t('assembly.evidence.pitch'), value: angle(spec.pitchDeg) },
          {
            label: t('assembly.evidence.eave'),
            value: length(spec.overhangMm),
          },
          {
            label: t('assembly.hipPlanRun'),
            value: length(result.planRunMm),
            note: t('assembly.evidence.hipPlanFormula'),
          },
          {
            label: t('assembly.hipSlope'),
            value: angle(result.hipSlopeDeg),
            note: t('assembly.evidence.hipSlopeFormula'),
          },
          {
            label: t('assembly.hipTheoreticalLength'),
            value: length(result.totalTheoreticalLineLengthMm),
          },
          {
            label: t('assembly.evidence.ridgeDeduction'),
            value: `− ${length(result.ridgeAxisDeductionMm)}`,
          },
          {
            label: t('assembly.quickResult.h1Length'),
            value: length(result.outerEaveToRidgeFaceMm),
            result: true,
          },
        ]}
        footnote={t('assembly.evidence.h1Footnote')}
      />
    </section>
  );
}
