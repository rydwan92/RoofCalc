# PROMPT_ITERATION_019
# Roof Tile Engine, Covering Workbench,
# Batten-Aware Tile Layout and Covering Quantities

Continue RoofCalc / CieślaCalc from the CURRENT repository HEAD.

Expected starting commit:

af635994e9cf3f7b72153319b4c10d733376661e
"V18"

V18 established:

- roof-window productivity,
- pure @cieslacalc/covering-core,
- versioned technical product snapshots,
- covering assignments,
- catalogue revision references,
- compatibility diagnostics,
- future layout strategy boundaries.

V19 must implement the FIRST REAL COVERING ENGINE:

ROOF TILES.

Do NOT implement modular sheet layout.
Do NOT implement standing seam layout.
Do NOT implement catalogue/backend/database.
Do NOT implement prices.

The objective is:

> select/configure a technical roof-tile product,
> validate it against the current roof and battens,
> derive an explicit plane-local tile coverage layout,
> visualize it,
> and expose honest geometric covering quantities.

==================================================
0. PREFLIGHT
==================================================

Read completely:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/DOMAIN_RESEARCH_ROADMAP.md
- docs/domain/COVERING_PRODUCT_MODEL.md
- docs/ARCHITECTURE_V16_WORKBENCH_AND_ROOF_BUILDUP.md
- docs/ARCHITECTURE_V17_UNITS_DIMENSIONS_MEASUREMENT_UX.md
- docs/ARCHITECTURE_V18_OPENING_PRODUCTIVITY_AND_COVERING_PLATFORM.md
- docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md
- docs/PROMPT_ITERATION_018_OPENING_PRODUCTIVITY_COVERING_PLATFORM.md

Inspect:

- packages/covering-core
- packages/quantity-core
- packages/roof-math roof surface / battens / roof-plane geometry
- packages/calculator-core ProjectDocument
- apps/web Builder/workbench/store
- SkeletonCanvas
- BuildUpWorkspace
- MaterialSchedule
- Toolbox
- Inspector
- WorkbenchControls

Run baseline:

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

V18 documentation currently reports approximately:

386 tests across 40 files
main web ~548.10 kB / 154.37 gzip

Use actual checkout results.

Do not discard user work.

==================================================
1. AUDIT V18 FIRST
==================================================

Verify:

- covering-core remains pure,
- no pricing/commercial logic entered technical specs,
- coverings[] round-trips,
- old projects normalize coverings to [],
- product technical snapshots are immutable project facts,
- catalogue references remain optional,
- roof-window duplication does not duplicate framing,
- alignment/distribution remain plane-local,
- all previous opening Undo semantics remain correct.

Fix real regressions before V19.

==================================================
2. REVERIFY TILE DOMAIN RESEARCH
==================================================

Before implementing the algorithm, reverify current official technical data for
at least:

- one concrete/interlocking tile,
- one large ceramic interlocking tile,
- one plain tile with more than one laying mode.

Use official manufacturer technical sheets/instructions.

The research must explicitly verify:

- physical size,
- covering/effective width,
- allowed gauge range,
- declared pieces/m² where available,
- installation/course pattern,
- minimum pitch where stated.

Update:

docs/domain/COVERING_PRODUCT_MODEL.md

with dated references.

Manufacturer data is research/test-fixture evidence,
NOT a hard-coded production catalogue.

==================================================
3. IMPORTANT V18 SCHEMA GAP
==================================================

V18 tile installation modes currently know:

coverWidthMm
gaugeRangeMm
declaredUnitsPerM2
minPitchDeg

That is insufficient for all real tile systems.

Example domain distinction:

plain tile in scale:
one tile course per batten

plain tile in crown:
two courses on one batten,
with a horizontal shift between layers

Other tile systems may use alternating staggered rows.

Extend the TILE INSTALLATION MODE contract to describe the COVERAGE PATTERN.

Do not add manufacturer-specific names.

Preferred conceptual model:

TileCoursePattern {
  layers: [
    {
      id: string
      horizontalOffsetFraction: number
    }
  ]

  battenRowOffsetCycle: number[]
}

Constraints:

horizontalOffsetFraction >= 0
horizontalOffsetFraction < 1

row offset fractions use the same normalized cover-width basis.

Examples conceptually:

straight interlocking:
layers = [0]
row cycle = [0]

staggered interlocking:
layers = [0]
row cycle = [0, 0.5]

plain tile crown:
layers = [0, 0.5]
row cycle = [0]

Do not blindly assume these example values for a manufacturer product.
Fixtures must be based on verified instructions.

Keep old V18 technical snapshots parseable.

If a V18 roof-tile snapshot lacks enough pattern information:

Tile Engine status = incomplete

with:

tile-placement-pattern-required

Do NOT silently guess "straight".

==================================================
4. KEEP TECHNICAL SCHEMA VERSION COMPATIBLE
==================================================

Prefer a backward-compatible additive field to the existing technical schema
unless analysis proves an actual version migration is necessary.

Do not invalidate V18 ProjectDocuments.

A snapshot which can still be parsed but cannot yet be laid out should remain:

valid snapshot
+
incomplete layout

not:

corrupted project.

==================================================
5. TILE LAYOUT INTENT
==================================================

Introduce canonical roof-tile layout intent.

This belongs to the covering assignment/project intent.

At minimum support horizontal alignment:

centered
from-u-min
manual/per-plane offset if cleanly justified

Conceptual:

RoofTileLayoutIntent {
  kind: 'roof-tile'
  horizontalAlignment: ...
  planeOverrides?: ...
}

Do not persist derived tile positions.

Default deterministic layout may be centered.

Changing layout intent:
one canonical history edit.

==================================================
6. SOURCE OF VERTICAL COURSE GEOMETRY = BATTENS
==================================================

CRITICAL RULE:

Tile Engine must NOT independently calculate another batten system.

Existing roof-math resolves battens.

Use the resolved physical/geometric batten rows as the course reference.

Pipeline:

RoofBuildUp.battenLayout
↓
resolveBattenLayout()
↓
ResolvedBatten[]
↓
TileLayoutStrategy

A tile assignment without enabled/resolved battens:

status = incomplete

issue:

batten-layout-required

==================================================
7. ACTUAL BATTEN COMPATIBILITY
==================================================

Do not only compare a nominal form value if resolved batten geometry is available.

Validate the resolved course spacing relevant to the assignment.

Regular course spacings must stay within:

installationMode.gaugeRangeMm

Do not automatically change battens.

Special eave/ridge rules which are not yet modelled by the product contract
must remain explicit limitations.

If incompatible:

show actual range/value
show allowed range

and offer UI navigation:

Przejdź do Warstwy → Łaty

No silent repair.

==================================================
8. NEUTRAL BATTEN INPUT CONTRACT
==================================================

covering-core must not import timber-model or roof-math.

Extend CoveringLayoutInput with a renderer-neutral batten projection such as:

CoveringBattenRow {
  id
  roofPlaneId
  stationVMm
  segments: [
    { fromUMm, toUMm }
  ]
}

Web/project composition adapts current ResolvedBatten into this contract.

Do not introduce a reverse dependency from covering-core to roof-math.

==================================================
9. ROOF TILE LAYOUT STRATEGY
==================================================

Implement a pure:

RoofTileLayoutStrategy

inside covering-core.

No React.
No DOM/SVG.
No database.
No pricing.

Inputs:

- assigned roof-plane local polygons,
- openings,
- resolved neutral batten rows,
- selected RoofTileTechnicalSpec,
- selected installation mode,
- RoofTileLayoutIntent.

Output:

structured RoofTileLayoutResult.

==================================================
10. LAYOUT RESULT
==================================================

Result should expose structured per-plane information.

Conceptually:

RoofTileLayoutResult
  status
  assignmentId
  installationModeId
  planes[]

TilePlaneLayout
  roofPlaneId
  courses[]
  totalPositions
  fullPositions
  cutPositions
  splitPositions?
  issues[]

TileCourse
  rowId
  battenId
  stationVMm
  layerIndex
  horizontalOffsetFraction
  positions[]

TilePosition
  stable derived ID
  columnIndex
  nominalFromUMm
  nominalToUMm
  visibleFragments[]
  classification:
    full
    cut-roof-edge
    cut-opening
    split-by-opening

Final naming may differ,
but preserve the semantic distinctions.

==================================================
11. IMPORTANT — COVERAGE GEOMETRY, NOT TILE SHAPE
==================================================

V19 does NOT know the exact curved/profiled physical outline of a roof tile.

Therefore the layout represents:

COVERAGE POSITIONS / COVERAGE CELLS

based on:

effective width
course/batten references
plane boundary
openings

Do not claim the canvas rectangle is the physical ceramic/concrete tile outline.

Use terminology such as:

siatka krycia
pozycja dachówki
moduł krycia

where appropriate.

==================================================
12. GLOBAL COLUMN GRID
==================================================

Tile columns must remain geometrically coherent across courses.

Do NOT independently restart columns for every batten segment.

For each roof plane establish a single deterministic u-grid.

coverWidthMm defines nominal column spacing.

Installation pattern applies:

rowOffsetCycle
+
layer offset

relative to this base grid.

This is essential around roof windows:
columns to the left and right of an opening must remain part of one coherent
roof layout.

==================================================
13. CENTERED LAYOUT
==================================================

For centered layout:

derive one plane-level horizontal origin so the effective grid is centered
against the plane's eave/overall u span.

Do not re-center independently on every narrowing hip course.

Hip courses narrow against the SAME plane-level grid,
creating deterministic edge cuts.

==================================================
14. HIP PLANES
==================================================

The geometry contract already exposes polygonal roof planes.

Do not special-case "gable only" if the generic plane-local interval solution
rigorously supports hip planes.

For hip planes:

- grid remains eave-parallel,
- narrowing rows create edge cuts,
- hip-edge positions are classified as cut positions.

However:

do NOT solve specialized hip tiles,
half tiles,
ridge accessories,
mechanical fastening,
or offcut reuse.

If a geometric condition cannot be resolved rigorously:
return limited/incomplete rather than guessing.

==================================================
15. OPENINGS
==================================================

Roof windows must participate in tile layout.

A roof-window opening must:

- remove fully covered positions through its void,
- classify boundary positions as cut/opening affected,
- preserve the global column grid.

Do not move the window.
Do not automatically modify framing.

Tile layout consumes opening geometry only.

If one nominal position becomes multiple disconnected visible fragments around
an opening:

represent that explicitly.

Do not falsely state that one purchased tile is guaranteed to provide all
fragments.

==================================================
16. PIECE COUNT LANGUAGE
==================================================

Do NOT call the V19 result:

"ilość do zakupu"

Use:

pozycje dachówek w układzie geometrycznym

or an equally precise concise term.

V19 does NOT include:

waste
breakage
offcut reuse optimization
spare percentage
accessory tiles
verge tiles
ridge tiles
ventilation tiles
half tiles
packaging/pallets.

==================================================
17. DECLARED CONSUMPTION CROSS-CHECK
==================================================

If the installation mode provides:

declaredUnitsPerM2

calculate a non-authoritative reference range:

net assigned surface area
×
declared units/m²

Expose it separately from layout position count.

Example:

Układ geometryczny:
286 pozycji

Deklaracja producenta wg powierzchni:
279–296 szt. equivalent range

Do not replace layout count with manufacturer area consumption.

Use this as:

reference
sanity check
future QA signal.

No purchase recommendation.

==================================================
18. COVERING QUANTITY SOURCE
==================================================

V18 defined CoveringQuantitySource.

Use it now.

Create quantity source(s) for resolved roof-tile layout.

At minimum:

unit = piece
quantity = geometric layout position count
basis = explicit stable semantic identifier

If a layout is incomplete/invalid:
do not emit a trusted quantity source.

==================================================
19. QUANTITY-CORE INTEGRATION
==================================================

Do NOT force roof tiles into RoofMemberScheduleRow,
which assumes timber/linear member semantics.

Introduce a separate covering/product quantity row boundary.

Conceptually:

CoveringQuantityRow {
  assignmentId
  product reference/snapshot display facts
  unit
  quantity
  basis
  warningKeys
}

Keep:

timber
linear build-up
surface build-up
covering product quantities

semantically separate.

Do not sum:

m
m²
pcs

into one meaningless total.

==================================================
20. REAL "POKRYCIE" TASK
==================================================

V18 correctly did NOT expose an empty covering task.

V19 now has real user value.

Add task:

Konstrukcja
Otwory
Warstwy
Pokrycie
Cięcia
Zestawienie

Internal key:

covering

or another clear language-neutral equivalent.

It remains transient workbench state.

Task switching creates no project history.

==================================================
21. COVERING WORKSPACE
==================================================

Create a focused CoveringWorkspace.

Empty state:

POKRYCIE

Nie wybrano pokrycia.

[ Dodaj dachówkę ]

Do NOT expose disabled fake buttons for:

blacha
rąbek
catalogue

until those implementations exist.

==================================================
22. MANUAL PRODUCT PATH
==================================================

V19 has no backend catalogue yet.

Allow a MANUAL technical roof-tile product.

This is important because manual and future database products must prove they
use one calculation path.

Manual editor produces:

CoveringProductSelection {
  catalogRef: undefined
  displaySnapshot
  technicalSpecSnapshot
}

The same Tile Engine must later accept backend-selected products unchanged.

Do not create:

calculateManualTile()
calculateCatalogTile()

There is one strategy.

==================================================
23. MANUAL TILE EDITOR
==================================================

Keep the first UI practical.

Primary:

working name
cover width
minimum gauge
maximum gauge
placement pattern
minimum pitch optional

Secondary / advanced:

physical width
physical length
weight
declared pieces/m² range

Use cm display preference where appropriate,
canonical values remain mm.

Do not expose schema implementation jargon.

==================================================
24. PRODUCT SOURCE UX
==================================================

Show a small source badge:

Parametry ręczne

Future catalogue products will later show a catalogue/manufacturer source.

Do not add a fake catalogue browser now.

==================================================
25. INSTALLATION MODE UX
==================================================

A tile product may contain multiple installation modes.

User must select one when more than one exists.

Inspector/workspace shows:

Sposób krycia
Rozstaw łat
Szerokość krycia
Minimalny kąt
Pattern summary where useful

Never silently select a mode when multiple valid modes exist.

A manually created one-mode product may select that mode immediately.

==================================================
26. COVERING COMPATIBILITY UX
==================================================

Provide compact structured status:

ZGODNOŚĆ

✓ kąt połaci
✓ rozstaw łat

or:

⚠ Rozstaw łat
35 cm
produkt: 31,2–34,5 cm

[ Przejdź do Łat ]

Missing data:
Nie można jeszcze wyznaczyć układu.

Do not use safety language such as:

"pokrycie jest bezpieczne"

Compatibility means only implemented technical parameter checks.

==================================================
27. COVERING TOP SUMMARY
==================================================

When resolved show something like:

DACHÓWKA · PARAMETRY RĘCZNE

24 rzędy
286 pozycji
248 pełnych
38 docinanych

28,5 cm szerokość krycia
37–40 cm rozstaw

No zapas / odpady / akcesoria

Keep it compact.

==================================================
28. COVERING CANVAS
==================================================

In Pokrycie mode:

- roof structure strongly muted,
- battens lightly visible as context,
- openings visible,
- coverage grid dominant.

Render geometric coverage positions,
not photographic tile shapes.

Differentiate:

normal/full
cut/edge
opening-affected
selected plane

Do not rely only on colour.

==================================================
29. RENDERING PERFORMANCE
==================================================

A roof can contain hundreds or thousands of tile positions.

Do not create expensive independent React state for every position.

Derived layout is one memoized result.

If individual SVG positions exceed a sensible rendering threshold:

use a simplified representation:

course lines
column guides
aggregate cut markers

while preserving exact quantity results.

Do not change the domain result just to reduce DOM size.

Record the chosen threshold/policy.

==================================================
30. NO INDIVIDUAL TILE EDITING YET
==================================================

Do not make every tile position a persistent selectable project object.

V19 layout is derived.

User edits:

product
mode
plane assignment
layout intent
roof/battens/openings

The tile positions rederive.

This prevents a project with 1000 persisted tile records.

==================================================
31. PLANE SELECTION
==================================================

Reuse the existing semantic roof-plane selection.

In Pokrycie mode clicking a plane:

- emphasizes its covering layout,
- Inspector may show per-plane counts,
- other planes remain contextual/muted.

Selection is transient.

==================================================
32. LAYOUT ALIGNMENT CONTROL
==================================================

Expose simple horizontal layout control:

Symetrycznie
Od początku połaci
Ręczne przesunięcie

Only if all modes are rigorously implemented.

Manual offset remains plane-local millimetres internally.

Use current display unit in UI.

One canonical edit = one history item.

==================================================
33. ZESTAWIENIE
==================================================

Extend Zestawienie with separate section:

POKRYCIE

Dachówka
286 pozycji geometrycznych

Pełne       248
Docinane     38

Powierzchnia netto:
...

Deklarowane zużycie wg danych technicznych:
...

Clearly state:

Bez zapasu, odpadu i akcesoriów.

Do not mix with timber counts.

==================================================
34. QUICK CALC
==================================================

Quick stays unchanged.

Do NOT add:

Pokrycie
tile layout
product editor
catalogue
covering quantities

to Quick.

==================================================
35. CANONICAL HISTORY
==================================================

Canonical and undoable:

- add covering assignment,
- remove covering assignment,
- edit manual technical snapshot,
- choose installation mode,
- assign planes,
- change tile layout intent.

Transient and zero-history:

- open Pokrycie task,
- select plane,
- hover tile coverage cell,
- visualization detail level,
- compatibility panel expansion.

==================================================
36. PRODUCT SNAPSHOT SAFETY
==================================================

A manual edit changes the current project technical snapshot.

A future catalogue product must remain immutable for its recorded
technicalRevisionId until the user explicitly requests refresh.

Do not weaken the V18 snapshot contract.

==================================================
37. TEST FIXTURES
==================================================

It is acceptable to create TEST fixtures representing verified current examples.

Do not ship them as a production catalogue.

Useful fixture classes:

- generic interlocking concrete tile,
- large ceramic interlocking tile,
- plain tile scale/crown patterns.

Keep manufacturer names in research/tests where useful,
not in engine branches.

There must be no:

if manufacturer === ...

logic.

==================================================
38. COVERING-CORE TESTS
==================================================

Add strong pure tests.

At minimum:

1. old V18 tile technical snapshot still parses,
2. missing placement pattern -> incomplete layout,
3. straight single-layer pattern,
4. alternating half-width row stagger,
5. two-layer same-batten pattern,
6. deterministic base grid,
7. centered horizontal layout,
8. from-u-min layout,
9. manual offset if implemented,
10. rectangular gable plane,
11. hip/trapezoidal narrowing rows,
12. edge cut positions,
13. roof-window removal,
14. roof-window boundary cut,
15. multiple openings,
16. multiple assigned planes,
17. same column grid persists around openings,
18. no enabled battens -> incomplete,
19. gauge too small -> incompatible,
20. gauge too large -> incompatible,
21. pitch too low -> incompatible,
22. declared consumption reference range,
23. deterministic IDs/order,
24. no NaN/Infinity,
25. no manufacturer-specific branching.

==================================================
39. QUANTITY TESTS
==================================================

Test:

- valid layout emits piece quantity source,
- unresolved layout emits no trusted source,
- covering quantity stays separate from timber/build-up,
- multiple planes aggregate deterministically,
- Undo covering assignment restores quantity report,
- changing openings changes layout-derived positions,
- changing battens rederives quantities,
- price never appears in quantity source.

==================================================
40. PROJECT DOCUMENT TESTS
==================================================

Add:

- V18 document still parses,
- layout intent roundtrip,
- manual technical product roundtrip,
- installation mode selection roundtrip,
- assignment plane changes,
- Undo/Redo,
- derived positions absent from serialization.

==================================================
41. UI TESTS
==================================================

Add:

- Pokrycie task exists in Builder,
- Pokrycie absent from Quick,
- empty covering state,
- manual tile creation,
- mode selection,
- compatibility success,
- missing battens warning,
- incompatible gauge warning,
- "Przejdź do Łat",
- covering grid shown after resolution,
- openings visible through grid,
- per-plane selection,
- covering summary,
- covering section in Zestawienie,
- no price fields,
- no catalogue browser,
- task/view interactions create no history.

==================================================
42. RESPONSIVE UX
==================================================

Test design for:

1440x900
1024
768
360x800

On mobile:

- Pokrycie task remains reachable,
- product editor is not an enormous desktop table,
- compatibility status readable,
- one major contextual panel at once,
- canvas/schedule switching follows existing patterns,
- no horizontal page overflow,
- no hover-only essential action.

==================================================
43. BUNDLE / PERFORMANCE
==================================================

V18 main bundle grew again.

Do not place the entire Tile Workbench into the initial main chunk.

Prefer lazy-loading:

CoveringWorkspace
tile visualization
manual product editor

where the boundaries are meaningful.

Do not dynamically split tiny primitives.

Record before/after production chunk sizes.

==================================================
44. ARCHITECTURE DOCUMENT
==================================================

Create:

docs/ARCHITECTURE_V19_TILE_ENGINE_AND_COVERING_WORKBENCH.md

Document:

- technical schema extension,
- placement/course pattern,
- why battens are the vertical source of truth,
- plane-level u grid,
- layout intent,
- opening handling,
- hip-edge handling,
- layout position semantics,
- quantity semantics,
- declared-consumption cross-check,
- ProjectDocument boundary,
- future catalogue path,
- rendering performance,
- explicit limitations.

Also create:

docs/PROMPT_ITERATION_019_TILE_ENGINE_COVERING_WORKBENCH.md

containing the actual iteration contract.

==================================================
45. IMPORTANT NON-GOALS
==================================================

Do NOT implement in V19:

- modular sheet calculation,
- standing seam calculation,
- manufacturer catalogue backend,
- product API,
- SQL database,
- prices,
- VAT,
- discount,
- Cost Engine,
- purchase recommendation,
- waste percentage,
- offcut optimization,
- tile accessories,
- verge tiles,
- ridge tiles,
- ventilation tiles,
- half-tile catalogue,
- fastening calculations,
- structural verification,
- new roof topology,
- dormers/chimneys,
- collar ties/posts/braces,
- PDF/XLSX.

==================================================
46. FINAL VALIDATION
==================================================

Run:

npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check

Run changed-file Prettier validation.

Record:

exact test count
bundle sizes
warnings
browser QA if genuinely available.

==================================================
47. PROJECT BLUEPRINT
==================================================

Update WORK CHECKPOINT.

Record:

- V18 audit,
- research revalidation,
- tile pattern schema,
- TileLayoutStrategy,
- batten dependency,
- openings,
- hip behavior,
- layout/quantity semantics,
- covering task,
- manual product path,
- schedule integration,
- automated validation,
- browser/mobile QA,
- performance,
- known limitations.

NEXT ACTION should prepare:

Iteration 020 — metal covering engines:
modular sheet / cut-to-length sheet / standing seam

on the SAME covering contracts.

Do not begin V20 automatically.

Do not commit or push unless explicitly requested.
