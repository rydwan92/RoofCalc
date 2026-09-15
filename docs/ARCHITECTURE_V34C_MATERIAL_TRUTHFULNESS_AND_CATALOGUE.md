# V34C — Tile Consumption Truthfulness, Real Catalogue Data, Pricing Module, Membrane Overlap Engine

Status: implemented, 2026-09-15, built on `main` at `2673583` (V34C Phases
1-3) plus the Phase 4 membrane engine landed in the same iteration.

## Definition of Ready

1. **User problem:** after reviewing the live V34B Kosztorys, the user asked
   for two closed truthfulness gaps ("zakładki" on tiles and membrane must be
   accounted for) and real manufacturer product data with real prices, with
   explicit delegated judgement on whether pricing needed its own module.
2. **Domain owner:** `apps/web/src/assembly/cost-adapter.ts` remains the sole
   place that turns already-trusted project facts into `CostSuggestion`s
   (unchanged from V34B). `packages/pricing-core` is a new pure commerce
   package, sibling to `cost-core`, never imported by geometry/quantity/
   procurement/catalogue packages. `packages/roof-math` gains the membrane
   course-fit solver, sibling to the batten solver, not a `covering-core`
   layout engine.
3. **Canonical persistence:** `RoofProjectDocumentV1` gains one additive
   optional field, `project.membraneProduct?: MembraneTechnicalSpec`
   (`docs/SCHEMA_REGISTRY.md` §1, V34C note). No `schemaVersion` bump; every
   pre-V34C project and fixture parses unchanged, with membrane's exact
   pre-V34C net-area-only behaviour.
4. **Schema / migration:** additive-only across every package. New DB tables
   (`price_lists`, `price_list_entries`, `pricing_import_batches`) are a
   purely additive migration (`migrations/0001_spooky_rocket_racer.sql`),
   never touching the existing catalogue tables.
5. **Quantity:** the covering-consumption suggestion states `execution-based`
   suitability truthfully — a manufacturer-declared range is materially
   better than a bare position count, but still not a resolved purchase
   count (waste, breakage and offcut reuse excluded). The membrane suggestion
   states `gross-area` only once every contributing plane resolves a roll
   product, and carries disclosed warning note keys (`hip-course-width-
   approximated`, `openings-not-subtracted`) rather than presenting an
   approximation as exact.
6. **Catalogue:** real manufacturer data (CREATON KODA, swissporTON DOMINO,
   Nelskamp Planum), retrieved 2026-09, cited per revision via the existing
   `CatalogImportBatchV1` pipeline — no schema change. A `coursePattern`
   default is disclosed as a straight-lay default where the manufacturer's
   installation guide does not publish one, never silently invented.
7. **Pricing:** `PriceList`/`PriceListEntry` are write-once per entry ID
   (ADR-004) — an unchanged re-import is a no-op, a genuine price change
   requires a new entry ID, never a silent overwrite of price history. The
   web layer pre-fills a price only when every contributing tile assignment
   resolves to the exact same priced variant (same amount and currency);
   a mismatch leaves the price blank rather than blending two products.
8. **Cost:** this is the layer ADR-005 reserved and V34B left as "no database
   price list exists yet." `tools/architecture/layering.test.ts` now also
   confines pricing identifiers to `pricing-core` and its allowlisted
   `apps/api/src/db` files.
9. **Offline:** unchanged — `pricing-core`/`pricing-schema.ts` require a
   reachable `DATABASE_URL`; absent one, `/api/pricing` returns 503 and the
   web app simply shows no price (same 503-graceful pattern as the catalogue).
10. **Mobile:** no new mobile-specific surface; the membrane product form and
    pricing pre-fill render inside existing responsive panels.
11. **Research:** real manufacturer sources cited per import batch entry
    (`apps/api/src/data/import-batches/{tiles,prices}-2026-09.json`); the
    membrane course-fit simplifications are named, not silently approximated
    (see §4 below).
12. **Regression:** `pricing-core` (18 tests), `apps/api/src/pricing/
    {importer,routes}.test.ts` (12), `packages/roof-math/src/membrane-
    layout.test.ts` (13), the `membrane course layout` suite in
    `roof-features.test.ts` (6), `quantity-core`'s gross-aggregation tests
    (2), and `cost-adapter.test.ts`'s consumption/price/membrane tests (7 new)
    cover the model, truthfulness rules and persistence. Full `pnpm verify`
    and `pnpm e2e` pass at the end of each phase and once at the very end.
13. **Multi-structure:** the membrane course solver runs per assigned roof
    plane independently; no change to ID vocabulary.

## 1. Boundary — Phases 1-3 (tile consumption, catalogue, pricing)

```text
RoofTileLayoutResult.declaredConsumptionReference (already computed, V26C)
      ↓ (apps/web/src/assembly/cost-adapter.ts — read-only)
CoveringConsumptionSuggestion (execution-based, min/max declared range)
      ↓ (user: Dodaj, in CostWorkspace.tsx)
CostLine (source: 'price-list' only when a matching price resolves)

CatalogImportBatchV1 (real manufacturer data) → catalog DB (unchanged pipeline)
PriceImportBatchV1 (real retail price) → pricing DB (packages/pricing-core)
      ↓ (apps/api /api/pricing/variants)
apps/web/src/pricing/{client,use-prices}.ts → Page.tsx → ExportFacts.variantPrices
      ↓ (cost-adapter.ts resolveConsumptionPrice — same-price-or-blank rule)
CoveringConsumptionSuggestion.unitPriceMinor / currencyCode
```

`pricing-core` depends on nothing but `zod`. It does not know a roof, a
covering family, or a technical product shape — `commercialVariantId` is an
opaque string, never imported from `catalog-core`.

## 2. `pricing-core` model

- **`PriceList`**: `{ id, ownerLabel, currencyCode, regionCode?, taxContext?,
  validFrom, validTo? }` — supplier/owner, currency and validity policy.
- **`PriceListEntry`**: `{ id, priceListId, commercialVariantId, saleUnit,
  netAmountMinor, validFrom, validTo? }` — integer minor units, same
  convention as `cost-core`.
- **`PriceImportBatchV1`**: mirrors `CatalogImportBatchV1`'s dry-run-by-
  default, checksum, diff-against-existing-state, `--apply`-required shape.
  Entries are write-once (`comparePriceListEntry`): identical data under an
  existing ID is a no-op, any diff is a conflict — a real price change needs
  a new entry ID.
- **`resolvePriceForVariant`/`activePriceListEntries`**: pick the entry with
  the latest `validFrom` at a given date, tie-broken by ID.

## 3. Real catalogue and pricing data (dated snapshot, not a live feed)

| Manufacturer | Product | Cover width | Gauge range | Consumption | Price | Source |
| --- | --- | --- | --- | --- | --- | --- |
| CREATON | KODA (ceramic, flat) | 260-263 mm | 393-433 mm | 9.0-9.9 szt./m² | 9.24 PLN/szt. (retail) | rabatplus.pl |
| swissporTON | DOMINO (ceramic, flat) | 224-226 mm | 343-354 mm | 12.4-13.1 szt./m² | not published | swissporton.pl |
| Nelskamp | Planum (concrete, flat) | 300 mm | 312-340 mm | 10 szt./m² | not published | ambit.gda.pl |

These are retail/technical-sheet figures observed in September 2026, cited
per revision via `sourceLabel`/`sourceUrl` on each `TechnicalProductRevision`
— never presented as an official current manufacturer price list. Each
revision's `coursePattern` is disclosed as a straight-lay default where the
manufacturer's own installation guide was not the source (only the physical
dimensions and consumption range are manufacturer-sourced).

## 4. Boundary — Phase 4 (membrane overlap/course geometry)

```text
project.membraneProduct? (MembraneTechnicalSpec, manual entry only)
      ↓ (apps/web/src/assembly/Page.tsx)
resolveMembraneLayout (roof-math) — per assigned roof plane
      ↓
SurfaceBuildUpSource.semantic: 'gross-installed' (grossAreaMm2/courseCount/rollCount)
      ↓ (quantity-core createSurfaceBuildUpRows — never blends a partial mix)
RoofSurfaceQuantityRow
      ↓ (cost-adapter.ts membraneSuggestion)
MembraneSuggestion (quantityBasis: 'gross-area', disclosed note keys)
```

`resolveMembraneCourseFit` (`packages/roof-math/src/membrane-layout.ts`)
mirrors `resolveAutoBattenSpacing`'s whole-interval-fit shape but simpler: no
gauge-range optimisation, just the minimum whole course count that covers an
eave-to-ridge span, given a fixed roll width and minimum overlap. The first
course contributes its full `rollWidthMm`; every course after it contributes
only `rollWidthMm - minimumOverlapMm` of new up-slope coverage.

`resolveMembraneLayout` wraps it per plane (mirroring `resolveBattenLayout`'s
own per-plane wrapping), living in `roof-math` rather than `covering-core`
because membrane is architecturally a **build-up layer** — like battens — not
a primary covering competing for roof-plane ownership. `MembraneTechnicalSpec`
is a schema **sibling** to `coveringTechnicalSpecSchema` in `covering-core`,
deliberately never joined into its union, for the same reason.

### Disclosed V1 simplifications — named, not silent

- **Course width uses each plane's maximum (eave) width**, not the exact
  per-station width a hip/valley plane narrows to above the eave. This
  deliberately *over-estimates* material on such planes — the safe direction
  for a purchase suggestion — tagged `hip-course-width-approximated`. Gable
  planes are exact (their eave and ridge widths are equal, verified per
  plane by comparing the two, not assumed).
- **Opening interruption is not modeled.** A course is assumed to run
  continuous under a later-framed roof window, tagged
  `openings-not-subtracted`.
- **No roll-cutting/reuse optimiser.** `rollCount` is a simple per-plane
  ceiling division (`courseLengthTotalMm / rollLengthMm`), never optimized
  across planes or courses, tagged `gross-area-no-roll-reuse` on the cost
  suggestion.

Both warning keys are per-plane facts (`MembranePlaneLayoutResult.tapers` /
`.hasOpenings`) aggregated to the top level and threaded through
`quantity-core`'s `warningKeys` into the cost suggestion's `noteKeys` — never
silently dropped between layers.

### Truthful aggregation across planes

`quantity-core`'s `createSurfaceBuildUpRows` groups every membrane source by
family key, and only sets `semantic: 'gross-installed'` (and the gross
fields) when **every** contributing source in the group already carries
gross data. A partial mix — one plane resolved, another not — falls back to
`net-geometric` for the whole group rather than inventing a partial gross
total. `cost-adapter.ts`'s `membraneSuggestion` applies the identical rule
one layer up.

## 5. Files touched

- **Phase 1** (tile consumption): `apps/web/src/assembly/{export-adapter,
  Page,cost-adapter,CostWorkspace,translations,cost-adapter.test}.ts(x)`.
- **Phase 2** (real catalogue data): `apps/api/src/data/import-batches/
  tiles-2026-09.json` (new); no code change, existing importer pipeline.
- **Phase 3** (pricing module): new package `packages/pricing-core/src/
  {model,validation,persistence,lookup,index}.ts` + `index.test.ts` (18
  tests); `apps/api/src/db/{pricing-schema,pricing-repository}.ts`;
  `apps/api/src/pricing/{repository,service,importer,routes,memory-
  repository}.ts` + tests; `apps/api/src/cli/import-pricing.ts`;
  `apps/api/src/data/import-batches/prices-2026-09.json`; `apps/web/src/
  pricing/{client,use-prices}.ts`; `drizzle.config.ts`,
  `apps/api/src/{app,server,db/client}.ts`, `tools/architecture/
  layering.test.ts` (narrowed + new pricing-boundary assertion).
- **Phase 4** (membrane engine): `packages/covering-core/src/index.ts`
  (`membraneTechnicalSpecSchema`); `packages/roof-math/src/membrane-
  layout.ts` (new) + tests; `packages/roof-math/src/roof-features.ts`
  (`resolveMembraneLayout`) + tests in `roof-features.test.ts`;
  `packages/quantity-core/src/index.ts` (gross fields) + tests;
  `packages/calculator-core/src/project-document.ts`
  (`project.membraneProduct?`); `packages/cost-core/src/{model,
  persistence}.ts` (`'gross-area'` basis); `packages/document-core/src/
  index.ts` (basis literal widened); `apps/web/src/assembly/{store,Page,
  cost-adapter,ResultBasis,translations,cost-adapter.test}.ts(x)`;
  `apps/web/src/assembly/Inspector.tsx` (manual membrane product form).
- **Cross-cutting fix**: `apps/web/src/assembly/Page.tsx`/`main.tsx` —
  `AssemblyPage` now owns its own `QueryClientProvider` (previously relied on
  `main.tsx`'s, which every unit test bypasses); discovered because the new
  pricing hook made this a real dependency for the first time.
- Docs: this file (new); `docs/adr/ADR-005-*.md`;
  `docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md`;
  `docs/ARCHITECTURE_INDEX.md`; `docs/SCHEMA_REGISTRY.md` §1;
  `docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md`;
  `docs/domain/EXECUTION_SEMANTICS_MATRIX.md` (roadmap item 4).

## 6. Known gaps / recommended next iteration

- No automatic price-refresh/scraping — the seeded price list is a one-time,
  dated, cited retail snapshot; a live price feed is a later iteration.
- No membrane catalogue/picker — manual roll entry only (roll width/length/
  minimum overlap; no material/salesUnit UI yet even though the schema
  supports them).
- No opening-aware membrane course subtraction, no hip/valley-exact course
  width, no roll-cutting/reuse optimizer across courses or planes.
- `rollCount` is per-plane only; a project with several similarly-sized
  planes could, in principle, share roll offcuts across them — not modeled.
- `pricing-core`'s `taxContext` is a label field only, no VAT/regional tax
  logic beyond what `cost-core`'s scenario-level VAT already provides.
- The membrane product is one roll product for the *entire* membrane layer
  (all assigned planes share it), not per-plane — matches how the layer is
  configured today (`buildUp.membrane.roofPlaneIds`), but a future project
  might reasonably want a different roll product per plane.
