import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react';
import {
  createCatalogProductSelection,
  type CatalogProductDetail,
} from '@cieslacalc/catalog-core';
import type {
  CoveringKind,
  CoveringProductSelection,
  CoveringTechnicalSpec,
} from '@cieslacalc/covering-core';
import { useTranslation } from 'react-i18next';
import { MobileSheet } from '../assembly/MobileSheet';
import { useMobileWorkbench } from '../assembly/mobile-workbench';
import { catalogClient, type CatalogClient } from './client';

const copy = {
  pl: {
    title: 'Katalog produktów',
    close: 'Zamknij katalog',
    back: 'Wróć do wyników',
    search: 'Szukaj producenta lub produktu',
    manufacturer: 'Producent',
    all: 'Wszyscy producenci',
    loading: 'Ładowanie katalogu…',
    empty: 'Brak produktów spełniających kryteria.',
    unavailable: 'Katalog jest obecnie niedostępny.',
    manual: 'Użyj parametrów ręcznych',
    choose: 'Wybierz',
    apply: 'Zastosuj produkt',
    applying: 'Pobieranie rewizji…',
    revision: 'Rewizja techniczna',
    source: 'Źródło techniczne',
    variants: 'Wariant',
    noVariant: 'Bez wariantu',
    width: 'Szerokość krycia',
    gauge: 'Rozstaw łat',
    pitch: 'Minimalny kąt',
    panelLength: 'Zakres długości',
  },
  en: {
    title: 'Product catalogue',
    close: 'Close catalogue',
    back: 'Back to results',
    search: 'Search manufacturer or product',
    manufacturer: 'Manufacturer',
    all: 'All manufacturers',
    loading: 'Loading catalogue…',
    empty: 'No products match these filters.',
    unavailable: 'The catalogue is currently unavailable.',
    manual: 'Use manual parameters',
    choose: 'Choose',
    apply: 'Apply product',
    applying: 'Fetching revision…',
    revision: 'Technical revision',
    source: 'Technical source',
    variants: 'Variant',
    noVariant: 'No variant',
    width: 'Cover width',
    gauge: 'Batten gauge',
    pitch: 'Minimum pitch',
    panelLength: 'Length range',
  },
};

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

function facts(spec: CoveringTechnicalSpec, m: (typeof copy)['pl']) {
  if (spec.kind === 'roof-tile') {
    const mode = spec.installationModes[0];
    return [
      mode && [m.width, `${mode.coverWidthMm} mm`],
      mode && [m.gauge, `${mode.gaugeRangeMm.min}–${mode.gaugeRangeMm.max} mm`],
      mode?.minPitchDeg && [m.pitch, `${mode.minPitchDeg}°`],
    ].filter(Boolean) as string[][];
  }
  if (spec.kind === 'modular-sheet')
    return [
      [m.width, `${spec.effectiveWidthMm} mm`],
      spec.minPitchDeg && [m.pitch, `${spec.minPitchDeg}°`],
    ].filter(Boolean) as string[][];
  return [
    spec.installationModes[0] && [
      m.width,
      `${spec.installationModes[0].effectiveWidthMm} mm`,
    ],
    [m.panelLength, `${spec.minPanelLengthMm}–${spec.maxPanelLengthMm} mm`],
    spec.minPitchDeg && [m.pitch, `${spec.minPitchDeg}°`],
  ].filter(Boolean) as string[][];
}

function PickerBody({
  kind,
  client,
  onApply,
  onManual,
}: {
  kind: CoveringKind;
  client: CatalogClient;
  onApply: (selection: CoveringProductSelection) => void;
  onManual: () => void;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [manufacturerId, setManufacturerId] = useState('');
  const [productId, setProductId] = useState<string>();
  const [variantId, setVariantId] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const manufacturers = useQuery({
    queryKey: ['catalog', 'manufacturers'],
    queryFn: ({ signal }) => client.listManufacturers(signal),
    staleTime: 5 * 60_000,
  });
  const products = useQuery({
    queryKey: ['catalog', 'products', kind, q, manufacturerId],
    queryFn: ({ signal }) =>
      client.searchProducts(
        {
          q: q || undefined,
          kind,
          manufacturerId: manufacturerId || undefined,
          limit: 30,
        },
        signal,
      ),
    staleTime: 60_000,
  });
  const detail = useQuery({
    queryKey: ['catalog', 'product', productId],
    queryFn: ({ signal }) => client.getProduct(productId!, signal),
    enabled: Boolean(productId),
    staleTime: 60_000,
  });

  const unavailable = manufacturers.isError || products.isError;
  const selectedVariant = detail.data?.variants.find(
    (item) => item.id === variantId,
  );
  const detailFacts = useMemo(
    () =>
      detail.data ? facts(detail.data.currentRevision.technicalSpec, m) : [],
    [detail.data, m],
  );

  async function apply(item: CatalogProductDetail) {
    setApplying(true);
    setApplyError(false);
    try {
      const exact = await queryClient.fetchQuery({
        queryKey: [
          'catalog',
          'revision',
          item.product.id,
          item.currentRevision.id,
        ],
        queryFn: ({ signal }) =>
          client.getRevision(item.product.id, item.currentRevision.id, signal),
        staleTime: Infinity,
      });
      onApply(
        createCatalogProductSelection({
          manufacturer: exact.manufacturer,
          product: exact.product,
          revision: exact.revision,
          variant: selectedVariant,
        }),
      );
    } catch {
      setApplyError(true);
    } finally {
      setApplying(false);
    }
  }

  if (productId)
    return (
      <div className="a-catalog-picker-body" data-testid="catalog-detail">
        <button
          className="a-catalog-back"
          onClick={() => setProductId(undefined)}
        >
          <ArrowLeft size={17} /> {m.back}
        </button>
        {detail.isLoading ? (
          <div className="a-catalog-loading">{m.loading}</div>
        ) : detail.isError || !detail.data ? (
          <CatalogUnavailable
            message={m.unavailable}
            manual={m.manual}
            onManual={onManual}
          />
        ) : (
          <>
            <header className="a-catalog-detail-heading">
              <small>{detail.data.manufacturer.name}</small>
              <h2>{detail.data.product.name}</h2>
              <span>
                {m.revision}: {detail.data.currentRevision.revisionCode}
              </span>
              {detail.data.currentRevision.source?.label && (
                <span>
                  {m.source}: {detail.data.currentRevision.source.label}
                </span>
              )}
            </header>
            <dl className="a-catalog-facts">
              {detailFacts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {detail.data.variants.length > 0 && (
              <label className="a-field">
                <span>{m.variants}</span>
                <select
                  value={variantId}
                  onChange={(event) => setVariantId(event.target.value)}
                >
                  <option value="">{m.noVariant}</option>
                  {detail.data.variants.map((variant) => (
                    <option key={variant.id} value={variant.id}>
                      {variant.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {applyError && <p role="alert">{m.unavailable}</p>}
            <button
              className="a-button a-primary a-catalog-apply"
              disabled={applying}
              onClick={() => void apply(detail.data!)}
            >
              {applying ? m.applying : m.apply}
            </button>
          </>
        )}
      </div>
    );

  return (
    <div className="a-catalog-picker-body" data-testid="catalog-results">
      <div className="a-catalog-filters">
        <label>
          <span>{m.search}</span>
          <span className="a-catalog-search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={m.search}
            />
          </span>
        </label>
        <label>
          <span>{m.manufacturer}</span>
          <select
            value={manufacturerId}
            onChange={(event) => setManufacturerId(event.target.value)}
          >
            <option value="">{m.all}</option>
            {manufacturers.data?.map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.id}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {unavailable ? (
        <CatalogUnavailable
          message={m.unavailable}
          manual={m.manual}
          onManual={onManual}
        />
      ) : products.isLoading || manufacturers.isLoading ? (
        <div className="a-catalog-loading" aria-live="polite">
          {m.loading}
        </div>
      ) : products.data?.items.length ? (
        <div className="a-catalog-results">
          {products.data.items.map((product) => (
            <article key={product.id} className="a-catalog-card">
              <small>{product.manufacturer.name}</small>
              <strong>{product.name}</strong>
              <dl>
                {product.technicalPreview.effectiveWidthMm && (
                  <div>
                    <dt>{m.width}</dt>
                    <dd>{product.technicalPreview.effectiveWidthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.gaugeMinMm && (
                  <div>
                    <dt>{m.gauge}</dt>
                    <dd>
                      {product.technicalPreview.gaugeMinMm}–
                      {product.technicalPreview.gaugeMaxMm} mm
                    </dd>
                  </div>
                )}
                {product.technicalPreview.minPitchDeg && (
                  <div>
                    <dt>{m.pitch}</dt>
                    <dd>{product.technicalPreview.minPitchDeg}°</dd>
                  </div>
                )}
              </dl>
              <button
                className="a-button"
                onClick={() => {
                  setVariantId('');
                  setProductId(product.id);
                }}
              >
                {m.choose}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="a-catalog-empty">{m.empty}</div>
      )}
    </div>
  );
}

function CatalogUnavailable({
  message,
  manual,
  onManual,
}: {
  message: string;
  manual: string;
  onManual: () => void;
}) {
  return (
    <div className="a-catalog-unavailable" role="status">
      <p>{message}</p>
      <button className="a-button" onClick={onManual}>
        {manual}
      </button>
    </div>
  );
}

export function CatalogProductPicker({
  kind,
  onApply,
  onManual,
  onClose,
  client = catalogClient,
}: {
  kind: CoveringKind;
  onApply: (selection: CoveringProductSelection) => void;
  onManual: () => void;
  onClose: () => void;
  client?: CatalogClient;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const mobile = useMobileWorkbench();
  const body = (
    <PickerBody
      kind={kind}
      client={client}
      onApply={onApply}
      onManual={onManual}
    />
  );
  if (mobile)
    return (
      <MobileSheet title={m.title} onClose={onClose} expanded>
        {body}
      </MobileSheet>
    );
  return (
    <div className="a-catalog-layer">
      <button
        className="a-catalog-backdrop"
        aria-label={m.close}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={m.title}
        className="a-catalog-dialog"
      >
        <header>
          <strong>{m.title}</strong>
          <button className="a-icon" aria-label={m.close} onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {body}
      </section>
    </div>
  );
}
