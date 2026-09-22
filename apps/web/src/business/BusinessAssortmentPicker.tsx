import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCatalogProductSelection } from '@cieslacalc/catalog-core';
import type { CoveringProductSelection } from '@cieslacalc/covering-core';
import type { OrganizationAssortmentRow } from '@cieslacalc/business-core';
import { catalogClient, type CatalogClient } from '../catalog/client';
import { BusinessAssortmentSearch } from './BusinessAssortmentSearch';
import { businessCopy } from './copy';

/**
 * The "Asortyment firmy" tab of the product picker (§15, §16, §44).
 *
 * A salesperson searches what their own company sells — a few dozen or a few
 * hundred rows — not five thousand global catalogue products. Rows show the
 * warehouse code and whether a price exists, and nothing else administrative.
 *
 * Applying a row does **not** short-circuit the technical path. It fetches the
 * exact catalogue revision and builds the same `CoveringProductSelection` the
 * catalogue tab builds, so the technical snapshot a project stores is
 * identical whichever tab it was picked from — the organization contributed
 * availability and a code, never a dimension (§13, §71).
 */
export function BusinessAssortmentPicker({
  kind,
  onApply,
  onBrowseCatalog,
  catalog = catalogClient,
}: {
  kind: string;
  onApply: (selection: CoveringProductSelection) => void;
  onBrowseCatalog: () => void;
  catalog?: CatalogClient;
}) {
  const queryClient = useQueryClient();
  const { i18n } = useTranslation();
  const m = businessCopy(i18n.language);
  const [preview, setPreview] = useState<{
    row: OrganizationAssortmentRow;
    selection: CoveringProductSelection;
  }>();

  async function apply(row: OrganizationAssortmentRow) {
    if (!row.catalog) return;
    const exact = await queryClient.fetchQuery({
      queryKey: [
        'catalog',
        'revision',
        row.catalog.productId,
        row.catalog.currentRevisionId,
      ],
      queryFn: ({ signal }) =>
        catalog.getRevision(
          row.catalog!.productId,
          row.catalog!.currentRevisionId,
          signal,
        ),
      staleTime: Infinity,
    });
    const detail = await queryClient.fetchQuery({
      queryKey: ['catalog', 'product', row.catalog.productId],
      queryFn: ({ signal }) =>
        catalog.getProduct(row.catalog!.productId, signal),
      staleTime: 60_000,
    });
    const variant = detail.variants.find(
      (candidate) => candidate.id === row.catalog!.variantId,
    );
    setPreview({
      row,
      selection: createCatalogProductSelection({
        manufacturer: exact.manufacturer,
        product: exact.product,
        revision: exact.revision,
        ...(variant ? { variant } : {}),
      }),
    });
  }

  if (preview) {
    const spec = preview.selection.technicalSpecSnapshot;
    const tileMode =
      spec.kind === 'roof-tile' ? spec.installationModes[0] : undefined;
    return (
      <section
        className="bz-product-detail"
        data-testid="business-product-detail"
      >
        <button
          className="a-button"
          type="button"
          onClick={() => setPreview(undefined)}
        >
          {m.backToProducts}
        </button>
        <header>
          <span>{m.productDetails}</span>
          <h3>
            {preview.row.item.displayNameOverride ??
              preview.row.item.sourceName}
          </h3>
          <p>
            {preview.row.catalog?.manufacturerName} ·{' '}
            {preview.row.catalog?.productName}
            {preview.row.catalog?.variantName
              ? ` · ${preview.row.catalog.variantName}`
              : ''}
          </p>
        </header>
        <dl>
          {'physicalWidthMm' in spec && 'physicalLengthMm' in spec && (
            <div>
              <dt>{m.dimensions}</dt>
              <dd>
                {spec.physicalWidthMm} × {spec.physicalLengthMm} mm
              </dd>
            </div>
          )}
          {tileMode && (
            <div>
              <dt>{m.effectiveCoverWidth}</dt>
              <dd>{tileMode.coverWidthMm} mm</dd>
            </div>
          )}
          {tileMode && (
            <div>
              <dt>{m.gaugeRange}</dt>
              <dd>
                {tileMode.gaugeRangeMm.min}–{tileMode.gaugeRangeMm.max} mm
              </dd>
            </div>
          )}
          <div>
            <dt>{m.wholesalerCode}</dt>
            <dd>
              <code>{preview.row.item.externalKey}</code>
            </dd>
          </div>
          <div>
            <dt>{m.netPrice}</dt>
            <dd>
              {preview.row.price
                ? m.organizationPrice(
                    new Intl.NumberFormat(i18n.language, {
                      style: 'currency',
                      currency: preview.row.price.currencyCode,
                    }).format(preview.row.price.netAmountMinor / 100),
                    m.saleUnit[preview.row.price.saleUnit] ??
                      preview.row.price.saleUnit,
                  )
                : m.priceMissing}
            </dd>
          </div>
        </dl>
        <p className="bz-technical-complete">✓ {m.technicalDataComplete}</p>
        <button
          className="a-button a-primary"
          type="button"
          onClick={() => onApply(preview.selection)}
        >
          {m.use}
        </button>
      </section>
    );
  }

  return (
    <BusinessAssortmentSearch
      kind={kind}
      onSelect={apply}
      onBrowseCatalog={onBrowseCatalog}
    />
  );
}
