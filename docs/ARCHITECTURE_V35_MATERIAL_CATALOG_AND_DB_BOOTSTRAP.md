# V35 — Material Catalog Generalization, Authoritative Tile Correction, Timber Stock + Pricing, First-Run DB Bootstrap

Status: implemented, 2026-09-15, built on `main` at `b75dd0f` (V34C).

## Definition of Ready

1. **User problem:** the user supplied a research handoff package
   (`RESEARCH_HANDOFF.md`, `catalog_candidates.v35.json`,
   `timber_price_observations.v35.json`) after reviewing the live V34C
   catalogue, flagging a real defect (V34C's KODA revision was
   retailer-sourced with the wrong manufacturer attribution) and asking for
   a richer tile model, a generalized catalogue that can also hold membrane
   and timber-stock products, and a deterministic first-run DB bootstrap.
2. **Domain owner:** `catalog-core` remains the one place that owns
   catalogue/revision contracts; it now also owns the general
   `CatalogTechnicalSpec` union (`docs/SCHEMA_REGISTRY.md` §10) rather than
   only covering technical specs. `apps/web/src/assembly/timber-stock-
   adapter.ts` is the *only* place a catalogue timber pick becomes a
   `procurement-core` `StockOption` — `procurement-core` itself is
   untouched.
3. **Canonical persistence:** `project.membraneProduct` widens from a raw
   `MembraneTechnicalSpec` to a `MembraneProductSelection` wrapper
   (`docs/SCHEMA_REGISTRY.md` §1, V35 note) via a backward-compatible
   normalization, not a migration. No other `RoofProjectDocumentV1` field
   changes; timber-stock picks are never persisted into the canonical
   document (they only ever pre-fill a `K1CuttingPlan.tsx` text field, the
   same as a hand-typed commercial length always could).
4. **Schema / migration:** `catalog-core`'s technical union widens
   (no DB migration — the JSON column and `covering_kind varchar(32)`
   already accepted arbitrary values). `pricing-core`'s `PriceListEntry`
   gains two additive nullable columns via a real, reviewed, committed
   migration (`migrations/0002_colorful_stranger.sql`).
5. **Quantity/procurement:** unchanged. A timber-stock catalogue pick
   becomes a plain `StockOption` with a **section-only** `stockClassId`
   (§5) — the exact same fingerprint format the pre-existing K1 adapter
   already used, so `procurement-core` needs no change and a catalogue pick
   is never silently incompatible with a K1 required piece.
6. **Catalogue:** the CREATON→swissporTON KODA rebrand is a worked example
   of ADR-004: a new family/revision under the corrected manufacturer (a
   revision's manufacturer/technical data is immutable), the old CREATON
   family flipped `active: false` (a mutable field) and never technically
   mutated — any project still citing the old revision opens identically.
   Six more real tile products, one real membrane product and four real
   timber-stock products are seeded, each cited to a real retailer/
   manufacturer source, no invented SKUs, prices, dimensions or pitch
   rules.
7. **Pricing:** two OBI/BAT timber prices are imported, both explicitly
   gross with a source-stated 23% VAT — net computed as
   `round(gross / 1.23)`, with `sourceAmountBasis`/`sourceVatRateBps`
   recorded as pure provenance (§6). Two Castorama observations with an
   unstated tax basis are deliberately **not** imported.
8. **Cost:** an MVP, read-only material-cost panel inside `K1CuttingPlan.tsx`
   joins a resolved cutting plan's stock usages against a catalogue price,
   with an explicit "verify before purchase" disclosure — the same spirit
   as V34C's Kosztorys price pre-fill.
9. **Offline:** unchanged. `DATABASE_URL` absent still yields the
   `catalog-unavailable`/`pricing-unavailable` 503-graceful pattern; every
   new picker (`MembraneProductPicker`, `TimberStockProductPicker`) offers a
   manual fallback the same way `CatalogProductPicker` already does.
10. **Mobile:** no new mobile-specific surface; the two new pickers reuse
    `MobileSheet`/`useMobileWorkbench` exactly like `CatalogProductPicker`.
11. **Research:** every new seed row cites a real source
    (`apps/api/src/data/import-batches/{tiles-2026-09-v35,membranes-2026-09,
    timber-stock-2026-09,timber-prices-2026-09}.json`); BMI Teviva's
    genuinely pitch-dependent gauge is **not** seeded, since giving it one
    unconditional `gaugeRangeMm` would misstate it.
12. **Regression:** `covering-core` (5 new tile-model tests, 4 new membrane
    tests), `catalog-core` (5 new generalized-union tests), `apps/api/src/
    catalog/importer.test.ts` (1 new mutable-update test),
    `pricing-core`/`apps/api/src/pricing` (7 new provenance/routes tests),
    `apps/web`'s new `timber-stock-adapter.test.ts` (6),
    `TimberStockProductPicker.test.tsx` (7), `MembraneProductPicker.test.tsx`
    (4), `K1CuttingPlan.test.tsx` (5, new file), `apps/api/src/catalog/
    service.test.ts` (3 new cross-kind tests), one Phase 9 BOM-readiness
    integration test. Full `pnpm verify`/`pnpm test:architecture` (25/25)
    pass; live-browser verification for every new UI surface (§10).
13. **Multi-structure:** no change to ID vocabulary; timber-stock picks
    carry no roof-geometry concept at all.

---

## 1. Boundary — Phase 1 (tile model enrichment)

`tileInstallationModeSchema` (`packages/covering-core/src/index.ts`) gains
three **additive optional** fields:

- `coverWidthRangeMm?` — a range sibling to the existing single-value,
  exact-meaning `coverWidthMm`.
- `recommendedMinPitchDeg?` — a *display/guidance* figure, distinct from
  `minPitchDeg` which keeps its exact current enforced semantics
  (`evaluateRoofTileInstallation` gates compatibility on `minPitchDeg`
  only, unchanged). When pitch is below `recommendedMinPitchDeg` but not
  below `minPitchDeg`, a new `category: 'recommendation'` issue
  (`'below-recommended-pitch'`) is added — advisory, never blocking.
- `installationRules?: Array<{id, pitchRangeDeg, gaugeRangeMm?,
  technicalConditionId?}>` — **schema and type only this iteration**, not
  wired into the compatibility solver. This is the reason BMI Teviva (whose
  real gauge genuinely depends on pitch) is not seeded: giving it one
  unconditional `gaugeRangeMm` would be dishonest, and the solver change to
  actually evaluate per-rule gauge is deferred, not silently worked around.

## 2. KODA correction — an ADR-004 worked example

The V34C KODA revision (`product:creaton:koda`) was retailer-sourced and
both wrong on dimensions and on manufacturer attribution (labeled CREATON;
the real current product is swissporTON). Since a revision's manufacturer
and technical data are immutable (ADR-004), the fix is a **new** family
under the corrected manufacturer, not an edit:

- `apps/api/src/data/import-batches/tiles-2026-09-v35.json` creates
  `product:swissporton:koda` / `revision:swissporton:koda:2026-09` with
  corrected data (304×503 mm, `coverWidthMm` 260 +
  `coverWidthRangeMm:{258,261}`, gauge 390-430 mm, 8.9-9.9 szt./m²,
  `minPitchDeg` 10, 4.6 kg, swissporton.pl).
- The old `product:creaton:koda` family flips `active: false` — a mutable
  field (`planMutable` in `apps/api/src/catalog/importer.ts`) — and its
  revision JSON is never touched. Any saved project still citing
  `revision:creaton:koda:2026-09` opens and resolves identically; the
  family only stops appearing in new catalogue searches.
- Four existing `variant:creaton:koda:*` and three `variant:swissporton:
  domino:*` are re-declared **without** their `sku` field, fixing invented
  pseudo-SKUs from V34C (e.g. `CRE-KODA-CU-NU`). This required a Drizzle
  fix: `.onDuplicateKeyUpdate({set:{...}})` silently drops an `undefined`
  value from the generated SQL instead of writing `NULL`, so a re-import
  never actually cleared a stale SKU. Fixed with an explicit
  `orNull<T>(value): T | null` helper (`apps/api/src/db/catalog-
  repository.ts`) applied to every nullable optional field in both
  `onDuplicateKeyUpdate` calls; re-verified idempotent (a third identical
  apply reports `unchanged` for every row).
- Also seeded: swissporTON SIMPLA/TITANIA/BALANCE and BMI Braas Turmalin
  (the latter with both `minPitchDeg: 10` and `recommendedMinPitchDeg: 30`
  — the exact field Phase 1 exists for). None of these four ship with
  invented commercial variants — the research names no specific finish, so
  they have zero `CommercialVariant` rows (the picker already renders a
  "Bez wariantu" option for this case).

## 3. Boundary — Phase 3 (generalized catalog technical union)

```text
packages/catalog-core/src/timber-stock-spec.ts   (new)
      +
packages/covering-core   coveringTechnicalSpecSchema  (unchanged, §3 stays narrow)
packages/covering-core   membraneTechnicalSpecSchema  (V34C, unchanged shape)
      ↓ (packages/catalog-core/src/index.ts)
CatalogTechnicalSpec = union(covering, membrane, timber-stock)
      ↓
technicalProductRevisionSchema.technicalSpec : CatalogTechnicalSpec
CATALOG_PRODUCT_KINDS = [roof-tile, modular-sheet, standing-seam, membrane, timber-stock]
```

`CatalogTechnicalSpec` (`docs/SCHEMA_REGISTRY.md` §10) is strictly **wider**
than `CoveringTechnicalSpec` (§3): every covering spec is still a valid
catalog spec, but a membrane or timber-stock spec is never a valid covering
spec — the two unions serve different boundaries on purpose, matching how
`membraneTechnicalSpecSchema` was already deliberately excluded from
`coveringTechnicalSpecSchema`'s own union in V34C. `isCoveringTechnicalSpec`
narrows the wider union back down for consumers that are covering-scoped by
construction (`CatalogProductPicker.tsx`).

The `coveringKind` field name is kept unchanged everywhere (DB column, API
query param, TypeScript field) even though its accepted values now include
`membrane`/`timber-stock` — the lowest-risk option versus a `productKind`
rename touching the DB column, every query filter and every existing test
for no functional gain. Recorded in `docs/adr/ADR-011-catalog-kind-is-
general.md`. No DB migration: `technical_product_revisions.technical_spec`
is an unconstrained `json` column and `technical_product_families.
covering_kind` is a plain `varchar(32)` — both already accepted the wider
values before any code changed.

`TimberStockTechnicalSpec` (`{schemaVersion, kind: 'timber-stock', widthMm,
depthMm, lengthMm, strengthClass?, species?, kilnDried?, planed?, treated?,
moisturePercentRange?, salesUnit}`) treats `lengthMm` as a **technical
fact**, not a commercial-variant attribute — a distinct (width, depth,
length, grade, treatment) combination is one product family with one
revision, never a shared family with size-variants. This is why the four
seeded timber-stock products are four separate families, not one family
with four variants.

## 4. Boundary — Phase 4 (membrane catalogue integration)

```text
apps/api/src/data/import-batches/membranes-2026-09.json  (DÖRKEN DELTA-MAXX PLUS)
      ↓ (unchanged CatalogImportBatchV1 pipeline)
GET /api/catalog/products?kind=membrane
      ↓ (apps/web/src/catalog/MembraneProductPicker.tsx — new, mirrors CatalogProductPicker.tsx)
createMembraneProductSelection (catalog-core)
      ↓
project.membraneProduct: MembraneProductSelection
      ↓ (apps/web/src/assembly/Page.tsx — unchanged resolveMembraneLayout call, now reads .technicalSpecSnapshot)
resolveMembraneLayout (roof-math, V34C engine, untouched)
```

`project.membraneProduct` evolves from V34C's raw `MembraneTechnicalSpec`
to a `MembraneProductSelection` wrapper — the same `{catalogRef?,
displaySnapshot?, technicalSpecSnapshot}` shape `CoveringProductSelection`
already used, so a membrane pick can carry catalogue provenance exactly
like a primary covering pick. Backward compatibility is a **normalization**
(`docs/SCHEMA_REGISTRY.md`'s own policy for this): `membraneProductFieldSchema
= z.union([membraneTechnicalSpecSchema, membraneProductSelectionSchema])
.transform(...)` accepts either the old raw-spec shape (has `kind` at the
top level) or the new wrapper, normalizing an old raw spec into
`{technicalSpecSnapshot: oldSpec}` on parse. Every pre-V35 project still
opens and shows its manual membrane product unchanged — verified both by
unit tests and by opening a real persisted V34C-shaped project in the
browser before replacing its membrane product with a catalogue pick.

`membraneTechnicalSpecSchema` also gains an additive optional
`overlapRules?: Array<{direction, minimumOverlapMm, pitchRangeDeg?,
requiresSealing?, technicalConditionId?}>` — schema only; `minimumOverlapMm`
stays the one figure `resolveMembraneCourseFit` actually uses, no engine
change. `MembraneProductPicker.tsx` mirrors `CatalogProductPicker.tsx`'s
exact structure and hand-rolled `copy = {pl, en}` i18n convention
deliberately (not `translations.ts`), reusing the already-generic
`CatalogClient`/`catalogClient` singleton — no new HTTP client class was
needed since the underlying types are already generic (§3).

## 5. Boundary — Phase 5 (timber stock catalogue + procurement adapter)

```text
apps/api/src/data/import-batches/timber-stock-2026-09.json (4 real Castorama/BAT/OBI products)
      ↓
GET /api/catalog/products?kind=timber-stock
      ↓ (apps/web/src/catalog/TimberStockProductPicker.tsx — new)
      ↓ (apps/web/src/assembly/timber-stock-adapter.ts — new)
timberCatalogItemToStockOption(pick) → procurement-core StockOption
      ↓ (K1CuttingPlan.tsx — "+ Dodaj z katalogu" button)
StockDraft row, pre-filled length + display-only source label
      ↓ (existing, unchanged run() → createCuttingPlan)
CuttingPlan
```

**A deliberate deviation from the literal V35 research prompt, and the most
significant in-flight design decision of this phase.** The prompt's own
Phase 5 text suggested folding grade and treatment into the timber
`stockClassId` fingerprint (e.g. `['timber-section', width, depth,
strengthClass, treated]`), reasoning that a treated and an untreated item
of the same section should never be fungible. Implementing that literally
would have made every catalogue-picked `StockOption` **permanently
incompatible** with the pre-existing K1 adapter's own `RequiredPiece.
stockClassId`, which is section-only
(`apps/web/src/assembly/k1-cutting-adapter.ts`, unchanged since V28) —
because `timber-model` tracks a structural member's cross-section only,
never a grade/species/treatment requirement, a `RequiredPiece` can never
state one to match against. Following the prompt literally here would not
have made purchasing safer; it would have silently broken `createCuttingPlan`
matching for every timber-stock pick.

The fix: a single shared `timberSectionStockClassId(widthMm, depthMm)`
helper (`apps/web/src/assembly/timber-stock-class.ts`), **section-only**,
used by both `k1-cutting-adapter.ts` (refactored to call it instead of its
own inline `JSON.stringify`) and the new `timber-stock-adapter.ts`. The
real safeguard against buying the wrong grade is not the fingerprint — it
is that a catalogue pick is always one explicit, human choice: the picker
shows grade/treatment/kiln-dried/moisture in its facts (§ below), and
`createCuttingPlan` never chooses between grades itself, since it only ever
sees a section.

`TimberStockProductPicker.tsx` adds one behavior the other two pickers
don't need: a **client-side section filter**. It accepts an optional
`requiredSection: {widthMm, depthMm}` prop; when K1CuttingPlan opens it, it
passes the resolved blank's exact section, and the picker only lists
catalogue items whose technical section matches — with a defense-in-depth
re-check on `apply()` (rejecting a revision whose fetched exact section no
longer matches, even though the UI already filtered it out) rather than
trusting the list filter alone. This is why picking a wrong-section item is
not just "discouraged" but structurally impossible through the picker.

The picker also derives a `commercialVariantId` for the pick when the
product has exactly one commercial variant (all four seeded timber
products do) — needed for §6's pricing join. Unlike the primary/membrane
pickers there is no variant dropdown: timber items are seeded with zero or
one variant, never a finish choice to disambiguate.

## 6. Boundary — Phase 6 (timber pricing, net/gross honesty)

```text
apps/api/src/data/import-batches/timber-prices-2026-09.json
  OBI: 139.00 PLN gross, 23% VAT stated  → netAmountMinor = round(13900/1.23) = 11301
  BAT:  69.90 PLN gross, 23% VAT stated  → netAmountMinor = round(6990/1.23)  = 5683
  (Castorama's two observations: tax basis unstated → not imported)
      ↓ (unchanged PriceImportBatchV1 pipeline, unchanged /api/pricing/variants route)
apps/web/src/pricing/{client,use-prices}.ts (unchanged)
      ↓ (K1CuttingPlan.tsx — new)
usePricesForVariants(picked variant IDs) → stockOptionId → VariantPrice map
      ↓
MaterialCost panel: per-stock-usage price, total (only when every priced
line shares one currency), "N sztang bez ceny" note, verify-before-purchase disclosure
```

`PriceListEntry` gains two additive optional fields,
`sourceAmountBasis?: 'net' | 'gross'` and `sourceVatRateBps?: number`
(`docs/SCHEMA_REGISTRY.md` §11) — pure provenance, never read back into any
computation. `netAmountMinor` stays the one number everything downstream
uses and is always already-net; the two new fields only record whether the
*source* priced net or gross and at what stated rate, so a net figure
derived from a gross retail price stays auditable to that source without
`pricing-core` ever inferring a VAT rate from free text. Migration
`0002_colorful_stranger.sql` adds the two matching nullable columns to
`price_list_entries` — reviewed, committed, applied.

The web-side join in `K1CuttingPlan.tsx` is deliberately per-`stockUsage`
(one line per physical purchased piece via `plan.stockUsages[].
stockOptionId`), not per-length via `aggregateStockRequirements()` alone —
grouping by length only would lose which catalogue variant (and therefore
which price) a given purchased piece actually came from, which matters the
moment two differently-priced items of the same length exist (as OBI's
treated and BAT's untreated 45×145×4000 both do). A `StockDraft` row's
`commercialVariantId`/`sourceLabel` are cleared together the moment its
`length` is hand-edited, since an edited length is no longer accurately
described by either.

Live-verified end to end: with the K1 section and roof geometry temporarily
adjusted so the resolved blank fits within a seeded 4 m length, picking the
OBI-treated item and running the plan produced 14 stock items × 113,01 zł =
**1582,14 zł**, matching `netAmountMinor` exactly, with the disclosure text
rendered and no console errors.

## 7. First-run DB bootstrap (both variants)

Two ways to reach a fully seeded database from zero:

- **Docker Compose** (`compose.yaml`, new): MariaDB 10.11 — pinned to
  match `.github/workflows/ci.yml`'s already-proven `catalog-database` job
  exactly, not the plan's originally-sketched 11.8, since matching a
  service CI already exercises beats an arbitrary newer pin — on host port
  **3307** (never 3306, so it never collides with an existing local XAMPP
  install), named volume, UTF8MB4, the identical
  `healthcheck.sh --connect --innodb_initialized` healthcheck CI uses.
  Credentials come only from `.env` (`MARIADB_ROOT_PASSWORD`/
  `MARIADB_PASSWORD` have no built-in default, so `docker compose up` fails
  loudly rather than starting with a guessable password). `pnpm db:up` /
  `pnpm db:down` at the repo root.
- **Any reachable `DATABASE_URL`** (including an existing local XAMPP
  MariaDB on 3306): `pnpm --filter @cieslacalc/api db:bootstrap` runs
  `db:wait` (a `SELECT 1` retry loop with backoff — `apps/api/src/cli/
  wait-for-db.ts`, new; nothing like it existed before, and it matters
  because a fresh Compose container accepts TCP before its own healthcheck
  condition is true) → `db:migrate` (existing, unchanged) → `db:seed`
  (`seed-all.ts`, new — applies all six import batches in one deterministic
  order: tiles-2026-09 → tiles-2026-09-v35 → membranes-2026-09 →
  timber-stock-2026-09 → prices-2026-09 → timber-prices-2026-09, each
  through the existing importer classes, idempotent on every re-run) →
  `db:smoke-check` (`smoke-check.ts`, new — counts manufacturers and each
  seeded kind, reads the corrected KODA revision end-to-end through the
  canonical schema, confirms the seeded OBI timber price resolves; exits
  non-zero on any gap). Root `pnpm dev:full` = `pnpm db:bootstrap && pnpm dev`.

**Verified**: the full `wait → migrate → seed → smoke-check` chain was run
against a genuinely empty, freshly created throwaway database on the local
XAMPP MariaDB instance (`cieslacalc_bootstrap_test`, dropped afterward) and
produced `{"ok": true, "counts": {"manufacturers": 6, "roof-tile": 7,
"membrane": 1, "timber-stock": 4, "timberPriceEntries": 1}, "problems": []}`
— proving the XAMPP-compatible path genuinely works from zero, not just
against an already-migrated database. `compose.yaml`'s YAML was validated
for syntax (`js-yaml`) and its shape reviewed against the Compose spec, but
**its live `docker compose up` path could not be exercised on this
machine** — Docker is not installed here. This is a known, explicitly
disclosed verification gap, not a claim that the Docker path was proven.

## 8. API/UI catalogue filtering (verification pass)

Phase 3 already widened the search-query `kind` enum and Phases 4/5 each
build their own kind-filtered picker, so this phase is a verification pass
rather than new product code: `apps/api/src/catalog/service.test.ts` gained
three tests proving `?kind=membrane` and `?kind=timber-stock` round-trip
through search→detail→revision exactly like `roof-tile` always has, and
that no kind leaks into another's filtered results — on top of each
picker's own component test already asserting it only ever sends its own
`kind` to `searchProducts`.

## 9. Cost/BOM/Export readiness (verification only, no new UI)

`apps/web/src/assembly/cost-bom-readiness.test.ts` (new) walks a real K1
requirement → a real `createCuttingPlan` → `aggregateStockRequirements()`
→ a price join, in the test itself (deliberately — no product code
performs this join yet, since no BOM/export UI exists), confirming every
field a future BOM line would need is already present end to end: stock
option ID, section, purchased length, quantity, unit price, currency,
computed line total and price-source basis. Covering picks already carry
manufacturer/model/variant + revision (V34C); membrane's
`MembraneProductSelection` (§4) carries the same shape. No new UI was
built for this phase, matching the prompt's own instruction.

## 10. Files touched

- **Phase 1**: `packages/covering-core/src/{index,roof-tile-installation,
  index.test,roof-tile-installation.test}.ts`.
- **Phase 2**: `apps/api/src/data/import-batches/tiles-2026-09-v35.json`
  (new); `apps/api/src/db/catalog-repository.ts` (`orNull` helper);
  `apps/api/src/catalog/importer.test.ts`.
- **Phase 3**: `packages/catalog-core/src/timber-stock-spec.ts` (new),
  `index.ts`, `index.test.ts`; `apps/api/src/catalog/repository.ts`;
  `apps/web/src/catalog/CatalogProductPicker.tsx`; `docs/adr/ADR-011-
  catalog-kind-is-general.md` (new).
- **Phase 4**: `apps/api/src/data/import-batches/membranes-2026-09.json`
  (new); `packages/covering-core/src/index.ts` (`overlapRules?`,
  `MembraneProductSelection`); `packages/catalog-core/src/index.ts`
  (`createMembraneProductSelection`); `packages/calculator-core/src/
  project-document.ts` + test; `apps/web/src/assembly/{Page,Inspector,
  store,translations,Page.test}.ts(x)`; `apps/web/src/catalog/
  MembraneProductPicker.tsx` + test (new).
- **Phase 5**: `apps/api/src/data/import-batches/timber-stock-2026-09.json`
  (new); `apps/web/src/assembly/timber-stock-class.ts` (new),
  `timber-stock-adapter.ts` + test (new), `k1-cutting-adapter.ts`
  (refactored to the shared helper); `apps/web/src/catalog/
  TimberStockProductPicker.tsx` + test (new); `apps/web/src/assembly/
  K1CuttingPlan.tsx` (+ `.test.tsx`, new file) — "+ Dodaj z katalogu" wiring.
- **Phase 6**: `packages/pricing-core/src/{model,persistence,index.test}.ts`;
  `apps/api/src/db/{pricing-schema,pricing-repository}.ts`;
  `migrations/0002_colorful_stranger.sql` (new);
  `apps/api/src/data/import-batches/timber-prices-2026-09.json` (new);
  `apps/api/src/pricing/routes.test.ts`; `apps/web/src/assembly/
  K1CuttingPlan.tsx` (`MaterialCost` panel, `usePricesForVariants` wiring).
- **Phase 7**: `compose.yaml` (new); `.env.example`; root `package.json`
  (`db:up`/`db:down`/`db:bootstrap`/`dev:full`); `apps/api/package.json`
  (`db:wait`/`db:seed`/`db:smoke-check`/`db:bootstrap`); `apps/api/src/cli/
  {wait-for-db,seed-all,smoke-check}.ts` (new); `apps/api/tsup.config.ts`.
- **Phase 8**: `apps/api/src/catalog/service.test.ts`.
- **Phase 9**: `apps/web/src/assembly/cost-bom-readiness.test.ts` (new).
- Docs: this file (new); `docs/SCHEMA_REGISTRY.md` §1/§3/§4/§5/§10/§11
  (new + updated); `docs/ARCHITECTURE_INDEX.md`; `docs/adr/ADR-011-
  catalog-kind-is-general.md` (new); `README.md`.

## 11. Known gaps / consciously deferred

- **`installationRules` is schema-only.** BMI Teviva's genuinely
  pitch-dependent gauge is not seeded rather than approximated with a
  single unconditional range; wiring `installationRules` into
  `resolveInstallationMode`'s compatibility engine is a real solver change,
  left for a later iteration.
- **The Docker Compose bootstrap path is reviewed, not live-tested** —
  Docker is not installed on this development machine. The XAMPP-compatible
  path (identical `db:bootstrap` script, any reachable `DATABASE_URL`) was
  proven from a genuinely empty database (§7).
- **Timber-stock manufacturer attribution is a neutral placeholder**
  (`manufacturer:generic-sawn-timber`, "no identified mill") — the
  retailer sources named the product, not a real producer; this is
  disclosed in the manufacturer's own name and source labels, never
  presented as an identified mill.
- **No timber price feed and no free-text VAT inference** — the two
  imported timber prices are a one-time, dated, cited retail snapshot with
  an explicitly source-stated VAT rate; a live price feed or a VAT-from-
  free-text heuristic is out of scope.
- **`MaterialCost`'s per-line total assumes one shared currency** across
  every priced stock usage in a single plan; a mixed-currency plan (not
  possible with today's single-supplier seed data) would show no blended
  total rather than a misleading one, matching V34C's own
  same-price-or-blank rule for tile consumption.
- **No BOM/export UI was built** (Phase 9 is verification-only by design);
  a future Cost/BOM/Export pass has a proven data shape to build on, not a
  finished feature.
