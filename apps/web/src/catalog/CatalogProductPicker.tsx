import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, Search, X } from 'lucide-react';
import {
  createCatalogProductSelection,
  isCoveringTechnicalSpec,
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
import { useBusiness } from '../business/context';
import { businessCopy } from '../business/copy';
import { orderByPitchFit, pitchFit } from './pitch-fit';
import { BusinessAssortmentPicker } from '../business/BusinessAssortmentPicker';

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
    unseeded: 'Katalog nie został jeszcze zasilony.',
    unseededHint: 'Brak produktów w katalogu — możesz użyć danych ręcznych.',
    unseededAdmin: 'Dane katalogowe wymagają inicjalizacji.',
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
    width: 'Szerokość krycia',
    gauge: 'Rozstaw łat',
    pitch: 'Minimalny kąt',
    fits: 'Pasuje do kąta dachu {{pitch}}°',
    tooFlat: 'Dach za płaski: wymaga min. {{min}}°, dach ma {{pitch}}°',
    panelLength: 'Zakres długości',
    sheetFormat: 'Format',
    fixedSheet: 'Stały arkusz',
    cutSheet: 'Cięta na długość',
    more: 'Pokaż więcej produktów',
    replacementTitle: 'Zmiana produktu przeliczy projekt',
    replacementImpact:
      'Zmiana wpłynie na układ pokrycia, rozstaw łat, ilości materiałów i kosztorys.',
    replacementConfirm: 'Zmień produkt',
    replacementCancel: 'Wróć',
    kind: {
      'roof-tile': 'Dachówka',
      'modular-sheet': 'Blacha',
      'standing-seam': 'Rąbek',
    },
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
    unseeded: 'The catalogue has not been initialized yet.',
    unseededHint:
      'There are no catalogue products yet — you can use manual data.',
    unseededAdmin: 'Catalogue data requires initialization.',
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
    width: 'Cover width',
    gauge: 'Batten gauge',
    pitch: 'Minimum pitch',
    fits: 'Fits the roof pitch {{pitch}}°',
    tooFlat: 'Roof too flat: needs at least {{min}}°, roof is {{pitch}}°',
    panelLength: 'Length range',
    sheetFormat: 'Format',
    fixedSheet: 'Fixed sheet',
    cutSheet: 'Cut to length',
    more: 'Show more products',
    replacementTitle: 'Changing the product will recalculate the project',
    replacementImpact:
      'The change affects covering layout, batten gauge, material quantities, and costing.',
    replacementConfirm: 'Change product',
    replacementCancel: 'Back',
    kind: {
      'roof-tile': 'Roof tile',
      'modular-sheet': 'Metal sheet',
      'standing-seam': 'Standing seam',
    },
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
      [
        m.sheetFormat,
        spec.lengthModel.kind === 'cut-to-length' ? m.cutSheet : m.fixedSheet,
      ],
      spec.lengthModel.kind === 'cut-to-length' && [
        m.panelLength,
        `${spec.lengthModel.minPanelLengthMm}–${spec.lengthModel.maxPanelLengthMm} mm`,
      ],
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

function PitchFitBadge({
  minPitchDeg,
  roofPitchDeg,
  m,
}: {
  minPitchDeg?: number;
  roofPitchDeg?: number;
  m: (typeof copy)['pl'];
}) {
  const fit = pitchFit(minPitchDeg, roofPitchDeg);
  if (fit === 'unknown') return null;
  const pitch = String(Math.round(roofPitchDeg! * 10) / 10);
  return (
    <span className="a-catalog-fit" data-fit={fit}>
      {(fit === 'fits' ? m.fits : m.tooFlat)
        .replace('{{pitch}}', pitch)
        .replace('{{min}}', String(minPitchDeg))}
    </span>
  );
}

function PickerBody({
  kind,
  client,
  onApply,
  onManual,
  roofPitchDeg,
}: {
  roofPitchDeg?: number;
  kind: CoveringKind;
  client: CatalogClient;
  onApply: (selection: CoveringProductSelection) => void;
  onManual: () => void;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const business = useBusiness();
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
    queryKey: ['catalog', 'products', kind, q, manufacturerId],
    queryFn: ({ signal, pageParam }) =>
      client.searchProducts(
        {
          q: q || undefined,
          kind,
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
  const [selectedMinPitch, setSelectedMinPitch] = useState<number>();
  // Suitable for this roof's pitch first; nothing is hidden (catalogue data only).
  const productItems = useMemo(
    () =>
      products.data &&
      orderByPitchFit(
        products.data.pages.flatMap((page) => page.items),
        (item) => item.technicalPreview.minPitchDeg,
        roofPitchDeg,
      ),
    [products.data, roofPitchDeg],
  );
  const selectedVariant = detail.data?.variants.find(
    (item) => item.id === variantId,
  );
  const detailFacts = useMemo(() => {
    const spec = detail.data?.currentRevision.technicalSpec;
    return spec && isCoveringTechnicalSpec(spec) ? facts(spec, m) : [];
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
            <PitchFitBadge
              minPitchDeg={selectedMinPitch}
              roofPitchDeg={roofPitchDeg}
              m={m}
            />
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
      <p className="a-catalog-kind-context">{m.kind[kind]}</p>
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
              <PitchFitBadge
                minPitchDeg={product.technicalPreview.minPitchDeg}
                roofPitchDeg={roofPitchDeg}
                m={m}
              />
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
                {product.technicalPreview.sheetLengthModel && (
                  <div>
                    <dt>{m.sheetFormat}</dt>
                    <dd>
                      {product.technicalPreview.sheetLengthModel ===
                      'cut-to-length'
                        ? m.cutSheet
                        : m.fixedSheet}
                    </dd>
                  </div>
                )}
                {product.technicalPreview.minimumSheetLengthMm !== undefined &&
                  product.technicalPreview.maximumSheetLengthMm !==
                    undefined && (
                    <div>
                      <dt>{m.panelLength}</dt>
                      <dd>
                        {product.technicalPreview.minimumSheetLengthMm}–
                        {product.technicalPreview.maximumSheetLengthMm} mm
                      </dd>
                    </div>
                  )}
              </dl>
              <button
                className="a-button"
                onClick={() => {
                  setVariantId('');
                  setSelectedMinPitch(product.technicalPreview.minPitchDeg);
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
      ) : !q && !manufacturerId ? (
        <div className="a-catalog-unavailable" role="status">
          <p>{m.unseeded}</p>
          <span>
            {business.mode === 'business' ? m.unseededAdmin : m.unseededHint}
          </span>
          <button className="a-button" onClick={onManual}>
            {m.manual}
          </button>
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
  confirmReplacementImpact = false,
  roofPitchDeg,
}: {
  /** The roof's pitch, to mark and order products by their minimum pitch. */
  roofPitchDeg?: number;
  kind: CoveringKind;
  onApply: (selection: CoveringProductSelection) => void;
  onManual: () => void;
  onClose: () => void;
  client?: CatalogClient;
  confirmReplacementImpact?: boolean;
}) {
  const { i18n } = useTranslation();
  const m = copy[i18n.language.startsWith('pl') ? 'pl' : 'en'];
  const bm = businessCopy(i18n.language);
  const mobile = useMobileWorkbench();
  const business = useBusiness();
  const [pending, setPending] = useState<CoveringProductSelection>();
  /**
   * V54 §15/§44: in BUSINESS mode the picker opens on the company assortment,
   * because a salesperson should search the few hundred products their own
   * company sells rather than five thousand global ones. The full technical
   * catalogue stays one click away for expert and admin use. In STANDARD mode
   * neither the tabs nor the business tab exist, and the picker is unchanged.
   */
  // Keep the business picker mounted even when the organization request is
  // unavailable. It owns the scoped outage message and the explicit route to
  // the global technical catalogue; silently falling back to the catalogue
  // would hide the commercial outage from the user.
  const businessMode = business.mode === 'business';
  const [tab, setTab] = useState<'assortment' | 'catalog'>(
    businessMode ? 'assortment' : 'catalog',
  );
  const activeTab = businessMode ? tab : 'catalog';
  const apply = (selection: CoveringProductSelection) => {
    if (confirmReplacementImpact) setPending(selection);
    else onApply(selection);
  };
  const body = pending ? (
    <section className="a-catalog-picker-body" role="alertdialog">
      <h3>{m.replacementTitle}</h3>
      <p>{m.replacementImpact}</p>
      <div className="a-catalog-actions">
        <button
          type="button"
          className="a-button a-primary"
          onClick={() => onApply(pending)}
        >
          {m.replacementConfirm}
        </button>
        <button
          type="button"
          className="a-button"
          onClick={() => setPending(undefined)}
        >
          {m.replacementCancel}
        </button>
      </div>
    </section>
  ) : (
    <>
      {businessMode && (
        <div
          className="bz-picker-tabs"
          role="tablist"
          aria-label={bm.companyAssortment}
        >
          <button
            type="button"
            role="tab"
            data-tab="assortment"
            aria-selected={activeTab === 'assortment'}
            onClick={() => setTab('assortment')}
          >
            {bm.companyAssortment}
          </button>
          <button
            type="button"
            role="tab"
            data-tab="catalog"
            aria-selected={activeTab === 'catalog'}
            onClick={() => setTab('catalog')}
          >
            {bm.wholeCatalog}
          </button>
        </div>
      )}
      {activeTab === 'assortment' ? (
        <BusinessAssortmentPicker
          kind={kind}
          onApply={apply}
          onBrowseCatalog={() => setTab('catalog')}
          catalog={client}
        />
      ) : (
        <PickerBody
          {...(roofPitchDeg !== undefined ? { roofPitchDeg } : {})}
          kind={kind}
          client={client}
          onApply={apply}
          onManual={onManual}
        />
      )}
    </>
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
