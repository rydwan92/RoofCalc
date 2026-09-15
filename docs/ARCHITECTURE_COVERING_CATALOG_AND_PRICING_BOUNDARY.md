# Covering catalogue and pricing boundary

## Decision

The project document owns construction intent. A covering assignment contains roof-plane IDs, a selected installation mode when required, and a versioned technical product snapshot. It may also contain a stable catalogue reference:

```text
project assignment
  ├─ roof plane IDs
  ├─ selected installation mode ID
  └─ product selection
       ├─ catalogRef? { productId, technicalRevisionId, variantId? }
       ├─ displaySnapshot?
       └─ technicalSpecSnapshot (required)
```

The snapshot makes saved projects deterministic and usable offline. Opening an old project must not silently replace its dimensions with the newest catalogue revision.

## Ownership boundaries

- `covering-core` owns pure technical product contracts, assignment contracts, compatibility checks, and layout-strategy interfaces.
- The catalogue platform (`apps/api/src/catalog`, `apps/api/src/db/schema.ts`) owns manufacturer identity, searchable products, variants, publication state, and technical revisions (`docs/ARCHITECTURE_V24_CATALOG_MYSQL_PLATFORM.md`).
- Covering layout engines (`packages/covering-core`, `packages/roof-math`) own family-specific layout and quantity math. They consume the snapshot and neutral geometry.
- `quantity-core` aggregates resolved quantity sources. It does not select products or fetch catalogues.
- `packages/cost-core` joins resolved quantities to a cost scenario's line items; `packages/pricing-core` joins a catalogue variant to a commercial offer.
- Commercial offers (`packages/pricing-core`, `apps/api/src/db/pricing-schema.ts`) own supplier SKU, price, currency, tax context, validity, and region — never a technical dimension.
- `roof-math` owns roof geometry and remains independent of every catalogue and commercial concern.

## Revision and update policy

Catalogue updates create a new technical revision. A project keeps its existing snapshot until the user explicitly chooses to review and accept an update. That action is a canonical project transaction and must show technical differences before replacement. Display-name changes alone do not alter calculation results.

Manual products use the same `technicalSpecSnapshot` without a `catalogRef`. This keeps manual entry and catalogue selection on one calculation path.

## Future catalogue concepts

- `Manufacturer`: stable identity and display metadata only.
- `TechnicalProductFamily`: the calculation family and product identity shared by commercial finishes.
- `TechnicalProductRevision`: immutable, validated `covering-core` technical JSON plus source/provenance and publication dates.
- `CommercialVariant`: colour, coating/finish, manufacturer SKU and its relation to a technical family; changing finish does not select another geometry algorithm.
- `PriceList`: supplier/owner, currency, tax context, region and validity policy. **Implemented** in `packages/pricing-core` and `apps/api/src/db/pricing-schema.ts` (`price_lists` table).
- `PriceListEntry`: variant/SKU, sale unit, amount and validity interval. **Implemented** the same way (`price_list_entries` table), write-once per entry ID (ADR-004): an unchanged re-import is a no-op, a genuine price change requires a new entry ID, never a silent overwrite of history.

These were conceptual V21 boundaries; V21–V33's technical concepts (`Manufacturer`, `TechnicalProductFamily`, `TechnicalProductRevision`, `CommercialVariant`) are implemented in the catalogue platform, and `PriceList`/`PriceListEntry` are implemented in `pricing-core` as of V34C.

**V34B note:** the "future cost engine" above is now the pure `packages/cost-core`
(`docs/ARCHITECTURE_V34B_COSTING_MVP.md`). It joined *manual* prices to
already-trusted quantities; `CostLineSource` reserved a `price-list`
variant for exactly the `PriceList`/`PriceListEntry` join below, ahead of
that join existing.

**V34C note:** the `price-list` join now exists. `packages/pricing-core`
models `PriceList`/`PriceListEntry` against an opaque
`commercialVariantId` — it never imports `catalog-core` and never sees a
technical dimension. `apps/api/src/db/pricing-schema.ts` is a sibling table
set to the catalogue-technical `schema.ts` (not a merge into it), sharing
only the platform's DB connection pool via `apps/api/src/db/client.ts`.
`GET /api/pricing/variants` resolves the active price for a set of variant
IDs; on the web side, `apps/web/src/assembly/cost-adapter.ts` pre-fills a
covering-consumption suggestion's `unitPriceMinor`/`currencyCode` only when
every contributing tile assignment resolves to the exact same priced
variant — a mismatch leaves the price blank rather than blending two
different products' prices into one number. The first real price list
(`price-list:rabatplus-retail-2026-09`) is a dated, cited retail snapshot,
not a live feed — there is no automatic price refresh or scraping.

## Compatibility is not structural approval

Pitch and batten-gauge checks only compare declared technical constraints to canonical project values. They do not certify installation, wind/snow resistance, fastening, substrate, fire performance, waterproofing, or structural safety. Manufacturer instructions and qualified verification remain authoritative.

## API and persistence direction

V18 added no database or product endpoint. V24 exposed catalogue product and revision resources under `/api/catalog`, while the project payload continues to persist its own snapshot. V34C exposed prices as their own resource under `/api/pricing` (`GET /api/pricing/variants`), a separate route tree, separate tables, and separate caching key (`['pricing', 'variants', ids]` in the web `useQuery` cache) from the catalogue — prices are never embedded in a technical product schema or response.
