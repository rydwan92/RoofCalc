import { useTranslation } from 'react-i18next';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import type { CounterBattenLayoutResult } from '@cieslacalc/roof-math';
import type { HipCounterBattenDetail } from '@cieslacalc/timber-model';
import { useAssembly } from './store';

/**
 * The V39 hip-boundary decision surface.
 *
 * V33 correctly refused to invent a counter-batten run at the hip, but it left
 * the user with a dead end: a permanent "partially automatic" status and a
 * passive sentence. Research found two well-evidenced, mutually exclusive
 * details and no basis for a default
 * (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md`), so the honest fix is to
 * ask the expert once and then resolve exactly — the V34A decision pattern.
 *
 * Choosing a detail is canonical project intent and a normal undoable edit.
 */

const OPTIONS: readonly HipCounterBattenDetail[] = [
  'no-dedicated-run',
  'paired-plane-runs',
];

/** Section through a hip, looking along it. Schematic, never a dimension source. */
function HipDetailSketch({ detail }: { detail: HipCounterBattenDetail }) {
  const { t } = useTranslation();
  return (
    <svg
      viewBox="0 0 120 68"
      className="a-hip-detail-sketch"
      role="img"
      aria-label={t(`assembly.hipBoundary.option.${detail}.label`)}
      data-hip-sketch={detail}
    >
      {/* Both roof planes meeting at the hip, seen in section. */}
      <path
        d="M4 54 L60 20 L116 54"
        fill="none"
        stroke="var(--a-line-strong)"
        strokeWidth="1.6"
      />
      {/* The hip rafter itself. */}
      <rect
        x="52"
        y="26"
        width="16"
        height="28"
        fill="var(--a-timber)"
        stroke="#3c2d20"
        strokeWidth="1"
      />
      {detail === 'no-dedicated-run' ? (
        <>
          {/* An adjustable holder screwed into the hip rafter. */}
          <path
            d="M60 26 L60 12"
            stroke="var(--a-text-muted)"
            strokeWidth="2"
          />
          <rect
            x="50"
            y="5"
            width="20"
            height="7"
            fill="var(--a-covering-full)"
            stroke="#3c2d20"
            strokeWidth="0.9"
          />
        </>
      ) : (
        <>
          {/* One counter-batten run on each adjoining plane. */}
          <rect
            x="34"
            y="30"
            width="14"
            height="8"
            transform="rotate(-31 41 34)"
            fill="var(--a-counter-batten)"
            stroke="#2f4a32"
            strokeWidth="0.9"
          />
          <rect
            x="72"
            y="30"
            width="14"
            height="8"
            transform="rotate(31 79 34)"
            fill="var(--a-counter-batten)"
            stroke="#2f4a32"
            strokeWidth="0.9"
          />
        </>
      )}
    </svg>
  );
}

export function HipBoundaryDetailChooser({
  result,
}: {
  result: CounterBattenLayoutResult;
}) {
  const state = useAssembly();
  const { t, i18n } = useTranslation();
  const layout = state.projectDocument.project.buildUp.counterBattens;
  if (!layout?.enabled || !result.hipBoundaries.length) return null;
  const selected = layout.hipBoundaryDetail ?? 'not-decided';
  const unresolved = result.unresolvedHipBoundaryCount;
  const metres = (valueMm: number) =>
    new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(
      valueMm / 1000,
    );
  return (
    <section
      className="a-hip-boundary-detail"
      data-testid="hip-boundary-detail"
      data-hip-boundary-status={unresolved ? 'needs-choice' : 'resolved'}
    >
      <h4>{t('assembly.hipBoundary.title')}</h4>
      <p className="a-hip-boundary-state">
        {unresolved ? (
          <>
            <TriangleAlert size={15} aria-hidden="true" />
            {t('assembly.hipBoundary.needsChoice', { count: unresolved })}
          </>
        ) : (
          <>
            <CheckCircle2 size={15} aria-hidden="true" />
            {t('assembly.hipBoundary.complete', {
              count: result.hipBoundaries.length,
            })}
          </>
        )}
      </p>
      <p className="a-hip-boundary-why">{t('assembly.hipBoundary.why')}</p>
      <div
        className="a-hip-detail-options"
        role="radiogroup"
        aria-label={t('assembly.hipBoundary.title')}
      >
        {OPTIONS.map((option) => (
          <label key={option} data-hip-detail-option={option}>
            <input
              type="radio"
              name="hip-boundary-detail"
              checked={selected === option}
              onChange={() => state.setHipCounterBattenDetail(option)}
            />
            <HipDetailSketch detail={option} />
            <strong>{t(`assembly.hipBoundary.option.${option}.label`)}</strong>
            <span>{t(`assembly.hipBoundary.option.${option}.hint`)}</span>
          </label>
        ))}
      </div>
      {selected !== 'not-decided' && (
        <dl className="a-facts a-hip-boundary-facts">
          <div>
            <dt>{t('assembly.hipBoundary.runs')}</dt>
            <dd data-hip-boundary-runs>{result.hipBoundaryRunCount}</dd>
          </div>
          <div>
            <dt>{t('assembly.hipBoundary.added')}</dt>
            <dd data-hip-boundary-added>
              {metres(
                result.hipBoundaries.reduce(
                  (sum, boundary) => sum + boundary.addedLengthMm,
                  0,
                ),
              )}{' '}
              m
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
