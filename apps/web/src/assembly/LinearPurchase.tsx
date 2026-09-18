import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { CatalogProductSummary } from '@cieslacalc/catalog-core';
import type {
  CommercialLengthSpec,
  LinearStockSelectionSpec,
} from '@cieslacalc/timber-model';
import { catalogClient, type CatalogClient } from '../catalog/client';
import type {
  LinearMaterialKind,
  LinearMaterialRequirement,
  LinearPurchasePlan,
} from './linear-material-plan';
import './linear-purchase.css';

/**
 * V48/V49 commercial planning surface for battens and counter-battens.
 *
 * Hierarchy (UX contract): material → available lengths → purchase plan →
 * price. Solver vocabulary never reaches a normal user; the advanced block
 * shows the physical settings a carpenter sets and a translated solver status.
 */

/**
 * Offered lengths before any catalogue data is chosen. Explicitly a
 * suggestion: no verified product backs them.
 */
export const SUGGESTED_LENGTHS_MM = [3000, 4000, 5000];

const mmToM = (value: number) => value / 1000;

export function defaultSelection(): LinearStockSelectionSpec {
  return {
    source: 'manual',
    lengths: SUGGESTED_LENGTHS_MM.map((lengthMm) => ({ lengthMm })),
  };
}

/** A section is the same stock whichever way round it is named (40×60 = 60×40). */
const sameSection = (
  a: { widthMm: number; depthMm: number },
  b: { widthMm: number; depthMm: number },
) =>
  Math.min(a.widthMm, a.depthMm) === Math.min(b.widthMm, b.depthMm) &&
  Math.max(a.widthMm, a.depthMm) === Math.max(b.widthMm, b.depthMm);

const APPLICATION: Record<LinearMaterialKind, 'batten' | 'counter-batten'> = {
  batten: 'batten',
  'counter-batten': 'counter-batten',
};

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
 * "38 × (1,38 + 1,38 + 1,18)", not 200 identical lines.
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
    (a, b) =>
      b.count - a.count ||
      b.stockLengthMm - a.stockLengthMm ||
      a.cuts.join(',').localeCompare(b.cuts.join(',')),
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

/**
 * V49: catalogue lengths. Only products whose source *declares* this
 * application are offered, and only in the project's section; a matching
 * section alone never makes a product suitable (prompt §25).
 */
function CatalogueLengths({
  kind,
  requirement,
  selection,
  locale,
  client,
  onChange,
  onChangeSection,
}: {
  kind: LinearMaterialKind;
  requirement: LinearMaterialRequirement;
  selection: LinearStockSelectionSpec;
  locale: string;
  client: CatalogClient;
  onChange: (selection: LinearStockSelectionSpec) => void;
  onChangeSection?: (section: { widthMm: number; depthMm: number }) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string>();
  const query = useQuery({
    queryKey: ['catalog', 'products', 'timber-stock'],
    queryFn: ({ signal }) =>
      client.searchProducts({ kind: 'timber-stock', limit: 50 }, signal),
    retry: false,
    staleTime: 60_000,
  });
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const testId = `linear-purchase-${kind}-catalogue`;

  if (query.isPending)
    return <p className="lp-note lp-muted">{t('assembly.linear.loading')}</p>;
  if (query.isError)
    return (
      <p className="lp-note" data-testid={`${testId}-unavailable`}>
        <Info size={14} aria-hidden="true" />
        {t('assembly.linear.catalogueUnavailable')}
      </p>
    );

  const declared = (item: CatalogProductSummary) =>
    item.technicalPreview.declaredApplications?.includes(APPLICATION[kind]) ??
    false;
  const sectionOf = (item: CatalogProductSummary) =>
    item.technicalPreview.sectionWidthMm &&
    item.technicalPreview.sectionDepthMm &&
    item.technicalPreview.lengthMm
      ? {
          widthMm: item.technicalPreview.sectionWidthMm,
          depthMm: item.technicalPreview.sectionDepthMm,
          lengthMm: item.technicalPreview.lengthMm,
        }
      : undefined;
  const section = requirement.section;
  const items = query.data.items.filter((item) => sectionOf(item));
  const compatible = items
    .filter(
      (item) =>
        declared(item) && section && sameSection(sectionOf(item)!, section),
    )
    .sort(
      (a, b) =>
        sectionOf(a)!.lengthMm - sectionOf(b)!.lengthMm ||
        a.manufacturer.name.localeCompare(b.manufacturer.name) ||
        a.id.localeCompare(b.id),
    );
  const otherSections = [
    ...new Map(
      items
        .filter(
          (item) =>
            declared(item) &&
            section &&
            !sameSection(sectionOf(item)!, section),
        )
        .map((item) => {
          const s = sectionOf(item)!;
          const key = `${Math.min(s.widthMm, s.depthMm)}×${Math.max(s.widthMm, s.depthMm)}`;
          return [
            key,
            {
              key,
              widthMm: Math.max(s.widthMm, s.depthMm),
              depthMm: Math.min(s.widthMm, s.depthMm),
            },
          ] as const;
        }),
    ).values(),
  ];
  const undeclaredSameSection = items.filter(
    (item) =>
      !declared(item) && section && sameSection(sectionOf(item)!, section),
  ).length;

  const chosen = new Set(
    selection.lengths.flatMap((item) =>
      item.catalogRef ? [item.catalogRef.productId] : [],
    ),
  );
  const toggle = async (item: CatalogProductSummary) => {
    if (chosen.has(item.id)) {
      onChange({
        ...selection,
        lengths: selection.lengths.filter(
          (length) => length.catalogRef?.productId !== item.id,
        ),
      });
      return;
    }
    setPending(item.id);
    try {
      // The summary has no variant; the detail says whether exactly one
      // commercial variant exists to price. Never parse it out of an ID.
      const detail = await queryClient.fetchQuery({
        queryKey: ['catalog', 'product', item.id],
        queryFn: ({ signal }) => client.getProduct(item.id, signal),
        staleTime: 60_000,
      });
      const variants = detail.variants.filter((variant) => variant.active);
      const length: CommercialLengthSpec = {
        lengthMm: sectionOf(item)!.lengthMm,
        catalogRef: {
          productId: item.id,
          technicalRevisionId: detail.currentRevision.id,
          ...(variants.length === 1 ? { variantId: variants[0]!.id } : {}),
          productName: item.name,
          manufacturerName: item.manufacturer.name,
        },
      };
      onChange({
        ...selection,
        source: 'catalogue',
        lengths: [...selection.lengths, length].sort(
          (a, b) =>
            a.lengthMm - b.lengthMm ||
            (a.catalogRef?.productId ?? '').localeCompare(
              b.catalogRef?.productId ?? '',
            ),
        ),
      });
    } finally {
      setPending(undefined);
    }
  };

  return (
    <div className="lp-catalogue" data-testid={testId}>
      {compatible.length ? (
        <ul className="lp-products">
          {compatible.map((item) => {
            const facts = sectionOf(item)!;
            return (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={chosen.has(item.id)}
                    disabled={pending === item.id}
                    data-testid={`${testId}-item`}
                    data-product={item.id}
                    onChange={() => void toggle(item)}
                  />
                  <span>
                    <strong>
                      {facts.widthMm}×{facts.depthMm} ×{' '}
                      {number(mmToM(facts.lengthMm))} m
                    </strong>
                    <small>
                      {item.manufacturer.name} · {item.name}
                    </small>
                  </span>
                  <span className="lp-badge">
                    {t('assembly.linear.sourceCatalogue')}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="lp-note lp-muted" data-testid={`${testId}-empty`}>
          <Info size={14} aria-hidden="true" />
          {t(`assembly.linear.noDeclaredProducts.${kind}`)}
        </p>
      )}
      {otherSections.length > 0 && onChangeSection && (
        <div className="lp-other-sections">
          <small>{t('assembly.linear.otherSections')}</small>
          {otherSections.map((other) => (
            <button
              key={other.key}
              type="button"
              className="a-button a-quiet"
              data-testid={`${testId}-change-section`}
              onClick={() =>
                onChangeSection({
                  widthMm: other.widthMm,
                  depthMm: other.depthMm,
                })
              }
            >
              {t('assembly.linear.changeSection', { section: other.key })}
            </button>
          ))}
        </div>
      )}
      {undeclaredSameSection > 0 && (
        <p className="lp-note lp-muted">
          <Info size={14} aria-hidden="true" />
          {t('assembly.linear.undeclaredSameSection', {
            count: undeclaredSameSection,
          })}
        </p>
      )}
      <p className="lp-note lp-muted">
        {t('assembly.linear.availabilityUnknown')}
      </p>
    </div>
  );
}

function ManualLengths({
  kind,
  selection,
  locale,
  onChange,
}: {
  kind: LinearMaterialKind;
  selection: LinearStockSelectionSpec;
  locale: string;
  onChange: (selection: LinearStockSelectionSpec) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const number = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const lengths = selection.lengths;
  const toggle = (lengthMm: number) => {
    const next = lengths.some((item) => item.lengthMm === lengthMm)
      ? lengths.filter((item) => item.lengthMm !== lengthMm)
      : [...lengths, { lengthMm }].sort((a, b) => a.lengthMm - b.lengthMm);
    onChange({ ...selection, source: 'manual', lengths: next });
  };
  // Metres in the UI, millimetres in the project; an unparsable or
  // non-positive draft is never committed.
  const parsed = Number(draft.replace(',', '.'));
  const draftMm =
    Number.isFinite(parsed) && parsed > 0 && parsed <= 20
      ? Math.round(parsed * 1000)
      : undefined;
  return (
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
            {number(mmToM(lengthMm))} m
          </label>
        ))}
      <span className="lp-add">
        <input
          type="text"
          inputMode="decimal"
          aria-label={t('assembly.linear.addLength')}
          placeholder="m"
          data-testid={`linear-purchase-${kind}-add-length`}
          value={draft}
          aria-invalid={draft !== '' && draftMm === undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draftMm !== undefined) {
              if (!lengths.some((item) => item.lengthMm === draftMm))
                toggle(draftMm);
              setDraft('');
            }
          }}
        />
        <button
          type="button"
          className="a-button a-quiet"
          disabled={draftMm === undefined}
          data-testid={`linear-purchase-${kind}-add-length-button`}
          onClick={() => {
            if (draftMm === undefined) return;
            if (!lengths.some((item) => item.lengthMm === draftMm))
              toggle(draftMm);
            setDraft('');
          }}
        >
          {t('assembly.linear.addLength')}
        </button>
      </span>
    </fieldset>
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
  onChangeSection,
  catalogue = catalogClient,
}: {
  kind: LinearMaterialKind;
  requirement: LinearMaterialRequirement;
  selection?: LinearStockSelectionSpec;
  plan?: LinearPurchasePlan;
  locale: string;
  onChange: (selection?: LinearStockSelectionSpec) => void;
  onFixBlocker?: (blocker: string) => void;
  onChangeSection?: (section: { widthMm: number; depthMm: number }) => void;
  catalogue?: CatalogClient;
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

  const source = selection.source ?? 'manual';
  const unresolvedCount = plan?.assembly.unresolved.length ?? 0;
  const pieces = plan?.stock.reduce((sum, item) => sum + item.quantity, 0);
  const proven =
    plan?.search.optimality === 'proven-within-search-space' &&
    plan.plan.optimality === 'proven-within-search-space';
  const section = requirement.section;

  return (
    <div className="lp-panel" data-testid={testId} data-state="planning">
      <div className="lp-requirement">
        <span>{t('assembly.linear.installationRequirement')}</span>
        <strong>{number(mmToM(requirement.installedLengthMm))} m</strong>
        {section && (
          <small>
            {section.widthMm} × {section.depthMm} mm
          </small>
        )}
      </div>

      <div
        className="lp-source"
        role="radiogroup"
        aria-label={t('assembly.linear.lengthSource')}
      >
        <span>{t('assembly.linear.lengthSource')}</span>
        {(['catalogue', 'manual'] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={source === option}
            className={source === option ? 'is-active' : undefined}
            data-testid={`${testId}-source-${option}`}
            onClick={() => {
              if (source === option) return;
              // One source per plan: switching never mixes provenance.
              onChange(
                option === 'manual'
                  ? defaultSelection()
                  : { ...selection, source: 'catalogue', lengths: [] },
              );
            }}
          >
            {t(`assembly.linear.source.${option}`)}
          </button>
        ))}
      </div>

      {source === 'catalogue' ? (
        <CatalogueLengths
          kind={kind}
          requirement={requirement}
          selection={selection}
          locale={locale}
          client={catalogue}
          onChange={onChange}
          {...(onChangeSection ? { onChangeSection } : {})}
        />
      ) : (
        <ManualLengths
          kind={kind}
          selection={selection}
          locale={locale}
          onChange={onChange}
        />
      )}

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
              const parsedValue = Number(raw);
              onChange({
                ...selection,
                angledEndAllowanceMm:
                  raw === '' || !Number.isFinite(parsedValue) || parsedValue < 0
                    ? undefined
                    : parsedValue,
              });
            }}
          />
          <small>mm</small>
        </label>
      )}

      {plan ? (
        <div className="lp-plan" data-testid={`${testId}-plan`}>
          <div className="lp-plan-head">
            <h5>
              {plan.status === 'complete' ? (
                <CheckCircle2 size={15} aria-hidden="true" />
              ) : (
                <AlertTriangle size={15} aria-hidden="true" />
              )}
              {t('assembly.linear.purchasePlan')}
            </h5>
            <span
              className="lp-status"
              data-testid={`${testId}-plan-status`}
              data-proven={proven ? 'true' : 'false'}
            >
              {plan.status !== 'complete'
                ? t('assembly.linear.planStatus.partial')
                : proven
                  ? t('assembly.linear.planStatus.ready')
                  : t('assembly.linear.planStatus.approximate')}
            </span>
          </div>
          <dl className="lp-metrics lp-headline">
            <Metric
              label={t('assembly.linear.purchasePlan')}
              value={number(pieces ?? 0, 0)}
              unit={t('assembly.linear.pieceUnit')}
            />
            <Metric
              label={t('assembly.linear.purchased')}
              value={number(mmToM(plan.purchasedLengthMm))}
              unit="m"
            />
            <Metric
              label={t('assembly.linear.waste')}
              value={number(mmToM(plan.plan.summary.wasteLengthMm))}
              unit="m"
            />
          </dl>
          <ul className="lp-stock" data-testid={`${testId}-breakdown`}>
            {plan.stock
              .slice()
              .sort(
                (a, b) =>
                  a.lengthMm - b.lengthMm ||
                  a.stockOptionId.localeCompare(b.stockOptionId),
              )
              .map((item) => {
                const origin = plan.stockSources[item.stockOptionId];
                return (
                  <li key={item.stockOptionId}>
                    <span>
                      {section
                        ? `${Math.min(section.widthMm, section.depthMm)}×${Math.max(section.widthMm, section.depthMm)} × `
                        : ''}
                      {number(mmToM(item.lengthMm), 2)} m
                      <small>
                        {origin?.kind === 'catalogue'
                          ? `${origin.manufacturerName ? `${origin.manufacturerName} · ` : ''}${origin.productName}`
                          : t('assembly.linear.manualLength')}
                      </small>
                    </span>
                    <span className="lp-badge" data-source={origin?.kind}>
                      {origin?.kind === 'catalogue'
                        ? t('assembly.linear.sourceCatalogue')
                        : t('assembly.linear.sourceManual')}
                    </span>
                    <strong>
                      {t('assembly.linear.pieces', { count: item.quantity })}
                    </strong>
                  </li>
                );
              })}
          </ul>

          {/*
           * Shown only when the difference is visible in the two numbers a
           * buyer compares; an improvement on a later tie-breaker (joints,
           * offcut size) would otherwise read as two identical plans.
           */}
          {plan.search.improvedOverBaseline &&
            (plan.purchasedLengthMm !== plan.baseline.purchasedLengthMm ||
              plan.plan.summary.wasteLengthMm !==
                plan.baseline.wasteLengthMm) && (
              <div className="lp-compare" data-testid={`${testId}-compare`}>
                <div>
                  <small>{t('assembly.linear.compare.chosen')}</small>
                  <strong>
                    {number(mmToM(plan.purchasedLengthMm))} m ·{' '}
                    {number(plan.utilizationRatio * 100)}%
                  </strong>
                  <small>
                    {t('assembly.linear.compare.waste', {
                      value: number(mmToM(plan.plan.summary.wasteLengthMm)),
                    })}
                  </small>
                </div>
                <div>
                  <small>{t('assembly.linear.compare.fixedJoints')}</small>
                  <strong>
                    {number(mmToM(plan.baseline.purchasedLengthMm))} m ·{' '}
                    {number(plan.baseline.utilizationRatio * 100)}%
                  </strong>
                  <small>
                    {t('assembly.linear.compare.waste', {
                      value: number(mmToM(plan.baseline.wasteLengthMm)),
                    })}
                  </small>
                </div>
              </div>
            )}

          <dl className="lp-metrics">
            <Metric
              label={t('assembly.linear.installed')}
              value={number(mmToM(plan.installedLengthMm))}
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
                  const parsedValue = Number(event.target.value);
                  if (!Number.isFinite(parsedValue) || parsedValue < 0) return;
                  onChange({ ...selection, [field]: parsedValue });
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
        {plan && (
          <dl className="lp-solver" data-testid={`${testId}-solver`}>
            <div>
              <dt>{t('assembly.linear.solver.joints')}</dt>
              <dd>{plan.assembly.summary.jointCount}</dd>
            </div>
            <div>
              <dt>{t('assembly.linear.solver.status')}</dt>
              <dd>
                {t(
                  `assembly.linear.solver.optimality.${plan.search.optimality}`,
                )}
              </dd>
            </div>
            <div>
              <dt>{t('assembly.linear.solver.effort')}</dt>
              <dd>
                {t('assembly.linear.solver.evaluations', {
                  used: plan.search.evaluations,
                  budget: plan.search.evaluationBudget,
                })}
              </dd>
            </div>
            {plan.assembly.summary.staggerRelaxed && (
              <div>
                <dt>{t('assembly.linear.solver.stagger')}</dt>
                <dd>{t('assembly.linear.staggerRelaxed')}</dd>
              </div>
            )}
          </dl>
        )}
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
