# ADR-005 — Geometry, quantity, procurement and commerce are separate layers

## Status

Accepted. Extended in V26 to name procurement as its own layer. Extended in
V34B/V34C to implement the commerce layer itself: `cost-core` (line-item
estimation) and `pricing-core` (price lists), both previously only named as
"not implemented" below.

## Context

The roadmap ends in estimating: waste factors, labour, transport, margin, VAT,
customer quotations. The cheapest way there is to let a price leak into the
geometry layer — a "price per m²" beside an area, a "sale unit" branch inside a
solver. Every such leak makes the geometry engine untestable without commercial
fixtures and unusable for anyone who only wants dimensions.

V26 added a fourth concern: turning exact physical requirements into a stock
cutting plan. That is neither geometry nor commerce, and merging it into either
would be the same mistake in a new place.

## Decision

Four layers, in one direction:

```text
Geometry  →  Quantity  →  Procurement  →  Commerce
```

- **Geometry** (`roof-math`, `covering-core`, `calculator-core`,
  `timber-model`, `drawing-engine`) resolves shapes, members, cuts and covering
  placement. It knows physical product dimensions, never commercial ones.
- **Quantity** (`quantity-core`) aggregates resolved geometry into schedule rows
  through neutral source contracts. It selects no product and fetches nothing.
- **Procurement** (`procurement-core`) turns explicit required fabrication
  blanks and available stock lengths into a cutting plan. It knows kerf, trims,
  remnants and availability — physical facts — and no prices.
- **Commerce** (`cost-core`, `pricing-core`) joins a plan and resolved
  quantities to price lists, waste factors, labour and tax, in packages of
  its own. `cost-core` models a cost scenario's line items, quantity basis
  and suitability; `pricing-core` models supplier price lists and their
  entries against an opaque commercial-variant ID — it never imports
  `catalog-core` and carries no technical product shape. Neither package is
  imported by any geometry, quantity or procurement package, and
  `apps/api/src/db/pricing-schema.ts` is a sibling table set to the
  catalogue-technical `schema.ts`, not a merge into it (see
  `docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md`).

Physical technical values (effective width, module length, minimum pitch, kerf,
stock length) belong below commerce. Commercial values (price, currency,
discount, VAT, supplier terms, availability *policy*) belong to commerce.
`salesUnit` is a labelling hint and carries no price.

## Consequences

V58 extends the existing commerce persistence exception to
`apps/api/src/db/workspace-schema.ts`: customer/estimation/quote/auth tables
are separate from catalogue-technical tables. Quote JSON and currency belong
there; technical project snapshots remain unmodified documents. This changes
no dependency direction and allows no money in geometry or catalogue schema.

- The Cost Engine (`cost-core`, `pricing-core`) was added without touching a
  solver, confirming the layering held under real pressure.
- Quantity output is *geometric evidence*, not a purchase list; procurement
  output is a *physical plan*, not a quotation.
- `tools/architecture/layering.test.ts` fails the build if a pricing identifier
  appears in a geometry, quantity, procurement or catalogue-technical package
  — `pricing-schema.ts`/`pricing-repository.ts` are the one explicitly
  allowlisted exception inside `apps/api/src/db`, since they are the
  commerce layer's own tables sharing the platform's DB connection.
