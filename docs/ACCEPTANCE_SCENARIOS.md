# User Acceptance Scenarios

Stable end-user flows. Each one is a promise about behaviour, not about pixels.

**Status legend** — `AUTOMATED`: covered by a fast test and/or the reference
corpus. `BROWSER`: additionally covered by `pnpm e2e` in a real browser.
`MANUAL`: needs a person. `PLANNED`: not implemented.

Reference project archives live in `fixtures/projects/` and are asserted by
`fixtures/projects/reference-projects.test.ts`.

## EXPORT-001 — Execution package · `AUTOMATED` `BROWSER`

1. Open a local project in Builder and choose **Eksport** in the project header.
2. Review section readiness; without a current K1 plan, the cutting section is
   unavailable and offers a direct route to the K1 planner.
3. Preview selected A4 pages, including project summary, roof diagram, compact
   member schedule and K1 preparation with the proven blank.
4. Choose **Drukuj / Zapisz PDF** and use the browser print destination.

**Holds:** source ID/name/updated timestamp and schema are truthful; print
contains no workbench controls; geometry and quantity values come from existing
resolved results; H1/J1 execution instructions and purchase amounts are omitted;
section selection and preview create no roof Undo entry. At 390×844 and 360×800
the export remains usable without horizontal page overflow.

---

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

## START-001 — Guided Creator start and Quick handoff · `AUTOMATED` `BROWSER`

1. With no saved project, open Creator at 1440×900 and 390×844.
2. Choose **Szybki start**; enter building length and width, then pitch and
   eave, then rafter spacing; review and create.
3. Separately, enter exact Quick Calc geometry and choose **Otwórz w
   Kreatorze**.

**Holds:** the start offers guided, example and advanced paths; each step shows
only its fields with a sketch and short help; the plan preview comes from the
resolved skeleton; validation names the field; the final step shows geometry,
construction and K1 cutting readiness and any limitation; full width maps to
`halfRunMm = width / 2`; Quick width, pitch and eave appear as confirmed values
with **Zmień** and an unchanged hand-off yields the identical assembly; first
creation starts with empty history; a later creation produces a separate
record; no supported viewport scrolls horizontally.

---

## START-002 — Example project never overwrites · `AUTOMATED` `BROWSER`

1. Have an active project. Open **Projekty → Nowy projekt → Projekt
   przykładowy** and choose the hip example.

**Holds:** the card is labelled "Projekt przykładowy — nie projekt
konstrukcyjny."; exactly one new record is created from fixture 02; the
previously active record is unchanged; the hip roof is visible and Materials
is reachable.

---

## NAV-001 — Perspectives and contextual return · `AUTOMATED` `BROWSER`

1. In Projekt › Pokrycie jump to Materiały › Plan materiałów, then follow a
   link back to Pokrycie.
2. Open Materiały › Rozkrój K1 from Dokumenty; open a document preview.
3. Press **Cofnij zmianę** after a geometry edit.

**Holds:** only the active perspective's tasks are shown (plus a jump menu);
the context bar names the location and offers **← {target}** with a human
label; Back returns to the remembered location; document preview returns with
**← Centrum dokumentów**; navigation creates no history and is not persisted;
Undo still reverts the canonical edit.

---

## COVER-STUDIO-001 — Technical coverage versus material preview · `AUTOMATED` `BROWSER`

1. Add a roof tile whose centred effective grid produces edge cuts; run the
   automatic batten fit.
2. Inspect the technical view, then switch to **Pogląd materiału**; change
   **Układ w poziomie** to "Zacznij od lewej krawędzi".

**Holds:** visible fragments stay clipped to the plane with the outline on top;
edge-cut positions show dashed nominal cells whose count equals the edge-cut
count; the legend names the nominal cell; the note says physical projection
beyond the edge is not modelled; the preview renders tile glyphs without
changing any count; the per-plane summary explains the alignment; switching
views creates no history.

---

## COVER-UX-001 — Explicit covering family and source · `AUTOMATED` `BROWSER`

1. Open an uncovered roof and choose Pokrycie.
2. Choose a family, then catalogue or manual source.
3. Leave a manual form incomplete, then complete and confirm it.
4. Inspect the scheme, contextual legend and plane-assignment cards.

**Holds:** family/source navigation creates no canonical covering and no Undo
entry; only a valid confirmation commits one assignment; the scheme uses
family-specific visual rhythm without claiming physical purchase pieces; plane
cards expose translated name, area and assigned state; full, cut, opening,
problem and selection states use semantic styling plus non-colour cues.

---

## STRUCT-001 — Collar-tie structural system · `AUTOMATED`

1. On a gable project, switch structural system from Więźba krokwiowa to
   Więźba krokwiowo-jętkowa.
2. Edit the collar-tie height above the wall plate and its section.
3. Switch back to Więźba krokwiowa.

**Holds:** enabling the system creates one collar tie per rafter station with
a positive resolved length, a distinct 3D colour and a member-schedule row
coded `C1`; height and section are one shared value editable from either the
roof panel or a selected collar tie; a height that would reach the ridge is
rejected as invalid input; disabling the system removes every collar-tie
member and its schedule row; no collar tie ever enters `RoofFabricationPackage`
or the K1 cutting plan; each toggle is exactly one Undo entry.

---

## RIDGE-001 — K1 ridge connection variants · `AUTOMATED`

1. On a gable project, open the ridge properties and read the default
   connection.
2. Switch to Połączenie bezpośrednie (direct meeting), then to Nakładka
   (half-lap).
3. With each connection, inspect K1 preparation, the K1 cutting plan and the
   execution export.

**Holds:** the default is Deska kalenicowa and reproduces the pre-V32 K1
geometry exactly; direct meeting resolves a K1 blank longer than the board
case and shows a distinct assumptions note; half-lap shows an inline note
that its geometry is not modeled, hides K1 preparation and the cutting plan,
and the export's assumptions section explains why instead of silently
omitting the section; switching connection always invalidates a previously
planned cutting plan, even when the required length happens to coincide.

---

## PERF-001 — Large layouts stay usable · `MANUAL`

1. Build a long roof with a fine covering grid so fragment count exceeds 1200.
2. The drawing switches to simplified technical linework.

**Holds:** the simplification is purely visual — domain counts, lengths and
quantities are unchanged, and the Auto/Detailed/Simplified control creates no
project history.

---

## BUILDUP-001 — Automatic battens from roof-tile covering · `AUTOMATED`

1. Assign one roof-tile covering with a valid installation gauge range.
2. Use **Dopasuj łaty automatycznie** from the grouped compatibility warning.
3. Change roof geometry, inspect each plane result, switch to manual and Undo.

**Holds:** the repair is one canonical history entry; each plane uses an integer
number of equal intervals inside the stored technical range; the first and last
station equal the explicit eave/ridge references with no accumulated drift;
the compatibility warning disappears; manual mode retains its exact numeric
gauge; Undo restores the earlier intent. Repeated per-plane gauge warnings are
shown as one cause with the affected plane count.

---

## BUILDUP-002 — Hip counter-battens with openings · `AUTOMATED`

1. Enable counter-battens on a rectangular hip roof.
2. Add a roof opening that crosses one resolved K1 or J1 axis.
3. Inspect the layer, material schedule and export.

**Holds:** K1/J1 counter-batten axes remain visible and contribute exact
opening-split segment lengths; the crossed axis has two visible segments; the
H1 boundary detail remains a structured partial warning without removing the
useful axes; summary, material and export views report consistent axis, segment
and total visible length facts.

---

## SCENE3D-001 — One project, two renderers · `AUTOMATED`

1. Open the gable example and switch the workspace to **3D**.
2. Click a rafter in the scene, then isolate it, then show the whole roof.
3. Switch view presets (Izometria / Z góry) and projection
   (Perspektywa / Ortogonalny).
4. Switch back to **2D**.

**Holds:** the 3D scene draws the same resolved skeleton as the 2D drawing; the
3D click sets the one canonical selection, so the Inspector, context bar and
breadcrumb follow; the same member is still selected in the 2D drawing
afterwards; isolation, camera, preset, projection and filters create no project
history and are never persisted; the page never scrolls horizontally; returning
to 2D needs no interaction with the canvas.
Covered by `e2e/technical-3d.spec.ts` at 1440×900 and 390×844.

---

## SCENE3D-002 — Hip roof stays truthful in 3D · `AUTOMATED`

1. Open the hip example in 3D.
2. Open **Rodziny** and read the offered families.
3. Select an H1 hip rafter, then a J1 jack rafter.

**Holds:** K1, H1 and J1 are all drawn and individually selectable, each mapped
to its own physical member identity; the family filter lists only families this
roof actually resolves; every solid is reference geometry and the HUD states
"Geometria referencyjna — detal połączenia nie jest jeszcze modelowany" for
H1/J1. No finished hip face, backing or compound cut solid is drawn, and no cut
or notch is subtracted from any member. No console errors.

---

## SCENE3D-003 — Collar ties in space · `AUTOMATED`

1. Open the collar-tie example in 3D.
2. Select one collar tie.
3. Return to 2D.

**Holds:** collar ties are drawn in their correct spatial location with their
own semantic colour and appear in the family filter; selecting one selects the
same canonical member in the 2D drawing.

---

## SCENE3D-004 — 3D unavailable never breaks the workbench · `AUTOMATED`

1. Open the workspace in 3D on a device or browser without a usable WebGL
   context.

**Holds:** the workspace says "Widok 3D jest niedostępny na tym urządzeniu."
and offers **Wróć do 2D**; the project document and its history are untouched;
all 2D calculations, schedules and exports remain fully available. Covered by
`apps/web/src/assembly/scene3d/TechnicalScene3D.test.tsx`, which runs in JSDOM
where WebGL genuinely does not exist.

---

## HIP-001 — The hip counter-batten dead end becomes a decision · `AUTOMATED`

1. Open the hip example and enable the counter-batten layer.
2. Read the counter-batten status and the 2D layer view.
3. Choose one of the two offered hip details.
4. Open the Material Plan.

**Holds:** before the choice the result is *partial*, names the real split
(`interiorAxisCount` axes, zero hip runs) and draws each undecided hip as a
dashed reference — it is never silently absent. Both offered details carry a
sketch and an explanation, and neither is pre-selected. Choosing
`paired-plane-runs` adds exactly two runs per hip, once each, and the total grows
by exactly the reported added length; choosing `no-dedicated-run` resolves the
layout and adds nothing. Interior K1/J1 axes are identical either way. The
Material Plan upgrades from *CZĘŚCIOWE* to *GEOMETRIA* with the new total without
recomputing any geometry, and the figure stays labelled a geometric visible
length. The choice is one Undo/Redo entry.
Covered by `e2e/hip-execution.spec.ts` and
`packages/roof-math/src/hip-execution.test.ts`.

---

## HIP-002 — J1 terminates against a physical hip face · `AUTOMATED`

1. Resolve a hip roof with no hip execution intent.
2. Select `hip-face-butt` as the J1 connection.

**Holds:** without the intent every J1 is `reference-only` with the structured
reason `hip-connection-not-selected`, and no finished length is reported. With
it, the finished end is `referenceLengthMm − hipWidthMm / √2 / cos(pitch)`, every
cut angle is unchanged (the face is parallel to the centre plane), and the
reference geometry is preserved untouched alongside it. A physical termination
without the hip section width is rejected, not guessed. J1 does **not** become
procurement-ready: no fabrication allowance has been declared (ADR-009).

---

## HIP-003 — K1 shows its finished cuts in 3D · `AUTOMATED`

1. Open a project in the technical 3D view.
2. Toggle between *Wykonawczy* and *Referencyjny*.

**Holds:** the finished solid is the solver's own machined profile extruded by
the section width — no boolean operation, no new dependency — and its roof-plane
reference line coincides with the skeleton axis to within 1e-6 mm across pitches,
overhangs and both roof sides. Without a resolved seat reference the solid stays
unresolved rather than being guessed. The scene states that K1 is finished while
H1/J1 remain reference geometry. The toggle is transient and creates no history.
Covered by `packages/roof-math/src/finished-rafter-solid.test.ts` and
`e2e/hip-execution.spec.ts`.

---

## INSTALL-001 — Covering-first batten workflow · `AUTOMATED` `BROWSER`

1. Hip roof → Pokrycie → catalogue roof tile (KODA seed). The tile takes all
   four planes; mode is sole and shown as Standardowy; pitch ✓.
2. **Rozmieść łaty automatycznie** → AUTO, gauge within 39–43 cm, rows per
   plane, whole-roof geometric length (= sum of per-plane solver totals).
3. **Dodaj kontrłaty z konstrukcji** → "Częściowo · 4 grzbiety H1 wymagają
   wyboru detalu" → **Szczegóły montażu** opens the composite plan.
4. Choose the hip detail → counter-battens Gotowe; Material Plan shows the same
   batten and counter-batten lengths as geometry.

Tests: `e2e/v43b-installation.spec.ts`, `batten-workflow.test.ts`,
`Page.test.tsx` (V43B), `batten-layout-audit.test.ts`.

## INSTALL-002 — Expert manual gauge · `AUTOMATED` `BROWSER`

Manual gauge before or after a covering is validated (unverified / compatible /
mismatch with range), retained across product change, and **Dopasuj
automatycznie** is one undoable history step. No covering + Auto never shows a
350 mm ready layout. Covering removal keeps Auto intent with zero rows.

## TRUST-001 — Calculator oracles and reference numbers · `AUTOMATED`

Independent K1/H1 trigonometry, roof-area formulas, metamorphic (run, pitch,
eave, overlap, gauge) and symmetry checks pass
(`calculator-oracles.test.ts`). Fixtures 01, 02, 04, 05, 09, 10 keep their
roof area, K1/H1 length, K1/J1 counts and batten/counter-batten totals
(`reference-projects.test.ts`).

## TRUST-002 — Quick explains itself · `AUTOMATED` `BROWSER`

Quick K1 shows one dominant length; hovering the birdsmouth fact highlights it
in the drawing without history; "Jak policzono?" ends with the same length.
Invalid inputs are flagged at the field and never change the project; switching
covering Technical/Visual changes no counted position (`input-guards.test.tsx`).

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
