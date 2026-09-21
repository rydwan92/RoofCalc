import { useQueryClient } from '@tanstack/react-query';
import { createCatalogProductSelection } from '@cieslacalc/catalog-core';
import type { CoveringProductSelection } from '@cieslacalc/covering-core';
import type { OrganizationAssortmentRow } from '@cieslacalc/business-core';
import { catalogClient, type CatalogClient } from '../catalog/client';
import { BusinessAssortmentSearch } from './BusinessAssortmentSearch';

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
    onApply(
      createCatalogProductSelection({
        manufacturer: exact.manufacturer,
        product: exact.product,
        revision: exact.revision,
        ...(variant ? { variant } : {}),
      }),
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
