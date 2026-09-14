# RoofCalc / CieślaCalc — Architecture Index

**This is the current-state map, after V29.** Read it after `PROJECT_BLUEPRINT.md`
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
future cost                NOT IMPLEMENTED — commercial valuation
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
| `roof-math` | The geometry engine. Templates → resolved roofs, skeletons, rafters, hips, jacks, cuts, plane bases, roof surfaces, battens, counter-battens, opening framing. **Generates and owns roof-plane IDs.** | `timber-model`, `zod` |
| `drawing-engine` | Renderer-neutral projection: lanes, dimensions, interaction hit-testing, measurement. Produces view models, not DOM. | — |
| `covering-core` | Covering technical product schemas and the four family layout solvers (tile, fixed modular sheet, standing seam, cut-to-length), plane-ownership resolution, and the quantity bridge. | `zod` |
| `calculator-core` | Composition layer: assembly resolution, member instances, fabrication packages, detail previews, and the canonical `RoofProjectDocumentV1`. | `roof-math`, `timber-model`, `covering-core`, `drawing-engine`, `shared` |
| `quantity-core` | Aggregates neutral quantity sources into the member/material schedule. Knows nothing about products, procurement or prices. | `timber-model` |
| `catalog-core` | Pure catalogue contracts: manufacturers, product families, immutable technical revisions, commercial variants, import batch, read-API payloads. Reuses `covering-core` technical schemas rather than redefining them. | `covering-core`, `zod` |
| `procurement-core` | **V26.** Pure timber cutting/stock planning over explicit required blanks. Indivisible blanks, kerf, stock end trims, reusable remnants, finite availability, three objectives, bounded search with deterministic fallback and honest optimality status. | **nothing — zero dependencies** |
| `project-core` | `ProjectRecordV1` envelope, lifecycle helpers, JSON import/export and the `ProjectRepository` interface. No browser, no React, no i18n. | `calculator-core`, `zod` |
| `shared` | Cross-cutting DTOs shared by web and API. | — |
| `ui` | Semantic design tokens (`--ui-*`) and a few primitives. | `react` (peer) |
| `apps/web` | React workbench: Zustand store, canvases, inspectors, i18n, local persistence, catalogue client. | the packages above |
| `apps/api` | Express read-only catalogue API, Drizzle/MySQL repository, canonical importer, CLI. | `catalog-core`, `covering-core`, `shared` |

**Never**: a package importing an app; `roof-math` importing React/DOM/Express/
database; `covering-core` importing React/DOM/Express/Drizzle/mysql2;
`quantity-core` importing UI, a database or the catalogue; `catalog-core`
importing Drizzle/Express/React/UI; `project-core` importing i18n, React or
`localStorage`; `procurement-core` importing **anything**.

`procurement-core` is deliberately **not** wired into `quantity-core` or
`RoofProjectDocumentV1`. A V28 web application adapter connects only proven,
whole K1 fabrication blanks to `RequiredPiece[]` and the Material Schedule
opens that K1-only planner. Other member families remain outside this pilot.

---

## 3. State classification

| Kind | Where it lives | Serialized? | In Undo history? |
| --- | --- | --- | --- |
| **Canonical project** | `AssemblyState.projectDocument` (`RoofProjectDocumentV1`) | yes | yes |
| **Derived geometry** | `useMemo` in `Page.tsx`; `state.template` / `state.spec` | no — recomputed | no |
| **Transient view/session** | `AssemblyState.workbench`, component `useState` (camera, hover, pointer maps) | no | no |
| **Remote/server** | TanStack Query cache (catalogue only) | no | no |

Transient means: mode, task/view preset, selection, hover, isolation, dimension
level, layer visibility, panel and sheet state, `mobilePanel`,
`selectedCoveringAssignmentId`, drawing detail level, camera/pan/zoom,
measurement, drafts and invalid-field flags.

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

- `tools/architecture/` — executable dependency and opaque-ID rules.
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
| `docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md` + `docs/domain/*` | touching coverage, overlap or connection semantics |
| `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` | touching IDs, planes or document shape |
| `docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md` | covering, catalogue or future pricing |
| `docs/DOMAIN_RESEARCH_ROADMAP.md` | before implementing new domain geometry |

**Subsystem history — open only when changing that subsystem:**

| Document | Subsystem |
| --- | --- |
| `ARCHITECTURE_V3`–`V5` | workbench foundation, roof skeleton, direct manipulation |
| `ARCHITECTURE_V6`–`V8`, `HIP_RAFTER_GEOMETRY`, `JACK_RAFTER_GEOMETRY` | hip/jack rafters, compound cuts, detail previews |
| `ARCHITECTURE_V9`–`V11` | project workbench, member instances, quick details |
| `ARCHITECTURE_V12`, `V16` | roof features, battens, build-up |
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
