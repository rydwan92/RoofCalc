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
- **Effective dimensions may already encode installation overlap** (V26C). Any
  future overlap field must say explicitly whether it is already included, or
  the two will be double-counted.
- **No price field may ever be added here** (ADR-005).

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

---

## 5. Catalogue database migrations

| | |
| --- | --- |
| Owner | `apps/api/src/db/schema.ts` (Drizzle), generated into `migrations/` |
| Current state | one migration, `0000_catalog_platform`, journal `migrations/meta/_journal.json` |
| Tables | `manufacturers`, `technical_product_families`, `technical_product_revisions`, `commercial_variants`, `catalog_import_batches` |
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

`ExecutionDocument` V1 (`packages/document-core/src/index.ts`) is a **transient,
versioned output contract**, not a saved-project schema. It carries source
project ID/name/created/updated timestamps, ProjectDocument schema version,
generation time and discriminated execution sections. The browser print renderer
consumes it in memory; no document JSON, PDF or configuration is written to
ProjectRecord, localStorage or the database. The `version: 1` tag reserves an
explicit reader boundary if these output bytes are ever persisted or exchanged.
That future persistence requires its own compatibility policy and `ExportArtifact`
design, without changing `RoofProjectDocumentV1` by implication.

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

## 10. Checklist for any schema change

1. Which registry entry does this touch?
2. Does an existing valid document still parse? If no → new version + explicit reader.
3. Does it change the meaning of an existing field? If yes → new version, never a silent reinterpretation.
4. Does it need a database migration? Generate, review, commit.
5. Does it affect saved-project reproducibility (ADR-003)?
6. Does it turn a runtime contract into a persisted one (§6)? If yes, version it first.
7. Add or update a reference fixture in `fixtures/projects/` so the change is covered.
8. Update this registry in the same change.
