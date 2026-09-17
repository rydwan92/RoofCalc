import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { datumDisplayLabel } from '@cieslacalc/drawing-engine';
import { formatLength, formatNumber } from '../format';
import { useAssembly } from './store';
import type { Calculation } from './Inputs';
import type {
  ResolvedHipRafter,
  ResolvedMemberPrototype,
  ResolvedRafterSpacing,
  RoofSkeleton,
} from '@cieslacalc/timber-model';
import type {
  ResolvedRoofTemplate,
  WorkbenchSelectionContext,
} from './selection';

export function SpacingSummary({
  spacing,
  stationLabelKey = 'rafterPairs',
  headingKey,
  compact = false,
}: {
  spacing: ResolvedRafterSpacing;
  stationLabelKey?: 'rafterPairs' | 'spacingAxes';
  headingKey?: 'commonRafterRegionSpacing' | 'jackRafterRegionSpacing';
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const percent = (value: number) => {
    const formatted = formatNumber(Math.abs(value) * 100, i18n.language);
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatted}%`;
  };
  const requestedLabel =
    spacing.mode === 'max-even-spacing'
      ? 'requestedMaximumSpacing'
      : spacing.mode === 'target-even-spacing'
        ? 'requestedTargetSpacing'
        : 'requestedModuleSpacing';
  const explanation =
    spacing.mode === 'max-even-spacing'
      ? t('assembly.spacingMaxExplanation', {
          count: spacing.stationCount,
          middle: Math.max(0, spacing.stationCount - 2),
          requested: length(spacing.requestedSpacingMm),
        })
      : spacing.mode === 'target-even-spacing'
        ? t('assembly.spacingTargetExplanation', {
            bays: spacing.bayCount,
            deviation: percent(spacing.deviationRatio ?? 0),
          })
        : spacing.endPolicy === 'require-both-ends'
          ? t('assembly.spacingFixedEndExplanation', {
              endBay:
                spacing.endBaySpacingMm === undefined
                  ? length(spacing.actualSpacingMm)
                  : length(spacing.endBaySpacingMm),
            })
          : t('assembly.spacingOpenEndExplanation', {
              remainder: length(spacing.remainderToEndMm ?? 0),
            });
  return (
    <section
      className={`a-spacing-summary ${compact ? 'is-compact' : ''}`}
      data-testid="spacing-summary"
    >
      {headingKey && <h3>{t(`assembly.${headingKey}`)}</h3>}
      <dl>
        <div>
          <dt>{t(`assembly.${requestedLabel}`)}</dt>
          <dd data-testid="requested-spacing">
            {length(spacing.requestedSpacingMm)}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.actualSpacing')}</dt>
          <dd data-testid="actual-spacing">
            {length(spacing.actualSpacingMm)}
          </dd>
        </div>
        <div>
          <dt>{t('assembly.bayCount')}</dt>
          <dd data-testid="bay-count">{spacing.bayCount}</dd>
        </div>
        <div>
          <dt>{t(`assembly.${stationLabelKey}`)}</dt>
          <dd data-testid="station-count">{spacing.stationCount}</dd>
        </div>
        {spacing.deviationRatio !== undefined && (
          <div>
            <dt>{t('assembly.spacingDeviation')}</dt>
            <dd data-testid="spacing-deviation">
              {percent(spacing.deviationRatio)}
            </dd>
          </div>
        )}
      </dl>
      <p>{explanation}</p>
    </section>
  );
}

export function HipResults({ hip }: { hip: ResolvedHipRafter }) {
  const { t, i18n } = useTranslation(),
    state = useAssembly();
  const length = (n: number) => formatLength(n, state.unit, i18n.language);
  const angle = (n: number) => formatNumber(n, i18n.language);
  const result = hip.result;
  return (
    <div className="a-results a-hip-results" aria-live="polite">
      <div className="a-main-result">
        <span>{t('assembly.hipPhysicalLength')}</span>
        <strong data-testid="hip-physical-length">
          {length(result.outerEaveToRidgeFaceMm)} <small>{state.unit}</small>
        </strong>
        <p>{t('assembly.hipLengthNote')}</p>
      </div>
      <div>
        <span>{t('assembly.hipTheoreticalLength')}</span>
        <strong data-testid="hip-theoretical-length">
          {length(result.totalTheoreticalLineLengthMm)}{' '}
          <small>{state.unit}</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.hipPlanRun')}</span>
        <strong>
          {length(result.planRunMm)} <small>{state.unit}</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.hipSlope')}</span>
        <strong>
          {angle(result.hipSlopeDeg)}
          <small>°</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.hipPlumb')}</span>
        <strong>
          {angle(result.plumbToMemberDeg)}
          <small>°</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.hipCheek')}</span>
        <strong>
          {angle(result.cheekAngleDeg)}
          <small>°</small>
        </strong>
      </div>
      <div>
        <span>{t('assembly.hipBacking')}</span>
        <strong>
          {angle(result.backingAngleDeg)}
          <small>°</small>
        </strong>
      </div>
    </div>
  );
}

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
          {length(result?.plan.minimumStockLengthMm)} <small>{unit}</small>
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
              state.select(joint.id, state.spec.member.id);
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
            state.select('cut:ridge', state.spec.member.id);
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

function prototypeName(
  prototype: ResolvedMemberPrototype,
  t: (key: string) => string,
) {
  return t(
    `assembly.${
      prototype.kind === 'common-rafter'
        ? 'commonRafter'
        : prototype.kind === 'hip-rafter'
          ? 'hipRafter'
          : 'jackRafter'
    }`,
  );
}

function Metric({
  label,
  children,
  main = false,
  testId,
}: {
  label: string;
  children: ReactNode;
  main?: boolean;
  testId?: string;
}) {
  return (
    <div className={main ? 'a-main-result' : undefined}>
      <span>{label}</span>
      <strong data-testid={testId}>{children}</strong>
    </div>
  );
}

export function ContextualResults({
  context,
  resolved,
  skeleton,
}: {
  context: WorkbenchSelectionContext;
  resolved: ResolvedRoofTemplate;
  skeleton: RoofSkeleton;
}) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const angle = (value: number) => `${formatNumber(value, i18n.language)}°`;
  const section = (width: number, depth: number) =>
    `${formatLength(width, state.unit, i18n.language)} × ${formatLength(depth, state.unit, i18n.language)} ${state.unit}`;
  const prototypes = resolved.memberPrototypes;
  const count = (code: ResolvedMemberPrototype['code']) =>
    prototypes.find((prototype) => prototype.code === code)?.count ?? 0;

  if (context.kind === 'roof') {
    const ridgeLength =
      'ridgeLengthMm' in resolved
        ? resolved.ridgeLengthMm
        : resolved.template.buildingLengthMm;
    return (
      <section
        className="a-context-results"
        aria-label={t('assembly.roofSummary')}
        data-context="roof"
      >
        <header>
          <span>{t('assembly.roofSummary')}</span>
          <strong>
            {t(
              `assembly.${resolved.template.type === 'hip' ? 'hipRoof' : 'gableRoof'}`,
            )}
          </strong>
        </header>
        <div className="a-results">
          <Metric label={t('assembly.footprint')} main>
            {length(resolved.template.buildingLengthMm)} ×{' '}
            {length(resolved.template.halfRunMm * 2)}
          </Metric>
          <Metric label={t('assembly.ridgeLength')}>
            {length(ridgeLength)}
          </Metric>
          <Metric label={t('assembly.ridgeHeight')}>
            {length(resolved.ridgeHeightMm)}
          </Metric>
          <Metric label={t('assembly.stock')} testId="stock-length">
            {length(resolved.calculation.plan.minimumStockLengthMm)}
          </Metric>
          <Metric label={`${t('assembly.commonRafter')} K1`}>
            {count('K1')}
          </Metric>
          <Metric label={`${t('assembly.hipRafter')} H1`}>{count('H1')}</Metric>
          <Metric label={`${t('assembly.jackRafter')} J1`} testId="jack-count">
            {count('J1')}
          </Metric>
          <Metric label={t('assembly.actualSpacing')}>
            {length(
              'jackRafterSpacing' in resolved
                ? resolved.jackRafterSpacing.actualSpacingMm
                : resolved.rafterSpacing.actualSpacingMm,
            )}
          </Metric>
        </div>
        {'jackRafterSpacing' in resolved ? (
          <>
            {resolved.rafterSpacing && (
              <SpacingSummary
                spacing={resolved.rafterSpacing}
                stationLabelKey="rafterPairs"
                headingKey="commonRafterRegionSpacing"
                compact
              />
            )}
            <SpacingSummary
              spacing={resolved.jackRafterSpacing}
              stationLabelKey="spacingAxes"
              headingKey="jackRafterRegionSpacing"
              compact
            />
          </>
        ) : (
          <SpacingSummary spacing={resolved.rafterSpacing} compact />
        )}
      </section>
    );
  }

  if (context.kind === 'prototype') {
    const { prototype } = context;
    const range = prototype.lengthRangeMm;
    return (
      <section
        className="a-context-results"
        aria-label={t('assembly.prototypeSummary')}
        data-context="prototype"
      >
        <header>
          <span>{t('assembly.prototypeSummary')}</span>
          <strong>
            {prototype.code} · {prototypeName(prototype, t)}
          </strong>
        </header>
        <div className="a-results">
          <Metric label={t('assembly.family')} main>
            {prototype.code} · {prototypeName(prototype, t)}
          </Metric>
          <Metric label={t('assembly.pieceCount')}>{prototype.count}</Metric>
          <Metric label={t('assembly.section')}>
            {section(prototype.section.widthMm, prototype.section.depthMm)}
          </Metric>
          <Metric label={t('assembly.lengthRange')}>
            {range.min === range.max
              ? length(range.max)
              : `${length(range.min)} – ${length(range.max)}`}
          </Metric>
          <Metric label={t('assembly.fabricationMode')}>
            {t(
              `assembly.${
                prototype.fabricationMode === 'shared'
                  ? 'sharedFabrication'
                  : 'variableFabrication'
              }`,
            )}
          </Metric>
        </div>
      </section>
    );
  }

  if (context.kind === 'instance') {
    const prototype = prototypes.find(
      (candidate) => candidate.id === context.member.prototypeId,
    );
    const hip = 'hipRafter' in resolved ? resolved.hipRafter : undefined;
    const exactLength = context.jack
      ? context.jack.result.outerEaveToHipCenterLineLengthMm
      : context.member.kind === 'hip-rafter' && hip
        ? hip.result.outerEaveToRidgeFaceMm
        : resolved.calculation.plan.minimumStockLengthMm;
    return (
      <section
        className="a-context-results"
        aria-label={t('assembly.instanceSummary')}
        data-context="instance"
      >
        <header>
          <span>{t('assembly.instanceSummary')}</span>
          <strong>ID · {context.member.id.replace('instance:', '')}</strong>
        </header>
        <div className="a-results">
          <Metric
            label={t('assembly.exactLength')}
            main
            testId="instance-length"
          >
            {length(exactLength)}
          </Metric>
          <Metric label={t('assembly.prototype')}>
            {prototype?.code ?? '—'}
          </Metric>
          <Metric label={t('assembly.roofPlane')}>
            {t(`assembly.${context.member.side}`)}
          </Metric>
          <Metric label={t('assembly.position')}>
            {length(context.member.stationMm ?? 0)}
          </Metric>
          {context.jack && (
            <Metric label={t('assembly.meetingHip')}>
              {t(`assembly.${context.jack.spec.hipCorner}`)}
            </Metric>
          )}
          {context.jack && (
            <Metric label={t('assembly.jackTopFace')}>
              {angle(context.jack.result.topFaceCutLineToMemberAxisDeg)}
            </Metric>
          )}
        </div>
      </section>
    );
  }

  if (context.kind === 'support') {
    const supportSection = context.support
      ? section(
          context.support.section.widthMm,
          context.support.section.heightMm,
        )
      : section(
          resolved.template.ridge.thicknessMm,
          resolved.template.rafterSection.depthMm,
        );
    const connected = skeleton.members.filter((member) =>
      context.supportKind === 'purlin'
        ? member.kind === 'rafter' &&
          (resolved.template.type === 'gable' ||
            member.side === 'left' ||
            member.side === 'right')
        : ['rafter', 'hip-rafter', 'jack-rafter'].includes(member.kind),
    ).length;
    return (
      <section
        className="a-context-results"
        aria-label={t('assembly.supportSummary')}
        data-context="support"
      >
        <header>
          <span>{t('assembly.supportSummary')}</span>
          <strong>{t(`assembly.${context.supportKind}`)}</strong>
        </header>
        <div className="a-results">
          <Metric label={t('assembly.support')} main>
            {t(`assembly.${context.supportKind}`)}
          </Metric>
          <Metric label={t('assembly.section')}>{supportSection}</Metric>
          <Metric label={t('assembly.connectedMembers')}>{connected}</Metric>
          {context.support && (
            <Metric label={t('assembly.position')}>
              {length(context.support.placement.xMm)}
            </Metric>
          )}
        </div>
      </section>
    );
  }

  if (context.kind === 'roof-window') {
    const feature = context.feature;
    return (
      <section
        className="a-context-results"
        aria-label={t('assembly.roofWindow')}
        data-context="roof-window"
      >
        <header>
          <span>{t('assembly.roofWindow')}</span>
          <strong>{feature.id.replace('feature:roof-window-', 'O')}</strong>
        </header>
        <div className="a-results">
          <Metric label={t('assembly.windowWidth')} main>
            {length(feature.widthMm)}
          </Metric>
          <Metric label={t('assembly.windowHeight')}>
            {length(feature.heightMm)}
          </Metric>
          <Metric label={t('assembly.windowPositionU')}>
            {length(feature.position.uMm)}
          </Metric>
          <Metric label={t('assembly.windowPositionV')}>
            {length(feature.position.vMm)}
          </Metric>
        </div>
      </section>
    );
  }

  if (context.kind === 'batten-row') return null;

  const isSeat = context.jointKind === 'seat-notch';
  const isHipCut = context.jointKind === 'hip-end-cut';
  return (
    <section
      className="a-context-results"
      aria-label={t('assembly.cutSummary')}
      data-context="joint"
    >
      <header>
        <span>{t('assembly.cutSummary')}</span>
        <strong>
          {isSeat
            ? t('assembly.notch')
            : isHipCut
              ? t('assembly.hipUpperCutDetail')
              : t('assembly.ridgeCut')}
        </strong>
      </header>
      <div className="a-results">
        {isSeat ? (
          <>
            <Metric label={t('assembly.seat')} main>
              {length(context.joint.seatLengthMm)}
            </Metric>
            <Metric label={t('assembly.notchDepth')}>
              {length(context.joint.normalDepthMm)}
            </Metric>
            <Metric label={t('assembly.remaining')}>
              {length(context.joint.remainingDepthMm)}
            </Metric>
            <Metric label={t('assembly.position')}>
              {length(context.joint.stationMm)}
            </Metric>
          </>
        ) : isHipCut ? (
          <>
            <Metric label={t('assembly.hipPlumb')} main>
              {angle(context.cut.plumbToMemberDeg)}
            </Metric>
            <Metric label={t('assembly.hipCheek')}>
              {angle(context.cut.cheekAngleDeg)}
            </Metric>
            <Metric label={t('assembly.position')}>
              {length(context.cut.referenceStationMm)}
            </Metric>
          </>
        ) : (
          <>
            <Metric label={t('assembly.cutAngle')} main>
              {angle(context.cut.angleToMemberDeg)}
            </Metric>
            <Metric label={t('assembly.position')}>
              {length(context.cut.stationMm)}
            </Metric>
          </>
        )}
      </div>
    </section>
  );
}

function K1Steps({ result }: { result: Calculation }) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const length = (value: number) =>
    formatLength(value, state.unit, i18n.language);
  const labels = new Map(
    result.plan.datums.map((datum, index) => [
      datum.id,
      datumDisplayLabel(index),
    ]),
  );
  return (
    <ol>
      {result.plan.steps.map((step, index) => (
        <li key={`${step.operationId}/${step.action}`}>
          <span className="a-step-number">{index + 1}</span>
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
  );
}

/**
 * V44: says whether a member's numbers are reference geometry (axis/layout,
 * joint not chosen — not an error) or execution geometry (a resolved finished
 * connection). Presentation of the resolver's own execution status only.
 */
export function GeometryKindBadge({
  kind,
}: {
  kind: 'reference' | 'execution';
}) {
  const { t } = useTranslation();
  return (
    <p
      className={`a-geometry-kind is-${kind}`}
      data-geometry-kind={kind}
      data-testid="geometry-kind"
    >
      <b>{t(`assembly.geometryKind.${kind}`)}</b>
      <span>{t(`assembly.geometryKind.${kind}Note`)}</span>
    </p>
  );
}

export function ContextualFabrication({
  context,
  resolved,
  expanded,
}: {
  context: WorkbenchSelectionContext;
  resolved: ResolvedRoofTemplate;
  expanded: boolean;
}) {
  const { t, i18n } = useTranslation();
  const state = useAssembly();
  const length = (value: number) =>
    `${formatLength(value, state.unit, i18n.language)} ${state.unit}`;
  const angle = (value: number) => `${formatNumber(value, i18n.language)}°`;
  const hip = 'hipRafter' in resolved ? resolved.hipRafter : undefined;
  const jacks = 'jackRafters' in resolved ? resolved.jackRafters : [];
  const contextPrototype =
    context.kind === 'prototype'
      ? context.prototype
      : context.kind === 'instance'
        ? resolved.memberPrototypes.find(
            (prototype) => prototype.id === context.member.prototypeId,
          )
        : undefined;
  const selectedJack = context.kind === 'instance' ? context.jack : undefined;
  const representativeJack =
    selectedJack ??
    [...jacks].sort(
      (a, b) =>
        b.result.outerEaveToHipCenterLineLengthMm -
        a.result.outerEaveToHipCenterLineLengthMm,
    )[0];
  const isHipJoint =
    context.kind === 'joint' && context.jointKind === 'hip-end-cut';

  return (
    <section
      className="a-fabrication a-context-fabrication"
      aria-label={t('assembly.fabrication')}
      data-testid="contextual-fabrication"
      data-context={context.kind}
    >
      <header>
        <div>
          <small>{t('assembly.whatToPrepare')}</small>
          <h2>{t('assembly.selectionFabrication')}</h2>
        </div>
        <span>{t(`assembly.${context.kind}Context`)}</span>
      </header>

      {context.kind === 'roof' && (
        <div className="a-preparation-groups">
          {resolved.memberPrototypes.map((prototype) => (
            <button
              key={prototype.id}
              className="a-preparation-card"
              onClick={() => state.select(prototype.id)}
            >
              <strong>{prototype.code}</strong>
              <span>{prototypeName(prototype, t)}</span>
              <b>
                {prototype.count} ×{' '}
                {prototype.lengthRangeMm.min === prototype.lengthRangeMm.max
                  ? length(prototype.lengthRangeMm.max)
                  : `${length(prototype.lengthRangeMm.min)} – ${length(prototype.lengthRangeMm.max)}`}
              </b>
              <small>
                {t(
                  `assembly.${prototype.fabricationMode === 'shared' ? 'sharedFabrication' : 'variableFabrication'}`,
                )}
              </small>
            </button>
          ))}
        </div>
      )}

      {(contextPrototype?.code === 'K1' ||
        (context.kind === 'joint' && !isHipJoint)) && (
        <div className="a-fabrication-summary">
          <strong>K1 · {t('assembly.commonRafter')}</strong>
          <span>
            {length(resolved.calculation.plan.section.widthMm)} ×{' '}
            {length(resolved.calculation.plan.section.depthMm)}
          </span>
          <p>{t('assembly.k1PreparationSummary')}</p>
          {expanded && <K1Steps result={resolved.calculation} />}
        </div>
      )}

      {(contextPrototype?.code === 'H1' || isHipJoint) && hip && (
        <div className="a-fabrication-summary">
          <strong>H1 · {t('assembly.hipRafter')}</strong>
          <span>{length(hip.result.outerEaveToRidgeFaceMm)}</span>
          <GeometryKindBadge kind="reference" />
          <p>{t('assembly.h1PreparationSummary')}</p>
          {expanded && (
            <ol>
              <li>
                {t('assembly.h1StepMeasure', {
                  value: length(hip.result.outerEaveToRidgeFaceMm),
                })}
              </li>
              <li>
                {t('assembly.h1StepPlumb', {
                  value: angle(hip.result.plumbToMemberDeg),
                })}
              </li>
              <li>
                {t('assembly.h1StepCheek', {
                  value: angle(hip.result.cheekAngleDeg),
                })}
              </li>
              <li>
                {t('assembly.h1StepBacking', {
                  value: angle(hip.result.backingAngleDeg),
                })}
              </li>
            </ol>
          )}
        </div>
      )}

      {contextPrototype?.code === 'J1' && representativeJack && (
        <div className="a-fabrication-summary">
          <strong>
            J1 · {t('assembly.jackRafter')}
            {selectedJack ? ` · ${selectedJack.spec.ordinalFromCorner}` : ''}
          </strong>
          <span>
            {selectedJack
              ? length(selectedJack.result.outerEaveToHipCenterLineLengthMm)
              : t('assembly.variableLengthSet', {
                  min: length(contextPrototype.lengthRangeMm.min),
                  max: length(contextPrototype.lengthRangeMm.max),
                })}
          </span>
          <GeometryKindBadge
            kind={
              representativeJack.fabrication.executionStatus ===
              'fabrication-resolved'
                ? 'execution'
                : 'reference'
            }
          />
          <p>{t('assembly.j1PreparationSummary')}</p>
          <div className="a-fabrication-notes">
            <p>{t('assembly.hipFaceDeductionNote')}</p>
            {representativeJack.fabrication.intermediateSupportJoinery ===
              'not-resolved' && <p>{t('assembly.jackPurlinLimit')}</p>}
          </div>
          {expanded && (
            <ol>
              {representativeJack.fabrication.steps.map((step, index) => (
                <li key={`${step.action}/${index}`}>
                  {step.action === 'measure-to-hip-center-plane'
                    ? t('assembly.j1StepMeasure', {
                        value: length(step.distanceMm),
                      })
                    : step.action === 'mark-wall-seat'
                      ? t('assembly.j1StepSeat', {
                          seat: length(step.joint.seatLengthMm),
                          depth: length(step.joint.normalDepthMm),
                        })
                      : step.action === 'mark-hip-plumb'
                        ? t('assembly.j1StepPlumb', {
                            value: angle(step.angleDeg),
                          })
                        : step.action === 'mark-hip-top-face-line'
                          ? t('assembly.j1StepTopFace', {
                              value: angle(step.angleDeg),
                            })
                          : t('assembly.j1StepHipFace', {
                              deduction: length(step.deductionMm),
                              finished: length(step.finishedLengthMm),
                            })}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {context.kind === 'support' && (
        <div className="a-fabrication-summary">
          <strong>{t(`assembly.${context.supportKind}`)}</strong>
          <p>{t('assembly.supportPreparationSummary')}</p>
          {context.supportKind === 'purlin' &&
            resolved.template.type === 'hip' && (
              <p className="a-limit-note">{t('assembly.jackPurlinLimit')}</p>
            )}
        </div>
      )}
    </section>
  );
}
