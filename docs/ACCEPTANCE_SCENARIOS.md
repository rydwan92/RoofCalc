# User Acceptance Scenarios

Stable end-user flows. Each one is a promise about behaviour, not about pixels.

**Status legend** — `AUTOMATED`: covered by a fast test and/or the reference
corpus. `BROWSER`: additionally covered by `pnpm e2e` in a real browser.
`MANUAL`: needs a person. `PLANNED`: not implemented.

Reference project archives live in `fixtures/projects/` and are asserted by
`fixtures/projects/reference-projects.test.ts`.

---

## QUICK-001 — Quick common rafter · `AUTOMATED`

1. Open the app. Quick Calc is the default mode.
2. Enter run to ridge axis, pitch and eave overhang.
3. Read rafter length, cuts and the compact drawing immediately, with no mode
   switch and no save.

**Holds:** values update reactively; the same solver as Builder produces them;
the display-unit preference applies throughout; no project is created.

---

## BUILD-001 — Builder gable · `AUTOMATED` `BROWSER`
Fixture: `01-basic-gable.cieslacalc.json`

1. From Quick Calc, open Builder. The current Quick inputs carry over.
2. The skeleton canvas shows the gable with both roof planes and the rafter
   pattern.
3. Toolbox selects an object; the Inspector edits its exact values; the context
   bar names the current selection.

**Holds:** two roof planes; a K1 common-rafter family with a resolved count;
every geometric value reachable as an exact number; entering Builder creates or
restores a named local project.

---

## BUILD-002 — Builder hip · `AUTOMATED`
Fixture: `02-basic-hip.cieslacalc.json`

1. Switch the roof type to hip.
2. Four roof planes resolve: left, right, front, rear.
3. H1 hip rafters and J1 jack rafters appear as their own families with compound
   cut data.

**Holds:** no view-specific formula — the hip is a discriminated template
resolved by pure functions; hip and jack cuts state their exact reference plane.

**Known limitation:** a hip whose building length equals twice the half-run
degenerates to a pyramid with no ridge; opening framing reports
`unsupported-complex-boundary` there. The reference hip is 12 m long for this
reason.

---

## OPEN-001 — Roof windows: duplicate, align, distribute, frame · `AUTOMATED`
Fixtures: `03-gable-three-roof-windows`, `04-hip-opening-framing`

1. Add a roof window, then duplicate it twice.
2. Multi-select the three and align them; then distribute them along the eave.
3. Plan framing for one window and accept it.

**Holds:** three openings deduct from the net roof area of one plane; alignment
and distribution are canonical edits with Undo; accepting framing stores an
`acceptedGeometrySignature` so later geometry changes report the framing as
stale rather than silently re-deriving it; framing adds exactly two headers
carrying `sourceFeatureId` and `openingRole`, and splits crossing rafters into
segments carrying `sourceMemberId` (ADR-007).

---

## LAYER-001 — Roof layers · `AUTOMATED` `BROWSER`

1. Open the Layers task.
2. Enable membrane, counter-battens and battens; set gauge and offsets.
3. The active layer is dominant in the drawing; roof boundaries and openings stay
   readable; other members remain subdued context.

**Holds:** membrane reports net area; battens and counter-battens report visible
length with openings subtracted; counter-battens on a hip roof report the
`unsupported-hip-counter-battens` limitation instead of guessing. A gross
membrane resolver is **not** implemented.

---

## COVER-001 — Roof tile · `AUTOMATED`
Fixture: `05-gable-roof-tile.cieslacalc.json`

1. Open the Covering task and add a roof tile product (manual or catalogue).
2. Choose the installation mode and assign roof planes.
3. Read the whole-assignment result and the selected-plane result separately.

**Holds:** the batten gauge must lie inside the product's gauge range or the
result is `incompatible`, not merely a warning; a resolved layout emits trusted
**coverage positions**; the schedule states these are geometric positions, not a
purchase quantity.

---

## COVER-002 — Fixed modular sheet · `AUTOMATED`
Fixture: `06-gable-fixed-modular-sheet.cieslacalc.json`

**Holds:** coverage uses effective width and effective length, never total; U is
one coherent plane-level grid, not recentred per hip row; positions classify as
full / cut-at-roof-edge / cut-at-opening / split-by-opening; a declared module
length must agree with the resolved batten gauge or the product is reported
incompatible.

---

## COVER-003 — Standing seam · `AUTOMATED`
Fixture: `07-gable-standing-seam.cieslacalc.json`

**Holds:** runs are connected visible components of the strip grid; the result
reports column count, physical run count, total geometric length and exact
length groups; the position count equals the sum of the length groups; an
over-long run reports `transverse-joint-required` without inventing a joint
position.

---

## COVER-004 — Cut-to-length metal · `AUTOMATED`
Fixture: `08-gable-cut-to-length-sheet.cieslacalc.json`

**Holds:** the V22 variable-panel kernel is reused, not copied; a partial-width
opening leaves one connected notched run while a full-width opening splits the
strip; a hip's diagonal edge counts as an edge cut even at full nominal width;
`orderLengthMm` is **absent** because the technical schema does not encode
start/end allowances or permitted manufactured lengths; an over-long run reports
`segmentation-required` and stays one candidate.

---

## CAT-001 — Catalogue product → technical snapshot · `AUTOMATED`
Fixture: `09-hip-catalogue-snapshot.cieslacalc.json`

1. Open the Product Picker from the Covering task.
2. Filter by manufacturer and covering family, search, page past the first page.
3. Apply a product.

**Holds:** applying re-fetches and validates the exact displayed revision, then
makes **one** canonical covering edit containing `catalogRef`, a small
`displaySnapshot` and a deep-copied `technicalSpecSnapshot`; the solver sees only
the snapshot; editing a catalogue-derived technical value detaches `catalogRef`
in the same edit; the manual path is always offered.

---

## SAVE-001 — Save and reopen a project offline · `AUTOMATED` `BROWSER`

1. Edit geometry in Builder. The project becomes dirty and autosaves 800 ms after
   the last change (never during an open gesture).
2. Reload the page with the catalogue API unreachable.
3. The project reopens with the edit intact and recalculates.

**Holds:** view, camera, task, selection and unit changes never schedule a write;
autosave adds no Undo entry; a write failure keeps the document editable and
offers JSON export; catalogue *browsing* is the only thing lost offline
(ADR-006). `apps/api/src/app.test.ts` proves all four catalogue routes answer
`503 catalog-unavailable` without `DATABASE_URL`.

---

## MOBILE-001 — Exact values on a phone · `AUTOMATED` `BROWSER`

1. At 390×844, open Builder. A six-task dock replaces the desktop columns.
2. Open Tools, choose the roof, and edit pitch as an exact number.
3. Every task view opens without horizontal scrolling.

**Holds:** exactly one sheet owns the screen at a time; the Toolbox chooses
objects while the Inspector owns exact values; **every editable geometric value
has an exact numeric input on mobile too** — this scenario exists because
choosing the roof from the mobile Toolbox previously led nowhere.

---

## PROC-001 — Procurement golden scenario · `AUTOMATED`

Owned by `packages/procurement-core/src/index.test.ts` and
`optimizer-hardening.test.ts`. **Not duplicated in `fixtures/projects/`.**

Given explicit required fabrication blanks, stock options for one opaque stock
class, and cutting settings (kerf, end trim, reusable-remnant threshold):

**Holds:** one indivisible blank is assigned to one stock item and is never made
from two remnants; `usable = stockLength − 2 × endTrim` and
`kerfTotal = max(0, cuts − 1) × kerf`; a blank longer than every stock option is
reported `piece-longer-than-stock` rather than truncated; finite `availability`
is respected and exhaustion is reported; the three objectives
(`minimum-waste`, `minimum-purchased-length`, `minimum-stock-count`) select
different plans; search is bounded per stock class with a deterministic heuristic
fallback; optimality is reported as `heuristic`,
`proven-within-search-space` or `search-budget-exhausted` — never "optimal";
identical input yields an identical plan and `deterministicSignature`.

**Explicitly not covered, because it does not exist:** any bridge from the
Material Schedule to `RequiredPiece[]`, any UI, any persisted plan, any price.

---

## RESULT-001 — Truthful takeoff semantics · `AUTOMATED` `BROWSER`

1. Open a resolved covering and then its Material Schedule row.
2. Read the primary count and expand its basis/result-layer explanation.

**Holds:** tile and fixed-sheet results say **coverage positions**; standing seam
and cut-to-length say **geometric runs**; membrane says net geometric area;
timber distinguishes member-axis from resolved-visible length. Execution,
cutting and purchase remain pending/unavailable unless their real upstream
results exist. No geometric count is called an order quantity, and the same
disclosure is reachable without horizontal overflow on desktop and mobile.

---

## CUT-001 — K1 fabrication blank to commercial cutting · `AUTOMATED` `BROWSER`

1. Open a gable or hip Builder and choose Zestawienie → Drewno → K1.
2. Open the K1 cutting task, enter at least two commercial lengths and run it.
3. Read grouped commercial stock lengths/quantities, copy the list and inspect
   an individual proportional cut layout.

**Holds:** only whole K1 instances with the currently modeled centered
ridge-board butt cut become indivisible required blanks; no axis row is
silently promoted. Kerf, stock-end trims and reusable-remnant threshold are
separate user inputs. Too-short or exhausted stock leaves explicit unassigned
blanks. H1, J1 and opening-framing members do not enter the cutting plan. The
scenario is transient, works offline and creates no roof Undo entry. The same
task is reachable at 1440×900, 1024×768, 390×844 and 360×800.

---

## PERF-001 — Large layouts stay usable · `MANUAL`

1. Build a long roof with a fine covering grid so fragment count exceeds 1200.
2. The drawing switches to simplified technical linework.

**Holds:** the simplification is purely visual — domain counts, lengths and
quantities are unchanged, and the Auto/Detailed/Simplified control creates no
project history.

---

## COMPOUND-001 — Higher house + lower garage · `PLANNED`

**Not implemented.** No multi-structure document, transform, connection graph or
scene UI exists.

Intended flow once ProjectDocument V2 lands (ADR-008):

1. A project contains two structures: House and Garage, each with its own local
   roof, framing, build-up and coverings.
2. A project-level Scene view lists them and edits each one's position,
   elevation and rotation.
3. Selecting Garage enters the familiar roof workbench, scoped to it.
4. A connection between the garage roof and the house wall is declared
   explicitly and resolved by a separate connection resolver.
5. Quantities and procurement report per structure, per connection and per
   project, with junction material counted once.

Blocked on the research in `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md`:
transform convention, identity scheme, contact anchors, connection classes,
prototype coalescing and the V1→V2 migration.
