# PROMPT_ITERATION_018

# Opening Productivity, Roof-Window Layout Tools,

# Covering Platform Architecture and Catalog-Ready Product Contracts

Continue RoofCalc / CieślaCalc from the CURRENT repository HEAD.

Expected starting commit:

5d3442baf3968ffcb6b03c504c70a8e27658124f
"V17"

This iteration has TWO tightly controlled goals:

A. make roof-window authoring substantially faster and more professional,
B. introduce the architecture on which roof tiles, modular sheet roofing,
standing seam, future catalog data and future price lists will be built.

DO NOT yet implement full tile quantity/layout.
DO NOT yet implement modular-sheet panelization.
DO NOT yet implement pricing/database/catalog backend.
DO NOT add collar ties in this iteration.

The reason for this iteration is architectural:
the next covering engines must not create technical debt that later forces
a rewrite when real manufacturer products and price lists are connected.

================================================== 0. MANDATORY PREFLIGHT
==================================================

Read completely:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/DOMAIN_RESEARCH_ROADMAP.md
- docs/ARCHITECTURE_V12_ROOF_FEATURES_BATTENS_AND_COMPOSITION.md
- docs/ARCHITECTURE_V13_INTERACTION_AND_LAYER_WORKBENCH.md
- docs/ARCHITECTURE_V14_OPENING_FRAMING_AND_ADAPTATION.md
- docs/ARCHITECTURE_V15_QUANTITY_ENGINE_AND_MEMBER_SCHEDULE.md
- docs/ARCHITECTURE_V16_WORKBENCH_AND_ROOF_BUILDUP.md
- docs/ARCHITECTURE_V17_UNITS_DIMENSIONS_MEASUREMENT_UX.md
- docs/PROMPT_ITERATION_017_UNITS_DIMENSIONS_MEASUREMENT_UX.md

Inspect:

- timber-model
- roof-math roof feature/window geometry
- opening framing/composition
- roof surface geometry
- batten geometry
- quantity-core
- ProjectDocument schema
- assembly/store
- workbench state
- Toolbox
- Inspector
- SkeletonCanvas
- context strip
- responsive styles
- apps/api current state

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

The V17 checkpoint reports approximately:

354 tests / 39 files,
green typecheck/lint/build,
main web chunk ~530 kB,
lazy SkeletonCanvas and MaterialSchedule.

Use the real checkout results, not documentation as proof.

Do not discard user work.

==================================================

1. V17 UX REGRESSION GATE
   \==================================================

Before new implementation verify that V17 contracts remain intact:

- first-run display unit cm,
- remembered unit preference,
- grouped Working spacing dimensions,
- Full dimensions,
- transient Measure tool,
- workspace Focus,
- camera preservation,
- ridge depth optionality,
- quantity partial/complete behavior,
- Quick remains simple.

If real evidenced defects are found, fix them first.

Do not redesign the whole application again.

================================================== 2. ROOF-WINDOW PRODUCTIVITY OBJECTIVE
==================================================

Current roof-window workflow supports:

add
place
move
nudge
collision
between-rafter placement
opening framing

V18 must add:

duplicate
multi-select
horizontal/eave-parallel alignment
equal horizontal distribution
smart alignment snapping

without introducing persistent layout clutter.

Interaction principle:

select physical objects
→ act on them
→ immediate geometric feedback
→ exact Inspector fallback

================================================== 3. ROOF-PLANE COORDINATE CONTRACT
==================================================

Reuse the existing plane-local coordinate system:

u = parallel to eave
v = uphill along roof plane

Therefore a horizontal row parallel to the eave/wall-plate direction is defined
in plane-local geometry, NOT screen coordinates.

Never use screen Y equality for alignment.

For a window:

lower reference:
v

centre reference:
v + height / 2

upper reference:
v + height

Implement these as pure geometry helpers.

================================================== 4. WINDOW DUPLICATION
==================================================

Add:

duplicateRoofWindow / beginRoofWindowDuplicatePlacement

Choose final naming after architecture review.

Desired UX:

select O1
→ "Powiel"
→ ghost copy of O1
→ same plane is initially active
→ width/height/clearance preserved
→ pointer chooses new position
→ click commits O2
→ O2 becomes selected

Opening the duplicate-placement tool:

- no ProjectDocument mutation,
- no history.

Click placement:

- exactly one canonical history edit.

Escape:

- cancel with zero history.

Do NOT place the duplicate immediately on top of O1.

================================================== 5. DUPLICATION DEPENDENCIES
==================================================

Duplicating a roof window copies:

- width,
- height,
- clearance,
- target roof plane as placement default.

It MUST NOT copy:

- accepted RoofOpeningFramingSpec,
- collision result,
- nearest-rafter result,
- selection/view state,
- derived batten splits,
- derived quantity rows.

The new location gets its own structural/collision resolution.

================================================== 6. MULTI-SELECTION
==================================================

Introduce a restrained transient multi-selection capability for roof windows.

Keep one PRIMARY selected window compatible with the existing selectedId model.

Add a secondary transient set such as:

selectedFeatureIds

or a cleaner equivalent.

Do not rewrite the entire selection architecture into a generic CAD selection
system unless clearly necessary.

Desktop:

Shift+click may add/remove roof windows from the set.

Toolbox window rows should support equivalent keyboard-accessible selection.

Mobile must have a non-hover way to select multiple windows.

Multi-selection:

- transient,
- not serialized,
- no history.

================================================== 7. ALIGNMENT OPERATIONS
==================================================

Add pure domain helpers.

Supported only when selected windows belong to the same roof plane.

Alignment modes:

lower-edge
centre
upper-edge

Example:

alignRoofWindows({
windows,
anchorFeatureId,
mode: 'lower-edge'
})

The PRIMARY/anchor window stays fixed.

Other selected windows move only in plane-local v.

Preserve:

width
height
u position

Clamp/validate against the plane.

If exact requested alignment cannot fit a window:
return an explicit result.
Do not silently distort the window.

Applying alignment:
exactly one Undo item.

================================================== 8. EQUAL HORIZONTAL DISTRIBUTION
==================================================

Add pure:

distributeRoofWindowsAlongEave(...)

or equivalent.

For 3+ selected windows on one plane:

- sort by geometric u,
- preserve first and last anchor positions,
- preserve every window size,
- make CLEAR horizontal gaps equal.

Do not distribute centres blindly when widths differ.

Return:

current positions
proposed positions
clearGapMm
status

Preview before Apply where practical.

Preview:
zero history.

Apply:
one history entry.

For two windows:
alignment/distribution UI should explain that there is nothing to distribute.

================================================== 9. SMART ALIGNMENT GUIDES
==================================================

During roof-window drag provide transient snap guides against other windows on
the SAME roof plane.

Candidate references:

lower edge
centre line
upper edge

A snap threshold may use screen-distance ergonomics,
but the actual snap TARGET must be canonical plane-local geometry.

Example:

drag O2 near O1 lower edge
→ show guide
→ snap O2 v exactly to O1 v

Do not store guides.

Allow an explicit temporary modifier to disable snapping if useful and
conflict-free.

================================================== 10. WINDOW GROUP UX
==================================================

Do NOT permanently add ten buttons to every window row.

When one window is selected expose compact actions:

Powiel
Wyrównaj
...

When multiple windows are selected expose a contextual group bar:

3 okna
[ Wyrównaj ▾ ] [ Rozmieść równo ] [ Wyczyść zaznaczenie ]

Use Inspector/context UI rather than bloating Toolbox.

Toolbox remains primarily:
select / add / navigate.

================================================== 11. WINDOW INSPECTOR POLISH
==================================================

Keep current exact fields.

Add compact action section near the opening header:

Powiel

When multi-selection is active:
show the multi-selection actions instead of repeating all exact inputs for every
window.

Do not show misleading shared values when selected windows differ.

================================================== 12. WINDOW STATUS SUMMARY
==================================================

Improve Otwory task context.

Useful compact project-level facts:

number of openings
number with collision
number with accepted framing
number needing review

Do not create another large dashboard.

================================================== 13. WINDOW TESTS
==================================================

Add pure/domain/store/UI tests for:

- duplication preview has zero history,
- duplicate commit = one history entry,
- Escape duplicate = zero history,
- dimensions/clearance copied,
- framing NOT copied,
- stable new ID,
- duplicate remains on selected plane by default,
- same-plane lower-edge alignment,
- centre alignment,
- upper alignment,
- different window heights,
- equal CLEAR gaps for different widths,
- cross-plane selection rejected,
- impossible alignment explicit,
- smart snap lower/centre/upper,
- snap writes exact canonical v,
- one Undo for multi-window operation,
- Undo exact restore,
- multi-selection not serialized.

================================================== 14. COVERING DOMAIN RESEARCH BEFORE CODING
==================================================

Before defining the product schema create:

docs/domain/COVERING_PRODUCT_MODEL.md

Research multiple independent current product families.

At minimum inspect examples representing:

- interlocking ceramic/concrete roof tile,
- plain tile / alternative laying mode,
- modular metal tile,
- sheet/profile cut-to-length system,
- standing-seam panel.

Research technical facts such as:

- physical width/length,
- effective/cover width,
- effective/cover length,
- gauge / batten-spacing range,
- installation mode,
- module length,
- minimum/maximum panel length,
- minimum pitch,
- sales unit,
- material/weight where useful.

The purpose is NOT to seed a product catalogue.

The purpose is to ensure the generic contract can represent real products.

Do not encode manufacturer-specific algorithms in roof-math.

================================================== 15. CRITICAL PRODUCT MODEL DECISION
==================================================

Product TECHNICAL geometry and COMMERCIAL variant are separate concepts.

Conceptually:

TechnicalProductFamily
├── calculation strategy
├── geometric/install parameters
└── technical revision

CommercialVariant
├── SKU
├── colour
├── coating/finish
└── future price relation

PriceListEntry
├── price list
├── variant/SKU
├── sale unit
├── amount
└── validity

Do not merge these into one giant Product object.

A colour change must not require another geometry algorithm.

================================================== 16. NEW PURE PACKAGE
==================================================

Create:

packages/covering-core

This package must be pure TypeScript.

Allowed:

- Zod,
- shared serializable types,
- explicit technical product schemas,
- pure compatibility/layout contracts.

Forbidden:

- React,
- Zustand,
- DOM/SVG,
- Express,
- database,
- HTTP,
- prices,
- translations.

Do NOT put manufacturer catalogue records in roof-math.

Do NOT put prices in covering-core.

Do NOT add product catalogue entities into timber-model.

================================================== 17. COVERING KIND CONTRACT
==================================================

Initial discriminator:

CoveringKind =
| 'roof-tile'
| 'modular-sheet'
| 'standing-seam'

Design explicit discriminated schemas.

Do NOT use:

Record<string, any>

for technical parameters.

The compiler and Zod must know the supported fields.

================================================== 18. ROOF TILE TECHNICAL SPEC
==================================================

Design a contract capable of representing tile systems where:

- physical size differs from cover size,
- usable/cover width exists,
- batten gauge may be a range,
- a product may support more than one laying mode,
- minimum pitch may depend on mode/technical conditions.

Conceptual direction:

RoofTileTechnicalSpec {
kind: 'roof-tile'
schemaVersion
physicalWidthMm?
physicalLengthMm?
installationModes: [
{
id
coverWidthMm
minGaugeMm
maxGaugeMm
declaredUnitsPerM2Min?
declaredUnitsPerM2Max?
minPitchDeg?
}
]
}

Use final naming based on research.

Do not force one fixed gauge when real products expose a range.

================================================== 19. MODULAR SHEET TECHNICAL SPEC
==================================================

Represent at least concepts such as:

kind
effectiveWidthMm
totalWidthMm?
effectiveLengthMm
totalLengthMm?
moduleLengthMm
moduleWidthMm?
profileHeightMm?
minPitchDeg?
physicalThicknessMm?
sales-unit metadata ONLY if technically useful

Do NOT add price.

Do not assume every modular sheet has identical dimensions.

================================================== 20. STANDING-SEAM TECHNICAL SPEC
==================================================

Represent concepts such as:

effectiveWidth options / selected effective width
total width where relevant
minimum panel length
maximum panel length
seam/profile height
minimum pitch
optional transverse-overlap rule when genuinely supported

Do not model standing seam as a modular-sheet rectangle merely because both are
metal.

They will require different layout strategies.

================================================== 21. INSTALLATION MODE
==================================================

Technical family may expose installation modes.

Examples conceptually:

standard
scale
crown
selected effective panel width
other researched mode

Use stable language-neutral IDs.

User-visible labels belong outside covering-core.

================================================== 22. COVERING PRODUCT SNAPSHOT
==================================================

Introduce a project-safe covering product snapshot contract.

Conceptually:

CoveringProductSelection {
catalogRef?: {
productId: string
technicalRevisionId: string
variantId?: string
}

displaySnapshot?: {
manufacturer?: string
familyName?: string
variantName?: string
}

technicalSpecSnapshot: CoveringTechnicalSpec
}

The CALCULATION must consume the technical snapshot.

It must never require a live database row.

This enables:

- offline calculation,
- reproducible old projects,
- explicit future catalogue refresh,
- manual products using the same engine.

================================================== 23. PROJECT COVERING ASSIGNMENT
==================================================

Create a canonical serializable intent for assigning covering to roof planes.

Conceptually:

CoveringAssignmentSpec {
id
roofPlaneIds
product: CoveringProductSelection
selectedInstallationModeId?
layoutIntent?
}

Do not prematurely define every layout field required by V19/V20.

Only add what is justified.

Support multiple future assignments so different planes may eventually use
different products.

================================================== 24. PROJECT DOCUMENT COMPATIBILITY
==================================================

Add an OPTIONAL covering boundary to RoofProjectDocumentV1 in a genuinely
backward-compatible way.

Possible:

coverings?: CoveringAssignmentSpec[]

Old documents:
parse with [].

Do not reinterpret old fields.

Do not put transient product-browser/filter state into project data.

Add roundtrip/backward compatibility tests.

================================================== 25. MANUAL AND DATABASE PRODUCT = ONE CALCULATION PATH
==================================================

This is a critical invariant.

Future:

user manually enters parameters
OR
user selects BMI/Wienerberger/Budmat/Ruukki/... from the backend

Both must produce the SAME:

CoveringTechnicalSpec

and enter the SAME:

Covering Engine.

Never create:

calculateManualTile(...)
calculateDatabaseTile(...)

There is one resolver.

================================================== 26. TECHNICAL REVISION SAFETY
==================================================

A future backend product may change.

Therefore architecture must support:

catalog product
technical revision
project snapshot

A project created with revision R1 must not silently recalculate using R2 after
a manufacturer/catalog update.

Updating technical product data in an existing project must later be an explicit
user action.

Document this invariant now.

================================================== 27. FUTURE DATABASE CONTRACT — DOCUMENT ONLY
==================================================

Do NOT create database tables in V18.

Create:

docs/ARCHITECTURE_COVERING_CATALOG_AND_PRICING_BOUNDARY.md

Describe future entities conceptually:

Manufacturer
TechnicalProductFamily
TechnicalProductRevision
CommercialVariant / SKU
PriceList
PriceListEntry

A likely future database may store technical parameters as validated versioned
JSON using the SAME Zod contracts from covering-core.

Prices remain relational/commercial data.

Do not commit to final SQL columns prematurely.

================================================== 28. COVERING STRATEGY CONTRACT
==================================================

Define the future pure resolver boundary.

Conceptually:

CoveringLayoutStrategy<TSpec, TIntent, TResult>

resolve({
roofSurfaceGeometry,
openings,
buildUp,
productSpec,
layoutIntent
})

Do not implement all strategies yet.

Establish types/interfaces and tests proving discrimination.

Future strategies:

TileLayoutStrategy
ModularSheetLayoutStrategy
StandingSeamLayoutStrategy

No switch on manufacturer names.

================================================== 29. COMPATIBILITY VALIDATION
==================================================

It is acceptable and useful for V18 to implement pure compatibility checks such
as:

- product minimum pitch vs roof pitch,
- selected tile installation mode gauge range vs current batten gauge,
- missing required technical parameters.

Return structured codes.

Do NOT automatically change the roof or battens.

Do NOT claim structural safety.

Do NOT calculate product quantity yet.

================================================== 30. NO EMPTY PRODUCT UI
==================================================

Do NOT add a top-level "Pokrycie" task merely to show an unfinished form.

North Star rule:
only expose task presets with real user value.

The real Pokrycie workbench will begin when V19 has an actual tile layout /
quantity engine.

V18 covering work is primarily architectural and tested.

================================================== 31. QUANTITY-CORE PREPARATION
==================================================

Do not implement tile/sheet quantities yet.

Audit quantity-core and document the later bridge:

CoveringLayoutResult
→ CoveringQuantitySource
→ QuantityItem / schedule
→ future Cost Engine

Do not overload existing timber/build-up rows with fake product quantities.

No meaningless combined total of:
m
m²
pcs

================================================== 32. FUTURE COST ENGINE BOUNDARY
==================================================

Explicitly document:

Covering Engine:
technical geometry

Quantity Engine:
required geometric/product quantity

Catalog:
what product/SKU exists

Price List:
commercial price for a SKU/unit/date

Cost Engine:
quantity × commercial rules

These layers must remain independently testable.

================================================== 33. TIMBER-MODEL BOUNDARY
==================================================

Current timber-model already contains some general roof composition contracts.

Do NOT undertake a broad package rename/refactor in V18 unless a genuine cyclic
dependency blocks covering-core.

Also DO NOT worsen the problem by placing:

manufacturer
SKU
colour
coating
price
catalog product JSON

inside timber-model.

Keep the new covering domain isolated.

Document whether a future neutral roof-model extraction becomes desirable.

================================================== 34. UI/UX POLISH AROUND OPENINGS
==================================================

Use this iteration to improve the Otwory task rather than redesigning all Builder.

Priorities:

- selected window easy to identify,
- duplicate easy to discover,
- group selection clear,
- alignment guide obvious but restrained,
- collision warning remains distinguishable from alignment guide,
- group toolbar disappears when irrelevant,
- mobile actions remain reachable,
- no permanent extra panel.

Do not increase global visual complexity.

================================================== 35. RESPONSIVE OPENING WORKFLOW
==================================================

At 360 px:

- window list reachable,
- duplicate works without hover,
- multi-select accessible,
- align mode accessible,
- equal distribution accessible,
- no horizontal page overflow,
- alignment guide remains understandable,
- only one large contextual sheet at a time.

================================================== 36. KEYBOARD
==================================================

If conflict-free:

Ctrl/Cmd + D on selected roof window:
begin duplicate-placement workflow.

Do NOT duplicate immediately on top of the source.

Existing input/contenteditable shortcut guards remain mandatory.

Escape:
cancel placement/proposal/multi action according to the existing hierarchy.

================================================== 37. PERFORMANCE
==================================================

Hovering alignment candidates or showing snap guides must NOT rerun:

roof template solver
opening framing solver
quantity engine
roof surface solver

Pure window group operations should run on the relevant feature list.

No per-window persistent React state for derived guides.

================================================== 38. TESTS — COVERING CONTRACTS
==================================================

Add covering-core tests for:

- roof-tile spec parse,
- tile with multiple installation modes,
- modular-sheet spec parse,
- standing-seam spec parse,
- invalid non-finite/negative values,
- invalid gauge ranges,
- invalid effective width/length,
- explicit discriminator behavior,
- project product snapshot roundtrip,
- optional catalogue reference,
- manual product without catalogue reference,
- stable technical schema version,
- minimum-pitch compatibility,
- batten-gauge compatibility,
- no pricing fields in technical spec.

================================================== 39. TESTS — PROJECT DOCUMENT
==================================================

Add:

- old V17 document parses with empty coverings,
- covering assignment serializes,
- product technical snapshot preserved exactly,
- catalogue reference optional,
- covering state participates in project Undo only when canonical covering intent
  is changed,
- catalogue browser/filter UI state does not serialize.

================================================== 40. DOCUMENTATION
==================================================

Create:

docs/ARCHITECTURE_V18_OPENING_PRODUCTIVITY_AND_COVERING_PLATFORM.md

Document:

- roof-window multi-selection,
- duplicate workflow,
- alignment geometry,
- distribution,
- snapping,
- Undo semantics,
- covering-core package boundary,
- technical product union,
- product snapshot,
- technical revision,
- future catalogue/database relation,
- future quantity relation,
- future Cost Engine relation.

Create:

docs/PROMPT_ITERATION_018_OPENING_PRODUCTIVITY_COVERING_PLATFORM.md

Store this actual contract.

Update:

docs/ROOFCALC_PRODUCT_NORTH_STAR.md

only where V18 decisions genuinely clarify the future architecture.

Do not rewrite historical sections unnecessarily.

================================================== 41. IMPORTANT NON-GOALS
==================================================

Do NOT implement in V18:

- actual manufacturer product database,
- MySQL catalogue tables,
- product API,
- price list,
- VAT,
- Cost Engine,
- tile quantity calculation,
- tile accessories,
- ridge tiles,
- sheet panelization,
- sheet nesting,
- sheet cut optimization,
- standing-seam strip layout,
- waste factor,
- ordering,
- PDF/XLSX,
- collar ties / jętki,
- posts,
- struts/braces,
- chimney,
- dormer,
- new roof topology,
- structural verification.

================================================== 42. FINAL VALIDATION
==================================================

Run:

npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check

Run changed-file Prettier validation.

Record actual:

test count
bundle sizes
warnings
browser QA if genuinely available.

================================================== 43. PROJECT BLUEPRINT
==================================================

Update WORK CHECKPOINT with:

- V17 audit,
- roof-window productivity implementation,
- duplicate semantics,
- multi-selection,
- alignment/distribution,
- snapping,
- covering research,
- covering-core contract,
- catalogue-ready product snapshot,
- ProjectDocument compatibility,
- technical revision rule,
- future backend boundary,
- validation,
- bundle impact,
- QA status,
- known limitations.

Set precise NEXT ACTION:

prepare V19 Tile Engine on top of the proven covering-core contracts.

Do not begin V19 automatically.

Do not commit or push unless explicitly requested.
