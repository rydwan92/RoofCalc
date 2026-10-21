# RoofCalc VNext-6.1 / VNext-7 preflight

Branch `feature/vnext-6-1-hardening` from `main` @ `6d391ef` (VNext-6),
2026-10-21. Inputs: `docs/Vnext/AUDYT_ROOFCALC_VNEXT6.md` and
`docs/Vnext/COPILOT_NEXT_ITERATION_VNEXT7.md` (user-supplied audit and brief,
kept untracked in the main checkout).
Every finding below was checked in the code or by running it; each is marked
**potwierdzony błąd** (confirmed defect), **luka testowa** (missing test) or
**rekomendacja**.

## 0. Baseline

| Gate | Result |
| --- | --- |
| `pnpm verify` on `6d391ef` (end of VNext-6) | green — 198 test files / 2014 tests (13 skipped), builds and bundle boundaries clean |
| `pnpm e2e` on `6d391ef` | 160 passed / 32 conditionally skipped / 0 failed |
| CI on `6d391ef` | two green workflows (audit §2) |

One mid-edit `verify` run on this branch failed a single test because the test
and the module were being rewritten at the same moment; it is not a baseline
failure.

## 1. The pipeline as the code runs it

```text
DocumentImportWorkspace (apps/web/src/document-import)
  → document-import-core: recognizeTextLayer / recognizeVectorGeometry
    → deriveImportedRoofDraft → summarizeIntake / fieldProvenance
    → mapDraftToRoofStart
  → createProjectStartTemplate (apps/web/src/assembly/project-start.ts)
  → createRoofProjectDocument (calculator-core) → ProjectSession.createFromDocument
  → roof-math: resolveRoofTemplate · resolveRoofSurfaceGeometry · resolveRoofFeatureTopology
  → deriveProjectReadiness → deriveProjectJourney → deriveProjectPreparation
  → MaterialPlan / quantity-core → export-adapter → document-core (ExecutionDocument)
```

## 2. Findings

| # | Finding | Evidence | Class | Status |
| --- | --- | --- | --- | --- |
| 1 | The preparation card set `reviewed = true` on the click that only OPENED the editor — looking was treated as confirming | `Page.tsx` `ProjectPreparationCard.onAction` (VNext-6) | **potwierdzony błąd** | fixed: `needs-review → reviewing → reviewed`, explicit "Potwierdzam", confirmation bound to the exact values, expires on change; e2e covers open → leave → reload → still pending, change → `changed`, confirm, Undo → pending again |
| 2 | Where each start value came from was lost after a reload or reopening | `ImportIntakeReport` lived in React state only | **potwierdzony błąd** (provenance) | fixed: versioned import-evidence sidecar (no document content), pruned with deleted projects |
| 3 | `roofSceneFromResolvedRoof` / `assessRoofScene` had no production caller | repository search: only the package and its tests | **potwierdzony** (audit P0) | fixed: `apps/web/src/assembly/roof-scene.ts` is the one adapter; its assessment gates documents through readiness; all 10 reference projects pass identity tests |
| 4 | Boundary coverage summed lengths: duplicates could hide a gap | `assess.ts` (VNext-6) | **potwierdzony** (reproduced: two half-eaves) | fixed: interval union per side, `edge-overlap` + `boundary-unclassified` |
| 5 | No self-intersection, repeated-vertex or frame/normal/pitch consistency checks | `assess.ts` | **luka testowa** + gap | fixed with negative and positive tests |
| 6 | Openings checked by corners only; overlapping openings summed twice | `assess.ts`, `build.ts` | **potwierdzony** (reproduced on a concave plane) | fixed: every side checked, `openings-overlap`, metrics `openingAreaExact` / no net area when inexact |
| 7 | Structure overlap by bounding boxes gave false junction alarms | `assess.ts` | **potwierdzony** (reproduced: roof in an L's notch) | fixed: narrow phase on plan outlines; tolerances reported |
| 8 | `mergeRoofScenes` let colliding IDs through silently | `build.ts` | **potwierdzony** | fixed: `RoofSceneMergeError` with the colliding IDs |
| 9 | Worker `/api/health` said only "unavailable"; the configurator could not repair a stale Hyperdrive password | `http/handler.ts`, `configure-cloudflare.ts`; live: Worker `database: unavailable` while the same credentials worked from the laptop | **potwierdzony** (operations) | fixed: generic `databaseReason`; configurator offers to store the password step 5 verified (consent, shell-less, never logged) |
| 10 | Converted slopes displayed as `34.9920201985586` | `Inputs.tsx` | **potwierdzony** (UX) | fixed: display to 0.0001°, stored value unchanged |
| 11 | Same dimension on two sheets in different units; a sheet set aside after its value was confirmed | `document-import-core` | **luka testowa** | added; behaviour already correct (agreement, conflict on hidden mismatch, confirmation withdrawn) |
| 12 | No measurement of recognition quality beyond one demo file | — | **rekomendacja** → started | `fixtures/import-benchmark` (schema, metrics, synthetic cases, real-pdf.js test) |
| 13 | Cost-estimate sidecars stay in storage after a project is deleted | `projects/cost-repository.ts` has no prune | **potwierdzony** (minor, not user-visible) | rekomendacja: same prune as import evidence (next iteration) |
| 14 | `Page.tsx` ≈ 3 950 lines, `DocumentImportWorkspace.tsx` ≈ 2 300 | — | **rekomendacja** | only touched parts extracted (`roof-scene.ts`, `import-evidence.ts`); no broad refactor |
| 15 | Memory/cancel on 20–50 page PDFs | `pdf-runtime.ts`: 30-page cap, sequential thumbnails, worker terminated on close, load token cancels stale loads | evaluated | no change needed now |
| 16 | Duplicate sources of truth / two forms for one value | card lists values and links to the one input; no second input | evaluated | none found |

## 3. What VNext-7A may build on

- The roof graph is now in production as a gate; a mono-pitch solver in
  `roof-math` produces planes and lines, `roofSceneFromResolvedRoof`-style
  adaptation gives the graph, and the gate decides what documents may show.
- Import evidence keeps "z dokumentu / domyślne / potwierdzone" across
  sessions, so a future import of a mono-pitch design can reuse it.
- `RoofProjectDocumentV1` stays the only persisted roof; V2 remains a
  designed, not executed, migration (ADR-015).

## 4. VNext-7A outcome (bounded slice, started after P0 was green)

| Brief item | Done | Evidence |
| --- | --- | --- |
| Domain document | `docs/domain/MONO_PITCH_ROOF.md` — frame, wall heights, run/rise/pitch, low/high overhang, supports, top edge free/abutment, ranges, formulas, six reference vectors | V1–V6 hand-checked (exact `tan 15° = 2 − √3`) |
| Independent solver, discriminated type with validation | `resolveMonoPitchRoof`, `monoPitchRoofSpecSchema`, `monoPitchFromBearingElevations` in `roof-math` | 15 tests; 6 × 4 m, 15°: rise 1071.797 mm, area 24/cos 15° = 24.846628 m² |
| No invented rafters | the result has no members, cuts or supports; `MONO_PITCH_SOLVER_SCOPE` says framing/fabrication/covering/drainage `not-supported` | key-set test |
| Existing scene adapter, one model | same `roofSceneFromResolvedRoof` → `complete` / `not-supported` | 3 tests next to the production adapter's |
| V1 readable; V1→V2 designed and tested; V2 writing a separate gate | `project-document-v2.ts`; architecture test keeps it out of `apps/` | 45 tests over the 10 reference projects |
| Not end-to-end | no UI entry, nothing persisted, documents unchanged | VNext-7B: covering, battens, membrane, drainage, quantities, cost, documents, V2 on |
