import { flattestRoofPitchDeg } from '@cieslacalc/roof-math';
import { useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, CircleCheck, Search, TriangleAlert, X } from 'lucide-react';
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
import type { CatalogClient } from './client';
import {
  BundledCatalogNotice,
  catalogQueryKey,
  UseBundledCatalog,
  useCatalogClient,
} from './catalog-source';
import { bundledCatalogClient } from './offline-client';
import { useAssembly } from '../assembly/store';
import { useBusiness } from '../business/context';
import { businessCopy } from '../business/copy';
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
    fitTitle: 'Twój dach',
    fits: (pitch: number) => `kąt dachu ${pitch}° ≥ minimum produktu`,
    tooFlat: (pitch: number) => `dach ${pitch}° — poniżej minimum produktu`,
    fitOnly: (pitch: number, count: number) =>
      `Pasujące do kąta dachu ${pitch}° (${count})`,
    fitNone: (pitch: number) =>
      `Żaden z wczytanych produktów nie dopuszcza kąta ${pitch}°. Wyłącz filtr albo wczytaj więcej.`,
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
    fitTitle: 'Your roof',
    fits: (pitch: number) => `roof pitch ${pitch}° ≥ product minimum`,
    tooFlat: (pitch: number) => `roof ${pitch}° — below the product minimum`,
    fitOnly: (pitch: number, count: number) =>
      `Fits the ${pitch}° roof (${count})`,
    fitNone: (pitch: number) =>
      `None of the loaded products allows ${pitch}°. Turn the filter off or load more.`,
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
  const business = useBusiness();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [manufacturerId, setManufacturerId] = useState('');
  const [productId, setProductId] = useState<string>();
  const [variantId, setVariantId] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  /** VNext-12: only products whose minimum pitch this roof meets. */
  const [fitOnly, setFitOnly] = useState(false);
  const manufacturers = useQuery({
    queryKey: catalogQueryKey(client, 'manufacturers'),
    queryFn: ({ signal }) => client.listManufacturers(signal),
    staleTime: 5 * 60_000,
  });
  const products = useInfiniteQuery({
    queryKey: catalogQueryKey(client, 'products', kind, q, manufacturerId),
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
  // VNext-14: the manufacturer filter lists only who makes this kind — one
  // page of up to 50 of the kind tells; a larger kind keeps every maker.
  const kindMakers = useQuery({
    queryKey: catalogQueryKey(client, 'kind-makers', kind),
    queryFn: ({ signal }) => client.searchProducts({ kind, limit: 50 }, signal),
    staleTime: 5 * 60_000,
  });
  const manufacturerOptions = useMemo(() => {
    const all = manufacturers.data ?? [];
    const page = kindMakers.data;
    if (!page || page.nextCursor) return all;
    const ids = new Set(page.items.map((item) => item.manufacturer.id));
    return all.filter(
      (maker) => ids.has(maker.id) || maker.id === manufacturerId,
    );
  }, [manufacturers.data, kindMakers.data, manufacturerId]);
  const detail = useQuery({
    queryKey: catalogQueryKey(client, 'product', productId),
    queryFn: ({ signal }) => client.getProduct(productId!, signal),
    enabled: Boolean(productId),
    staleTime: 60_000,
  });

  const unavailable = manufacturers.isError || products.isError;
  // V-next-2: the card says whether the product suits this roof's pitch.
  // VNext-9C: the flattest plane decides (an asymmetric gable has two).
  const roofPitchDeg = useAssembly((state) =>
    flattestRoofPitchDeg(state.template),
  );
  const loadedItems = products.data?.pages.flatMap((page) => page.items);
  // VNext-12: what suits this roof comes first — products it meets the
  // minimum pitch of, then those with no stated minimum, then too-flat.
  const fitOf = (product: NonNullable<typeof loadedItems>[number]) =>
    product.technicalPreview.minPitchDeg === undefined
      ? 'unknown'
      : roofPitchDeg >= product.technicalPreview.minPitchDeg
        ? 'fits'
        : 'too-flat';
  const FIT_RANK = { fits: 0, unknown: 1, 'too-flat': 2 } as const;
  const rankedItems = loadedItems
    ?.map((product, index) => ({ product, index }))
    .sort(
      (a, b) =>
        FIT_RANK[fitOf(a.product)] - FIT_RANK[fitOf(b.product)] ||
        a.index - b.index,
    )
    .map(({ product }) => product);
  const fittingCount =
    loadedItems?.filter((product) => fitOf(product) === 'fits').length ?? 0;
  const productItems = fitOnly
    ? rankedItems?.filter((product) => fitOf(product) === 'fits')
    : rankedItems;
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
        queryKey: catalogQueryKey(
          client,
          'revision',
          item.product.id,
          item.currentRevision.id,
        ),
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
        <BundledCatalogNotice />
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
            offerBundled={client !== bundledCatalogClient}
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
      <BundledCatalogNotice />
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
            {manufacturerOptions.map((manufacturer) => (
              <option key={manufacturer.id} value={manufacturer.id}>
                {manufacturer.name}
              </option>
            ))}
          </select>
        </label>
        {!!loadedItems?.length && (
          <button
            type="button"
            className="a-catalog-fit-filter"
            data-testid="catalog-fit-filter"
            aria-pressed={fitOnly}
            onClick={() => setFitOnly((value) => !value)}
          >
            <CircleCheck size={15} aria-hidden="true" />
            {m.fitOnly(roofPitchDeg, fittingCount)}
          </button>
        )}
      </div>
      {unavailable ? (
        <CatalogUnavailable
          message={m.unavailable}
          manual={m.manual}
          onManual={onManual}
          offerBundled={client !== bundledCatalogClient}
        />
      ) : products.isLoading || manufacturers.isLoading ? (
        <div className="a-catalog-loading" aria-live="polite">
          {m.loading}
        </div>
      ) : productItems?.length ? (
        <div className="a-catalog-results">
          {productItems.map((product) => (
            <article
              key={product.id}
              className="a-catalog-card"
              data-fit={fitOf(product)}
            >
              <small>{product.manufacturer.name}</small>
              <strong>{product.name}</strong>
              <span className="a-catalog-revision-badge">
                {m.currentRevision}
              </span>
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
                {product.technicalPreview.minPitchDeg !== undefined && (
                  <div
                    className="a-catalog-fit"
                    data-fits={
                      roofPitchDeg >= product.technicalPreview.minPitchDeg ||
                      undefined
                    }
                  >
                    <dt>{m.fitTitle}</dt>
                    <dd>
                      {roofPitchDeg >= product.technicalPreview.minPitchDeg ? (
                        <CircleCheck size={13} aria-hidden="true" />
                      ) : (
                        <TriangleAlert size={13} aria-hidden="true" />
                      )}
                      {roofPitchDeg >= product.technicalPreview.minPitchDeg
                        ? m.fits(roofPitchDeg)
                        : m.tooFlat(roofPitchDeg)}
                    </dd>
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
      ) : fitOnly && loadedItems?.length ? (
        <div className="a-catalog-empty" data-testid="catalog-fit-none">
          {m.fitNone(roofPitchDeg)}
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
  offerBundled,
}: {
  message: string;
  manual: string;
  onManual: () => void;
  offerBundled: boolean;
}) {
  return (
    <div className="a-catalog-unavailable" role="status">
      <p>{message}</p>
      {offerBundled && <UseBundledCatalog />}
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
  client: injectedClient,
  confirmReplacementImpact = false,
}: {
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
  const client = useCatalogClient(injectedClient);
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
