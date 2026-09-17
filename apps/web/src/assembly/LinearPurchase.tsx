import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { LinearStockSelectionSpec } from '@cieslacalc/timber-model';
import type {
  LinearMaterialKind,
  LinearMaterialRequirement,
  LinearPurchasePlan,
} from './linear-material-plan';
import './linear-purchase.css';

/**
 * V48 commercial planning surface for battens and counter-battens.
 *
 * The hierarchy the UX contract asks for: requirement → commercial lengths →
 * plan → cost. Solver vocabulary (`RequiredPiece`, `StockUsage`, branch and
 * bound) never reaches the user; the advanced block shows only the physical
 * settings a carpenter actually sets.
 */

/**
 * Offered lengths before any catalogue data exists. Explicitly a suggestion:
 * the UI labels it so, because no verified batten product backs it yet.
 */
export const SUGGESTED_LENGTHS_MM = [3000, 4000, 5000];

const mmToM = (value: number) => value / 1000;

export function defaultSelection(): LinearStockSelectionSpec {
  return { lengths: SUGGESTED_LENGTHS_MM.map((lengthMm) => ({ lengthMm })) };
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value}
        {unit ? <small> {unit}</small> : null}
      </dd>
    </div>
  );
}

/**
 * Repeated bar patterns rather than one row per stock item: a roofer reads
 * "38 × (1,38 + 1,38 + 1,18)", not 200 identical lines (V48 §23).
 */
function CutPatterns({
  plan,
  locale,
}: {
  plan: LinearPurchasePlan;
  locale: string;
}) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const number = (value: number) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  const grouped = new Map<
    string,
    { stockLengthMm: number; cuts: number[]; count: number }
  >();
  for (const usage of plan.plan.stockUsages) {
    const cuts = usage.cuts
      .map((cut) => Math.round(cut.requiredBlankLengthMm))
      .sort((a, b) => b - a);
    const key = JSON.stringify([usage.originalLengthMm, cuts]);
    const entry = grouped.get(key);
    if (entry) entry.count += 1;
    else
      grouped.set(key, {
        stockLengthMm: usage.originalLengthMm,
        cuts,
        count: 1,
      });
  }
  const patterns = [...grouped.values()].sort(
    (a, b) => b.count - a.count || b.stockLengthMm - a.stockLengthMm,
  );
  const shown = all ? patterns : patterns.slice(0, 4);
  return (
    <div className="lp-patterns" data-testid="linear-cut-patterns">
      <h5>{t('assembly.linear.cutPlan')}</h5>
      {shown.map((pattern) => (
        <div
          key={`${pattern.stockLengthMm}-${pattern.cuts.join('-')}`}
          className="lp-pattern"
        >
          <strong>
            {number(mmToM(pattern.stockLengthMm))} m ×{' '}
            {t('assembly.linear.pieces', { count: pattern.count })}
          </strong>
          <div className="lp-bar" aria-hidden="true">
            {pattern.cuts.map((cut, index) => (
              <span
                key={`${cut}-${index}`}
                style={{ flexGrow: cut }}
                title={`${number(mmToM(cut))} m`}
              >
                {number(mmToM(cut))}
              </span>
            ))}
          </div>
        </div>
      ))}
      {patterns.length > shown.length && (
        <button
          type="button"
          className="a-button a-quiet"
          onClick={() => setAll(true)}
        >
          {t('assembly.linear.showAllPatterns', {
            count: patterns.length - shown.length,
          })}
        </button>
      )}
    </div>
  );
}

export function LinearPurchasePanel({
  kind,
  requirement,
  selection,
  plan,
  locale,
  onChange,
  onFixBlocker,
}: {
  kind: LinearMaterialKind;
  requirement: LinearMaterialRequirement;
  selection?: LinearStockSelectionSpec;
  plan?: LinearPurchasePlan;
  locale: string;
  onChange: (selection?: LinearStockSelectionSpec) => void;
  onFixBlocker?: (blocker: string) => void;
}) {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(false);
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
      value,
    );
  const testId = `linear-purchase-${kind}`;

  // A blocker is never dressed up as a zero: say what is missing and where.
  const blocker = requirement.blockers[0];
  if (requirement.status === 'blocked' && blocker) {
    if (blocker === 'layer-off') return null;
    return (
      <div className="lp-panel" data-testid={testId} data-state="blocked">
        <p className="lp-blocked">
          <AlertTriangle size={15} aria-hidden="true" />
          {t(`assembly.linear.blocker.${blocker}`)}
        </p>
        {blocker === 'hip-detail-unresolved' && onFixBlocker && (
          <button
            type="button"
            className="a-button a-primary"
            data-testid={`${testId}-fix`}
            onClick={() => onFixBlocker(blocker)}
          >
            {t('assembly.linear.fixHipDetail')}
          </button>
        )}
      </div>
    );
  }

  if (!selection)
    return (
      <div className="lp-panel" data-testid={testId} data-state="requirement">
        <div className="lp-requirement">
          <span>{t('assembly.linear.installationRequirement')}</span>
          <strong>{number(mmToM(requirement.installedLengthMm))} m</strong>
        </div>
        <button
          type="button"
          className="a-button a-primary"
          data-testid={`${testId}-start`}
          onClick={() => onChange(defaultSelection())}
        >
          {t('assembly.linear.planPurchase')}
        </button>
      </div>
    );

  const lengths = selection.lengths;
  const toggle = (lengthMm: number) => {
    const next = lengths.some((item) => item.lengthMm === lengthMm)
      ? lengths.filter((item) => item.lengthMm !== lengthMm)
      : [...lengths, { lengthMm }].sort((a, b) => a.lengthMm - b.lengthMm);
    onChange({ ...selection, lengths: next });
  };
  const unresolvedCount = plan?.assembly.unresolved.length ?? 0;

  return (
    <div className="lp-panel" data-testid={testId} data-state="planning">
      <div className="lp-requirement">
        <span>{t('assembly.linear.installationRequirement')}</span>
        <strong>{number(mmToM(requirement.installedLengthMm))} m</strong>
        {requirement.section && (
          <small>
            {requirement.section.widthMm} × {requirement.section.depthMm} mm
          </small>
        )}
      </div>

      <fieldset className="lp-lengths">
        <legend>
          {t('assembly.linear.commercialLengths')}
          <span className="lp-hint">{t('assembly.linear.suggestion')}</span>
        </legend>
        {[
          ...new Set([
            ...SUGGESTED_LENGTHS_MM,
            ...lengths.map((item) => item.lengthMm),
          ]),
        ]
          .sort((a, b) => a - b)
          .map((lengthMm) => (
            <label key={lengthMm}>
              <input
                type="checkbox"
                checked={lengths.some((item) => item.lengthMm === lengthMm)}
                onChange={() => toggle(lengthMm)}
              />
              {number(mmToM(lengthMm), 2)} m
            </label>
          ))}
      </fieldset>

      {requirement.angledRunCount > 0 && (
        <label className="lp-allowance">
          {t('assembly.linear.angledAllowance', {
            count: requirement.angledRunCount,
          })}
          <input
            type="number"
            min={0}
            step={10}
            inputMode="numeric"
            data-testid={`${testId}-allowance`}
            value={selection.angledEndAllowanceMm ?? ''}
            placeholder="—"
            onChange={(event) => {
              const raw = event.target.value.trim();
              const parsed = Number(raw);
              onChange({
                ...selection,
                angledEndAllowanceMm:
                  raw === '' || !Number.isFinite(parsed) || parsed < 0
                    ? undefined
                    : parsed,
              });
            }}
          />
          <small>mm</small>
        </label>
      )}

      {plan ? (
        <div className="lp-plan" data-testid={`${testId}-plan`}>
          <h5>
            {plan.status === 'complete' ? (
              <CheckCircle2 size={15} aria-hidden="true" />
            ) : (
              <AlertTriangle size={15} aria-hidden="true" />
            )}
            {t('assembly.linear.purchasePlan')}
          </h5>
          <ul className="lp-stock">
            {plan.stock
              .slice()
              .sort((a, b) => a.lengthMm - b.lengthMm)
              .map((item) => (
                <li key={item.stockOptionId}>
                  <span>{number(mmToM(item.lengthMm), 2)} m</span>
                  <strong>
                    {t('assembly.linear.pieces', { count: item.quantity })}
                  </strong>
                </li>
              ))}
          </ul>
          <dl className="lp-metrics">
            <Metric
              label={t('assembly.linear.purchased')}
              value={number(mmToM(plan.purchasedLengthMm))}
              unit="m"
            />
            <Metric
              label={t('assembly.linear.installed')}
              value={number(mmToM(plan.installedLengthMm))}
              unit="m"
            />
            <Metric
              label={t('assembly.linear.waste')}
              value={number(mmToM(plan.plan.summary.wasteLengthMm))}
              unit="m"
            />
            <Metric
              label={t('assembly.linear.reusable')}
              value={number(mmToM(plan.plan.summary.reusableRemnantLengthMm))}
              unit="m"
            />
            <Metric
              label={t('assembly.linear.utilization')}
              value={number(plan.utilizationRatio * 100)}
              unit="%"
            />
            <Metric
              label={t('assembly.linear.joints')}
              value={number(plan.assembly.summary.jointCount, 0)}
            />
          </dl>

          {unresolvedCount > 0 && (
            <p className="lp-note" data-testid={`${testId}-unresolved`}>
              <AlertTriangle size={14} aria-hidden="true" />
              {t('assembly.linear.unresolvedRuns', { count: unresolvedCount })}
            </p>
          )}
          {plan.plan.unassignedPieces.length > 0 && (
            <p className="lp-note" data-testid={`${testId}-unassigned`}>
              <AlertTriangle size={14} aria-hidden="true" />
              {t('assembly.linear.unassigned', {
                count: plan.plan.unassignedPieces.length,
              })}
            </p>
          )}
          {plan.assembly.summary.staggerRelaxed && (
            <p className="lp-note">
              <Info size={14} aria-hidden="true" />
              {t('assembly.linear.staggerRelaxed')}
            </p>
          )}
          {plan.plan.optimality !== 'proven-within-search-space' && (
            <p className="lp-note lp-muted">
              <Info size={14} aria-hidden="true" />
              {t('assembly.linear.approximate')}
            </p>
          )}

          <CutPatterns plan={plan} locale={locale} />
        </div>
      ) : (
        <p className="lp-note">{t('assembly.linear.chooseLength')}</p>
      )}

      <details
        className="lp-advanced"
        open={advanced}
        onToggle={(event) => setAdvanced(event.currentTarget.open)}
      >
        <summary>{t('assembly.linear.cuttingSettings')}</summary>
        <div className="lp-settings">
          {(
            [
              ['kerfMm', 3],
              ['endTrimMm', 0],
              ['minimumReusableRemnantMm', 300],
            ] as const
          ).map(([field, fallback]) => (
            <label key={field}>
              {t(`assembly.linear.setting.${field}`)}
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                data-testid={`${testId}-${field}`}
                value={selection[field] ?? fallback}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (!Number.isFinite(parsed) || parsed < 0) return;
                  onChange({ ...selection, [field]: parsed });
                }}
              />
              <small>mm</small>
            </label>
          ))}
          <label>
            {t('assembly.linear.objective')}
            <select
              data-testid={`${testId}-objective`}
              value={selection.objective ?? 'minimum-waste'}
              onChange={(event) =>
                onChange({
                  ...selection,
                  objective: event.target
                    .value as LinearStockSelectionSpec['objective'],
                })
              }
            >
              <option value="minimum-waste">
                {t('assembly.linear.objectiveOption.minimum-waste')}
              </option>
              <option value="minimum-purchased-length">
                {t('assembly.linear.objectiveOption.minimum-purchased-length')}
              </option>
              <option value="minimum-stock-count">
                {t('assembly.linear.objectiveOption.minimum-stock-count')}
              </option>
            </select>
          </label>
        </div>
        <button
          type="button"
          className="a-button a-quiet"
          data-testid={`${testId}-clear`}
          onClick={() => onChange(undefined)}
        >
          {t('assembly.linear.clearPlan')}
        </button>
      </details>
    </div>
  );
}
