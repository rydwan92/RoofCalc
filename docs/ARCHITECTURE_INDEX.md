# RoofCalc / CieślaCalc — Architecture Index

**This is the current-state map, after V46.** Read it after `PROJECT_BLUEPRINT.md`
and before touching code. It describes what exists today, not the history of how
it got here. Historical `ARCHITECTURE_V*.md` documents stay authoritative for the
subsystem they introduced and should be opened only when changing that subsystem.

Canonical unit everywhere: **millimetres**. Display units are presentation only.

---

## 1. The pipeline

```text
design geometry            roof template → skeleton, planes, openings
        ↓
execution / fabrication    cuts, joints, opening framing, resolved build-up
        ↓
exact physical requirement one indivisible fabrication blank per physical member
        ↓
quantity                   schedule rows: counts, lengths, areas, coverage positions
        ↓
procurement                stock selection, cut placement, kerf, trims, remnants
        ↓
documentation              typed evidence → selected print pages / offline PDF
        ↓
cost estimate               V34B — suggested/manual lines, prices, VAT, totals
                             V34C — real catalogue prices, execution-based
                             tile consumption, gross membrane course area
```

Each stage consumes only the stage above it, and adds one kind of fact.

> **`procurement-core` does not infer installation or fabrication rules.**
> It receives explicit required blank lengths and stock options, and returns a
> cutting plan. It never derives an allowance, an overlap, a waste factor or a
> product rule, and it never parses an upstream reference (ADR-009, ADR-010).

The layers are enforced, not merely described: `tools/architecture/*.test.ts`
fails `pnpm verify` when the code stops matching them.

---

## 2. Packages

Dependency direction is **downward only**.

| Package | Responsibility | Depends on |
| --- | --- | --- |
| `timber-model` | Pure type vocabulary: sections, members, skeletons, templates, build-up, features. No logic, no dependencies. | — |
| `roof-math` | The geometry engine. Templates → resolved roofs, skeletons, rafters, hips, jacks, cuts, plane bases, roof surfaces, battens, counter-battens, opening framing. **Generates and owns roof-plane IDs.** **V34C** adds the membrane build-up layer's course-fit solver (`resolveMembraneCourseFit`, `resolveMembraneLayout`), mirroring the batten solver's own shape and home — a membrane never enters `covering-core`'s layout engines, since it is a build-up layer, not a primary covering. | `timber-model`, `zod` |
| `drawing-engine` | Renderer-neutral projection: lanes, dimensions, interaction hit-testing, measurement. Produces view models, not DOM. **V38** extracts `createTimberPrismBasis` so the 2D faces and the 3D solid share one orientation formula. | — |
| `technical-scene` | **V38.** The renderer-neutral technical scene: `TechnicalScene`/`TechnicalSceneEntity` DTOs, the roof→scene adapter, pure camera framing and the visibility policy. Consumes resolved geometry; runs no solver and knows no renderer. **V39** adds the `extruded-profile` primitive (a finished, already-machined timber) plus optional counter-batten, unresolved-hip-boundary and finished-member inputs. | `timber-model`, `drawing-engine` |
| `covering-core` | Covering technical product schemas and the four family layout solvers (tile, fixed modular sheet, standing seam, cut-to-length), plane-ownership resolution, and the quantity bridge. **V34C** adds `membraneTechnicalSpecSchema`/`MembraneTechnicalSpec` — a schema **sibling** to `coveringTechnicalSpecSchema`, deliberately never joined into its union. | `zod` |
| `calculator-core` | Composition layer: assembly resolution, member instances, fabrication packages, detail previews, and the canonical `RoofProjectDocumentV1`. **V34C** adds the additive optional `project.membraneProduct?: MembraneTechnicalSpec` field. | `roof-math`, `timber-model`, `covering-core`, `drawing-engine`, `shared` |
| `quantity-core` | Aggregates neutral quantity sources into the member/material schedule. Knows nothing about products, procurement or prices. **V34C** adds optional gross build-up fields (`grossAreaMm2`, `courseCount`, `rollCount`, `semantic: 'gross-installed'`) alongside the always-present net area — exposed only once every contributing plane resolves a roll product, never blended from a partial mix. | `timber-model` |
| `catalog-core` | Pure catalogue contracts: manufacturers, product families, immutable technical revisions, commercial variants, import batch, read-API payloads. Reuses `covering-core` technical schemas rather than redefining them. **V35** widens the catalogue boundary from covering-only to a general technical material catalogue: `CatalogProductKind`/`CatalogTechnicalSpec` also accept `membrane` and the new `timber-stock` (own `timber-stock-spec.ts`, no roof-plane geometry concept at all). `coveringKind` keeps its field/column name (ADR-011). | `covering-core`, `zod` |
| `procurement-core` | **V26.** Pure timber cutting/stock planning over explicit required blanks. Indivisible blanks, kerf, stock end trims, reusable remnants, finite availability, three objectives, bounded search with deterministic fallback and honest optimality status. | **nothing — zero dependencies** |
| `document-core` | **V30.** Pure typed execution-document sections, source identity, deterministic order and readiness filtering. No solver or renderer. Its V34B `cost-estimate` section carries only plain numbers/strings; V34C widens its `basis` literal to include `'gross-area'`. | **nothing — zero dependencies** |
| `cost-core` | **V34B.** Pure commerce layer: integer-minor-unit money, typed quantity/unit, named `CostQuantityBasis` and `CostSuitability` (never a confidence score), `CostLine`/`CostScenario`, deterministic line/VAT rounding and scenario totals. Knows no product, geometry, procurement or translation. **V34C** adds `'gross-area'` to `CostQuantityBasis` (a gross, overlap-inclusive area is never blended with a net one) and the `'price-list'` `CostLineSource` is now a real join, not just reserved. | `zod` |
| `pricing-core` | **V34C.** Pure commerce layer, sibling to `cost-core`: `PriceList`/`PriceListEntry` against an opaque `commercialVariantId` (never imports `catalog-core`, never sees a technical dimension). Write-once entries (ADR-004) — an unchanged re-import is a no-op, a genuine price change needs a new entry ID. **V35** adds additive `sourceAmountBasis?`/`sourceVatRateBps?` provenance fields — pure record-keeping; `netAmountMinor` stays the one number everything downstream uses and is always already-net. | `zod` |
| `project-core` | `ProjectRecordV1` envelope, lifecycle helpers, JSON import/export and the `ProjectRepository` interface. No browser, no React, no i18n. | `calculator-core`, `zod` |
| `shared` | Cross-cutting DTOs shared by web and API. | — |
| `ui` | Semantic design tokens (`--ui-*`) and a few primitives. | `react` (peer) |
| `apps/web` | React workbench: Zustand store, canvases, inspectors, i18n, local persistence, catalogue client. **V38** adds `assembly/scene3d/` — the lazily loaded Three.js technical viewport, the only place in the repository allowed to import a renderer. **V34C** adds `apps/web/src/pricing/` (HTTP client + `usePricesForVariants`) and a manual membrane-product entry form in the layers inspector. **V35** adds `MembraneProductPicker.tsx`/`TimberStockProductPicker.tsx` (mirroring `CatalogProductPicker.tsx`'s DI/i18n pattern), `assembly/timber-stock-class.ts` + `timber-stock-adapter.ts` (the web-layer bridge from a catalogue timber pick into `procurement-core`'s pure `StockOption`), and an MVP read-only material-cost panel inside `K1CuttingPlan.tsx`. | the packages above |
| `apps/api` | Express read-only catalogue API, Drizzle/MySQL repository, canonical importer, CLI. **V34C** adds a sibling `/api/pricing` route tree, `apps/api/src/pricing/`, and `apps/api/src/db/pricing-schema.ts` (a table set sibling to the catalogue-technical `schema.ts`, sharing only the DB connection pool). **V35** adds a deterministic first-run bootstrap CLI (`wait-for-db.ts`, `seed-all.ts`, `smoke-check.ts`) and a root `compose.yaml` (MariaDB, Docker variant). | `catalog-core`, `covering-core`, `pricing-core`, `shared` |

**Never**: a package importing an app; **any** package importing `three` or
`@react-three/*`, or `apps/web` importing one outside
`apps/web/src/assembly/scene3d/`; `technical-scene` importing React/DOM/a
renderer/a solver; `roof-math` importing React/DOM/Express/
database; `covering-core` importing React/DOM/Express/Drizzle/mysql2;
`quantity-core` importing UI, a database or the catalogue; `catalog-core`
importing Drizzle/Express/React/UI; `project-core` importing i18n, React or
`localStorage`; `procurement-core` importing **anything**; `roof-math`,
`covering-core`, `quantity-core`, `procurement-core`, `catalog-core` or
`timber-model` naming a pricing concept (`priceList`, `unitPrice`, `vatRate`,
`currencyCode`, …) — enforced by `tools/architecture/layering.test.ts`'s
"commercial boundary" tests (ADR-005); `cost-core` importing React, DOM, i18n,
a roof-geometry package, `quantity-core` or `procurement-core`; `pricing-core`
importing `catalog-core`, React, DOM, i18n or a roof-geometry package;
`apps/api/src/db/schema.ts` (the catalogue-technical tables) naming a pricing
concept — `apps/api/src/db/pricing-schema.ts`/`pricing-repository.ts` are the
one explicitly allowlisted exception inside `apps/api/src/db`, since they are
the commerce layer's own tables sharing the platform's DB connection.

`procurement-core` is deliberately **not** wired into `quantity-core` or
`RoofProjectDocumentV1`. A V28 web application adapter connects only proven,
whole K1 fabrication blanks to `RequiredPiece[]` and the Material Schedule
opens that K1-only planner. Other member families remain outside this pilot.
V30's lazy web export adapter reads that existing K1 result and current plan;
`document-core` never imports procurement or geometry.

V31 adds no package dependency and no schema. `apps/web` owns the transient
Creator start draft, derived guidance and the family → source → product covering
flow. Confirmed values still enter the existing roof and covering contracts.

V32 adds no package dependency. It adds two additive optional fields inside
`project.roof` (roof structural system, K1 ridge connection — see
`docs/SCHEMA_REGISTRY.md` §1 and `docs/ARCHITECTURE_V32_STRUCTURAL_SYSTEMS_AND_EXECUTION.md`)
and one new `SkeletonMemberKind` (`collar-tie`, schedule family `C1`). The
collar tie is schedule/drawing-only — it never enters `RoofFabricationPackage`
or K1-style procurement. A `half-lap` ridge connection deliberately never
resolves a K1 fabrication blank; `direct-meeting` and `ridge-board` do.

V33 adds no package dependency. `apps/web` is the sole composition boundary
from a trusted roof-tile technical snapshot to neutral batten gauge constraints.
`roof-math` owns the pure integer whole-course solver and per-plane station
results; it does not import covering concepts. `BattenLayoutSpec.mode?` is an
additive optional intent (`manual | auto-from-covering`), with absence retaining
the pre-V33 manual behaviour. Hip counter-battens now resolve physical K1/J1
axes and opening interruptions while H1 boundary connection detail remains an
explicit structured partial result. See
`docs/ARCHITECTURE_V33_ROOF_BUILDUP_INTELLIGENCE.md`.

V34A adds snapshot-only tile installation authority/capability in `covering-core`
and derived batten decision status in the web composition. A single mode is
unambiguous; multiple modes require selection. Eave/ridge references stay manual
project inputs. Per-plane explanations are carried by the V33 solver result and
copied to typed execution evidence. No persisted schema or dependency changes.
See `docs/ARCHITECTURE_V34A_ROOFING_INSTALLATION_INTELLIGENCE.md`.

V34B adds the pure `cost-core` package (commerce layer, ADR-005) and a
sidecar-persisted `CostScenarioV1` per project (`docs/SCHEMA_REGISTRY.md` §9),
outside `RoofProjectDocumentV1`/`ProjectRecordV1` and roof history. A new
`apps/web/src/assembly/cost-adapter.ts` is the only place that turns already-
trusted facts (K1 cutting plan, battens, counter-battens, membrane) into
priceable suggestions; covering coverage positions/panel runs are deliberately
never auto-priced. `document-core` gains one more section, `cost-estimate`,
consumed by the existing V30 export/print pipeline; `cost-core` is not wired
into `quantity-core`, `procurement-core` or the catalogue. See
`docs/ARCHITECTURE_V34B_COSTING_MVP.md`.

V34C closes two truthfulness gaps V34B deliberately left open and fills in the
pricing boundary ADR-005 reserved but never implemented. (1) The
covering-consumption cost suggestion now surfaces a manufacturer-declared tile
consumption range (via `declaredConsumptionReference`, already computed by
`resolveRoofTileLayout` since V26C but never surfaced) as `execution-based`
instead of a bare `manual-required` position count, and pre-fills a catalogue
price only when every contributing assignment resolves the exact same priced
variant. (2) A new `packages/pricing-core` + `apps/api/src/db/pricing-schema.ts`
implement `PriceList`/`PriceListEntry`, kept structurally separate from
`catalog-core` (ADR-005) but sharing its DB connection pool, with a real seeded
price list (a dated, cited retail snapshot — no live price feed). (3) A new
membrane course-fit solver (`resolveMembraneLayout` in `roof-math`) turns an
optional manually-entered roll product (`project.membraneProduct`) into a
gross, overlap-inclusive course area — disclosed as approximated on hip/valley
planes and not opening-aware, never silently presented as exact. The real
catalogue was also seeded with three manufacturers' actual tile data (CREATON
KODA, swissporTON DOMINO, Nelskamp Planum), retrieved 2026-09 and cited per
revision. See `docs/ARCHITECTURE_V34C_MATERIAL_TRUTHFULNESS_AND_CATALOGUE.md`.

V35 does four things. (1) It enriches the roof-tile technical model with
optional `coverWidthRangeMm`/`recommendedMinPitchDeg`/`installationRules`
(schema only this iteration — not wired into the compatibility solver) and
corrects a research-debt defect: the KODA revision seeded in V34C was
retailer-sourced with the wrong manufacturer (CREATON instead of the real
current swissporTON) — handled as ADR-004's mutable-vs-immutable rules
intend, a wholly new family/revision under the corrected manufacturer, with
the old CREATON family flipped `active: false` and never technically
mutated. Six more real tile products are seeded (swissporTON SIMPLA/
TITANIA/BALANCE, BMI Braas Turmalin). (2) `catalog-core` generalizes from a
covering-only catalogue to a general technical material catalogue —
`CatalogTechnicalSpec` also accepts `membrane` and a new `timber-stock`
kind, with `coveringKind` keeping its field/column name for compatibility
(ADR-011, `docs/SCHEMA_REGISTRY.md` §10). No DB migration was needed (the
technical-spec JSON column and `covering_kind varchar(32)` already accepted
arbitrary values). (3) A real membrane product (DÖRKEN DELTA-MAXX PLUS) and
a `MembraneProductPicker` reuse the V34C membrane engine unchanged;
`project.membraneProduct` evolves from a raw spec to a
`MembraneProductSelection` wrapper (catalogue provenance, like a covering
pick) via a backward-compatible normalization, not a migration (`docs/
SCHEMA_REGISTRY.md` §1). A timber-stock catalogue (4 real Castorama/BAT/OBI
products) bridges into `procurement-core`'s pure `StockOption` through a
new `apps/web` adapter — `stockClassId` stays **section-only**, matching
the pre-existing K1 adapter's own fingerprint exactly, so a catalogue pick
is never permanently incompatible with a K1 required piece; grade/
treatment are surfaced to the human in the picker instead, never folded
into the physical matching key. (4) Timber pricing adds explicit net/gross
provenance (`sourceAmountBasis`/`sourceVatRateBps`, §11) so a net price
computed from a source-stated-gross retail figure stays auditable, and a
deterministic first-run DB bootstrap (`compose.yaml` + `wait-for-db.ts` /
`seed-all.ts` / `smoke-check.ts`) brings a fresh machine from zero to a
fully seeded, price-joinable database with one command, working against
either a bundled Docker MariaDB or an existing local XAMPP instance. See
`docs/ARCHITECTURE_V35_MATERIAL_CATALOG_AND_DB_BOOTSTRAP.md`.

V39 closes three execution gaps. (1) The hip counter-batten boundary stops
being a permanent `partial`: research found two well-evidenced, mutually
exclusive details and no basis for a default, so `CounterBattenLayoutSpec`
gains an additive-optional `hipBoundaryDetail` and the resolver either adds two
runs per hip or none — never a guessed one. Its result now separates
`interiorAxisCount` from `hipBoundaryRunCount` and reports every
`hipBoundaries[]` entry, decided or not. (2) `JackToHipConnection`
`hip-face-butt` resolves J1's finished end against the hip's vertical side face
(`hipWidthMm / √2`, then along the jack axis) **without overwriting** the
reference centre-plane geometry; `executionStatus` distinguishes
`reference-only` from `fabrication-resolved`, and neither becomes a procurement
blank. (3) A new `roof-math/finished-rafter-solid.ts` places the already-machined
K1 profile in 3D — extruded, never boolean-subtracted — so the technical scene
can show the real birdsmouth and ridge cut while H1/J1 stay honestly
reference-only. Material Plan, Cost and Export needed no change: they already
consume the resolver's own status. See
`docs/ARCHITECTURE_V39_EXECUTION_GEOMETRY_AND_HIP_BOUNDARY.md`.

V42 keeps one MariaDB/MySQL + Drizzle + mysql2 schema. Local Node reads a
private `DATABASE_URL`; the Cloudflare Worker uses Hyperdrive and the same
repositories/services through a shared HTTP handler. V42 adds an optional
metal-sheet batten gauge distinct from physical module length and additive
metal/price seeds. The immutable V39 T18 revision remains stored, while its
mutable family is inactive for new selections. See
`docs/ARCHITECTURE_V42_SHARED_DEV_AND_METAL.md` and
`docs/CLOUDFLARE_SEOHOST_V42.md`.

V44 hardens trust rather than adding modules: independent oracle,
metamorphic and symmetry tests for K1, H1, roof areas, membrane and battens;
reference acceptance numbers for six fixtures; 0.1 cm display precision with
shared angle/metre/area formatters; a Quick result panel with drawing
highlight and reusable "Jak policzono?" evidence; one source vocabulary
(`SourceBadge`), one status vocabulary and a reference/execution geometry
badge. See `docs/ARCHITECTURE_V44_CALCULATOR_TRUST_AND_UX.md`.

V45 connects local Node and the Cloudflare Worker to one shared alwaysdata
MariaDB DEV database (the SEOHost candidate is historical): a single
`DATABASE_URL` parser with verified TLS for remote hosts, a read-only
network/auth/grants doctor, health reporting
`connected | unavailable | not-configured`, a committed `wrangler.jsonc` for
Workers Builds and a read-only Node-vs-Worker parity test. See
`docs/ARCHITECTURE_V45_SHARED_DEV_DATABASE_AND_HYPERDRIVE.md`.

V46 keeps coverings and build-up layers in sync with the roof template:
`calculator-core/plane-scope.ts` reconciles plane scopes on a roof-type
switch in the same history entry, a one-step "Dopasuj pokrycie i łaty do
dachu" repair removes the batten dead end, the first covering creates Auto
battens, an independent overlap audit locks reference numbers, and the
covering scheme gains ridge/hip/eave context and course labels. See
`docs/ARCHITECTURE_V46_COVERING_SYNC_REPAIR_AND_SCHEME.md`.

V43B turns covering → battens → counter-battens into one workflow. The batten
quantity audit found no solver error but a silent application defect: repair
and first-layer creation copied a one-plane covering scope into the batten
layer, so a hip showed ~27 % of its battens. Layers now follow the whole roof,
the resolver reports scope and per-plane evidence, dangerous 350/250 fallbacks
are centralised in `build-up-defaults.ts`, and one derived `batten-workflow.ts`
projection (Auto/Manual ownership, covering validation, hip-detail state)
feeds the covering block, Warstwy summary, composite installation plan,
guidance, Material Plan note and export. Tile pitch rules and a derived
covering support capability live in `covering-core`. See
`docs/ARCHITECTURE_V43B_COVERING_AND_BATTEN_WORKFLOW.md`.

V38 adds the pure `packages/technical-scene` package and a second renderer for
the same resolved project. One adapter turns the already-resolved
`RoofSkeleton` into renderer-neutral `TechnicalScene` DTOs in canonical
millimetres and the roof's own Z-up coordinates — no axis swap, no unit change,
no re-derived geometry — and a lazily loaded Three.js viewport in
`apps/web/src/assembly/scene3d/` renders them. Selection is shared with the 2D
canvas through one `resolveMemberRefVisualState` rule and one `select()`
action; there is no 3D selection state. `three` is the only new runtime
dependency (React Three Fiber was benchmarked and rejected: its stable peer
range excludes the React 19.3 this app resolves), it loads behind a dynamic
import so the initial bundle grows by ~4 KB raw / ~0 KB gzipped, and an
architecture test confines it to that one folder. Every solid is reference
geometry — no cut is subtracted and the unresolved H1/J1 connection detail is
stated in words. See `docs/ARCHITECTURE_V38_TECHNICAL_3D_MVP.md`.

---

## 3. State classification

V38 adds only one transient field, `WorkbenchViewState.workspaceRenderer`
(`'2d' | '3d'`). Camera, projection, view preset, family filters, X-ray and
hover live inside the 3D viewport component and never reach the store at all.
Selecting in 3D calls the same `select()` the 2D canvas calls, so there is
exactly one selection state.

V37 adds only transient application state. `WorkbenchViewState` gains a
`documents` view preset, a `cutting` materials view and a bounded
`navigationTrail` of `WorkbenchLocation`s used for the breadcrumb and the
contextual **← Wróć**; none of it is serialized or recorded in history. The
guided Creator (`ProjectStartAssistant`, `project-start.ts`) validates drafts
and derives readiness from the existing resolver, schedule and K1 adapter;
example projects are imported fixture documents saved as new records through
`ProjectSession.createFromDocument`. Covering Studio view mode and nominal
ghost cells are presentation of existing `TilePosition` data and never feed
quantities.

V36 makes the application-level material plan the default Materials surface.
`apps/web/src/assembly/material-plan.ts` composes existing K1 procurement,
build-up quantities and declared covering consumption, preserving ranges and
partial limitations. Selected offers/manual price drafts are session state;
accepted price provenance is additive optional cost-sidecar state. Export adds
`material-list` evidence and CSV, separately from the accepted cost estimate.
API `environment.ts` initializes root `.env` once for server, CLI and Drizzle;
`pnpm db:doctor` is read-only and never forwards connection credentials.

| Kind | Where it lives | Serialized? | In Undo history? |
| --- | --- | --- | --- |
| **Canonical project** | `AssemblyState.projectDocument` (`RoofProjectDocumentV1`) | yes | yes |
| **Derived geometry** | `useMemo` in `Page.tsx`; `state.template` / `state.spec` | no — recomputed | no |
| **Transient view/session** | `AssemblyState.workbench`, component `useState` (camera, hover, pointer maps) | no | no |
| **Remote/server** | TanStack Query cache (catalogue only) | no | no |

Transient means: mode, task/view preset, workspace renderer (2D/3D), 3D
build-up visibility and finished/reference display, selection,
hover, isolation, dimension level, layer visibility, panel and sheet state,
`mobilePanel`, `selectedCoveringAssignmentId`, drawing detail level,
camera/pan/zoom, 3D projection, view preset and family filters, measurement,
drafts and invalid-field flags.

A procurement `CuttingPlan` is **derived**: it is computed from explicit inputs
and is not part of any persisted document (ADR-009).

---

## 4. Canonical `ProjectDocument` boundary

`packages/calculator-core/src/project-document.ts`

```ts
RoofProjectDocumentV1 {
  schemaVersion: 1
  project: {
    roof: RoofTemplateSpec          // exactly ONE roof today
    features: RoofFeature[]         // roof windows
    openingFraming: RoofOpeningFramingSpec[]
    buildUp: RoofBuildUp            // membrane, counter-battens, battens
    coverings: CoveringAssignmentSpec[]
  }
}
```

- Zod validates on every parse; optional collections normalize to `[]`/`{}`.
- Nothing about the user, the file, the screen or the session enters it.
- `schemaVersion` belongs to the **technical document only**. Covering technical
  snapshots carry their own independent versions.

## 5. `ProjectRecord` boundary

```ts
ProjectRecordV1 { schemaVersion: 1, id, name, createdAt, updatedAt, document }
```

Archive extension `.cieslacalc.json`. `ProjectRepository` is
`list / get / save / delete`; the only implementation today is
`LocalProjectRepository` over `localStorage`.

---

## 6. Covering architecture

```text
CoveringAssignmentSpec
  ├─ roofPlaneIds[]
  ├─ selectedInstallationModeId?
  ├─ layoutIntent?            (alignment / plane offsets)
  └─ product
       ├─ catalogRef?         { productId, technicalRevisionId, variantId? }
       ├─ displaySnapshot?    (labels only, never calculation input)
       └─ technicalSpecSnapshot   ← the ONLY calculation input
```

```text
canonical assignments
  → resolvePrimaryCoveringAssignments   (one primary covering per plane)
  → family solver, chosen by snapshot shape, never by a UI switch
  → quantity source through the covering bridge
  → material schedule
```

| Snapshot | Solver | Introduced |
| --- | --- | --- |
| `roof-tile` | `resolveRoofTileLayout` | V19 |
| `modular-sheet` + `fixed-sheet` | `resolveModularSheetLayout` | V21 |
| `standing-seam` | `resolveStandingSeamLayout` (via `resolveVariablePanelPlane`) | V22 |
| `modular-sheet` + `cut-to-length` | `resolveCutToLengthSheetLayout` (same kernel) | V25 |

Covering results are **coverage positions and geometric runs** — geometric
evidence, not a purchase list. Their quantity bridge is discriminated: tile and
fixed-sheet layouts use `effective-coverage-position` / `coverage-position`,
while standing-seam and cut-to-length layouts use `geometric-panel-run` /
`geometric-run`. Waste, offcut reuse, accessories, packaging and
`orderLengthMm` are deliberately absent.

**Overlap invariant (V26C):** effective coverage width/length may already encode
installation overlap. Never add an overlap allowance on top of an effective
dimension — that double-counts. See §10.

## 7. Quantity architecture

`quantity-core` consumes neutral sources and emits schedule rows:

```text
RoofSkeleton                     → structural timber rows (grouped by family + length)
LinearBuildUpSource[]            → batten / counter-batten rows
SurfaceBuildUpSource[]           → membrane area rows
CoveringProductQuantitySource[]  → covering rows (positions, optional length groups)
```

It never selects a product, fetches a catalogue, plans procurement, or applies a
price. Untrusted covering results produce no trusted row.

V27 makes result provenance machine-readable. The current semantic vocabulary
is `axis-geometric`, `resolved-visible`, `net-geometric`,
`effective-coverage-position` and `geometric-panel-run`. `limited` remains a
result status rather than a length basis. Every current schedule row is
`requirementReadiness: geometric-only`; future `fabrication-resolved` and
`procurement-ready` states may be emitted only when an upstream fabrication
resolver provides a real physical blank. Covering summaries keep effective
positions and geometric runs separate instead of adding them as generic pieces.

V28 adds a **K1-only** fabrication blank proof in `roof-math` and an
application-boundary adapter in `apps/web`. The adapter intersects whole K1
instance IDs with the schedule and passes explicit physical blanks to the pure
`procurement-core`; quantity rows remain `geometric-only` and H1/J1/opening
members remain unresolved. Commercial cutting inputs and plans are transient.
See `docs/ARCHITECTURE_V28_K1_CUTTING_PLAN.md`.

V29 adds a pure, derived **project workflow projection** in `apps/web`: six
non-blocking stage statuses, one next action and a project summary from existing
roof/surface/schedule/covering/K1 facts. Neither the workflow nor the summary
is persisted or part of roof history. The Materials task owns the summary,
schedule and drawing views; its K1 CTA reuses the V28 planner. See
`docs/ARCHITECTURE_V29_GUIDED_WORKFLOW_UX.md`.

**Known limitation:** `schedule-family-code.ts` still derives the display codes
`O<n>` and `P<n>` from generated IDs because the single-roof skeleton carries no
ordinal. Isolated in one module, allowlisted in the architecture test, and a
ProjectDocument V2 migration item.

## 8. Procurement architecture (V26)

```text
RequiredPiece[]   one indivisible physical fabrication blank each
  + StockOption[] commercial lengths per opaque stockClassId
  + CuttingSettings { kerfMm, endTrimMm, minimumReusableRemnantMm }
  + objective     minimum-waste | minimum-purchased-length | minimum-stock-count
        ↓
  createCuttingPlan  → bounded branch-and-bound per stock class,
                       deterministic heuristic fallback beyond the budget
        ↓
  CuttingPlan { status, score, diagnostics, stockUsages, unassignedPieces, summary }
```

Contract rules frozen in V26D:

- `requiredBlankLengthMm`, never an ambiguous `lengthMm`. The name states that
  every fabrication allowance is already resolved upstream (ADR-010).
- `stockClassId` is **opaque**: only exact equality is meaningful.
- Blanks are indivisible — two remnants are never joined, an overlong blank is
  never truncated.
- `usable = stockLength − 2 × endTrimMm`; `kerfTotal = max(0, cuts − 1) × kerfMm`.
- `availability: undefined` is unlimited; a number is an exact finite count.
- Optimality is reported honestly: `heuristic`,
  `proven-within-search-space`, or `search-budget-exhausted` — never "optimal".
- The public barrel exports the contract only; solver internals stay private.

## 9. Catalogue architecture

```text
MySQL/MariaDB → Drizzle repository → CatalogService → read-only REST → CatalogClient
                                                                          ↓
                                                            lazy Product Picker
                                                                          ↓
                                              one canonical covering edit (snapshot)
```

Technical revisions are **immutable**; read-only routes only; `DATABASE_URL` is
optional and its absence yields a structured `catalog-unavailable` 503. No price
column exists in any catalogue table or technical schema.

**V35**: the same pipeline now serves `roof-tile`/`modular-sheet`/
`standing-seam`/`membrane`/`timber-stock` uniformly — `?kind=` on the search
route accepts all five, and each of the three pickers (`CatalogProductPicker`,
`MembraneProductPicker`, `TimberStockProductPicker`) only ever queries its own
kind, never leaking a cross-kind result (`apps/api/src/catalog/service.test.ts`).

## 10. Execution semantics research (V26C) — research only

Not implemented. Read before changing any coverage or connection calculation:

- `docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md` — the five geometry layers and why
  one length/area/`piece` count cannot describe them all.
- `docs/domain/EXECUTION_SEMANTICS_MATRIX.md`
- `docs/domain/COVERING_INSTALLATION_SEMANTICS_RESEARCH.md`
- `docs/domain/TIMBER_CONNECTION_EXECUTION_RESEARCH.md`

No overlap correction, membrane gross resolver or timber connection redesign has
been implemented.

## 11. Workbench state and mobile shell

One Zustand store: `projectDocument` canonical, `template`/`spec` derived,
`workbench` transient. History snapshots the **document only**, limit 40, with
explicit `beginTransaction / commitTransaction / cancelTransaction` for gestures.

Shell: `>1100px` Toolbox | Workspace | Inspector; `801–1100px` the same three
columns narrowed; `≤800px` compact header + context row + workspace + six-task
dock, with tools/inspector/view in one `MobileSheet` at a time.

**Toolbox** chooses objects, **Workspace** shows and manipulates geometry,
**Inspector** edits exact values, **Context bar** explains the selection. Every
editable geometric value has an exact numeric input on desktop *and* mobile.

V38: the Workspace can be drawn by either renderer on construction-capable
tasks — `[ 2D | 3D ]` beside the technical view controls. 3D is a *view* of the
current task, never a perspective, and it edits nothing: the Inspector remains
the one exact-edit surface.

## 12. Future multi-structure constraint

Today there is exactly one `project.roof`, and local IDs (`roof-plane:left`,
`instance:rafter-pair-4:left`, `feature:roof-window-1`, …) are unique **only
inside that roof**. A future house + garage document will reuse them.

Therefore (ADR-007, enforced by `tools/architecture/opaque-ids.test.ts`):

- Domain code treats geometry IDs as **opaque**. No `startsWith`, `endsWith`,
  `split`, `replace` or regex over an ID to recover a decision.
- Derived members carry structured provenance: `sourceMemberId`,
  `sourceFeatureId`, `openingRole`.
- Only `roof-math` holds the roof-plane ID vocabulary, because it generates it.
  A module that *mints* IDs in its own namespace may read that namespace to
  allocate the next ordinal; that is generation, not inference.
- UI resolves a plane label through `roofPlaneLabelKey` /
  `roofPlaneShortLabelKey`, which fall back to a translated generic.

`docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` holds the candidate V2 design.
Nothing in it is implemented.

## 13. Quality gate

```bash
pnpm verify   # typecheck → lint → format:check → tests (incl. architecture + fixtures) → build
pnpm e2e      # real-browser smoke, desktop 1440x900 and mobile 390x844 (pnpm e2e:install first)
```

- `tools/architecture/` — executable dependency and opaque-ID rules, including
  the V38 renderer boundary (`three` may appear only in
  `apps/web/src/assembly/scene3d/`, never in a package).
- `fixtures/projects/` — nine reference project archives with aggregate
  invariants (see `docs/ACCEPTANCE_SCENARIOS.md`). Procurement is **not**
  duplicated here; `procurement-core` owns its own golden fixtures.
- `.github/workflows/ci.yml` — `pnpm install --frozen-lockfile && pnpm verify`,
  plus a separate Playwright job. **Normal CI needs no database.** The MySQL job
  is manual (`workflow_dispatch`).

## 14. Document map

**Active — read when relevant:**

| Document | Read when |
| --- | --- |
| `ARCHITECTURE_V36_MATERIAL_PLAN` | Materials plan, price selection/provenance, BOM/CSV and DB runtime diagnostics |
| `ARCHITECTURE_V37_PRODUCT_EXPERIENCE_AND_COVERING_STUDIO` | perspective navigation and return trail, Document Hub, guided Creator and examples, Covering Studio technical/visual views |
| `ARCHITECTURE_V38_TECHNICAL_3D_MVP` | the technical scene contract, coordinate convention, roof→scene adapter, Three.js viewport, 2D/3D selection identity and renderer boundary |
| `ARCHITECTURE_V39_EXECUTION_GEOMETRY_AND_HIP_BOUNDARY` | hip-boundary counter-batten detail, J1→H1 finished termination, finished K1 3D solid, hip execution intent |
| `ARCHITECTURE_V42_SHARED_DEV_AND_METAL` | shared DEV SQL, Cloudflare Worker/Hyperdrive boundary, additive metal seed, batten/module semantics |
| `ARCHITECTURE_V43B_COVERING_AND_BATTEN_WORKFLOW` | covering-first batten workflow, Auto/Manual ownership, batten scope audit, installation plan, hip-detail guidance |
| `ARCHITECTURE_V44_CALCULATOR_TRUST_AND_UX` | calculator oracles, reference acceptance numbers, display precision, Quick result/evidence, source and status vocabulary |
| `ARCHITECTURE_V45_SHARED_DEV_DATABASE_AND_HYPERDRIVE` | one alwaysdata DEV database for Node and Worker, DATABASE_URL/TLS policy, doctor, health, Hyperdrive setup |
| `ARCHITECTURE_V46_COVERING_SYNC_REPAIR_AND_SCHEME` | plane-scope reconciliation on roof-type switch, fit-roof repair, automatic battens with first covering, overlap audit, roof-aware covering scheme |
| `domain/ROOF_TILE_EDGE_PLACEMENT` | eave/verge evidence; why no physical tile edge projection is modelled |
| `PROJECT_BLUEPRINT.md` | always first; holds the work checkpoint |
| `docs/ARCHITECTURE_INDEX.md` | always second; this file |
| `docs/ROOFCALC_PRODUCT_NORTH_STAR.md` | always third; long-term constraints |
| `docs/adr/` | before changing a decision it records |
| `docs/SCHEMA_REGISTRY.md` | touching anything persisted or versioned |
| `docs/UX_DESIGN_CONTRACT.md` | touching workbench layout or UI primitives |
| `docs/ACCEPTANCE_SCENARIOS.md` | changing a user-visible flow |
| `docs/ARCHITECTURE_V26_TIMBER_PROCUREMENT_CORE.md` | touching procurement |
| `docs/ARCHITECTURE_V27_RESULT_SEMANTICS.md` | quantity basis, result wording or takeoff UX |
| `docs/ARCHITECTURE_V28_K1_CUTTING_PLAN.md` | K1 fabrication blank and cutting-plan adapter/UX |
| `docs/ARCHITECTURE_V29_GUIDED_WORKFLOW_UX.md` | derived project guidance, summary and workbench UX |
| `docs/ARCHITECTURE_V30_DOCUMENT_EXPORT_ENGINE.md` | execution document, export readiness, preview and browser print |
| `docs/ARCHITECTURE_V31_CREATOR_AND_COVERING_EXPERIENCE.md` | guided project start, derived guidance and covering-studio UX |
| `docs/ARCHITECTURE_V32_STRUCTURAL_SYSTEMS_AND_EXECUTION.md` | roof structural system, collar tie, K1 ridge-connection variants |
| `docs/ARCHITECTURE_V33_ROOF_BUILDUP_INTELLIGENCE.md` | automatic batten spacing, covering composition boundary, hip K1/J1 counter-battens |
| `docs/ARCHITECTURE_V34A_ROOFING_INSTALLATION_INTELLIGENCE.md` | decision authority, tile capabilities, hard compatibility, manual ownership and explainable repair |
| `docs/ARCHITECTURE_V34B_COSTING_MVP.md` | `cost-core`, cost suggestions, quantity basis/suitability, VAT, perspective navigation, cost export |
| `docs/ARCHITECTURE_V34C_MATERIAL_TRUTHFULNESS_AND_CATALOGUE.md` | `pricing-core`, real tile catalogue/pricing data, membrane course-fit engine |
| `docs/ARCHITECTURE_V35_MATERIAL_CATALOG_AND_DB_BOOTSTRAP.md` | generalized catalogue (membrane/timber-stock), timber procurement/pricing, first-run DB bootstrap |
| `docs/domain/ROOF_TILE_INSTALLATION_RULES.md` | manufacturer evidence for regular gauge, pitch and manual boundary references |
| `docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md` | hip counter-batten detail, hip-batten support, J1→H1 face deduction |
| `docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md` + `docs/domain/*` | touching coverage, overlap or connection semantics |
| `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` | touching IDs, planes or document shape |
| `docs/ARCHITECTURE_FUTURE_3D_BIM_IFC.md` | long-term 3D/BIM/IFC direction; V38 implemented its stages 1–3 |
| `docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md` | covering, catalogue or future pricing |
| `docs/DOMAIN_RESEARCH_ROADMAP.md` | before implementing new domain geometry |

**Subsystem history — open only when changing that subsystem:**

| Document | Subsystem |
| --- | --- |
| `ARCHITECTURE_V3`–`V5` | workbench foundation, roof skeleton, direct manipulation |
| `ARCHITECTURE_V6`–`V8`, `HIP_RAFTER_GEOMETRY`, `JACK_RAFTER_GEOMETRY` | hip/jack rafters, compound cuts, detail previews |
| `ARCHITECTURE_V9`–`V11` | project workbench, member instances, quick details |
| `ARCHITECTURE_V12`, `V16` | roof features, battens, build-up |
| `domain/BATTEN_COUNTERBATTEN_LAYOUT_RESEARCH` | batten references, whole-course fitting, hip counter-batten semantics |
| `ARCHITECTURE_V13`, `V17` | interaction, units, dimensions, measurement |
| `ARCHITECTURE_V14`, `domain/ROOF_OPENING_FRAMING` | openings and framing adaptation |
| `ARCHITECTURE_V15` | quantity engine and member schedule |
| `ARCHITECTURE_V18`–`V19`, `domain/COVERING_PRODUCT_MODEL` | covering platform and tile engine |
| `ARCHITECTURE_V20` | mobile workbench shell |
| `ARCHITECTURE_V21` | token contract, modular sheet, plane exclusivity |
| `ARCHITECTURE_V22` | variable-panel kernel, standing seam |
| `ARCHITECTURE_V23` | local project lifecycle and autosave |
| `ARCHITECTURE_V24` | catalogue platform, MySQL, importer |
| `ARCHITECTURE_V25` | cut-to-length metal, covering workbench |
| `ARCHITECTURE_V26` | timber procurement core |

`docs/PROMPT_ITERATION_*.md` are the original iteration contracts: evidence of
intent, not current specification. `ChatPromptsHistoryIgnore/` is archive only.
