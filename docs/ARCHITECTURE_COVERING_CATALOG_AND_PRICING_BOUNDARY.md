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
- A future catalogue service owns manufacturer identity, searchable products, variants, publication state, and technical revisions.
- Future covering layout engines own family-specific layout and quantity math. They consume the snapshot and neutral geometry.
- `quantity-core` aggregates resolved quantity sources. It does not select products or fetch catalogues.
- A future cost engine joins resolved quantities to commercial offers.
- Commercial offers own supplier SKU, price, currency, tax, validity, availability, discounts, and regional terms.
- `roof-math` owns roof geometry and remains independent of every catalogue and commercial concern.

## Revision and update policy

Catalogue updates create a new technical revision. A project keeps its existing snapshot until the user explicitly chooses to review and accept an update. That action is a canonical project transaction and must show technical differences before replacement. Display-name changes alone do not alter calculation results.

Manual products use the same `technicalSpecSnapshot` without a `catalogRef`. This keeps manual entry and catalogue selection on one calculation path.

## Future catalogue concepts

- `Manufacturer`: stable identity and display metadata only.
- `TechnicalProductFamily`: the calculation family and product identity shared by commercial finishes.
- `TechnicalProductRevision`: immutable, validated `covering-core` technical JSON plus source/provenance and publication dates.
- `CommercialVariant`: colour, coating/finish, manufacturer SKU and its relation to a technical family; changing finish does not select another geometry algorithm.
- `PriceList`: supplier/owner, currency, tax context, region and validity policy.
- `PriceListEntry`: variant/SKU, sale unit, amount and validity interval.

These are conceptual V21 boundaries, not a commitment to SQL columns. A future service may store technical parameters as versioned JSON validated with the same `covering-core` Zod schema used by the web calculation path.

## Compatibility is not structural approval

Pitch and batten-gauge checks only compare declared technical constraints to canonical project values. They do not certify installation, wind/snow resistance, fastening, substrate, fire performance, waterproofing, or structural safety. Manufacturer instructions and qualified verification remain authoritative.

## API and persistence direction

V18 adds no database or product endpoint. In V21 the API may expose catalogue product and revision resources, while the project payload continues to persist its own snapshot. Prices must use separate resources and caching/version rules; they must never be embedded in technical product schemas.
