# ADR-005 — Geometry, quantity, procurement and commerce are separate layers

## Status

Accepted. Extended in V26 to name procurement as its own layer.

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
- **Commerce** (not implemented) will join a plan and resolved quantities to
  price lists, waste factors, labour and tax in its own package.

Physical technical values (effective width, module length, minimum pitch, kerf,
stock length) belong below commerce. Commercial values (price, currency,
discount, VAT, supplier terms, availability *policy*) belong to commerce.
`salesUnit` is a labelling hint and carries no price.

## Consequences

- A Cost Engine can be added without touching a solver.
- Quantity output is *geometric evidence*, not a purchase list; procurement
  output is a *physical plan*, not a quotation.
- `tools/architecture/layering.test.ts` fails the build if a pricing identifier
  appears in a geometry, quantity, procurement or catalogue-technical package.
