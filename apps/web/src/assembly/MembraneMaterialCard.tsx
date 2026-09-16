import { materialCopy, materialText } from './material-copy';
import type { MaterialPlanRow } from './material-plan';

const BREAKDOWN = ['overlapArea', 'ridgeOverrunArea', 'simplificationArea'];
const LIMITATIONS = [
  'gross-area-no-roll-reuse',
  'hip-course-width-approximated',
  'openings-not-subtracted',
  'membrane-sold-per-roll',
];

/**
 * The membrane row of the Material Plan as a readable card. Presentation
 * only: every number is a metric already projected by
 * `createMaterialPlanRows` from the course solver.
 */
export function MembraneMaterialCard({
  row,
  locale,
}: {
  row: MaterialPlanRow;
  locale: string;
}) {
  const m = materialCopy(locale);
  const metric = (key: string) =>
    row.metrics.find((item) => item.labelKey === key)?.value;
  const number = (value: number, digits = 1) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value);
  const metres = (mm: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      mm / 1000,
    );
  const rollPlan = row.membranePlan === 'roll-plan';
  const net = metric('netArea');
  const gross = metric('grossArea');
  const rolls = metric('rollCount');
  const courses = metric('courseCount');
  const breakdown = row.metrics.filter((item) =>
    BREAKDOWN.includes(item.labelKey),
  );
  const limitations = row.warnings.filter((key) => LIMITATIONS.includes(key));
  return (
    <div className="mp-membrane" data-testid="membrane-material-card">
      <div className="mp-membrane-head">
        <div>
          <h4>{m.membrane}</h4>
          <span
            className="mp-badge"
            data-status={rollPlan ? 'success' : 'warning'}
            data-testid="membrane-plan-kind"
          >
            {rollPlan ? m.membraneRollPlan : m.membraneNetOnly}
          </span>
          {row.partial && (
            <span className="mp-badge" data-status="warning">
              {m.partial}
            </span>
          )}
        </div>
        <div className="mp-membrane-product">
          {row.product ? (
            <>
              <strong>{row.product.name || m.membrane}</strong>
              {row.membraneRoll && (
                <span>
                  {m.rollSize} {metres(row.membraneRoll.widthMm)} ×{' '}
                  {metres(row.membraneRoll.lengthMm)} m
                </span>
              )}
              <span
                className="mp-badge"
                data-status={
                  row.productSource === 'catalog' ? 'success' : 'warning'
                }
                title={
                  row.productSource === 'manual' ? m.manualDataHelp : undefined
                }
                data-testid="membrane-product-source"
              >
                {row.productSource === 'catalog'
                  ? `${m.catalogue}${row.membraneRoll?.revisionCode ? ` · ${m.catalogRevision} ${row.membraneRoll.revisionCode}` : ''}`
                  : m.manualData}
              </span>
            </>
          ) : (
            <span>{m.noProduct}</span>
          )}
        </div>
      </div>
      <dl className="mp-membrane-hero">
        <div>
          <dd>{net === undefined ? '—' : `${number(net)} m²`}</dd>
          <dt>{m.netHero}</dt>
        </div>
        <div data-emphasis={rollPlan || undefined}>
          <dd>{gross === undefined ? '—' : `${number(gross)} m²`}</dd>
          <dt>{m.grossHero}</dt>
        </div>
        <div>
          <dd>{rolls === undefined ? '—' : `${number(rolls, 0)} ${m.roll}`}</dd>
          <dt>{m.rollsHero}</dt>
        </div>
      </dl>
      <p className="mp-note">
        {rollPlan ? m.membraneRollPlanHelp : m.membraneNetOnlyHelp}
      </p>
      {rollPlan && (
        <div className="mp-membrane-why" data-testid="membrane-overlap-effect">
          <strong>{m.whyMore}</strong>
          <dl>
            {row.membraneRoll && (
              <div>
                <dt>{m.overlapUsed}</dt>
                <dd>
                  {new Intl.NumberFormat(locale, {
                    maximumFractionDigits: 1,
                  }).format(row.membraneRoll.overlapMm / 10)}{' '}
                  cm
                </dd>
              </div>
            )}
            {courses !== undefined && (
              <div>
                <dt>{m.courseCount}</dt>
                <dd>{number(courses, 0)}</dd>
              </div>
            )}
            {breakdown.map((item) => (
              <div key={item.labelKey}>
                <dt>{materialText(locale, item.labelKey)}</dt>
                <dd>+{number(item.value)} m²</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {limitations.length > 0 && (
        <div className="mp-membrane-limits" data-testid="membrane-limitations">
          <strong>{m.limitations}</strong>
          <ul>
            {limitations.map((key) => (
              <li key={key}>{materialText(locale, key)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
