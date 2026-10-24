# Schema Registry

Every versioned or persisted shape in the repository, who owns it, where it
lives and what may change without a migration.

Read this before editing any schema. Adding an **optional** field is usually
free; changing meaning, type or required-ness is not.

---

## 1. `RoofProjectDocumentV1` — canonical technical document

| | |
| --- | --- |
| Owner | `packages/calculator-core/src/project-document.ts` |
| Current version | `schemaVersion: 1` |
| Validation | `roofProjectDocumentV1Schema` (Zod), on every parse and on `createRoofProjectDocument` |
| Persistence | nested inside `ProjectRecordV1`; `localStorage` via `LocalProjectRepository`; `.cieslacalc.json` archives |
| Contains | `project.roof`, `project.features`, `project.openingFraming`, `project.buildUp`, `project.coverings`, `project.membraneProduct` |

**Compatibility expectations**

- The version belongs to the technical document only. Covering technical
  snapshots inside it carry their own independent version (§3).
- Absent optional collections normalize to `[]` / `{}` on parse, so a document
  written by an earlier iteration still opens. This is normalization, **not** a
  migration.
- No user, session, camera, selection, history or display state may enter it
  (ADR-002). **No procurement result may enter it** (ADR-009).
- Exactly one `project.roof` today; everything else implicitly belongs to it
  (ADR-008).

**Migration policy**

- Additive optional fields: no version bump, no migration. Add to the Zod schema
  and to a reference fixture.
- Any change an existing valid document would fail, or that changes the meaning
  of an existing field: new `schemaVersion` **and** an explicit upgrade function,
  and `importProject` must accept both versions before anything writes V2.
  Unknown versions must fail validation loudly, never be coerced.
- **No implicit migration exists today.** Do not invent one.
- V26 note: the new `SkeletonMember3D` provenance fields (`sourceMemberId`,
  `sourceFeatureId`, `openingRole`) are on a **derived** runtime type, not on any
  persisted schema, so ADR-007 cost no serialization compatibility.
- V32 note: `GableRoofTemplateSpec.structure?: RoofStructureIntent` (roof
  structural system, `{ system: 'rafter' | 'rafter-collar-tie'; collarTie? }`)
  and `AssemblySpec['ridge'].connection?: RidgeConnectionType` (K1 ridge
  termination, `'ridge-board' | 'direct-meeting' | 'half-lap'`) are additive
  optional fields inside `project.roof`. Both are absent on every pre-V32
  document; absence means exactly the pre-V32 behavior (`system: 'rafter'`,
  `connection: 'ridge-board'`). No `schemaVersion` bump. Covered by
  `fixtures/projects/10-gable-collar-tie-direct-meeting.cieslacalc.json` and by
  every pre-V32 fixture parsing unchanged. `RoofStructureIntent.collarTie` is
  only meaningful for `type: 'gable'`; hip templates never carry `structure`.
- V33 note: `RoofBuildUp.battenLayout.mode?: 'manual' |
  'auto-from-covering'` is additive and optional. Absence is read as `manual`,
  so every pre-V33 project and fixture retains its exact layout behaviour.
  Automatic station rows, actual gauge, per-plane course counts, counter-batten
  axes and compatibility messages are derived and are never serialized. No
  `schemaVersion` bump.
- V39 note: two additive-optional **execution intents**, both absent on every
  pre-V39 document, where absence means exactly the pre-V39 behaviour.
  (a) `RoofBuildUp.counterBattens.hipBoundaryDetail?: HipCounterBattenDetail`
  (`'not-decided' | 'no-dedicated-run' | 'paired-plane-runs'`) — which hip
  counter-batten detail the project uses. Absence reads as `not-decided`, so an
  older hip project still loads with its truthful *partial* counter-batten
  status instead of silently gaining runs. Research
  (`docs/domain/HIP_BOUNDARY_EXECUTION_RESEARCH.md`) found two well-evidenced,
  mutually exclusive details and no basis for a default, so there is no
  fallback value that would be safe to invent.
  (b) `HipRoofTemplateSpec.hipExecution?: HipExecutionIntent`
  (`{ hipTop?: 'not-decided' | 'backed' | 'dropped'; jackConnection?:
  'theoretical-centre-plane' | 'hip-face-butt' }`) — the hip's top treatment and
  the J1→H1 connection. Absence keeps H1's `back-or-drop-not-decided` and J1's
  theoretical centre-plane termination. `hipExecution` is only meaningful for
  `type: 'hip'`; gable templates never carry it.
  Everything the two intents *produce* is derived and never serialized:
  hip-boundary runs and their segments, `interiorAxisCount` /
  `hipBoundaryRunCount` / `hipBoundaries[]`, J1 finished lengths, cut planes and
  face deductions, and the finished K1 solid (`resolveFinishedRafterSolid`).
  No `schemaVersion` bump. Covered by
  `apps/web/src/assembly/hip-execution.test.ts`, which asserts a save/load round
  trip and that a document with the fields deleted returns to *partial*.
- V48/V49 note: `RoofBuildUp.linearStock?: { battens?, counterBattens? }`, each
  a `LinearStockSelectionSpec` — the user's **commercial decision** (which
  commercial lengths to buy from, optional cutting settings, objective and an
  explicit raking-end allowance). Absent on every pre-V48 document, meaning no
  purchase plan was prepared; the quantities stay geometric. It is a decision,
  not a procurement result: the installable pieces, the cutting plan and every
  count are derived on each render and never serialized (ADR-009 holds).
  V49 adds, additively: `source?: 'manual' | 'catalogue'` (absent reads as
  manual — every V48 selection was manual) and per length
  `catalogRef?: { productId, technicalRevisionId, variantId?, productName,
  manufacturerName? }`. The IDs are the reference; the two names are display
  snapshots, exactly like a covering's `displaySnapshot`. One source per
  selection, so provenance is never ambiguous. No `schemaVersion` bump.
- V34C note: `project.membraneProduct?: MembraneTechnicalSpec`
  (`@cieslacalc/covering-core`) is additive and optional — the single roll
  product used across every plane `buildUp.membrane` assigns (manual entry
  only in V1, no catalogue picker). Absence keeps membrane's exact pre-V34C
  net-area-only behavior; setting it is what upgrades a membrane cost
  suggestion from `net-area` to the disclosed, overlap-inclusive `gross-area`
  basis. `MembraneTechnicalSpec` is deliberately **not** a member of
  `coveringTechnicalSpecSchema`'s union — a membrane never competes for
  roof-plane ownership the way a primary covering does. Resolved course
  counts, gross areas and roll counts are derived
  (`resolveMembraneLayout` in `@cieslacalc/roof-math`) and are never
  serialized. No `schemaVersion` bump.
- V35 note: `project.membraneProduct`'s type widens from the V34C raw
  `MembraneTechnicalSpec` to `MembraneProductSelection` (`@cieslacalc/
  covering-core`): `{catalogRef?, displaySnapshot?, technicalSpecSnapshot}`,
  the same shape `CoveringProductSelection` already used — so a membrane
  pick can carry catalogue provenance (Phase 4's `MembraneProductPicker`)
  exactly like a primary covering pick does. Backward compatibility is a
  **normalization, not a migration**: `membraneProductFieldSchema =
  z.union([membraneTechnicalSpecSchema, membraneProductSelectionSchema])
  .transform(...)` accepts either the old raw-spec shape (has `kind` at the
  top level) or the new wrapper shape, and normalizes an old raw spec into
  `{technicalSpecSnapshot: oldSpec}` on parse — every pre-V35 project still
  opens and shows its manual membrane product unchanged. No `schemaVersion`
  bump. Covered by `packages/calculator-core/src/project-document.test.ts`
  ("normalizes a V34C raw membrane spec..." / "round-trips a V35
  catalogue-backed membrane selection unchanged").
- V50 note: two additive-optional fields, no `schemaVersion` bump.
  `coverings[].purchase?: RoofTilePurchaseDecision` (`covering-core`
  `roof-tile-purchase-spec.ts`: `cutPolicy: 'no-offcut-reuse'`, integer
  `reserveBps` 0–5000, optional `packaging {saleUnit, piecesPerUnit,
  source}`, optional `accessories[]` with a snapshotted
  `roof-tile-accessory` spec and an explicit `userConfirmedRule`), allowed
  only on a `roof-tile` assignment; and
  `coverings[].product.commercialSnapshot?.packaging` (copied from the picked
  catalogue variant). Absence means "geometry only" — every older project
  opens unchanged. The purchase requirement itself is derived
  (`@cieslacalc/tile-procurement`) and never serialized.
- V50 catalogue: `CATALOG_PRODUCT_KINDS` gains `roof-tile-accessory` (stored
  in the existing `covering_kind varchar(32)`); `commercialVariant.metadata`
  types one key, `packaging`, in the existing JSON column. No migration.
  `QuantityUnit`/`PriceQuantityUnit` gain `pack` and `pallet` (additive enum
  values in the cost sidecar and price entries).
- V51 note: one additive-optional field, no `schemaVersion` bump.
  `project.roofSystem?: RoofSystemIntent` (`roof-system-core`
  `drainage-spec.ts`): `drainage?` (`enabled`, `mode: auto | manual`,
  `system?` snapshot of `roof-drainage-component` specs, `gutteredEaveIds?`,
  `corners?[] {endingEaveId, startingEaveId, connection}`, `outlets?[] {id,
  eaveId, station 0–1, downpipeHeightMm?, elbowCount?, clampCount?}`,
  `hookSpacing? auto | {manual, spacingMm}`) and `lineComponents?[]` (ridge
  tape / eave elements with an explicit `linear-effective-cover` or `manual`
  rule). Only user decisions are stored; runs, sections, hooks and every
  count are derived by `resolveDrainagePlan`. Eave IDs are the deterministic
  opaque IDs of `resolveRoofFeatureTopology`; an ID no longer present (roof
  type changed) is reported as `stale-eave-reference`, never re-mapped.
  Absence = no drainage; every older project opens unchanged.
- V51 catalogue: `CATALOG_PRODUCT_KINDS` gains `roof-drainage-component`
  (existing `covering_kind varchar(32)`); preview gains `drainageSystemKey`,
  `drainageRole`, `nominalSystemSize`, `maxSpacingMm`, `hand`. No migration.
- V52 note: additive-optional, no `schemaVersion` bump. `roofSystem.openings?[]`
  (`featureId`, optional `window` snapshot, optional `coveringClass
  profiled | flat`, optional `flashing` = catalogue kit snapshot or manual
  name + quantity); `lineComponents[]` gain optional `source`, `product`
  (`roof-system-component` spec snapshot + catalogRef), `featureIds`,
  `allowanceMm` and the rules `roll-length`, `one-per-feature-end`,
  `one-per-ridge-tile` (role-validated); `drainage.purchasePolicy?` and
  `outlets[].route?` (`straight` | `offset` + `offsetPipeLengthMm`, optional
  `dischargeElbow`). V51 documents parse unchanged.
- V52 catalogue: kinds `roof-system-component` and `roof-window-component`;
  preview gains `systemRole`, `windowRole`, `windowSystemKey`, `sizeCode`,
  `flashingCoveringClass`. `QuantityUnit` / `PriceQuantityUnit` gain `roll`.
  No migration.

---

## 2. `ProjectRecordV1` — saved-project envelope

| | |
| --- | --- |
| Owner | `packages/project-core/src/index.ts` |
| Current version | `schemaVersion: 1` |
| Validation | `projectRecordV1Schema` (Zod) |
| Persistence | `localStorage` keys `cieslacalc.projects.v1` (metadata index) and per-record entries; active project in `cieslacalc.activeProject.v1`; export file `*.cieslacalc.json` |
| Contains | `id`, trimmed `name`, ISO `createdAt`/`updatedAt`, nested `document` |

**Compatibility expectations**

- The envelope versions independently of the document it wraps.
- The index holds metadata only, so listing projects runs no geometry.
- A corrupt index can be rebuilt from individually valid records; one bad record
  does not block the others.
- `importProject` accepts a full record **or** a bare legacy
  `RoofProjectDocumentV1`, and always assigns a new local ID.

**Migration policy**

- Same rule as §1: additive optional fields are free; anything else needs a new
  envelope version and an explicit reader for both.
- A future `ApiProjectRepository` implements the same `list/get/save/delete`
  interface; the envelope is the wire shape and must stay serializable.

---

## 3. `CoveringTechnicalSpec` — covering technical snapshots

| | |
| --- | --- |
| Owner | `packages/covering-core/src/index.ts` |
| Current version | `COVERING_TECHNICAL_SCHEMA_VERSION = 1` |
| Validation | `coveringTechnicalSpecSchema` — a union of `roof-tile`, `modular-sheet` and `standing-seam` |
| Persistence | three places, all validated by this one schema: inside project documents (`product.technicalSpecSnapshot`), inside catalogue `technical_product_revisions.technical_spec` JSON, and inside canonical import batches |

**Compatibility expectations**

- This is why saved projects are reproducible (ADR-003). A stored snapshot must
  keep parsing for the life of the project archive.
- The same schema validates manual input, catalogue database JSON and API
  payloads. Never fork a DB-specific or API-specific copy.
- Additive-optional is the supported way to extend: V19 added
  `tileInstallationMode.coursePattern` as optional, so V18 snapshots still parse
  but cannot be laid out. Optional field + an explicit "cannot compute" status.
- `modular-sheet.lengthModel` discriminates `fixed-sheet` vs `cut-to-length`, and
  that choice selects the solver.
- V42 adds optional `modular-sheet.battenGaugeMm`. `moduleLengthMm` remains
  physical/profile repeat; the layout's required support gauge is
  `battenGaugeMm ?? moduleLengthMm` so pre-V42 snapshots behave unchanged.
  Optional advisory/physical metal facts preserve their meanings without
  making a recommended pitch a hard minimum. `standing-seam` gains optional
  recommended pitch and mass. No schema version bump or SQL migration: stored
  technical JSON is unchanged.
- **Effective dimensions may already encode installation overlap** (V26C). Any
  future overlap field must say explicitly whether it is already included, or
  the two will be double-counted.
- **No price field may ever be added here** (ADR-005).
- V35 note: this union stays **exactly** roof-tile/modular-sheet/
  standing-seam — primary coverings only. `catalog-core` has its own, wider
  `CatalogTechnicalSpec` union (§10) for the catalogue/revision boundary,
  which also accepts membrane and timber-stock. The two unions are
  deliberately different: a membrane or a stock length never competes for
  roof-plane ownership, so it must never satisfy this schema.

**Migration policy**

- Bumping `COVERING_TECHNICAL_SCHEMA_VERSION` invalidates every stored snapshot
  and every catalogue revision row simultaneously. Last resort.
- Prefer an optional additive field plus a solver status.
- An unavoidable bump needs a reader for both versions, a document upgrade path
  and a catalogue re-import plan, decided together.

---

## 4. `CatalogImportBatchV1` — canonical import payload

| | |
| --- | --- |
| Owner | `packages/catalog-core/src/index.ts` (`CATALOG_IMPORT_SCHEMA_VERSION`) |
| Current version | `schemaVersion: 1` |
| Validation | `catalogImportBatchV1Schema`, plus cross-reference and duplicate checks before any write |
| Persistence | not stored as a file. Its SHA-256 **checksum** over canonical JSON and per-entity counts are recorded in `catalog_import_batches` |

**Compatibility expectations**

- The only supported import format. Provider adapters (XLSX/XML/CSV/API) must
  terminate at this shape; manufacturer logic never enters the importer.
- Prices are rejected by the schema.
- A validation error or any conflict writes nothing at all.

**Migration policy**

- Additive optional fields are free.
- A required change is a new batch version with a new schema constant; the
  importer should accept the old one for at least one release.

**V35 note**: `products[].coveringKind` and `revisions[].technicalSpec`
accept the wider `CatalogProductKind`/`CatalogTechnicalSpec` values (§10) —
`membrane` and `timber-stock` batches use the exact same
`CatalogImportBatchV1` shape and importer pipeline as `roof-tile` batches
always have (`apps/api/src/data/import-batches/{membranes,timber-stock}-
2026-09.json`). No schema version bump; the existing
`covering-kind-mismatch` cross-check (`product.coveringKind ===
revision.technicalSpec.kind`) generalizes for free once both enums widen.

---

## 5. Catalogue database migrations

| | |
| --- | --- |
| Owner | `apps/api/src/db/schema.ts` + `apps/api/src/db/pricing-schema.ts` + `apps/api/src/db/business-schema.ts` (Drizzle), generated into `migrations/` |
| Current state | five migrations through `0004_mighty_madrox`; journal `migrations/meta/_journal.json` |
| Tables | Global catalogue/pricing tables plus `organizations`, `organization_assortment_items`, and `organization_import_batches` |
| Commands | `pnpm --filter @cieslacalc/api db:generate` / `db:migrate` |

**Compatibility expectations**

- Committed migrations only. Never automatic schema synchronization in
  production.
- Technical specifications live in a JSON column because covering families
  differ; every row is re-validated with `coveringTechnicalSpecSchema` after a
  MariaDB-compatible string decode. Database JSON is never trusted.
- Revision rows are write-once (ADR-004).
- **No price column exists**; adding one belongs to a separate commerce schema.

**Migration policy**

- Generate, review the SQL, commit it, then apply. Never hand-edit an applied
  migration.
- Rollback is backup/restore or a reviewed forward recovery migration.
- Normal CI does not need MySQL; the database job is opt-in
  (`workflow_dispatch` in `.github/workflows/ci.yml`).

**V35 note**: `0002_colorful_stranger` adds two nullable columns to
`price_list_entries` — `source_amount_basis varchar(8)` and
`source_vat_rate_bps int` (§11's `sourceAmountBasis`/`sourceVatRateBps`).
Purely additive; every pre-V35 row reads back with both `undefined`.

**V54/V55 note**: `0003_smooth_vampiro` adds organization-owned assortment and
price-list ownership. `0004_mighty_madrox` adds bounded-search indexes and the
missing `price_lists.organization_id → organizations.id` ownership constraint;
it changes no project document or stored technical snapshot.

---

## 6. Procurement public contract (V26D) — **runtime API, not persistence**

| | |
| --- | --- |
| Owner | `packages/procurement-core/src/model.ts`, exported through `src/index.ts` |
| Current version | frozen at V26D. **No `schemaVersion` field, by design.** |
| Validation | `validateCuttingPlanInput` / `ProcurementValidationError` with stable issue codes |
| Persistence | **none** |

This is the one entry in this registry that is **not** a persisted schema. A
`CuttingPlanInput` is assembled in memory and a `CuttingPlan` is a derived
result. Nothing procurement produces is written into `RoofProjectDocumentV1`,
`ProjectRecordV1`, `localStorage` or the database.

**Compatibility expectations**

- It is a *contract* rather than a *format*: the stability guarantee is to
  calling code, not to stored bytes. Breaking it breaks a compile, not an
  archive.
- Frozen meanings that must not drift (ADR-010): `requiredBlankLengthMm` is a
  required physical fabrication blank; `StockRequirement.lengthMm` is a
  commercial stock length; `stockClassId` is opaque; blanks are indivisible;
  `availability: undefined` means unlimited.
- The barrel exports the contract only. Solver internals (`fit`, `heuristic`,
  `bounded-search`, `optimizer`, `accounting`) are private and may change freely
  as long as behaviour and determinism hold.
- Optimality status is reported honestly and is part of the contract.

**Migration policy**

- Additive optional fields on inputs, and additive fields on results, are free.
- Renaming or repurposing a length field requires an ADR change first.
- **If a plan ever becomes persisted** — saved with a project, exported, or sent
  to a backend — it stops being a pure runtime contract and must be given its
  own `schemaVersion` and an entry in this registry *before* the first write.

---

## 7. `ExecutionDocumentV1` — transient output contract

V36 adds the renderer-neutral `material-list` section: categories, quantity
bases, ranges, partial flags, limitations, metrics and selected price
provenance. This remains transient; technical saved-project readers are unchanged.

`ExecutionDocument` V1 (`packages/document-core/src/index.ts`) is a **transient,
versioned output contract**, not a saved-project schema. It carries source
project ID/name/created/updated timestamps, ProjectDocument schema version,
generation time and discriminated execution sections. The browser print renderer
consumes it in memory; no document JSON, PDF or configuration is written to
ProjectRecord, localStorage or the database. The `version: 1` tag reserves an
explicit reader boundary if these output bytes are ever persisted or exchanged.
That future persistence requires its own compatibility policy and `ExportArtifact`
design, without changing `RoofProjectDocumentV1` by implication.

V51 adds the `drainage-plan` section (runs, outlets, downpipe heights,
plan-view outline; `hydraulicsNotVerified: true`, no quantities or prices).
It is optional: it counts toward the execution package only when drainage
is configured.

VNext adds the optional `source.inputFingerprint` (`documentInputFingerprint`
of the canonical project document, `rc1-<14 hex>`), printed in the page
footer. Additive and optional: documents built before VNext simply omit it;
`version` stays 1.

---

## 8. Browser storage keys

| Key | Owner | Contents |
| --- | --- | --- |
| `cieslacalc.projects.v1` | `apps/web/src/projects/local-repository.ts` | project metadata index |
| `cieslacalc.projects.v1:<id>` | same | one `ProjectRecordV1` |
| `cieslacalc.activeProject.v1` | same | active project ID |
| `cieslacalc.costEstimate.v1:<projectId>` | `apps/web/src/projects/cost-repository.ts` | one `CostScenarioV1` (§9) |
| display-unit preference | `apps/web/src/unit-preference.ts` | separate adapter; never part of a project |

Changing the shape behind a key requires a new key suffix (`.v2`) and a reader
that can still load the old one.

---

## 9. `CostScenarioV1` — cost estimate sidecar (V34B)

V36 adds optional `CostLine.priceProvenance` (manual/price-list source,
display label, entry ID, opaque variant ID and sale unit). Previously saved
sidecars still parse with this field absent. Accepted prices can be restored
offline with their source; directly editing a unit price clears its catalogue
reference and marks the price manual. Quantity ownership remains independent.

| | |
| --- | --- |
| Owner | `packages/cost-core/src/persistence.ts` (`costScenarioV1Schema`) |
| Current version | `schemaVersion: 1` |
| Validation | Zod, on every parse and before every write |
| Persistence | `localStorage` key `cieslacalc.costEstimate.v1:<projectId>` via `LocalCostRepository`; loaded/saved by `apps/web/src/assembly/use-cost-scenario.ts` |
| Contains | `currencyCode`, optional scenario-level `taxRateBps`, `lines: CostLine[]`, `metadata.updatedAt` |

**Compatibility expectations**

- Deliberately **not** part of `RoofProjectDocumentV1` or `ProjectRecordV1`.
  Commerce is one layer downstream of geometry/quantity/procurement (ADR-005);
  by the same reasoning that keeps a `CuttingPlan` out of the canonical
  document (§6, ADR-009), a cost estimate stays out of it too. It never enters
  roof Undo/Redo history (ADR-002).
- Keyed by project ID, independent of `ProjectRecordV1`'s own save/dirty
  tracking in `ProjectSession`. Deleting a project does not automatically
  delete its sidecar row today — a known V35 cleanup item.
- `CostLine.quantityBasis` and `.suitability` are named, stable strings (never
  a numeric confidence score) so a UI can render them without knowing the
  originating suggestion. `document-core`'s `CostEstimateSection.lines[].basis`
  duplicates the same string union independently, by convention (document-core
  stays a zero-dependency package; see its entry below).
- No price ever enters `RoofProjectDocumentV1`, `CoveringTechnicalSpec`, the
  catalogue schema, `quantity-core` or `procurement-core` — `tools/architecture
/layering.test.ts`'s "commercial boundary" tests fail the build if it does.

**Migration policy**

- Additive optional fields are free, same rule as §1/§2.
- A required change bumps `costScenarioV1Schema`'s version and needs an
  explicit reader for both, since existing sidecar rows must keep loading.
- A corrupt or unreadable row must not block opening the project: it is
  treated as absent and a fresh empty scenario is offered instead.

---

## 10. `CatalogTechnicalSpec` — generalized catalog technical union (V35)

| | |
| --- | --- |
| Owner | `packages/catalog-core/src/index.ts` + `timber-stock-spec.ts` |
| Current version | `TIMBER_STOCK_TECHNICAL_SCHEMA_VERSION = 1` (new, for the `timber-stock` branch only — the other two branches keep their own independent versions, §3) |
| Validation | `catalogTechnicalSpecSchema = z.union([coveringTechnicalSpecSchema, membraneTechnicalSpecSchema, timberStockTechnicalSpecSchema])` |
| Persistence | `technical_product_revisions.technical_spec` (unconstrained `json` column — already accepted any shape) and canonical import batches (§4) |

**Compatibility expectations**

- Strictly **wider** than §3's `CoveringTechnicalSpec`: every valid covering
  spec is still valid here, but a membrane or timber-stock spec is never
  valid as a `CoveringTechnicalSpec` — the two unions serve different
  boundaries on purpose (§3's V35 note).
- `technicalProductFamilySchema.coveringKind`,
  `catalogProductSummarySchema.kind` and `catalogSearchQuerySchema.kind` all
  widened together to `CATALOG_PRODUCT_KINDS = ['roof-tile',
  'modular-sheet', 'standing-seam', 'membrane', 'timber-stock']`. The field
  name stays `coveringKind` in the DB column and API for compatibility even
  though its meaning is now general — decision recorded in
  `docs/adr/ADR-011-catalog-kind-is-general.md`.
- `TimberStockTechnicalSpec` (`{schemaVersion, kind: 'timber-stock',
  widthMm, depthMm, lengthMm, strengthClass?, species?, kilnDried?, planed?,
  treated?, moisturePercentRange?, salesUnit}`) treats `lengthMm` as a
  **technical fact**, not a commercial-variant attribute: a distinct
  (width, depth, length, grade, treatment) combination is one product family
  with one revision, never a shared family with size-variants (mirrors how
  a differently-treated same-section item must be a different revision, so
  a purchase can never silently substitute one grade for another).
- V49: `declaredApplications?: ('batten' | 'counter-batten' |
  'structural-framing' | 'general')[]` — what the **source** declares or markets
  the product for, never a RoofCalc structural adequacy claim. Additive and
  optional under the same `TIMBER_STOCK_TECHNICAL_SCHEMA_VERSION = 1`: every
  V35 revision stays valid and immutable, and absence means *not declared*,
  not *general*. The product picker only offers a product for a use its source
  declares, so a same-section product marketed for something else is never
  suggested. The exact source wording is kept in the revision's
  `source.label` and in `docs/domain/BATTEN_COMMERCIAL_PRODUCTS_RESEARCH.md`.
  `technicalPreview()` also exposes `treated` and `declaredApplications`
  (additive fields on the strict preview schema).
- `isCoveringTechnicalSpec(spec)` narrows this wider union back down to the
  §3 subset for consumers that are covering-scoped by construction (e.g.
  `CatalogProductPicker.tsx`).

**Migration policy**

- No DB migration was needed to introduce this (confirmed: the JSON column
  and `covering_kind varchar(32)` already accepted arbitrary values) —
  purely a Zod-schema widening.
- Adding a further product kind follows the same pattern: widen
  `CATALOG_PRODUCT_KINDS` and `catalogTechnicalSpecSchema`'s union, add a
  `technicalPreview()` branch, no schema version bump unless the new kind's
  own technical shape changes meaning later.

---

## 11. `PriceList` / `PriceListEntry` — commercial price-list model (V34C, extended V35)

| | |
| --- | --- |
| Owner | `packages/pricing-core/src/{model,persistence}.ts` |
| Current version | `PriceImportBatchV1`: `schemaVersion: 1` |
| Validation | `priceListSchema` / `priceListEntrySchema` (Zod), plus `priceImportBatchV1Schema`'s cross-reference and duplicate-ID checks before any write |
| Persistence | `price_lists` / `price_list_entries` tables (§5); not part of `RoofProjectDocumentV1` or `ProjectRecordV1` — commerce stays downstream of geometry (ADR-005), same reasoning as §9 |

**Compatibility expectations**

- `PriceListEntry` is write-once per entry ID (ADR-004): an unchanged
  re-import is a no-op, any diff is a conflict — a real price change needs a
  new entry ID, never a silent overwrite of price history
  (`comparePriceListEntry`).
- `commercialVariantId` is an opaque string; `pricing-core` never imports
  `catalog-core` (confirmed by `tools/architecture/layering.test.ts`'s
  commercial-boundary assertion).
- V35 note: `sourceAmountBasis?: 'net' | 'gross'` and `sourceVatRateBps?:
  number` are additive optional **provenance** fields — pure record-keeping,
  never used to compute anything at read time. `netAmountMinor` stays the
  one number everything downstream actually uses, and it is always
  already-net; these two fields only say whether the *source* priced net or
  gross and at what stated rate, so a net figure derived from a gross retail
  price (`apps/api/src/data/import-batches/timber-prices-2026-09.json`:
  `netAmountMinor = round(grossAmountMinor / 1.23)` from a source-stated 23%
  VAT) stays auditable back to that source. `pricing-core` never infers a
  VAT rate from free text and never computes gross-from-net at read time.
  Absent on every pre-V35 entry (reads back as `undefined`); no
  `schemaVersion` bump (§5's V35 note covers the matching migration).

**Migration policy**

- Additive optional fields on `PriceList`/`PriceListEntry` are free, same
  rule as §1/§2/§9.
- A required change to what `netAmountMinor` *means* would need a new
  `PriceImportBatchV1` schema version and an explicit reader for both —
  not expected, since "always net, always minor units" is meant to be a
  frozen invariant like §6's procurement contract.

---

## 12. Checklist for any schema change

2026-10-17 migration recovery: no SQL or canonical schema version change.
The eight immutable SQL files are executed with explicit TIMESTAMP defaults.
Runtime readiness checks journal timestamps/hashes and column presence against
the shared Drizzle bundle; see `DATABASE_RECOVERY_AND_CLOUDFLARE.md`.

V59: migration `0006_daily_chamber.sql` adds nullable `phone`, `email`, `website`,
`default_validity_days` and `offer_footer` to `organizations`; migration 0005 is unchanged.
`Organization` and `QuoteOrganizationSnapshot` gain optional contact/logo fields;
`QuoteDraft` gains optional `footer`. Version 1 readers continue accepting old drafts.
Company identity/footer are frozen on first quote save and preserved on subsequent saves;
new quotes use the company's validity default (14 days when absent). Roof/project schemas are unchanged.

1. Which registry entry does this touch?
2. Does an existing valid document still parse? If no → new version + explicit reader.
3. Does it change the meaning of an existing field? If yes → new version, never a silent reinterpretation.
4. Does it need a database migration? Generate, review, commit.
5. Does it affect saved-project reproducibility (ADR-003)?
6. Does it turn a runtime contract into a persisted one (§6)? If yes, version it first.
7. Add or update a reference fixture in `fixtures/projects/` so the change is covered.
8. Update this registry in the same change.

V60: migration `0007_brainy_mandarin.sql` adds `organization_memberships.active`
(default true) and nullable organization-owned `organization_assortment_items.vat_rate_bps`.
Existing memberships retain access; unknown VAT stays unknown. No technical revision,
roof document or quote schema version changes. Quote VAT remains a commercial snapshot.

## Device-local recent-project preference (Guided Workbench)

`cieslacalc.recentProjects.v1` is a best-effort localStorage string array of up to
20 opaque project IDs in last-opened order, owned by `apps/web/src/projects/recent-projects.ts`.
Missing, invalid or inaccessible storage falls back to existing project update
order. Deleted IDs are ignored by intersection with the repository list. This
is a device navigation preference, never part of RoofProjectDocumentV1,
ProjectRecordV1, SQL, Business, export or canonical Undo history. No migration.

## 13. `RecognitionResult` / `ImportedRoofDraftV1` — document import (VNext, session-only)

Owned by `packages/document-import-core` (ADR-012). `RecognitionResult` is the
runtime contract every recognition engine returns; `recognitionResultSchema`
(zod) validates it at the boundary, so a future external engine is untrusted
input. `ImportedRoofDraftV1` (`schemaVersion: 1`) is derived by
`deriveImportedRoofDraft(source, results, decisions)` and is **not
persisted**: no localStorage key, no SQL, never part of
`RoofProjectDocumentV1`, `ProjectRecordV1`, exports or Undo history. Values are
canonical mm / degrees; page coordinates use the page's own space (`pt` for
PDF, `px` for images, top-left origin). The source file's bytes are never
stored. Only the confirmed result enters the existing project-start path.
Persisting a draft later (e.g. to resume a review) requires a new entry here,
a storage key and a reader for version 1.

## 14. Workbench section state (VNext, transient)

`WorkbenchViewState.constructionSection: 'project' | 'structure'` records
which navigation section shows the shared construction drawing. Transient view
state (ADR-002): never serialized, never in history, reset with the
workbench. No migration.

## 15. `project.connectionPlan` — connection plan (VNext-2, persisted)

- Owner: `packages/connection-core` (`roofConnectionPlanSchema`), embedded in
  `RoofProjectDocumentV1.project` by `calculator-core`.
- Shape: `{ version: 1, nodes: { [RoofNodeKind]?: { fastening?: { type,
  diameterMm?, perNode? }, connector?, note? } } }`. Decisions only — no
  counts, spacings or capacities.
- Additive optional: absent on every older project and whenever nothing is
  planned (`withPlannedConnection` drops empty nodes and an empty plan). An
  older app version that parses a newer file drops the field (zod strips
  unknown keys) — the roof itself is unaffected.
- Validation: a fastener or connector must be one the catalogue offers for
  that node kind; `perNode` 1–50; diameter 2–30 mm; note ≤ 240 characters.
- History: `setConnectionPlan` is one undo entry; every store composition
  site carries the field (test: `connections/plan-store.test.ts`).
- VNext-3 (additive): node kinds `jack-rafter-purlin`, `purlin-hip-rafter`,
  `interrupted-rafter-header` may appear as plan keys. Every older plan
  still parses; an older app reading a newer file rejects the unknown key —
  open newer files in the current app. Node occurrences themselves are
  derived (`resolveRoofConnectionNodes`), never persisted; the census row
  unit `member` (wall-plate anchorage) is derived as well.
- VNext-4: the "Zaproponuj połączenia" assistant writes only existing plan
  fields (fastening `type`, `connector`); no new key, no version change.

## 16. VNext-4 additive contracts (no project schema change)

- Business assortment import (API request, not persisted as a schema):
  column mapping gains optional `catalogVariantId`; match reason
  `catalog-id`; issue `unknown-catalog-variant` (warning). An older API
  rejects the unknown mapping key (strict schema) — deploy API and web
  together. Persisted assortment rows are unchanged.
- Catalogue seed batch `drainage-galeco-stal2-colours-2026-10-vnext4.json`:
  commercial variants only (20 colour variants of Galeco STAL² gutters and
  downpipes), registered in `CATALOGUE_SEED_BATCHES` and the Worker
  readiness manifest (checksum). Additive; no migration.
- CAD (DXF) import produces session-only analysis objects
  (`CadPlanAnalysis`); only the confirmed project-start values become a
  project through the existing path. Nothing new is persisted.
- Universal file opening classifies by bytes (`apps/web/src/import`); no
  storage key.
- VNext-5: `ExecutionDocument` (§7, transient output) gains the additive
  section kind `connection-plan` (`ConnectionPlanSection`: per node kind
  count/unit, modelled carpentry type, planned fastening/connector/note,
  status; `capacityNotVerified: true`). Offered only when something is
  planned. Nothing persisted.
- VNext-5: the drawing camera is remembered per roof type for the session
  (`apps/web/src/assembly/camera-memory.ts`) — view state, never in the
  project, cleared when another project document is loaded.

- RecognitionResult (§13) additions in VNext-2, session-only: mode
  `transcription`; evidence `dimension-row`, `chain-total`, `chain-part`,
  `transcribed`; relation `dimension-chain`; warnings `scaled-value-only`,
  `dimension-chain-mismatch`.

## 17. VNext-6 additive contracts (session-only, no project schema change)

- `ImportSource.fingerprint?` (§13): SHA-256 hex of the file computed on
  the device. Optional; never derived from the name; never persisted.
- `ImportDecisions.excludedPages?` / `pageRoles?`: pages set aside and
  corrected page roles. Session-only review decisions; `withoutPages`
  drops readings, statements, segments and relations of a set-aside page.
- `PageRoleSuggestion`, `IntakeSummary`, `FieldProvenance`: derived views of
  a draft (`suggestPageRoles`, `summarizeIntake`, `fieldProvenance`).
- `CadPlanAnalysis` gains the variant `{ status: 'unsupported', reason:
  'compound-outline', unit, outline, warnings, preview }` — a recognised
  L/T/U outline in mm (`PlanOutlineClassification`). Nothing is proposed.
- `ImportIntakeReport` (`apps/web/src/assembly/project-preparation.ts`): what
  an import gave the project it created (value sources, pages read/skipped,
  read time, fingerprint). React state bound to that project; dropped when
  another project opens; never stored.
- `RoofSceneGraph` `contractVersion: 1` (`packages/roof-topology-core`,
  ADR-015): derived from solver output or recognition; not persisted, no
  storage key, no SQL. The V1 → V2 document migration that would persist it
  is designed in ADR-015 and not executed.

## 18. VNext-6.1 contracts

- **Import evidence sidecar** (persisted, browser only): key
  `cieslacalc.importEvidence.v1.<projectId>`, `importEvidenceV1Schema`
  (`apps/web/src/projects/import-evidence.ts`), `schemaVersion: 1`:
  source kind, file name, device fingerprint (hex), import time, where each
  start value came from, the start values the project was created with, page
  and timing facts, and the review state (`opened`, `confirmed`
  field → exact value, `confirmedAt`). No file bytes, text or images.
  Outside `RoofProjectDocumentV1` / `ProjectRecordV1` (like the cost
  sidecar §9): exports, fingerprints and Undo are unchanged. Invalid or
  foreign data is ignored; unknown keys are stripped; entries of deleted
  projects are pruned. Version 2 would need a reader for version 1.
- `HealthResponse.databaseReason?` (`@cieslacalc/shared`, additive):
  `access-denied | database-missing | timeout | unreachable | tls | unknown`
  when `database` is `unavailable`. A generic class only — the server
  message never leaves the API. Older clients ignore it.
- `ReadinessIssueCode` gains `import-defaults-unconfirmed` (warning) and
  `roof-graph-inconsistent`; `ProjectLimitation` gains
  `import-defaults-unconfirmed`; `ReadinessAction` gains
  `review-import-defaults`. Derived, never persisted.
- `RoofSceneAssessment` gains `tolerances`; `RoofSceneIssue.severity` gains
  `note`; `RoofPlaneMetrics` gains `openingAreaExact` / `netAreaMm2?`.
  Derived only.

## 19. VNext-7A contracts (designed; nothing the app persists changes)

- `MonoPitchRoofSpec` / `monoPitchRoofSpecSchema`
  (`packages/roof-math/src/mono-pitch-roof.ts`): `type: 'mono-pitch'`,
  building length, run, pitch, low eave / high / verge overhangs, top edge
  `free | abutment` (an abutment has no high overhang), optional low
  bearing elevation. Same ranges as the gable/hip schema. **Not** a
  `RoofTemplateSpec` and not part of `RoofProjectDocumentV1`.
- `RoofProjectDocumentV2` / `roofProjectDocumentV2Schema`
  (`packages/calculator-core/src/project-document-v2.ts`),
  `schemaVersion: 2`: `structures[]` (`template-roof` holding exactly
  a V1 `project`, read by the V1 reader; or `mono-pitch` holding a
  `MonoPitchRoofSpec`), each with an opaque ID and a transform
  (`translationMm`, `rotationAboutVerticalDeg`); `connections` must be
  empty (none are modelled yet); duplicate structure IDs are rejected.
  `roofProjectDocumentV2FromV1` gives one structure `structure:roof` with
  the identity transform and byte-identical content;
  `roofProjectDocumentV1FromV2` returns V1 only when nothing is lost (one
  template roof, identity transform, no connections) and otherwise a
  reason. Tested over all ten reference projects.
- **Gate:** no application reads or writes V2
  (`tools/architecture/layering.test.ts`). Turning V2 on requires a
  version bump here, a reader for V1 and V2, and downstream adapters
  (covering, quantities, documents) for every structure kind — ADR-015.
- `ResolvedRoofLineInput.kind` in `roof-topology-core` gains
  `abutment`; the adapter's `template` gains `mono-pitch`. Derived only.

## 20. VNext-7B-1 contracts (derived; nothing persisted changes)

- `EndCut.end` (`timber-model`) gains `top`: the upper plumb end of a
  rafter that meets no ridge. Derived geometry only.
- `MonoPitchFramingSpec` / `monoPitchFramingSpecSchema` (`roof-math`):
  the 7A surface spec + rafter section and spacing + low and high support
  (`wall-plate | ledger`, width, height, seat). Not stored anywhere; the
  designed V2 `mono-pitch` structure still holds only the surface spec and
  will gain these fields with the V2 writer.
- `ResolvedCoveringLayout` now lives in `calculator-core`
  (`covering-layouts.ts`); the web export adapter re-exports it.

## 21. VNext-7B-2 / 7B-3 contracts

- `createMonoPitchSkeleton` returns a `RoofSkeleton` (no type change): the
  same member conventions as the gable skeleton. Derived only.
- `counterBattenRowsOnPlane`, `summarizeCounterBattens`,
  `resolveMembraneLayoutOnPlanes`: plane-generic engines; results keep their
  existing shapes. `MonoPitchRoofSystem` gains `skeleton`, `counterBattens?`,
  `membrane?`.
- **Mono-pitch workspace draft** (persisted, browser only): key
  `cieslacalc.monoPitchDraft.v1`, `{ schemaVersion: 1, draft }` — the
  workspace inputs in mm and degrees. Validated on read; anything invalid or
  foreign falls back to the example; a full storage only loses the
  convenience. Not a project, not exported, no Undo history. The V2 project
  writer gate is unchanged. VNext-7B-5 adds `purlins[]` (position, width,
  height, seat; at most four) — additive: a draft saved before has none.
- `MonoPitchFramingSpec.intermediateSupports?` (VNext-7B-5, derived): up to
  four purlins; result `MonoPitchFraming.purlins` (ID, position, seat level).

## 22. VNext-7C contracts (session-only and browser draft; no project schema change)

- `RecognitionResult.roofType.value` and `DetectedRoofType` gain
  `'mono-pitch'`; `ImportRoofType` is `'gable' | 'hip' | 'mono-pitch'`
  (`ProjectRoofType` keeps the two a project can hold). Session-only (§13):
  nothing persisted changes. A mono-pitch draft maps to
  `RoofStartParameters` with the same names (width = run, eave = low eave)
  and opens the mono-pitch workspace, never `createProjectStartTemplate`.
- Mono-pitch workspace draft (§21, `cieslacalc.monoPitchDraft.v1`) adds
  `pitchSource: 'angle' | 'plate-tops'`, `lowPlateTopMm`,
  `highPlateTopMm` — additive and optional on read: a draft saved before
  opens with the defaults (typed angle). Still schema version 1.
- Import sample drawings: static files `apps/web/public/samples/*.pdf`,
  byte-identical to `fixtures/documents` (generator + test). Not data.
