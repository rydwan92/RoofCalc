import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LINE_ROLE_RULES,
  isComponentCompatible,
  roofSystemComponentTechnicalSpecSchema,
  roofWindowComponentTechnicalSpecSchema,
  type ResolvedOpeningSystem,
  type RoofLineComponentIntent,
  type RoofLineComponentRequirement,
  type RoofLineComponentRole,
  type RoofLineComponentRule,
  type RoofOpeningIntent,
  type RoofSystemComponentTechnicalSpec,
  type RoofWindowProductSnapshot,
} from '@cieslacalc/roof-system-core';
import type { CatalogProductSummary } from '@cieslacalc/catalog-core';
import type { RoofFeatureTopology } from '@cieslacalc/roof-math';
import { catalogClient } from '../catalog/client';
import { parseDecimal } from '../format';
import { materialText } from './material-copy';
import { featureScopeLabel } from './roof-system';
import type { RoofSystemCopy } from './roof-system-copy';

/**
 * V52 roof-system editors: compact product cards (never a giant dropdown),
 * a manual fallback that always works, and the per-opening window/flashing
 * editor. Every edit is handed to the caller as one intent change — one
 * history entry.
 */
const number = (value: number, locale: string, digits = 2) =>
  new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(
    value,
  );
const metres = (mm: number, locale: string) => `${number(mm / 1000, locale)} m`;

/** Quantity text in the component's own sale unit. */
export function quantityText(
  item: Pick<RoofLineComponentRequirement, 'quantity' | 'unit' | 'status'>,
  c: RoofSystemCopy,
) {
  if (item.status !== 'resolved' || item.quantity === undefined)
    return c.needsDecision;
  return item.unit === 'roll'
    ? c.rolls(item.quantity)
    : c.pieces(item.quantity);
}

export function ComponentCard({
  item,
  intent,
  topology,
  locale,
  c,
  onHighlight,
  onRemove,
  children,
}: {
  item: RoofLineComponentRequirement;
  intent?: RoofLineComponentIntent;
  topology: RoofFeatureTopology;
  locale: string;
  c: RoofSystemCopy;
  onHighlight: (featureIds: string[]) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const resolved = item.status === 'resolved' && item.quantity !== undefined;
  const scope = featureScopeLabel(topology, item.featureIds, locale);
  return (
    <article
      className="rs-card"
      data-status={item.status}
      data-testid={`rs-component-${item.role}`}
    >
      <header>
        <div>
          <small>{materialText(locale, `roofSystem.${item.role}`)}</small>
          <strong>{item.name}</strong>
        </div>
        <span
          className={`rs-badge${item.source === 'catalog' ? ' is-catalog' : ''}`}
        >
          {item.source === 'catalog' ? c.catalog : c.manual}
        </span>
      </header>
      <p className="rs-quantity" data-testid="rs-component-quantity">
        {quantityText(item, c)}
      </p>
      <dl className="rs-facts">
        {item.rule !== 'one-per-feature-end' &&
          item.rule !== 'one-per-ridge-tile' && (
            <div>
              <dt>{c.requirement}</dt>
              <dd>{metres(item.requirementMm, locale)}</dd>
            </div>
          )}
        {resolved && item.purchasedLengthMm !== undefined && (
          <div>
            <dt>{c.purchase}</dt>
            <dd>
              {quantityText(item, c)} · {metres(item.purchasedLengthMm, locale)}
            </dd>
          </div>
        )}
        {resolved && !!item.commercialSurplusMm && (
          <div>
            <dt>{c.surplus}</dt>
            <dd data-testid="rs-component-surplus">
              {metres(item.commercialSurplusMm, locale)}
            </dd>
          </div>
        )}
        {item.openEnds !== undefined && (
          <div>
            <dt>{c.openEndsLabel}</dt>
            <dd>{c.openEnds(item.openEnds)}</dd>
          </div>
        )}
      </dl>
      {item.reason && (
        <p className="rs-warning">
          {materialText(locale, `line-component-${item.reason}`)}
        </p>
      )}
      {scope && (
        <button
          type="button"
          className="rs-applies"
          data-testid="rs-applies-to"
          onClick={() => onHighlight(item.featureIds)}
        >
          {c.appliesTo}: <strong>{scope}</strong>
        </button>
      )}
      {intent?.product?.manufacturer && (
        <small className="rs-muted">
          {c.producer}: {intent.product.manufacturer} · {c.technicalData}
        </small>
      )}
      {children}
      <button type="button" className="dw-link is-danger" onClick={onRemove}>
        {c.remove}
      </button>
    </article>
  );
}

function specRule(
  spec: RoofSystemComponentTechnicalSpec,
): RoofLineComponentRule | undefined {
  if (spec.quantityRule === 'roll-length' && spec.rollLengthMm)
    return { kind: 'roll-length', rollLengthMm: spec.rollLengthMm };
  if (
    spec.quantityRule === 'linear-effective-cover' &&
    spec.effectiveCoverLengthMm
  )
    return {
      kind: 'linear-effective-cover',
      effectiveCoverLengthMm: spec.effectiveCoverLengthMm,
    };
  if (spec.quantityRule === 'one-per-feature-end')
    return { kind: 'one-per-feature-end' };
  if (spec.quantityRule === 'one-per-ridge-tile')
    return { kind: 'one-per-ridge-tile' };
  return undefined;
}

/**
 * Catalogue cards + manual form for line-bound components of one area.
 * Compatible products come first; an incompatible one stays visible and
 * disabled. Nothing is added without an explicit click.
 */
export function ComponentPicker({
  roles,
  coveringProductId,
  openEnds,
  lineLengthMm,
  locale,
  c,
  nextId,
  onAdd,
  onCancel,
}: {
  roles: readonly RoofLineComponentRole[];
  /** V53: the physical line length the area's elements apply to. */
  lineLengthMm?: number;
  coveringProductId?: string;
  openEnds: number;
  locale: string;
  c: RoofSystemCopy;
  nextId: string;
  onAdd: (component: RoofLineComponentIntent) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'catalog' | 'manual'>('catalog');
  const products = useQuery({
    queryKey: ['catalog', 'products', 'roof-system-component'],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts(
        { kind: 'roof-system-component', limit: 50 },
        signal,
      ),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [pending, setPending] = useState<{
    base: Omit<RoofLineComponentIntent, 'rule'>;
    role: RoofLineComponentRole;
  }>();
  const [loading, setLoading] = useState<string>();
  const items = (products.data?.items ?? []).filter((item) =>
    roles.includes(item.technicalPreview.systemRole as RoofLineComponentRole),
  );
  const compatibility = (item: CatalogProductSummary) => {
    const ids = item.technicalPreview.compatibleProductIds;
    if (!ids) return 'universal' as const;
    return coveringProductId && ids.includes(coveringProductId)
      ? ('compatible' as const)
      : ('incompatible' as const);
  };
  const ordered = [...items].sort(
    (a, b) =>
      Number(compatibility(a) === 'incompatible') -
      Number(compatibility(b) === 'incompatible'),
  );
  const choose = async (item: CatalogProductSummary) => {
    setLoading(item.id);
    try {
      const detail = await catalogClient.getProduct(item.id);
      const spec = roofSystemComponentTechnicalSpecSchema.safeParse(
        detail.currentRevision.technicalSpec,
      );
      if (!spec.success) return;
      const role = spec.data.role as RoofLineComponentRole;
      const base = {
        id: nextId,
        role,
        name: detail.product.name,
        source: 'catalog' as const,
        product: {
          spec: spec.data,
          manufacturer: detail.manufacturer.name,
          catalogRef: {
            productId: detail.product.id,
            technicalRevisionId: detail.currentRevision.id,
          },
        },
      };
      const rule = specRule(spec.data);
      if (rule && isComponentCompatible(spec.data, coveringProductId))
        onAdd({ ...base, rule });
      else setPending({ base, role });
    } finally {
      setLoading(undefined);
    }
  };
  if (pending)
    return (
      <RuleConfirmation
        role={pending.role}
        openEnds={openEnds}
        c={c}
        onConfirm={(rule) => onAdd({ ...pending.base, rule })}
        onCancel={() => setPending(undefined)}
      />
    );
  return (
    <div className="rs-picker" data-testid="rs-picker">
      <div className="dw-chips" role="tablist">
        {(['catalog', 'manual'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-pressed={tab === key}
            data-testid={`rs-picker-${key}`}
            onClick={() => setTab(key)}
          >
            {key === 'catalog' ? c.addFromCatalogue : c.addManual}
          </button>
        ))}
      </div>
      {tab === 'catalog' ? (
        <>
          {products.isError && <p className="rs-muted">{c.catalogueOffline}</p>}
          {products.isSuccess && !ordered.length && (
            <p className="rs-muted">{c.catalogueEmpty}</p>
          )}
          <ul className="rs-product-list">
            {ordered.map((item) => {
              const state = compatibility(item);
              const preview = item.technicalPreview;
              return (
                <li
                  key={item.id}
                  className="rs-product"
                  data-compatibility={state}
                  data-testid="rs-product"
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {materialText(locale, `roofSystem.${preview.systemRole}`)}{' '}
                      · {item.manufacturer.name}
                    </small>
                    <small>
                      {preview.rollLengthMm
                        ? c.roll(metres(preview.rollLengthMm, locale))
                        : c.ruleUnknown}
                    </small>
                    {preview.rollLengthMm && lineLengthMm ? (
                      <small data-testid="rs-product-preview">
                        {c.needFor(metres(lineLengthMm, locale))} · {c.toBuy}:{' '}
                        {c.rolls(
                          Math.max(
                            1,
                            Math.ceil(
                              lineLengthMm / preview.rollLengthMm - 1e-9,
                            ),
                          ),
                        )}
                      </small>
                    ) : null}
                    <em className={`rs-badge is-${state}`}>
                      {state === 'compatible'
                        ? `${c.compatible} · ${c.systemElement}`
                        : state === 'universal'
                          ? c.universal
                          : c.incompatible}
                    </em>
                  </div>
                  <button
                    type="button"
                    className="a-primary"
                    disabled={state === 'incompatible' || !!loading}
                    data-testid="rs-product-add"
                    onClick={() => void choose(item)}
                  >
                    {loading === item.id ? c.adding : c.addThis}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <ManualComponentForm
          roles={roles}
          c={c}
          locale={locale}
          nextId={nextId}
          onAdd={onAdd}
        />
      )}
      <button type="button" className="dw-link" onClick={onCancel}>
        {c.cancel}
      </button>
    </div>
  );
}

function RuleConfirmation({
  role,
  openEnds,
  c,
  onConfirm,
  onCancel,
}: {
  role: RoofLineComponentRole;
  openEnds: number;
  c: RoofSystemCopy;
  onConfirm: (rule: RoofLineComponentRule) => void;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const allowed = LINE_ROLE_RULES[role];
  return (
    <div className="rs-picker" data-testid="rs-rule-confirmation">
      <strong>{c.confirmRule}</strong>
      <p className="rs-muted">{c.ruleUnknown}.</p>
      {allowed.includes('one-per-feature-end') && (
        <button
          type="button"
          className="a-primary"
          data-testid="rs-confirm-ends"
          onClick={() => onConfirm({ kind: 'one-per-feature-end' })}
        >
          {c.confirmEnds(openEnds)}
        </button>
      )}
      {allowed.includes('one-per-ridge-tile') && (
        <button
          type="button"
          className="a-primary"
          onClick={() => onConfirm({ kind: 'one-per-ridge-tile' })}
        >
          {c.confirmPerTile}
        </button>
      )}
      <label className="rs-field">
        {c.orManual}
        <input
          inputMode="numeric"
          value={quantity}
          data-testid="rs-confirm-quantity"
          onChange={(event) => setQuantity(event.target.value)}
        />
      </label>
      <div className="dw-chips">
        <button
          type="button"
          disabled={parseDecimal(quantity) === null}
          onClick={() => {
            const value = parseDecimal(quantity);
            if (value !== null && value >= 0)
              onConfirm({ kind: 'manual', quantity: Math.round(value) });
          }}
        >
          {c.save}
        </button>
        <button type="button" className="dw-link" onClick={onCancel}>
          {c.cancel}
        </button>
      </div>
    </div>
  );
}

function ManualComponentForm({
  roles,
  c,
  locale,
  nextId,
  onAdd,
}: {
  roles: readonly RoofLineComponentRole[];
  c: RoofSystemCopy;
  locale: string;
  nextId: string;
  onAdd: (component: RoofLineComponentIntent) => void;
}) {
  const [role, setRole] = useState<RoofLineComponentRole>(roles[0]!);
  const allowed = LINE_ROLE_RULES[role];
  const [ruleKind, setRuleKind] = useState<RoofLineComponentRule['kind']>(
    allowed[0] as RoofLineComponentRule['kind'],
  );
  const [draft, setDraft] = useState({
    name: '',
    value: '',
    allowance: '',
  });
  const [invalid, setInvalid] = useState(false);
  const kind = allowed.includes(ruleKind)
    ? ruleKind
    : (allowed[0] as RoofLineComponentRule['kind']);
  const needsValue =
    kind === 'roll-length' ||
    kind === 'linear-effective-cover' ||
    kind === 'manual';
  const save = () => {
    const value = parseDecimal(draft.value);
    const allowance = parseDecimal(draft.allowance);
    const rule: RoofLineComponentRule | undefined =
      kind === 'roll-length' && value && value > 0
        ? { kind, rollLengthMm: Math.round(value * 1000) }
        : kind === 'linear-effective-cover' && value && value > 0
          ? { kind, effectiveCoverLengthMm: Math.round(value * 10) }
          : kind === 'manual' && value !== null && value >= 0
            ? { kind, quantity: Math.round(value) }
            : kind === 'one-per-feature-end' || kind === 'one-per-ridge-tile'
              ? { kind }
              : undefined;
    if (!draft.name.trim() || !rule) return setInvalid(true);
    onAdd({
      id: nextId,
      role,
      name: draft.name.trim(),
      source: 'manual',
      ...(allowance && allowance > 0 && kind === 'roll-length'
        ? { allowanceMm: Math.round(allowance * 1000) }
        : {}),
      rule,
    });
  };
  return (
    <div className="rs-manual" data-testid="rs-manual-form">
      {roles.length > 1 && (
        <label className="rs-field">
          {c.role}
          <select
            value={role}
            data-testid="rs-manual-role"
            onChange={(event) =>
              setRole(event.target.value as RoofLineComponentRole)
            }
          >
            {roles.map((item) => (
              <option key={item} value={item}>
                {materialText(locale, `roofSystem.${item}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="rs-field">
        {c.name}
        <input
          value={draft.name}
          data-testid="rs-manual-name"
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label className="rs-field">
        {c.rule}
        <select
          value={kind}
          data-testid="rs-manual-rule"
          onChange={(event) =>
            setRuleKind(event.target.value as RoofLineComponentRule['kind'])
          }
        >
          {allowed.map((item) => (
            <option key={item} value={item}>
              {c.ruleOption[item]}
            </option>
          ))}
        </select>
      </label>
      {needsValue && (
        <label className="rs-field">
          {kind === 'roll-length'
            ? c.rollLength
            : kind === 'linear-effective-cover'
              ? c.cover
              : c.quantity}
          <input
            inputMode="decimal"
            value={draft.value}
            data-testid="rs-manual-value"
            onChange={(event) =>
              setDraft({ ...draft, value: event.target.value })
            }
          />
        </label>
      )}
      {kind === 'roll-length' && (
        <label className="rs-field">
          {c.allowance}
          <input
            inputMode="decimal"
            value={draft.allowance}
            data-testid="rs-manual-allowance"
            onChange={(event) =>
              setDraft({ ...draft, allowance: event.target.value })
            }
          />
          <small>{c.allowanceHelp}</small>
        </label>
      )}
      {invalid && <p className="rs-warning">{c.invalid}</p>}
      <button
        type="button"
        className="a-primary"
        data-testid="rs-manual-save"
        onClick={save}
      >
        {c.save}
      </button>
    </div>
  );
}

/** Feature selection chips for an eave/verge component (explicit list). */
export function FeatureChips({
  features,
  selected,
  label,
  onChange,
}: {
  features: { id: string; label: string }[];
  selected: readonly string[];
  label: string;
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="rs-chips" role="group" aria-label={label}>
      <small>{label}</small>
      <div className="dw-chips">
        {features.map((feature) => {
          const on = selected.includes(feature.id);
          return (
            <button
              key={feature.id}
              type="button"
              aria-pressed={on}
              data-testid="rs-feature-chip"
              onClick={() =>
                onChange(
                  on
                    ? selected.filter((id) => id !== feature.id)
                    : [...selected, feature.id],
                )
              }
            >
              {feature.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function windowSnapshot(
  item: Awaited<ReturnType<typeof catalogClient.getProduct>>,
): RoofWindowProductSnapshot | undefined {
  const spec = roofWindowComponentTechnicalSpecSchema.safeParse(
    item.currentRevision.technicalSpec,
  );
  if (!spec.success) return undefined;
  return {
    name: item.product.name,
    manufacturer: item.manufacturer.name,
    spec: spec.data,
    catalogRef: {
      productId: item.product.id,
      technicalRevisionId: item.currentRevision.id,
    },
  };
}

/**
 * One roof opening: optional window identity, the covering class at the
 * window, and a flashing — a compatible catalogue kit or a manual entry.
 * Incompatible kits stay visible with the exact structural reason.
 */
export function OpeningEditor({
  opening,
  intent,
  locale,
  c,
  onChange,
}: {
  opening: ResolvedOpeningSystem;
  intent: RoofOpeningIntent | undefined;
  locale: string;
  c: RoofSystemCopy;
  onChange: (next: RoofOpeningIntent) => void;
}) {
  const products = useQuery({
    queryKey: ['catalog', 'products', 'roof-window-component'],
    queryFn: ({ signal }) =>
      catalogClient.searchProducts(
        { kind: 'roof-window-component', limit: 50 },
        signal,
      ),
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [loading, setLoading] = useState<string>();
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const base: RoofOpeningIntent = intent ?? { featureId: opening.featureId };
  const items = products.data?.items ?? [];
  const windows = items.filter(
    (item) => item.technicalPreview.windowRole === 'roof-window',
  );
  const kits = items.filter(
    (item) => item.technicalPreview.windowRole === 'window-flashing-kit',
  );
  const pick = async (
    item: CatalogProductSummary,
    apply: (snapshot: RoofWindowProductSnapshot) => RoofOpeningIntent,
  ) => {
    setLoading(item.id);
    try {
      const snapshot = windowSnapshot(await catalogClient.getProduct(item.id));
      if (snapshot) onChange(apply(snapshot));
    } finally {
      setLoading(undefined);
    }
  };
  const window = base.window;
  // Kit compatibility from the summary facts only, before any detail fetch.
  const kitReasons = (item: CatalogProductSummary) => {
    const preview = item.technicalPreview;
    if (!window) return ['opening-window-generic'];
    if (preview.windowSystemKey !== window.spec.windowSystemKey)
      return ['opening-window-system-mismatch'];
    if (preview.sizeCode !== window.spec.sizeCode)
      return ['opening-size-code-mismatch'];
    if (
      base.coveringClass &&
      preview.flashingCoveringClass &&
      preview.flashingCoveringClass !== base.coveringClass
    )
      return ['opening-covering-class-mismatch'];
    return [];
  };
  const flashing = opening.flashing;
  return (
    <div className="rs-opening" data-testid="rs-opening-editor">
      <dl className="rs-facts">
        <div>
          <dt>{c.opening(opening.ordinal)}</dt>
          <dd>
            {Math.round(opening.widthMm / 10)} ×{' '}
            {Math.round(opening.heightMm / 10)} cm
          </dd>
        </div>
        <div>
          <dt>{c.pitch}</dt>
          <dd>{number(opening.pitchDeg, locale, 1)}°</dd>
        </div>
      </dl>
      <section>
        <h5>{c.stepWindow}</h5>
        <p className="rs-muted">{window ? window.name : c.windowGeneric}</p>
        {opening.windowSizeDiffers && (
          <p className="rs-warning" data-testid="rs-window-size-differs">
            {c.sizeDiffers}
          </p>
        )}
        <details open={!window}>
          <summary>{c.chooseWindow}</summary>
          <p className="rs-muted">{c.windowHelp}</p>
          {products.isError && <p className="rs-muted">{c.catalogueOffline}</p>}
          <ul className="rs-product-list">
            {windows.map((item) => (
              <li key={item.id} className="rs-product" data-testid="rs-window">
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.manufacturer.name}</small>
                </div>
                <button
                  type="button"
                  disabled={!!loading}
                  aria-pressed={window?.catalogRef?.productId === item.id}
                  data-testid="rs-window-choose"
                  onClick={() =>
                    void pick(item, (snapshot) => ({
                      ...base,
                      window: snapshot,
                      // A different window invalidates a catalogue kit.
                      ...(base.flashing?.source === 'catalog'
                        ? { flashing: undefined }
                        : {}),
                    }))
                  }
                >
                  {loading === item.id ? c.adding : c.addThis}
                </button>
              </li>
            ))}
            {window && (
              <li>
                <button
                  type="button"
                  className="dw-link"
                  onClick={() =>
                    onChange({
                      ...base,
                      window: undefined,
                      flashing: undefined,
                    })
                  }
                >
                  {c.windowGeneric}
                </button>
              </li>
            )}
          </ul>
        </details>
      </section>
      <section>
        <h5>{c.stepCovering}</h5>
        <p className="rs-muted">{c.coveringClassHelp}</p>
        <div className="dw-chips" role="group">
          {(['profiled', 'flat'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={base.coveringClass === value}
              data-testid={`rs-covering-${value}`}
              onClick={() => onChange({ ...base, coveringClass: value })}
            >
              {c[value]}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h5>{c.stepFlashing}</h5>
        {flashing.status === 'resolved' ||
        flashing.status === 'incompatible' ? (
          <div className="rs-card" data-status={flashing.status}>
            <header>
              <strong data-testid="rs-flashing-name">{flashing.name}</strong>
              <span
                className={`rs-badge${flashing.source === 'catalog' ? ' is-catalog' : ''}`}
              >
                {flashing.source === 'catalog' ? c.catalog : c.manual}
              </span>
            </header>
            {flashing.status === 'incompatible' && (
              <em
                className="rs-badge is-incompatible"
                data-testid="rs-flashing-incompatible"
              >
                {c.notCompatible}
              </em>
            )}
            {flashing.status === 'resolved' && (
              <p className="rs-quantity">
                ✓ {c.pieces(flashing.quantity ?? 0)}
              </p>
            )}
            {flashing.includes.length > 0 && (
              <small>
                {c.kitIncludes}:{' '}
                {flashing.includes.map((part) => c.includes[part]).join(', ')}
              </small>
            )}
            {flashing.reasons.map((reason) => (
              <p key={reason} className="rs-warning">
                {materialText(locale, `opening-${reason}`)}
              </p>
            ))}
            <button
              type="button"
              className="dw-link is-danger"
              onClick={() => onChange({ ...base, flashing: undefined })}
            >
              {c.removeFlashing}
            </button>
          </div>
        ) : (
          <p
            className="rs-state is-attention"
            data-testid="rs-flashing-required"
          >
            {c.flashingRequired}
          </p>
        )}
        <details open={flashing.status !== 'resolved'}>
          <summary>{c.chooseFlashing}</summary>
          <ul className="rs-product-list">
            {kits.map((item) => {
              const reasons = kitReasons(item);
              return (
                <li
                  key={item.id}
                  className="rs-product"
                  data-compatibility={
                    reasons.length ? 'incompatible' : 'compatible'
                  }
                  data-testid="rs-kit"
                >
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.manufacturer.name}</small>
                    {reasons.length ? (
                      <em className="rs-badge is-incompatible">
                        {materialText(locale, reasons[0]!)}
                      </em>
                    ) : (
                      <em className="rs-badge is-compatible">{c.compatible}</em>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!!reasons.length || !!loading}
                    data-testid="rs-kit-choose"
                    onClick={() =>
                      void pick(item, (snapshot) => ({
                        ...base,
                        flashing: { source: 'catalog', product: snapshot },
                      }))
                    }
                  >
                    {loading === item.id ? c.adding : c.addThis}
                  </button>
                </li>
              );
            })}
          </ul>
          {!manual ? (
            <button
              type="button"
              className="dw-link"
              data-testid="rs-flashing-manual-open"
              onClick={() => setManual(true)}
            >
              {c.manualFlashing}
            </button>
          ) : (
            <div className="rs-manual">
              <label className="rs-field">
                {c.manualFlashingName}
                <input
                  value={manualName}
                  data-testid="rs-flashing-manual-name"
                  onChange={(event) => setManualName(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="a-primary"
                disabled={!manualName.trim()}
                data-testid="rs-flashing-manual-save"
                onClick={() => {
                  onChange({
                    ...base,
                    flashing: {
                      source: 'manual',
                      name: manualName.trim(),
                      quantity: 1,
                    },
                  });
                  setManual(false);
                }}
              >
                {c.save}
              </button>
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
