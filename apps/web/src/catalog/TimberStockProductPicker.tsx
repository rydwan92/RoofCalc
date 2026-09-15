import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { CatalogProductDetail } from '@cieslacalc/catalog-core';
import { useTranslation } from 'react-i18next';
import { MobileSheet } from '../assembly/MobileSheet';
import { useMobileWorkbench } from '../assembly/mobile-workbench';
import { catalogClient, type CatalogClient } from './client';

/**
 * One length picked from the timber-stock catalogue, ready to pre-fill a
 * `StockDraft` row in `K1CuttingPlan.tsx`. Deliberately not a persisted
 * `*ProductSelection` type (unlike covering/membrane picks) — a K1 commercial
 * length is plain typed text today, so a catalogue pick only ever donates a
 * length value and a display label, never a stored `catalogRef`.
 */
export interface TimberStockCatalogPick {
  lengthMm: number;
  widthMm: number;
  depthMm: number;
  sourceLabel: string;
  /**
   * Set only when the product has exactly one commercial variant — timber
   * items are seeded with either zero or one, never a color/finish choice
   * to disambiguate, so there is no variant picker UI here (unlike
   * `CatalogProductPicker`/`MembraneProductPicker`). Left undefined when a
   * product has no variant or (should it ever happen) more than one, so a
   * price lookup never guesses which commercial item was meant.
   */
  commercialVariantId?: string;
}

/**
 * Mirrors `MembraneProductPicker.tsx`'s structure and hand-rolled `copy`
 * pattern deliberately, matching that same-template convention.
 */
const copy = {
  pl: {
    title: 'Katalog tarcicy konstrukcyjnej',
    close: 'Zamknij katalog',
    back: 'Wróć do wyników',
    search: 'Szukaj producenta lub produktu',
    manufacturer: 'Producent',
    all: 'Wszyscy producenci',
    loading: 'Ładowanie katalogu…',
    empty: 'Brak elementów spełniających kryteria.',
    emptySection:
      'Brak elementów w katalogu o przekroju zgodnym z wymaganym blankiem K1.',
    unavailable: 'Katalog jest obecnie niedostępny.',
    manual: 'Zamknij i wprowadź ręcznie',
    choose: 'Szczegóły',
    apply: 'Użyj tej długości',
    currentRevision: 'Aktualna rewizja techniczna',
    applying: 'Pobieranie rewizji…',
    revision: 'Rewizja techniczna',
    source: 'Źródło techniczne',
    variants: 'Wariant',
    noVariant: 'Bez wariantu',
    width: 'Szerokość przekroju',
    depth: 'Wysokość przekroju',
    length: 'Długość',
    strengthClass: 'Klasa wytrzymałości',
    kilnDried: 'Suszone komorowo',
    planed: 'Strugane',
    treated: 'Impregnowane',
    moisture: 'Wilgotność',
    more: 'Pokaż więcej produktów',
    sectionFilter:
      'Pokazano tylko elementy o przekroju {{width}} × {{depth}} mm, zgodnym z wymaganym blankiem K1.',
  },
  en: {
    title: 'Timber stock catalogue',
    close: 'Close catalogue',
    back: 'Back to results',
    search: 'Search manufacturer or product',
    manufacturer: 'Manufacturer',
    all: 'All manufacturers',
    loading: 'Loading catalogue…',
    empty: 'No items match these filters.',
    emptySection:
      'No catalogue item has a section matching the required K1 blank.',
    unavailable: 'The catalogue is currently unavailable.',
    manual: 'Close and enter manually',
    choose: 'Details',
    apply: 'Use this length',
    currentRevision: 'Current technical revision',
    applying: 'Fetching revision…',
    revision: 'Technical revision',
    source: 'Technical source',
    variants: 'Variant',
    noVariant: 'No variant',
    width: 'Section width',
    depth: 'Section depth',
    length: 'Length',
    strengthClass: 'Strength class',
    kilnDried: 'Kiln-dried',
    planed: 'Planed',
    treated: 'Treated',
    moisture: 'Moisture',
    more: 'Show more products',
    sectionFilter:
      'Showing only items with a {{width}} × {{depth}} mm section, matching the required K1 blank.',
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

function boolFact(value: boolean | undefined, label: string) {
  return value === true ? [[label, '✓']] : [];
}

function facts(
  spec: Extract<
    CatalogProductDetail['currentRevision']['technicalSpec'],
    { kind: 'timber-stock' }
  >,
  m: (typeof copy)['pl'],
) {
  return [
    [m.width, `${spec.widthMm} mm`],
    [m.depth, `${spec.depthMm} mm`],
    [m.length, `${spec.lengthMm} mm`],
    spec.strengthClass && [m.strengthClass, spec.strengthClass],
    ...boolFact(spec.kilnDried, m.kilnDried),
    ...boolFact(spec.planed, m.planed),
    ...boolFact(spec.treated, m.treated),
    spec.moisturePercentRange && [
      m.moisture,
      `${spec.moisturePercentRange.min}–${spec.moisturePercentRange.max}%`,
    ],
  ].filter(Boolean) as string[][];
}

function matchesSection(
  section: { widthMm: number; depthMm: number } | undefined,
  widthMm?: number,
  depthMm?: number,
) {
  if (!section) return true;
  return widthMm === section.widthMm && depthMm === section.depthMm;
}

function PickerBody({
  client,
  requiredSection,
  onApply,
  onManual,
}: {
  client: CatalogClient;
  requiredSection?: { widthMm: number; depthMm: number };
  onApply: (pick: TimberStockCatalogPick) => void;
  onManual: () => void;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [manufacturerId, setManufacturerId] = useState('');
  const [productId, setProductId] = useState<string>();
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const manufacturers = useQuery({
    queryKey: ['catalog', 'manufacturers'],
    queryFn: ({ signal }) => client.listManufacturers(signal),
    staleTime: 5 * 60_000,
  });
  const products = useInfiniteQuery({
    queryKey: ['catalog', 'products', 'timber-stock', q, manufacturerId],
    queryFn: ({ signal, pageParam }) =>
      client.searchProducts(
        {
          q: q || undefined,
          kind: 'timber-stock',
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
  const productItems = products.data?.pages
    .flatMap((page) => page.items)
    .filter((item) =>
      matchesSection(
        requiredSection,
        item.technicalPreview.sectionWidthMm,
        item.technicalPreview.sectionDepthMm,
      ),
    );
  const detailFacts = useMemo(() => {
    const spec = detail.data?.currentRevision.technicalSpec;
    return spec && spec.kind === 'timber-stock' ? facts(spec, m) : [];
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
      const spec = exact.revision.technicalSpec;
      if (
        spec.kind !== 'timber-stock' ||
        !matchesSection(requiredSection, spec.widthMm, spec.depthMm)
      ) {
        setApplyError(true);
        return;
      }
      onApply({
        lengthMm: spec.lengthMm,
        widthMm: spec.widthMm,
        depthMm: spec.depthMm,
        sourceLabel: [
          exact.manufacturer.name,
          exact.product.name,
          exact.revision.revisionCode,
        ].join(' · '),
        commercialVariantId:
          item.variants.length === 1 ? item.variants[0]!.id : undefined,
      });
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
        data-testid="timber-stock-catalog-detail"
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
      data-testid="timber-stock-catalog-results"
    >
      {requiredSection && (
        <p className="a-catalog-note">
          {m.sectionFilter
            .replace('{{width}}', String(requiredSection.widthMm))
            .replace('{{depth}}', String(requiredSection.depthMm))}
        </p>
      )}
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
                {product.technicalPreview.sectionWidthMm && (
                  <div>
                    <dt>{m.width}</dt>
                    <dd>{product.technicalPreview.sectionWidthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.sectionDepthMm && (
                  <div>
                    <dt>{m.depth}</dt>
                    <dd>{product.technicalPreview.sectionDepthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.lengthMm && (
                  <div>
                    <dt>{m.length}</dt>
                    <dd>{product.technicalPreview.lengthMm} mm</dd>
                  </div>
                )}
                {product.technicalPreview.strengthClass && (
                  <div>
                    <dt>{m.strengthClass}</dt>
                    <dd>{product.technicalPreview.strengthClass}</dd>
                  </div>
                )}
              </dl>
              <button
                className="a-button"
                onClick={() => setProductId(product.id)}
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
        <div className="a-catalog-empty">
          {requiredSection ? m.emptySection : m.empty}
        </div>
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

export function TimberStockProductPicker({
  requiredSection,
  onApply,
  onClose,
  client = catalogClient,
}: {
  requiredSection?: { widthMm: number; depthMm: number };
  onApply: (pick: TimberStockCatalogPick) => void;
  onClose: () => void;
  client?: CatalogClient;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const mobile = useMobileWorkbench();
  const body = (
    <PickerBody
      client={client}
      requiredSection={requiredSection}
      onApply={onApply}
      onManual={onClose}
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
