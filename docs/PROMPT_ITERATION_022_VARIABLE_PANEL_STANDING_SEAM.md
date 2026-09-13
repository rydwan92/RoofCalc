# PROMPT_ITERATION_022

# Recovery Closeout, Variable-Length Panel Core,

# Standing Seam Engine and Professional Covering UX

Continue RoofCalc / CieślaCalc from the CURRENT repository HEAD.

Expected starting commit:

b0a7f103984eb7e6aa80aceea5fe2452f2042798
"V21.1 niepeny"

IMPORTANT:

The previous Codex session was interrupted.

Do NOT assume the commit message accurately describes what is or is not complete.
Most V21.1 source changes appear to be present.

FIRST recover and validate the real current state.

Only after the recovery gate is green should you implement V22.

V22 must introduce:

1. a reusable variable-length panel/run geometry kernel,
2. the first full consumer of that kernel:
   STANDING SEAM roofing.

Do NOT implement the full cut-to-length modular-sheet strategy in this iteration.
Do NOT implement catalogue/backend/prices/project saving.

================================================== 0. MANDATORY PREFLIGHT
==================================================

Read completely:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/DOMAIN_RESEARCH_ROADMAP.md
- docs/domain/COVERING_PRODUCT_MODEL.md
- docs/ARCHITECTURE_V18_OPENING_PRODUCTIVITY_AND_COVERING_PLATFORM.md
- docs/ARCHITECTURE_V19_TILE_ENGINE_AND_COVERING_WORKBENCH.md
- docs/ARCHITECTURE_V20_MOBILE_WORKBENCH_UX.md
- docs/ARCHITECTURE_V21_WORKBENCH_HARDENING_AND_MODULAR_SHEET.md
- docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md
- docs/PROMPT_ITERATION_021_WORKBENCH_MODULAR_SHEET.md

Inspect current:

- packages/covering-core
- packages/quantity-core
- calculator-core ProjectDocument
- roof-math surface geometry
- Page.tsx
- CoveringWorkspace.tsx
- MaterialSchedule.tsx
- Inspector.tsx
- Toolbox.tsx
- store/workbench
- styles/translations
- current V21.1 changes

Run:

git status
git log -1 --oneline
git diff
git diff --stat

npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check

Record actual baseline.

Do not discard user work.

==================================================

1. RECOVER V21.1 FIRST
   \==================================================

Audit the interrupted V21.1 commit against its intended closeout scope.

Verify in actual source that:

- build-up schedule is compact by default,
- exact batten/counter-batten lengths remain available after expansion,
- quantity-core exact grouping was NOT weakened,
- totals remain unchanged,
- desktop Material Inspector does not reserve width when nothing is selected,
- row selection still exposes Inspector,
- Covering schedule title is generic "Pokrycia",
- roof-tile and modular-sheet rows are identified separately,
- no `assembly.roofTile` translation key leaks into UI,
- covering assignment strip behaves responsively,
- Covering drawing fit works for:
  gable rectangle,
  hip trapezoid,
  hip triangle,
- sticky controls do not visually cover technical content,
- mobile behavior from V20 is preserved.

Fix only demonstrated incomplete/regressed items.

If browser QA is available:
perform it now.

If not:
state that honestly.

Do not restart V21.1 from scratch.

================================================== 2. V22 DOMAIN RESEARCH
==================================================

Before implementation reverify current official manufacturer documentation for
variable-length standing-seam/panel roofing.

Research multiple independent systems.

At minimum verify concepts such as:

- effective/covering width,
- total width,
- selectable width variants where applicable,
- minimum panel length,
- maximum panel length,
- seam/profile height,
- minimum pitch,
- permissible transverse joints/overlaps if documented,
- panel direction,
- any hard distinction between:
  continuous full-slope panel
  and
  panel systems allowing transverse joining.

Update:

docs/domain/COVERING_PRODUCT_MODEL.md

Use manufacturer material as DOMAIN EVIDENCE,
not as a production catalogue.

There must be no:

if manufacturer === ...

branches.

================================================== 3. IMPORTANT ARCHITECTURAL DECISION
==================================================

Do NOT implement standing seam as an isolated one-off layout engine.

Create a reusable internal pure variable-panel geometry boundary.

Conceptually:

VariablePanelRunInput
VariablePanelRunResult

or another clean final name.

It must model the generic geometry:

roof-plane polygon +
void/opening polygons +
effective panel width +
horizontal grid origin +
minimum panel length +
maximum panel length
↓
parallel panel strips
↓
continuous visible run intervals
↓
physical panel candidates

This kernel should later be reusable by:

standing seam
cut-to-length sheet/profile systems

without knowing either product kind.

================================================== 4. PACKAGE BOUNDARY
==================================================

The reusable variable panel engine belongs in:

@cieslacalc/covering-core

Pure TypeScript only.

Forbidden dependencies:

React
DOM/SVG
Zustand
Express
database
HTTP
translation
manufacturer catalogue
price.

Do not put it in roof-math.

roof-math knows roof geometry.

covering-core knows covering layout.

================================================== 5. COORDINATE CONTRACT
==================================================

Keep existing roof-plane local coordinates.

u:
parallel to eave

v:
up-slope

Standing-seam/panel strips run primarily in the v direction.

A plane-level horizontal grid is defined in u using:

effectiveWidthMm.

Never derive layout from screen coordinates.

Never use rendered SVG size as geometry input.

================================================== 6. STANDING SEAM LAYOUT INTENT
==================================================

Extend the covering layout-intent union backward-compatibly.

Add:

StandingSeamLayoutIntent

Conceptually:

{
kind: 'standing-seam',
horizontalAlignment:
| 'centered'
| 'from-u-min'
| 'manual',

planeOffsetsMm?: Record<roofPlaneId, number>
}

Do not reuse modular-sheet intent via casting.

Old V21 documents must parse unchanged.

================================================== 7. PRODUCT INSTALLATION MODE
==================================================

StandingSeamTechnicalSpec already supports installation modes with:

effectiveWidthMm
totalWidthMm?
minPitchDeg?

Use selectedInstallationModeId exactly like other product families.

When multiple standing-seam modes/widths exist:

require an explicit selection.

Do not silently pick a width.

One-mode manual product may auto-select its only mode.

================================================== 8. GENERIC VARIABLE PANEL STRIPS
==================================================

For each assigned plane:

create one deterministic U grid.

Each nominal strip:

[fromU, toU]

with width:

effectiveWidthMm

except edge clipping.

The grid must remain coherent across the entire roof plane.

Do NOT independently recenter each V interval or roof opening fragment.

================================================== 9. ROOF POLYGON INTERSECTION
==================================================

For each strip derive the covered V interval(s) inside the roof-plane polygon.

This generic algorithm should naturally support:

rectangular gable planes
trapezoidal hip planes
triangular hip planes

without branching on roof type.

A narrowing hip plane simply creates shorter edge runs.

================================================== 10. OPENINGS — CRITICAL DIFFERENCE
==================================================

Standing seam is NOT the same as V21 fixed-sheet clipping.

A roof opening may interrupt one nominal vertical panel strip.

Example:

ridge
│
│ panel upper segment
│
┌──── O1 ────┐
└─────────────┘
│
│ panel lower segment
│
eave

Represent these as separate CONTIGUOUS RUN SEGMENTS.

Do NOT represent one disconnected polygon as one physical panel.

This distinction is critical for:

physical panel count
panel lengths
future purchasing
future flashing logic.

================================================== 11. VARIABLE PANEL RUN RESULT
==================================================

Return renderer-independent structured data.

Conceptual direction:

VariablePanelPlaneResult {
roofPlaneId
columns[]
}

VariablePanelColumn {
id
columnIndex
nominalFromUMm
nominalToUMm
effectiveVisibleWidthMm
edgeClassification
runs[]
}

VariablePanelRun {
id
fromVMm
toVMm
lengthMm
cause:
full-slope
opening-interrupted
edge
status
}

Final naming may differ.

IDs must be deterministic.

================================================== 12. WIDTH EDGE CLASSIFICATION
==================================================

Columns clipped by side/hip boundaries must be distinguishable from full-width
columns.

Example statuses:

full-width
edge-cut-width

Do NOT infer manufacturer-specific minimum allowable edge widths.

A very narrow edge strip remains a geometric result with an explicit future
technical limitation.

================================================== 13. PANEL LENGTH LIMITS
==================================================

Apply:

minPanelLengthMm
maxPanelLengthMm

to each contiguous run.

Run shorter than minimum:

status/issue:
below-min-panel-length

Run longer than maximum:

status/issue:
exceeds-max-panel-length

Do NOT silently split a long run in V22.

This is intentional.

================================================== 14. TRANSVERSE JOINTS — DO NOT AUTO-SOLVE YET
==================================================

StandingSeamTechnicalSpec may contain:

transverseOverlap

but V22 must NOT automatically invent transverse panel segmentation just because
an overlap dimension exists.

A valid joint may depend on:

support location
installation direction
manufacturer rule
slope
water-flow detail
minimum segment length.

Therefore:

if run > maxPanelLength:

return:

transverse-joint-required

or equivalent structured limitation.

Architecture may expose the verified technical overlap data,
but do not create fake joint positions.

This boundary will support future advanced segmentation.

================================================== 15. STANDING SEAM STRATEGY
==================================================

Implement:

resolveStandingSeamLayout(...)

as a thin product-specific strategy over the generic variable-panel kernel.

Responsibilities:

- validate standing-seam product/mode,
- choose effective width,
- minimum pitch compatibility,
- call variable-panel resolver,
- translate generic run issues into covering-layout issues,
- produce StandingSeamLayoutResult,
- create quantity facts.

Do not duplicate polygon/opening math.

================================================== 16. STANDING SEAM RESULT
==================================================

Expose useful structured facts:

status
assignmentId
selected mode
planes

aggregate:

columnCount
panelRunCount
fullWidthColumns
edgeCutColumns
openingInterruptedRuns
totalPanelLengthMm
minimumRunLengthMm
maximumRunLengthMm

per-plane equivalents.

Do not call them purchase quantities.

================================================== 17. QUANTITY SEMANTICS
==================================================

Standing seam should expose BOTH:

physical geometric panel-run count
and
total geometric panel length.

Example:

31 odcinków paneli
186.42 m długości geometrycznej

These are different dimensions.

Do not merge them.

Extend the covering quantity source cleanly.

Possible safe direction:

CoveringProductQuantitySource {
quantity
unit: piece
totalLengthMm?
lengthGroups?
}

Do not force standing seam into timber rows.

Do not create meaningless project-wide:
pcs + metres
totals.

================================================== 18. LENGTH GROUPING
==================================================

For standing-seam runs expose deterministic exact-length groups.

Use the same principle as timber:

no grouping based only on display rounding.

Example:

8460.0000001
and
8460.0000002

may group under numerical tolerance.

8460
and
8461

must remain different even if a coarse UI formatter would hide the difference.

Keep canonical mm.

================================================== 19. PROJECT DOCUMENT
==================================================

Standing seam assignment remains a normal:

CoveringAssignmentSpec.

Store:

technical snapshot
catalogRef optional
selected installation mode
layout intent
roofPlaneIds.

DO NOT serialize:

columns
runs
panel lengths
quantities
render geometry.

Derived layout re-resolves.

================================================== 20. MANUAL STANDING-SEAM PRODUCT
==================================================

Until catalogue backend exists provide a manual product path.

Add:

- Rąbek stojący

Only alongside currently supported:

Dachówka
Blacha modułowa

No fake future options.

Manual standing-seam default is a GENERIC editable technical product.

Do not brand it as a manufacturer product.

================================================== 21. MANUAL PRODUCT INSPECTOR
==================================================

Primary fields:

Nazwa produktu
Sposób / szerokość krycia
Szerokość krycia
Minimalna długość panelu
Maksymalna długość panelu
Minimalny kąt połaci

Advanced:

Szerokość całkowita
Wysokość rąbka
Grubość blachy
Materiał

Do not expose raw schema IDs.

All normal lengths respect current cm/mm/m display preference.

Canonical remains mm.

================================================== 22. MULTIPLE WIDTH MODES
==================================================

Support a standing-seam technical product with multiple effective-width modes.

Example conceptual UX:

Szerokość krycia

○ 47,5 cm
○ 35,5 cm
○ 27,1 cm

Do not hard-code these exact example values in production.

They belong only to research/tests when appropriate.

Changing mode:

one canonical history edit
full re-resolution.

================================================== 23. COVERING WORKSPACE
==================================================

Reuse the shared Covering shell from V21.

Do NOT create StandingSeamWorkspace as an entire duplicate page.

Shared:

assignment selector
product/source identity
status
plane tabs
summary
drawing frame
legend
boundary note

Strategy-specific:

tile grid
fixed sheet grid
standing seam panel strips/runs.

================================================== 24. STANDING SEAM DRAWING
==================================================

Visualize:

vertical/eave-to-ridge panel strips
edge-cut widths
openings
interrupted upper/lower runs
selected roof plane.

Do not render decorative realistic seam profiles.

This is technical geometry.

Use subtle seam lines only if useful.

Never allow visual density to make 100+ SVG items unusable.

================================================== 25. VISUAL STATES
==================================================

Reuse current semantic tokens.

Full panel:
normal covering state.

Edge-width cut:
cut state.

Opening interruption:
warning/context marker.

Invalid too-long/too-short run:
warning.

Do not introduce a new random colour palette.

================================================== 26. STANDING SEAM SUMMARY UX
==================================================

Example only:

RĄBEK STOJĄCY · PARAMETRY RĘCZNE

Układ rozwiązany

24 pasy
31 odcinków paneli
186,42 m łącznie

Pełna szerokość 20
Docinane krawędzie 4
Przerwane otworami 3

Długość:
218–846 cm

Keep it compact.

================================================== 27. SELECTED PLANE SUMMARY
==================================================

Clearly distinguish:

whole assignment total

from:

selected plane result.

Do not ambiguously mix them.

Example:

CAŁE POKRYCIE
31 paneli

LEWA POŁAĆ
14 paneli · 82,6 m

================================================== 28. MATERIAL SCHEDULE
==================================================

Extend generic:

POKRYCIA

section.

Example:

Rąbek stojący — ręczny

31 odcinków
186,42 m geometrycznie
218–846 cm

[ Pokaż długości ]

Expanded:

846 cm × 8
792 cm × 4
...

Reuse the V21.1 presentation principle:

compact default
exact detail on demand.

Do NOT create another kilometre-long default list.

================================================== 29. COVERING QUANTITY BOUNDARY
==================================================

Keep clear language:

geometryczne odcinki paneli

not:

arkusze do zamówienia

or:

ilość do kupienia.

V22 does NOT include:

waste
offcut reuse
manufacturing allowance
transport allowance
packaging
fasteners
clips
flashings
ridge/eave accessories
price.

================================================== 30. MINIMUM PITCH
==================================================

Use existing compatibility semantics.

Below declared min pitch:

"incompatible with implemented technical condition"

NOT:

unsafe
not watertight
forbidden structurally.

Maintain the project's established safety boundary.

================================================== 31. COVERING ASSIGNMENT CONFLICTS
==================================================

V21 plane exclusivity remains mandatory.

One primary covering per plane.

Standing seam:
must participate in the same:

resolvePrimaryCoveringAssignments

flow.

Do not create special conflict logic.

Conflicted planes produce no trusted quantity.

================================================== 32. PERFORMANCE
==================================================

Do not persist React state for each panel/run.

One memoized layout result.

Rendering may use a simplified representation when panel fragment count exceeds a
documented threshold.

Domain result stays exact.

Opening:
Inspector
details
length disclosure
assignment selection

must not rerun roof geometry unnecessarily.

================================================== 33. MOBILE
==================================================

Preserve V20 architecture.

At 360–430 px:

- all covering types remain accessible,
- assignment selector remains usable,
- drawing is primary,
- exact parameters in Inspector sheet,
- standing-seam mode selection usable by touch,
- length summary readable,
- no horizontal page overflow.

Do not reintroduce stacked editor + canvas + inspector.

================================================== 34. QUICK
==================================================

Quick remains unchanged.

Do not add standing seam to Quick.

================================================== 35. TESTS — V21.1 RECOVERY
==================================================

Keep/add only targeted tests necessary to prove recovered closeout behavior.

Do not duplicate existing tests.

================================================== 36. TESTS — GENERIC VARIABLE PANEL ENGINE
==================================================

At minimum:

1. rectangular plane one continuous interval per strip,
2. triangular hip plane,
3. trapezoidal hip plane,
4. deterministic column grid,
5. centered U alignment,
6. from-U-min alignment,
7. manual offset,
8. full-width strip,
9. edge-cut strip,
10. one opening splits a run,
11. multiple openings create multiple contiguous runs,
12. opening outside strip has no effect,
13. stable IDs/order,
14. min length violation,
15. max length violation,
16. finite geometry only,
17. no manufacturer branching.

================================================== 37. TESTS — STANDING SEAM
==================================================

At minimum:

- technical spec parse,
- multiple installation modes,
- explicit mode required,
- min pitch validation,
- chosen effective width drives grid,
- gable layout,
- hip layout,
- one opening,
- multiple openings,
- correct panel run count,
- correct total geometric length,
- exact length grouping,
- short run diagnostic,
- long run diagnostic,
- transverse joint NOT automatically generated,
- multiple assigned planes,
- assignment conflict,
- deterministic quantity,
- no purchase/waste claims.

================================================== 38. TESTS — PROJECT/HISTORY
==================================================

Add:

- manual standing seam assignment,
- edit snapshot,
- change installation mode,
- change alignment,
- plane assignment,
- Undo/Redo exact restore,
- old V21/V21.1 document parse,
- layout derived data not serialized,
- active assignment selection zero history.

================================================== 39. TESTS — UI
==================================================

Add:

- - Rąbek stojący,
- no raw technical IDs,
- standing seam Inspector,
- multiple width modes,
- layout summary,
- selected plane summary,
- opening interruption visualization,
- too-long panel warning,
- too-short warning,
- generic Pokrycia schedule,
- compact lengths collapsed by default,
- exact lengths reachable,
- tile/fixed-sheet regressions,
- mobile sheet path.

================================================== 40. LIVE QA
==================================================

If browser is available test:

1440×900
1024
768
430×932
390×844
360×800

Both:

gable
hip

Coverings:

roof tile
fixed modular sheet
standing seam

Cases:

no openings
one opening
multiple openings

Inspect especially:

V21.1 compact schedule
Covering canvas fit
sticky controls
assignment selector
Inspector
mobile sheet
no raw translation IDs
no black SVG regression.

Do not claim real touch QA without physical touch.

================================================== 41. ARCHITECTURE DOCUMENT
==================================================

Create:

docs/ARCHITECTURE_V22_VARIABLE_PANEL_AND_STANDING_SEAM.md

Document:

- generic variable panel kernel,
- coordinate contract,
- strip/grid semantics,
- contiguous run semantics,
- openings,
- edge-width cuts,
- min/max panel lengths,
- transverse-joint boundary,
- standing seam strategy,
- quantity semantics,
- ProjectDocument boundary,
- UI/shared shell,
- future cut-to-length reuse.

Create:

docs/PROMPT_ITERATION_022_VARIABLE_PANEL_STANDING_SEAM.md

with this actual contract.

================================================== 42. IMPORTANT NON-GOALS
==================================================

Do NOT implement:

- cut-to-length modular sheet final solver,
- automatic transverse-joint placement,
- purchase optimization,
- offcut reuse,
- sheet nesting,
- waste factor,
- clips/fasteners,
- flashings,
- ridge/eave accessories,
- gutters,
- manufacturer catalogue backend,
- API/database,
- prices,
- Cost Engine,
- project save/autosave,
- PDF/XLSX,
- new roof topology,
- structural verification.

Architecture must prepare for these,
not prematurely implement them.

================================================== 43. FINAL VALIDATION
==================================================

Run:

npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check

Run Prettier validation for changed files.

Record exact:

tests/files
bundle sizes
CSS
lazy chunks
warnings
QA.

================================================== 44. PROJECT BLUEPRINT
==================================================

Update PROJECT_BLUEPRINT.

First truthfully close/reclassify V21.1 after recovery.

Then record V22:

- research,
- variable panel kernel,
- standing seam strategy,
- quantities,
- UI,
- mobile,
- compatibility,
- exact validation,
- known limitations.

Set NEXT ACTION:

Iteration 023 — professional Project lifecycle:
named projects, local autosave, open/duplicate/delete,
versioned import/export and repository abstraction ready for future cloud/API
storage.

Do not begin V23 automatically.

Do not commit or push unless explicitly requested.
