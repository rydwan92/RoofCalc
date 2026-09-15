# V34B — Costing MVP and Workbench Perspectives

Status: implemented, 2026-09-15, built on `main` at `db4920a` ("V34 A skonczone").

## Definition of Ready

1. **User problem:** a carpenter or roofing-company owner can see project
   quantities and a K1 cutting plan, but has no way to turn them into a priced
   estimate without leaving RoofCalc. Kosztorys carries selected project facts
   into a priced, exportable estimate.
2. **Domain owner:** `packages/cost-core` owns the pure commerce model (money,
   quantity, quantity basis, suitability, line/VAT rounding, scenario totals).
   `apps/web/src/assembly/cost-adapter.ts` is the *only* place that turns
   already-trusted project facts into `CostSuggestion`s; no solver, geometry or
   procurement code moves into `cost-core`.
3. **Canonical persistence:** `RoofProjectDocumentV1` and `ProjectRecordV1` are
   unchanged. A `CostScenarioV1` sidecar, keyed by project ID, is the only new
   persisted shape (`docs/SCHEMA_REGISTRY.md` §9).
4. **Schema / migration:** additive-only. No `schemaVersion` bump on any
   existing schema; every pre-V34B project and fixture parses unchanged, and
   opens with no cost estimate (an empty scenario is offered on first visit to
   Kosztorys).
5. **History:** the cost estimate never enters roof Undo/Redo. Editing it is a
   separate, independent save to its own sidecar row; switching perspective or
   task creates no history entry (unchanged from V29).
6. **Quantity:** every suggested line states its `CostQuantityBasis`
   truthfully. K1 procurement stock is the only `exact-purchase` basis;
   battens/counter-battens/membrane are `geometric-estimate`; covering coverage
   positions and panel runs are never auto-priced (`manual-required`).
7. **Procurement:** the K1 suggestion reads the *existing* `CuttingPlan` the
   user already ran in Materiały; it never re-runs or infers one (ADR-009/010).
8. **Catalogue:** untouched. No price field anywhere in `covering-core`,
   `catalog-core` or the catalogue database (ADR-003/ADR-005).
9. **Cost:** this is the layer ADR-005 reserved. Geometry, quantity,
   procurement and catalogue-technical packages still contain no pricing
   concept — enforced by `tools/architecture/layering.test.ts`'s "commercial
   boundary" tests, now also covering `cost-core`'s independence from them.
10. **Offline:** the sidecar is `localStorage`, same offline guarantee as
    `ProjectRecordV1` (ADR-006). No network call anywhere in `cost-core` or the
    adapter.
11. **Mobile:** Kosztorys is reachable as the seventh task-dock entry and
    renders responsively (table scrolls horizontally inside its own container;
    the page never does). Desktop is the primary QA target; mobile got a
    390×844 smoke pass, not the full flow matrix.
12. **Research:** no geometry, covering or connection calculation changed.
13. **Regression:** `cost-core` (32 tests), `cost-adapter.test.ts` (8),
    `cost-csv.test.ts` (4), `cost-repository.test.ts` (5),
    `CostWorkspace.test.tsx` (4), extended `export-adapter.test.ts` (4 new) and
    `workbench.test.ts` (3 new) cover the model, truthfulness rules, CSV,
    persistence, UI and document export. See §9 below for what is *not*
    covered.
14. **Multi-structure:** no change to ID vocabulary or roof-plane handling;
    the adapter reads existing `RoofMemberSchedule`/`K1CuttingRequirement`
    facts only, opaquely.

## 1. Boundary

```text
RoofMemberSchedule + K1CuttingRequirement + K1SessionPlan + build-up facts
      ↓ (apps/web/src/assembly/cost-adapter.ts — read-only, no recomputation)
CostSuggestion[]
      ↓ (user: Dodaj / Uzupełnij / Pomiń, in CostWorkspace.tsx)
CostLine  (packages/cost-core)
      ↓
CostScenario  → localStorage sidecar (CostScenarioV1, §SCHEMA_REGISTRY 9)
      ↓ (apps/web/src/assembly/export-adapter.ts — cost-estimate section)
document-core ExecutionSection 'cost-estimate'
      ↓ (existing V30 pipeline)
ExecutionExport.tsx print/preview  +  cost-csv.ts CSV download
```

`cost-core` depends on nothing but `zod`. It does not know a roof, a plane, a
covering family or a product. The adapter is the sole composition point,
exactly like V28's K1 adapter and V30's export adapter.

## 2. `cost-core` model

- **Money**: `{ currencyCode, minorUnits }`, integer minor units only
  (`Number.isInteger`, `>= 0`). No floating PLN anywhere in the model.
- **Quantity**: `{ value, unit }`, `unit: QuantityUnit = 'piece' | 'm' | 'm2' |
  'm3' | 'kg' | 'hour' | 'flat'`.
- **`CostQuantityBasis`**: `'procurement-stock' | 'fabrication-requirement' |
  'geometric-length' | 'net-area' | 'effective-coverage' | 'manual'` — what the
  number *means*.
- **`CostSuitability`**: `'exact-purchase' | 'execution-based' |
  'geometric-estimate' | 'manual-required' | 'unavailable'` — how safe it is to
  price automatically. Never a numeric confidence score (§9 of the V34B
  prompt); always one of these five named, explainable states.
- **`CostLine`**: category (`material | labour | transport | equipment |
  other`), label, quantity + basis + suitability, optional `unitPriceMinor`,
  `source` (`project-derived | manual | price-list` — the last reserved for a
  future price-list join, unused in V34B), `included`, `noteKeys` (stable
  machine warning strings the UI translates), and `projectQuantityValue` (the
  project value last accepted, used only to detect drift on a
  `project-derived` line).
- **Rounding** (`calculateLine`): `netMinor = round(quantity.value *
  unitPriceMinor)`; if a scenario tax rate is configured, `taxMinor =
  round(netMinor * taxRateBps / 10000)` and `grossMinor = netMinor +
  taxMinor`. Tax rounds independently from the already-rounded net value, once
  per line — documented and tested (`index.test.ts`).
- **`CostScenario`**: one currency, optional scenario-level `taxRateBps`
  (`undefined` = "VAT nie ustawiono" — net-only), `lines[]`, `metadata`.
  `summarizeCostScenario` sums only `included` lines, and reports `complete`
  only when every included line has both a valid quantity and price — an
  unpriced or quantity-less included line contributes zero to the total but
  still blocks the "done" claim (§28 of the prompt).
- Pure transform helpers keep the "don't silently overwrite" rule out of React:
  `withManualQuantity` (a direct edit always drops `source` to `manual`),
  `projectQuantityDiverged`, `acceptProjectQuantity` ("Aktualizuj"),
  `keepManualQuantity` ("Zachowaj ręczną"), `restoreFromProject` ("Przywróć z
  projektu").

## 3. Suggestion adapter — what is and is not suggested

`apps/web/src/assembly/cost-adapter.ts`, `createCostSuggestions(facts:
ExportFacts)`:

| Suggestion | Condition | Basis | Suitability |
| --- | --- | --- | --- |
| K1 stock (one per commercial length) | a `K1SessionPlan` already exists | `procurement-stock` | `exact-purchase` |
| Battens | `battensEnabled` and batten rows exist | `geometric-length` | `geometric-estimate` |
| Counter battens | `counterBattensEnabled` and rows exist; flags `partial: true` when the H1 boundary result is partial | `geometric-length` | `geometric-estimate` |
| Membrane | `membraneEnabled` and surface rows exist | `net-area` | `geometric-estimate` |
| Covering positions / runs | any covering rows exist | `effective-coverage` | `manual-required` |

**Deliberately absent:** H1/J1/purlins/collar ties (no fabrication/procurement
resolution exists for them — suggesting a "cost per piece" from a bare axis
length would misstate a purchase requirement) and — critically — no covering
suggestion ever carries a `quantity`. `CoveringPositionsSuggestion` /
`CoveringRunsSuggestion` carry only `totalPositions` / `totalLengthMm` as
*information*, never as `CostLine.quantity`. Accepting one ("Uzupełnij")
creates a line with `quantity.value = 0`; the user must type a real number.
This is the single most load-bearing invariant in this iteration and is
covered by both a unit test (`cost-adapter.test.ts`: "never turns covering
coverage positions into a purchase quantity") and a component test
(`CostWorkspace.test.tsx`: "never pre-fills a covering suggestion with the
geometric count as quantity").

K1 stock is suggested only once a cutting plan has actually been run in
Materiały — the adapter never recomputes one, consistent with V28's
"procurement never infers, only receives explicit blanks" rule.

## 4. Persistence

`CostScenarioV1` is a sidecar, **not** an addition to `RoofProjectDocumentV1`
or `ProjectRecordV1` — see `docs/SCHEMA_REGISTRY.md` §9 for the full rationale
and compatibility policy. In short: commerce sits one layer downstream of the
canonical technical document (ADR-005), the same reasoning that already keeps
a `CuttingPlan` out of it (ADR-009). Wiring it into `ProjectRecordV1` would
also have required threading a second dirty/debounce state machine through the
already-intricate `ProjectSession` autosave class; the sidecar avoids that
coupling entirely at the cost of the two not sharing one write transaction (a
cost edit and a geometry edit save independently, each to its own key).

`apps/web/src/assembly/use-cost-scenario.ts` loads the sidecar for the active
project ID and saves on every change (no debounce — edits are infrequent
enough that this is simple and safe). `LocalCostRepository`
(`apps/web/src/projects/cost-repository.ts`) mirrors `LocalProjectRepository`'s
shape (`get`/`save`/`delete`, Zod-validated, a damaged row never blocks
opening the project).

## 5. Cost Workspace UI

`CostWorkspace.tsx` is a full-width panel (like Materials/Covering — no
Inspector alongside it):

- **Summary header**: RAZEM NETTO (and RAZEM BRUTTO once VAT is configured),
  a per-category net breakdown, a completeness line ("N pozycji wycenionych ·
  M wymaga ceny · K wymaga ilości"), a VAT select (blank/0/5/8/23%, scenario-
  level only), "Otwórz w eksporcie" (opens the existing V30 export flow with
  `cost-estimate` available) and "Pobierz CSV" (disabled while nothing is
  `included`).
- **Proponowane z projektu**: one card per live suggestion not yet added or
  dismissed, showing its suitability label and either its quantity or (for
  covering) the geometric fact as plain text, with *Dodaj*/*Uzupełnij* and
  *Pomiń* (session-only dismissal, not persisted).
- **Line table**, grouped by category: include toggle, label, basis, an
  editable quantity (blur-commits, always converts a project-derived line to
  manual), unit, an editable unit price, computed net, and a status badge. A
  divergence banner and a restore action appear inline as extra rows when
  relevant (§3.6 of the UX contract).
- **+ Dodaj pozycję**: a small inline form for a fully manual line (label,
  category, quantity, unit, price).

## 6. Perspective navigation

`PerspectiveBar.tsx` adds five perspectives (Projekt/Wykonanie/Materiały/
Kosztorys/Dokumenty) above the existing seven-task ribbon (`workbench.ts`:
`WorkbenchPerspective`, `perspectiveForTask`, `tasksForPerspective`). It is
purely derived, presentational grouping — no new persisted state — and it
**never hides a task from the ribbon**: every one of the seven tasks stays
directly, one-click reachable exactly as before. Selecting a perspective jumps
to its first task, or opens the existing execution-export flow for Dokumenty.
This is the lighter-weight design V32 deferred (see its "Workbench
perspectives (deferred)" section) rather than the originally-imagined
ribbon-filtering layout: filtering the ribbon down to the active perspective's
tasks was prototyped and rejected because it would have required two clicks
for common cross-perspective jumps (e.g. Konstrukcja → Cięcia) and broken
every existing `openTask(page, …)` E2E helper that clicks a task tab directly
regardless of the active perspective. See §13 of `docs/UX_DESIGN_CONTRACT.md`
for the accent-colour rule.

Costing is the seventh task-ribbon entry (`ViewPreset: 'costing'`) and the
seventh mobile-dock entry, added without changing the meaning of the existing
six.

## 7. Export and CSV

`document-core` gains one more `SectionKind`, `cost-estimate` (last in
`sectionOrder`), and `CostEstimateSection` — a plain-numbers/strings shape
that duplicates `cost-core`'s `CostQuantityBasis` strings by convention rather
than importing them, keeping `document-core`'s zero-dependency guarantee
intact. `export-adapter.ts`'s `costEstimateSection` copies the scenario's
already-computed totals verbatim; it is `unavailable` (`no-cost-lines`) until
at least one line is `included`, `warning` (`cost-incomplete`) while any
included line lacks a price or quantity, and `available` only once
`summary.complete`. `ExecutionExport.tsx` renders it as one more printable A4
page through the existing V30 pipeline — no new PDF/print engine.

`cost-csv.ts` produces a semicolon-delimited, UTF-8-BOM CSV (Polish Excel
compatibility, §34 of the prompt) with columns `Lp;Kategoria;Pozycja;Podstawa;
Ilość;Jm;Cena netto;Wartość netto;VAT;Wartość brutto;Uwagi`, mirroring exactly
what the printed estimate shows (included lines only). No spreadsheet
dependency; a plain `Blob` + `<a download>`.

## 8. What V34B deliberately does not implement

Per §49 of the prompt: no database price lists (the `PriceList`/
`PriceListEntry` boundary from V24's `ARCHITECTURE_COVERING_CATALOG_AND_
PRICING_BOUNDARY.md` stays conceptual; `CostLineSource.price-list` is reserved
but unused), no supplier price scraping, no quote/order API, no payment, no
automatic tile/roll purchase resolver, no labour-rate database, no margin
engine, no CRM, no `ProjectDocument` V2, no compound roofs.

## 9. Known gaps / recommended V35

- H1/J1/purlins/collar-tie timber is never suggested at all (§3 above) — a
  geometric-length suggestion analogous to battens is plausible once there is
  appetite for the extra ribbon rows, but was left out to honour "don't flood
  the workspace with low-confidence rows" (§21).
- A stale K1-stock line (added, then the cutting plan re-run with different
  stock lengths) is not flagged as orphaned — it simply stops matching any
  live suggestion. Worth a follow-up truthfulness check.
- Line `label` is fixed at creation for suggested lines (not renamable
  in-place); only manual lines choose their own label.
- VAT is scenario-level only, matching the prompt's own §22 mockup, not
  per-line. A future price-list join may need per-line VAT.
- Deleting a project does not delete its `CostScenarioV1` sidecar row (an
  orphaned key, harmless but uncollected).
- CSV/print truthfulness notes (`noteKeys`) are carried through to the
  document `notPurchaseFact`/`note.*` copy but not yet surfaced as a per-row
  footnote on the printed page — only the on-screen Kosztorys workspace shows
  them today.
- §37 of the prompt ("Przygotuj kosztorys" as a `project-guidance.ts` item
  once meaningful quantities exist) is not wired. `deriveProjectGuidance`
  already enforces "at most two visible items" (`docs/UX_DESIGN_CONTRACT.md`
  §10) and adding a sixth guidance kind late, untested, right before this
  checkpoint was judged riskier than leaving it for a focused follow-up.

## Files touched

- New package: `packages/cost-core/src/{model,validation,line,scenario,
  persistence,index}.ts` + `index.test.ts` (32 tests).
- `packages/document-core/src/index.ts` — `CostEstimateSection`, `SectionKind`,
  `sectionOrder`.
- `apps/web/src/assembly/{cost-adapter.ts,cost-adapter.test.ts,cost-csv.ts,
  cost-csv.test.ts,CostWorkspace.tsx,CostWorkspace.test.tsx,
  use-cost-scenario.ts,PerspectiveBar.tsx}` (new); `export-adapter.ts` (+
  `cost-estimate` section, 4 new tests), `ExecutionExport.tsx` (+ section
  render/copy), `Page.tsx` (costing branch, perspective bar, cost facts),
  `WorkbenchControls.tsx` / `MobileTaskDock.tsx` (7th task), `workbench.ts`
  (`WorkbenchPerspective` + 3 new tests), `translations.ts` (`assembly.cost.*`,
  `assembly.perspective.*`), `styles.css` (`.a-perspective-bar`, `.cw-*`).
- `apps/web/src/projects/{cost-repository.ts,cost-repository.test.ts}` (new).
- `apps/web/src/assembly/MobilePage.test.tsx` — six-task assertion updated to
  seven.
- Docs: this file (new); `docs/SCHEMA_REGISTRY.md` §9;
  `docs/ARCHITECTURE_INDEX.md`; `docs/UX_DESIGN_CONTRACT.md` §2/§13;
  `PROJECT_BLUEPRINT.md` checkpoint.
