import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react';
import {
  createMembraneProductSelection,
  type CatalogProductDetail,
} from '@cieslacalc/catalog-core';
import type { MembraneProductSelection } from '@cieslacalc/covering-core';
import { useTranslation } from 'react-i18next';
import { MobileSheet } from '../assembly/MobileSheet';
import { useMobileWorkbench } from '../assembly/mobile-workbench';
import { BusinessAssortmentSearch } from '../business/BusinessAssortmentSearch';
import { useBusiness } from '../business/context';
import { catalogClient, type CatalogClient } from './client';

/**
 * Mirrors `CatalogProductPicker.tsx`'s structure and hand-rolled `copy`
 * pattern deliberately (not the `translations.ts`/`t()` convention used
 * elsewhere) — a same-file convention match, not a fix, to keep this V35
 * addition a narrow, reviewable diff against its own template.
 */
const copy = {
  pl: {
    title: 'Katalog membran',
    close: 'Zamknij katalog',
    back: 'Wróć do wyników',
    search: 'Szukaj producenta lub produktu',
    manufacturer: 'Producent',
    all: 'Wszyscy producenci',
    loading: 'Ładowanie katalogu…',
    empty: 'Brak membran spełniających kryteria.',
    unavailable: 'Katalog jest obecnie niedostępny.',
    manual: 'Użyj parametrów ręcznych',
    choose: 'Szczegóły',
    apply: 'Użyj produktu',
    currentRevision: 'Aktualna rewizja techniczna',
    applying: 'Pobieranie rewizji…',
    revision: 'Rewizja techniczna',
    source: 'Źródło techniczne',
    variants: 'Wariant',
    noVariant: 'Bez wariantu',
    rollWidth: 'Szerokość rolki',
    rollLength: 'Długość rolki',
    overlap: 'Minimalny zakład',
    pitch: 'Minimalny kąt',
    more: 'Pokaż więcej produktów',
  },
  en: {
    title: 'Membrane catalogue',
    close: 'Close catalogue',
    back: 'Back to results',
    search: 'Search manufacturer or product',
    manufacturer: 'Manufacturer',
    all: 'All manufacturers',
    loading: 'Loading catalogue…',
    empty: 'No membranes match these filters.',
    unavailable: 'The catalogue is currently unavailable.',
    manual: 'Use manual parameters',
    choose: 'Details',
    apply: 'Use product',
    currentRevision: 'Current technical revision',
    applying: 'Fetching revision…',
    revision: 'Technical revision',
    source: 'Technical source',
    variants: 'Variant',
    noVariant: 'No variant',
    rollWidth: 'Roll width',
    rollLength: 'Roll length',
    overlap: 'Minimum overlap',
    pitch: 'Minimum pitch',
    more: 'Show more products',
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

function facts(
  spec: Extract<
    CatalogProductDetail['currentRevision']['technicalSpec'],
    { kind: 'membrane' }
  >,
  m: (typeof copy)['pl'],
) {
  return [
    [m.rollWidth, `${spec.rollWidthMm} mm`],
    [m.rollLength, `${spec.rollLengthMm} mm`],
    [m.overlap, `${spec.minimumOverlapMm} mm`],
    spec.minPitchDeg && [m.pitch, `${spec.minPitchDeg}°`],
  ].filter(Boolean) as string[][];
}

function PickerBody({
  client,
  onApply,
  onManual,
}: {
  client: CatalogClient;
  onApply: (selection: MembraneProductSelection) => void;
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
  const products = useInfiniteQuery({
    queryKey: ['catalog', 'products', 'membrane', q, manufacturerId],
    queryFn: ({ signal, pageParam }) =>
      client.searchProducts(
        {
          q: q || undefined,
          kind: 'membrane',
          manufacturerId: manufacturerId || undefined,
          limit: 30,
          cursor: pageParam || undefined,
        },
        signal,
      ),
    staleTime: 60_000,
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const detail = useQuery({
    queryKey: ['catalog', 'product', productId],
    queryFn: ({ signal }) => client.getProduct(productId!, signal),
    enabled: Boolean(productId),
    staleTime: 60_000,
  });

  const unavailable = manufacturers.isError || products.isError;
  const productItems = products.data?.pages.flatMap((page) => page.items);
  const selectedVariant = detail.data?.variants.find(
    (item) => item.id === variantId,
  );
  const detailFacts = useMemo(() => {
    const spec = detail.data?.currentRevision.technicalSpec;
    return spec && spec.kind === 'membrane' ? facts(spec, m) : [];
  }, [detail.data, m]);

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
        createMembraneProductSelection({
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
      <div
        className="a-catalog-picker-body"
        data-testid="membrane-catalog-detail"
      >
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
    <div
      className="a-catalog-picker-body"
      data-testid="membrane-catalog-results"
    >
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
      ) : productItems?.length ? (
        <div className="a-catalog-results">
          {productItems.map((product) => (
            <article key={product.id} className="a-catalog-card">
              <small>{product.manufacturer.name}</small>
              <strong>{product.name}</strong>
              <span className="a-catalog-revision-badge">
                {m.currentRevision}
              </span>
              <dl>
                {product.technicalPreview.rollWidthMm && (
                  <div>
                    <dt>{m.rollWidth}</dt>
                    <dd>{product.technicalPreview.rollWidthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.rollLengthMm && (
                  <div>
                    <dt>{m.rollLength}</dt>
                    <dd>{product.technicalPreview.rollLengthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.minimumOverlapMm !== undefined && (
                  <div>
                    <dt>{m.overlap}</dt>
                    <dd>{product.technicalPreview.minimumOverlapMm} mm</dd>
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
          {products.hasNextPage && (
            <button
              className="a-button a-catalog-more"
              disabled={products.isFetchingNextPage}
              onClick={() => void products.fetchNextPage()}
            >
              {products.isFetchingNextPage ? m.loading : m.more}
            </button>
          )}
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

export function MembraneProductPicker({
  onApply,
  onManual,
  onClose,
  client = catalogClient,
}: {
  onApply: (selection: MembraneProductSelection) => void;
  onManual: () => void;
  onClose: () => void;
  client?: CatalogClient;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const mobile = useMobileWorkbench();
  const business = useBusiness();
  const queryClient = useQueryClient();
  const [browseCatalog, setBrowseCatalog] = useState(false);
  const businessMode =
    business.mode === 'business' && Boolean(business.organization);
  const body =
    businessMode && !browseCatalog ? (
      <BusinessAssortmentSearch
        kind="membrane"
        onBrowseCatalog={() => setBrowseCatalog(true)}
        onSelect={async (row) => {
          if (!row.catalog) return;
          const [exact, detail] = await Promise.all([
            queryClient.fetchQuery({
              queryKey: [
                'catalog',
                'revision',
                row.catalog.productId,
                row.catalog.currentRevisionId,
              ],
              queryFn: ({ signal }) =>
                client.getRevision(
                  row.catalog!.productId,
                  row.catalog!.currentRevisionId,
                  signal,
                ),
              staleTime: Infinity,
            }),
            queryClient.fetchQuery({
              queryKey: ['catalog', 'product', row.catalog.productId],
              queryFn: ({ signal }) =>
                client.getProduct(row.catalog!.productId, signal),
              staleTime: 60_000,
            }),
          ]);
          const variant = detail.variants.find(
            (candidate) => candidate.id === row.catalog!.variantId,
          );
          onApply(
            createMembraneProductSelection({
              manufacturer: exact.manufacturer,
              product: exact.product,
              revision: exact.revision,
              variant,
            }),
          );
        }}
      />
    ) : (
      <PickerBody client={client} onApply={onApply} onManual={onManual} />
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
