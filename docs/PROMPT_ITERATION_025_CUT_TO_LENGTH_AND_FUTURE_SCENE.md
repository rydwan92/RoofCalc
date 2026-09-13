# PROMPT_ITERATION_025

# Professional Covering Workbench,

# Cut-to-Length Metal Engine,

# Architecture Hardening and Future Compound-Roof Readiness

Continue RoofCalc / CieślaCalc from CURRENT repository HEAD.

Expected starting commit:

434eb015d1e404381c51f10a3ebeca5c5e31ecdb
"024"

V24 established the first real catalogue/backend vertical:

MySQL/MariaDB
→ Drizzle
→ immutable technical product revisions
→ read-only REST API
→ Product Picker
→ CoveringProductSelection
→ technicalSpecSnapshot
→ existing local covering engines.

V25 must NOT undo that architecture.

V25 has THREE ordered goals:

A. improve the professional Covering/Workbench UX of the CURRENT product,
B. implement CUT-TO-LENGTH metal covering using the V22 reusable variable-panel core,
C. explicitly protect the architecture for a FUTURE multi-structure / compound-roof
project model WITHOUT implementing multi-roof now.

Do NOT implement prices yet.
Do NOT migrate ProjectDocument to multiple roofs yet.

================================================== 0. MANDATORY PREFLIGHT
==================================================

Read fully:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/DOMAIN_RESEARCH_ROADMAP.md
- docs/domain/COVERING_PRODUCT_MODEL.md

- docs/ARCHITECTURE_V20_MOBILE_WORKBENCH_UX.md
- docs/ARCHITECTURE_V21_WORKBENCH_HARDENING_AND_MODULAR_SHEET.md
- docs/ARCHITECTURE_V22_VARIABLE_PANEL_AND_STANDING_SEAM.md
- docs/ARCHITECTURE_V23_LOCAL_PROJECT_LIFECYCLE.md
- docs/ARCHITECTURE_V24_CATALOG_MYSQL_PLATFORM.md
- docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md

Inspect:

- packages/calculator-core ProjectDocument
- packages/roof-math
- packages/timber-model
- packages/covering-core
- packages/quantity-core
- packages/catalog-core
- packages/project-core

- apps/web assembly Page
- CoveringWorkspace
- Inspector
- Toolbox
- MaterialSchedule
- catalog Product Picker
- project lifecycle/session
- styles/i18n

- apps/api catalogue/db/import

Run:

git status
git log -1 --oneline
git diff
git diff --stat

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Record ACTUAL baseline.

V24 checkpoint reports approximately:

520 tests / 57 files.

Use actual checkout values.

Do not discard user work.

==================================================

1. V24 RECOVERY / INTEGRATION GATE
   \==================================================

Confirm actual source contains:

- catalog-core,
- MySQL/Drizzle schema,
- immutable revisions,
- canonical import CLI,
- Product Picker,
- manual fallback,
- exact revision snapshot,
- local project autosave,
- existing project can calculate without live catalogue.

If local MariaDB is configured:
perform harmless read-only catalogue smoke tests.

Do not destroy or reseed user data unnecessarily.

Do not redo V24.

================================================== 2. CURRENT UX REVIEW BEFORE NEW DOMAIN WORK
==================================================

Review the user's current real Covering screenshots.

The current engine is useful,
but the workbench should become less form-like and more task-oriented.

The central workspace should answer:

"What is the result?"

The Inspector should answer:

"What can I change?"

Avoid presenting the same facts at equal weight in both places.

================================================== 3. COVERING RESULT HIERARCHY
==================================================

Refine Covering top summary.

Example:

DACHÓWKA
Parametry ręczne

UKŁAD ROZWIĄZANY

4520
pozycji

4014
pełnych

506
docinanych

128 rzędów
30 cm szerokość krycia

Secondary:
declared manufacturer/reference consumption.

Boundary:
bez zapasu, odpadu i akcesoriów.

Do not turn this exact visual mockup into a rigid requirement,
but implement a stronger information hierarchy.

================================================== 4. COVERING INSPECTOR HIERARCHY
==================================================

Organize exact editing consistently.

Suggested semantic sections:

PRODUKT
MONTAŻ
WYMIARY KRYCIA
UKŁAD
POŁACIE
ZAAWANSOWANE

For catalogue product additionally:

ŹRÓDŁO
manufacturer
technical revision
variant

Avoid one uninterrupted long form.

Do not hide frequently edited values.

Advanced technical values may be collapsed.

================================================== 5. SOURCE IDENTITY
==================================================

Make the product source immediately understandable.

Examples:

KATALOG
Koramic · Alegra 8
rewizja 2026-01

or:

PARAMETRY RĘCZNE
Dachówka ręczna

Do not expose:

technicalRevisionId
fixed-sheet
cut-to-length
manual-standard

as normal user copy.

================================================== 6. PRODUCT PICKER UX HARDENING
==================================================

Audit V24 Product Picker for future hundreds/thousands of products.

Improve only where demonstrated useful:

- search field prominence,
- manufacturer filter,
- current covering-kind context,
- readable result cards,
- exact detail/back navigation,
- variant selection,
- technical revision/source context,
- manual fallback,
- mobile one-sheet behavior.

Do not redesign unrelated Builder UI.

================================================== 7. ONE SCALABLE "ADD COVERING" FLOW
==================================================

Prefer:

- Dodaj pokrycie

then user-level categories:

Dachówka
Blacha
Rąbek

For Blacha:
technical product decides internally whether it is:

fixed-size modular sheet
or
cut-to-length.

Do not make users choose internal solver class names.

Existing direct actions may remain temporarily if changing them would create
unnecessary regression risk,
but architect toward one scalable flow.

================================================== 8. DRAWING LEVEL OF DETAIL
==================================================

Large tile/sheet layouts may contain thousands of coverage positions.

Preserve exact domain result.

Improve drawing LOD.

Concept:

AUTO

small result:
detailed coverage cells

large result:
simplified technical grid

Allow:
Dokładny / Uproszczony

only if useful and clean.

Changing visualization detail:
zero history.

Never change quantity depending on render LOD.

================================================== 9. SELECTED PLANE CLARITY
==================================================

The workspace must always make clear:

TOTAL ASSIGNMENT

versus:

SELECTED ROOF PLANE

Do not ambiguously mix totals.

Example:

CAŁE POKRYCIE
4520 pozycji

PRAWA POŁAĆ
1210 pozycji
1068 pełnych
142 docinane

================================================== 10. CUT-TO-LENGTH DOMAIN RESEARCH
==================================================

Before implementation research CURRENT official technical documentation for
multiple metal roofing products ordered/cut to length.

Verify generic concepts:

- effective width,
- total width,
- minimum sheet/panel length,
- maximum sheet/panel length,
- module length where applicable,
- manufacturing length increments,
- minimum pitch,
- support/batten requirements,
- transverse joining rules,
- limitations on very long single sheets.

Update:

docs/domain/COVERING_PRODUCT_MODEL.md

Research is evidence.

Do not create manufacturer branches.

================================================== 11. TECHNICAL MODEL
==================================================

Keep:

CoveringKind = modular-sheet

for metal tile/profile sheet systems.

Use existing:

lengthModel.kind = fixed-sheet
lengthModel.kind = cut-to-length

Do NOT introduce another top-level covering kind merely because the length model
differs.

Extend schema only if research proves a genuinely required parameter.

Backwards compatibility is mandatory.

================================================== 12. CUT-TO-LENGTH INTENT
==================================================

Create a dedicated discriminated layout intent.

Conceptually:

CutToLengthSheetLayoutIntent {
kind: 'modular-sheet-cut-to-length'

horizontalAlignment:
| 'centered'
| 'from-u-min'
| 'manual'

planeOffsetsMm?: ...
}

If future segmentation intent is required,
design its boundary,
but do not prematurely expose unsafe automatic joint behavior.

Do not type-cast standing-seam intent.

================================================== 13. REUSE VARIABLE PANEL CORE
==================================================

V22 already introduced the reusable variable-length strip/run geometry.

Cut-to-length metal MUST reuse it.

Shared math:

roof polygon
opening polygons
effective width
U grid
continuous V intervals
edge clipping
opening splitting
min/max length checks
stable IDs.

Do not duplicate this geometry.

================================================== 14. COVER WIDTH
==================================================

Coverage grid uses:

effectiveWidthMm.

Total width is physical/reference data.

Never use total width as horizontal covering spacing.

================================================== 15. GEOMETRIC RUN
==================================================

For each strip calculate contiguous physical coverage runs.

No opening:

eave
↓
continuous run
↓
ridge

Opening:

lower run
↓
window void
↓
upper run

These are TWO geometric physical candidates.

Do not represent disconnected geometry as one sheet.

================================================== 16. GEOMETRIC VS MANUFACTURING LENGTH
==================================================

This distinction is critical.

Result may expose:

geometricLengthMm

and only if technical rules define it rigorously:

orderLengthMm

For example a product may have:

length increment
module step
manufacturing granularity.

Never silently round geometric length.

Expose:

geometric length
order/manufacturing length
difference

separately.

If rules are incomplete:
report geometric length only.

================================================== 17. MAXIMUM LENGTH
==================================================

If a continuous run exceeds the technical maximum:

do NOT silently split it.

Return structured:

segmentation-required

or equivalent.

Automatic transverse joint placement is allowed ONLY if all required generic
technical rules are explicitly represented and verified.

Otherwise defer.

================================================== 18. TRANSVERSE JOINT BOUNDARY
==================================================

Do not invent:

joint location
overlap
support point
water-flow details.

Architecture should allow a future segmentation resolver.

Current truthful limitation:

"Połać wymaga podziału arkusza/panelu — miejsce połączenia nie zostało
automatycznie zaprojektowane."

================================================== 19. CUT-TO-LENGTH RESULT
==================================================

Implement structured:

CutToLengthSheetLayoutResult

At minimum:

status
assignmentId
planes
stripCount
physicalRunCount
fullWidthStrips
edgeCutStrips
openingInterruptedRuns
totalGeometricLengthMm
minRunLengthMm
maxRunLengthMm
issues

Per run:

stable ID
plane ID
column index
effective width
fromV
toV
geometricLength
orderLength?
classification
issues.

================================================== 20. QUANTITY SEMANTICS
==================================================

Expose:

number of geometric sheet runs
total geometric length
length groups

and when rigorously available:

order-length groups

Do NOT call this:

"ilość do zakupu".

No waste.
No optimization.
No offcut reuse.
No price.

================================================== 21. MATERIAL SCHEDULE
==================================================

Under:

POKRYCIA

show compact:

BLACHA CIĘTA NA DŁUGOŚĆ

34 odcinki
212,6 m geometrycznie
245–846 cm

[ Pokaż długości ]

Expanded exact groups.

Reuse V21.1 presentation pattern.

Do not make default page extremely long.

================================================== 22. CATALOGUE PATH
==================================================

A catalogue modular-sheet product with:

lengthModel.kind = cut-to-length

must automatically use the new engine.

A manual product with identical technical snapshot must produce the SAME result.

No catalogue-specific solver.

================================================== 23. DEMO FIXTURE
==================================================

Extend DEMO catalogue data with one clearly DEMO-labelled cut-to-length technical
revision.

Use it to prove:

DB
→ API
→ picker
→ snapshot
→ engine
→ quantity.

Do not present it as authoritative manufacturer data.

================================================== 24. IMPORTER
==================================================

Ensure canonical importer handles the extended technical schema.

Test:

same import twice = unchanged

same immutable revision ID + changed technical definition = conflict

new valid revision = accepted.

Do not weaken revision immutability.

================================================== 25. COVERING ASSIGNMENTS
==================================================

Keep:

one primary covering per roof plane.

Cut-to-length participates in the SAME assignment conflict resolver.

Do not introduce strategy-specific plane ownership logic.

================================================== 26. FUTURE MULTI-STRUCTURE ARCHITECTURE AUDIT
==================================================

IMPORTANT NEW USER REQUIREMENT.

The user wants RoofCalc in the future to support projects composed of multiple
independently created roof/building structures.

Example:

HOUSE
higher roof

GARAGE
lower roof

The user should eventually be able to position both in one project and plan
their geometric/construction connection.

DO NOT implement this feature in V25.

Instead perform a serious architecture audit of current assumptions.

Audit at least:

RoofProjectDocument
RoofTemplate
roofPlaneId
member IDs
feature IDs
covering assignments
build-up
quantity
selection
workbench resolver
fabrication
project persistence.

================================================== 27. CURRENT SINGLE-ROOF BOUNDARY
==================================================

Document explicitly:

RoofProjectDocumentV1 currently contains one:

project.roof

plus features/buildUp/coverings scoped implicitly to that single roof.

Do not pretend V1 already supports multiple independent structures.

Future multi-roof is a ProjectDocument V2-level capability.

================================================== 28. FUTURE STRUCTURE NODE CONCEPT
==================================================

Design, DOCUMENT ONLY, a possible future concept such as:

RoofStructureNode {
id
name
localRoofDocument / roof definition
transform
}

Transform should conceptually support:

translation X
translation Y
elevation Z
rotation around vertical axis

Do not finalize implementation without a later dedicated iteration.

The goal is to identify the correct boundary.

================================================== 29. LOCAL VS WORLD GEOMETRY
==================================================

Future structures should resolve locally first.

Conceptual:

roof template
↓
local skeleton/surfaces/features
↓
structure transform
↓
world scene

This lets the existing single-roof solvers remain useful.

Do NOT start converting every existing geometry solver to global scene
coordinates in V25.

================================================== 30. FUTURE CONNECTION GRAPH
==================================================

A connection between two roofs/structures should NOT be embedded inside one
RoofTemplate.

Document a future independent concept:

RoofConnectionSpec

Conceptually references:

structure A
structure B
connection type / intent
anchors/contact references
manual parameters

Future resolver derives:

intersection/contact geometry
affected members
new structural adaptation
covering interruption
flashing/junction geometry
warnings.

Do not implement the resolver now.

================================================== 31. CONNECTION TYPES — DO NOT OVERCOMMIT
==================================================

Document possible future classes such as:

roof-to-wall / abutment
roof-to-roof intersection
lower roof tied into higher structure
valley/intersection
custom constrained connection

But do NOT freeze a final enum based on guesses.

Research will be required before implementation.

================================================== 32. IDENTITY — CRITICAL MULTI-ROOF ISSUE
==================================================

Today IDs such as:

roof-plane:left

may be unique only inside one roof.

Future two structures could both have:

roof-plane:left.

Therefore:

from V25 onward, NEW code must treat roofPlaneId/member IDs as OPAQUE identities.

Forbidden new patterns:

if (roofPlaneId.includes('left'))
if (roofPlaneId === 'roof-plane:right') for domain logic
parsing semantic meaning from ID strings.

Use geometry metadata instead.

Document future identity choices:

A. qualified global IDs

or

B. structured references:

{
structureId,
localId
}

Do NOT migrate all current IDs in V25.

================================================== 33. NEW SOLVER MULTI-ROOF SAFETY
==================================================

The V25 cut-to-length engine must:

- accept opaque plane IDs,
- never infer roof type/side from ID strings,
- never assume there is only one plane set globally,
- operate only on explicitly supplied plane geometry.

This makes it naturally reusable inside a future structure node.

================================================== 34. QUANTITY FUTURE SCOPING
==================================================

Document future quantity aggregation:

per structure +
whole project.

Current quantity engine remains single-roof.

Do NOT redesign it now.

But avoid new data contracts that make structure scoping impossible.

================================================== 35. COVERING FUTURE SCOPING
==================================================

Future covering assignments will need structure/plane scoping.

Current V1:

roofPlaneIds[]

remains unchanged.

Do not add ad-hoc structure identifiers only to V25 covering code.

Future migration should happen consistently across all roof-domain data.

================================================== 36. PROJECT LIFECYCLE FUTURE
==================================================

V23/V24 ProjectRecord must remain capable of wrapping a future ProjectDocumentV2.

Do not put multi-roof structure data into:

ProjectRecord metadata.

It belongs in the technical project document.

This distinction is important.

================================================== 37. FUTURE UI CONCEPT — DOCUMENT ONLY
==================================================

Document how the current workbench can survive multi-roof.

Possible future UX:

PROJECT
├── Dom
├── Garaż
└── Ganek

Selecting:
Garaż

enters the CURRENT style of roof workbench scoped to that structure.

A higher-level Scene/Project mode handles:

position
elevation
rotation
connections.

Do not replace the current Builder.

The current Builder should later become a structure editor.

================================================== 38. CREATE FUTURE ARCHITECTURE DOCUMENT
==================================================

Create:

docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md

Document:

- current V1 limitation,
- StructureNode concept,
- local/world transforms,
- identity/namespacing,
- structure-scoped features,
- connection graph,
- resolver layering,
- quantity aggregation,
- UI concept,
- persistence/migration concept,
- explicit research questions,
- what must NOT be prematurely implemented.

This document is strategic.

Do not write fake implementation status.

================================================== 39. COVERING CANVAS UX
==================================================

While implementing V25 also refine current Covering rendering.

The screenshots show a meaningful technical drawing.

Preserve:
clear openings
edge cuts
plane outline
coverage grid

Improve:

- active plane emphasis,
- selected assignment identity,
- result hierarchy,
- large-layout LOD,
- visual relationship between drawing and Inspector.

No branding redesign.

================================================== 40. MOBILE
==================================================

Preserve the V20 mobile workbench.

At 360–430px:

- Add Covering remains understandable,
- catalogue/manual choice usable,
- cut-to-length summary compact,
- drawing primary,
- parameters in Inspector sheet,
- length groups collapsed,
- no horizontal overflow.

Do not add another permanent panel.

================================================== 41. QUICK
==================================================

Quick remains simple.

No covering catalogue.
No cut-to-length workflow.
No multi-roof controls.

================================================== 42. PERFORMANCE
==================================================

Do not persist per-run React state.

One memoized domain result.

Render detail level is UI-only.

Catalog query must not rerun because:
camera changes
selection changes
drawing pan
Inspector accordion.

Do not resolve roof geometry because:
product picker search changes.

================================================== 43. TESTS — UX
==================================================

Add targeted coverage for:

- result vs Inspector hierarchy,
- product source badge,
- human-facing labels,
- covering totals vs selected-plane result,
- LOD changes produce zero project history,
- catalogue/manual workflow remains clear,
- mobile regressions.

Avoid massive snapshots.

================================================== 44. TESTS — CUT-TO-LENGTH
==================================================

At minimum:

1. schema parse,
2. backward-compatible existing modular products,
3. rectangular plane,
4. triangular hip plane,
5. trapezoidal hip plane,
6. deterministic U grid,
7. centered alignment,
8. from-U-min,
9. manual offset,
10. full-width strip,
11. edge-cut strip,
12. one opening splits run,
13. multiple openings,
14. min run length,
15. max run length,
16. module/increment handling if implemented,
17. explicit segmentation-required,
18. total geometric length,
19. exact length grouping,
20. deterministic IDs/order,
21. no NaN/Infinity,
22. opaque roofPlaneId test using a non-semantic arbitrary ID,
23. no manufacturer branching.

================================================== 45. TESTS — CATALOG END TO END
==================================================

Prove:

canonical demo import
→ API
→ Product Picker
→ exact revision
→ technical snapshot
→ cut-to-length resolver
→ quantity.

Manual product with identical snapshot:
same geometry result.

Reopen project with API unavailable:
same result from snapshot.

================================================== 46. TESTS — PROJECT REGRESSION
==================================================

Keep green:

create
open
rename
duplicate
delete
autosave
import/export

Applying a catalogue cut-to-length product:
one project edit
→ dirty
→ autosave.

View/LOD change:
zero dirty technical change.

================================================== 47. DATABASE
==================================================

Do not change DB schema merely because a new technical spec exists.

The technical revision JSON exists exactly for this kind of product-domain
extension.

Generate migration only if genuinely required.

No empty migration.

================================================== 48. NO PRICES IN V25
==================================================

Do NOT implement:

PriceList
PriceListEntry
Cost Engine
VAT
discounts
customer pricing.

Do not add a price column to:

manufacturer
product family
revision
commercial variant.

================================================== 49. IMPORTANT NON-GOALS
==================================================

Do NOT implement in V25:

actual multi-roof project model
StructureNode persistence
roof-to-roof solver
automatic junction geometry
valleys caused by multiple structures
structural connection design
flashing quantities
gutter system
offcut optimization
purchase optimization
waste factors
prices
auth
cloud projects
PDF/XLSX
new major structural members.

Multi-roof is architecture research only in this iteration.

================================================== 50. DOCUMENTATION
==================================================

Create:

docs/ARCHITECTURE_V25_CUT_TO_LENGTH_AND_WORKBENCH.md

Create:

docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md

Create:

docs/PROMPT_ITERATION_025_CUT_TO_LENGTH_AND_FUTURE_SCENE.md

Update domain research where required.

================================================== 51. LIVE QA
==================================================

If browser is available test:

1440x900
1024
768
430x932
390x844
360x800

Test:

gable
hip

coverings:

tile
fixed modular sheet
cut-to-length
standing seam

manual
catalogue

no openings
one opening
multiple openings

Check:

drawing LOD
result hierarchy
Inspector
catalogue picker
mobile sheets
project autosave
offline snapshot.

Do not claim physical touch QA without physical touch.

================================================== 52. FINAL VALIDATION
==================================================

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Run changed-file Prettier validation.

If DB configured:
run harmless read-only/demo catalogue smoke.

Record:

test count/files
bundle sizes
catalog chunk
CSS
API build
DB/migration status
QA limitations.

================================================== 53. BLUEPRINT
==================================================

Update PROJECT_BLUEPRINT truthfully.

Record:

- V24 audit,
- Covering UX changes,
- cut-to-length engine,
- catalogue integration,
- quantity semantics,
- future compound-roof architecture research,
- ID-scope rule,
- validation,
- browser/mobile QA,
- known limitations.

Do NOT claim multi-roof is implemented.

NEXT ACTION should be selected after user review.

Likely candidates:

A. Iteration 026 — Price Lists + Cost Engine

or

B. a dedicated Compound Roof / Scene foundation iteration

ONLY when the user explicitly chooses to begin that major ProjectDocument V2
migration.

Do not begin either automatically.

Do not commit/push unless explicitly requested.
