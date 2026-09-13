# PROMPT_ITERATION_020
# Mobile-First Professional Workbench,
# Unified Context Sheets, Touch Camera and Task-Aware UX

Continue RoofCalc / CieślaCalc from the CURRENT repository HEAD.

Expected starting commit:

c1b07b48e4465f52feb37df90750947ae1ff62f0
"V19"

IMPORTANT ROADMAP CHANGE:

The previous V19 checkpoint proposed metal coverings as V20.

The user has now explicitly prioritized usability and reported that the mobile
experience is uncomfortable.

This user-approved iteration SUPERSEDES that previous NEXT ACTION.

Iteration 020 is a PROFESSIONAL MOBILE/RESPONSIVE UX iteration.

Metal covering engines move to Iteration 021.

Do NOT implement modular sheet roofing or standing seam in V20.

The main objective is:

> make Builder feel like one coherent professional tool on a phone,
> not a desktop three-column application stacked vertically.

Desktop must remain powerful.
Mobile must become deliberately designed rather than merely responsive.

==================================================
0. MANDATORY PREFLIGHT
==================================================

Read fully:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- docs/ARCHITECTURE_V17_UNITS_DIMENSIONS_MEASUREMENT_UX.md
- docs/ARCHITECTURE_V18_OPENING_PRODUCTIVITY_AND_COVERING_PLATFORM.md
- docs/ARCHITECTURE_V19_TILE_ENGINE_AND_COVERING_WORKBENCH.md
- docs/PROMPT_ITERATION_019_TILE_ENGINE_COVERING_WORKBENCH.md

Inspect carefully:

- apps/web/src/assembly/Page.tsx
- WorkbenchControls.tsx
- WorkbenchContextBar.tsx
- Toolbox.tsx
- Inspector.tsx
- SkeletonCanvas.tsx
- CoveringWorkspace.tsx
- MaterialSchedule.tsx
- BuildUpWorkspace.tsx
- DetailPreview.tsx
- PreparationPlan.tsx
- workbench.ts
- store.ts
- styles.css
- packages/ui
- drawing-engine viewport helpers

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

V19 documentation currently reports approximately:

405 tests across 41 files
main web ~500.16 kB / 143.80 kB gzip
covering-core ~65.60 / 16.06 kB
CoveringWorkspace ~14.16 / 4.00 kB

Use actual checkout results.

Do not discard user work.

==================================================
1. FIRST: SOURCE-LEVEL MOBILE UX AUDIT
==================================================

Before edits document the current mobile interaction problems.

The current <=800px CSS effectively:

- converts Builder from grid to vertical flex,
- flattens Toolbox <details> with `display: contents`,
- hides Toolbox group summaries,
- exposes many tools simultaneously,
- makes the six-task ribbon horizontally scroll,
- gives each task a minimum width around 112px,
- turns Inspector into a fixed bottom sheet up to ~55dvh,
- turns Detail Drawer into another fixed bottom sheet,
- stacks Covering canvas/editor while a separate Inspector still exists.

Treat these as architectural UX issues,
not just spacing/color bugs.

Create an internal acceptance list before changing code.

==================================================
2. PRODUCT UX PRINCIPLE
==================================================

Desktop:

Toolbox | Workspace | Inspector

remains a valid architecture.

Mobile must instead follow:

TASK
↓
PRIMARY WORKSPACE
↓
CONTEXTUAL ACTION
↓
ONE OPTIONAL SHEET

At most ONE large bottom sheet/modal surface may dominate mobile at a time.

Do NOT show:

Toolbox sheet
+
Inspector sheet
+
Detail Drawer sheet

simultaneously.

==================================================
3. MOBILE VIEW STATE
==================================================

Introduce transient mobile workbench state only where needed.

Conceptual direction:

MobilePanel =
  | 'none'
  | 'tools'
  | 'inspector'
  | 'view'

Do not put viewport width itself into project state.

Do not serialize mobile panel state.

Do not create project history for:

open tools
open inspector
open view
switch task
close sheet

Use a clean `matchMedia` / viewport-class hook.

Avoid scattering direct
window.matchMedia('(max-width: 800px)')
calls through many components.

==================================================
4. MOBILE APPLICATION SHELL
==================================================

For Builder on <=800px:

do NOT simply stack the desktop layout.

Create a deliberate mobile shell.

Primary visual order:

compact app header
compact context
workspace/canvas
mobile task dock

Toolbox and Inspector become on-demand surfaces.

Canvas/workspace must appear BEFORE large tool lists.

==================================================
5. MOBILE HEADER
==================================================

Reduce vertical chrome.

The current mobile header wraps and places the Quick/Builder mode selector on
its own full-width row.

Builder also retains the large desktop page heading.

On mobile Builder target:

approximately one compact header region.

Keep:

brand
Quick / Kreator switching
Undo
Redo
essential overflow/settings access

Move low-frequency actions such as:

unit
language
reset

into a compact overflow/settings popover if this improves space.

Do not hide Undo/Redo so deeply that editing becomes risky.

In Builder mobile hide or heavily compact:

large H1 page heading
long explanatory paragraph
"local" status copy

Quick may retain more onboarding copy.

==================================================
6. MOBILE TASK DOCK
==================================================

Replace the horizontally-scrolled Builder task ribbon on narrow mobile with a
fixed/sticky task dock.

Tasks remain:

construction
openings
layers
covering
cuts
materials

The dock should show all six at once on normal 360px+ phones if practical.

Use:

icon
+
very short mobile label

Examples in Polish may be approximately:

Konstr.
Otwory
Warstwy
Pokrycie
Cięcia
Lista

Full label remains available through:

aria-label
title/accessibility text.

Each touch target should remain roughly >=44px.

Respect:

env(safe-area-inset-bottom)

For extremely narrow widths a safe fallback may scroll,
but 360px should not require horizontal task scrolling.

Desktop keeps the current task ribbon.

==================================================
7. TASK DOCK BEHAVIOR
==================================================

Changing task:

- changes only view state,
- creates zero history,
- closes/suspends irrelevant mobile panels,
- does NOT clear canonical selection unnecessarily.

For example:

Cuts
→ Covering

must close a cut Detail sheet.

Covering
→ Openings

must not leave product Inspector over the openings workspace.

==================================================
8. MOBILE TOOLBOX — DO NOT FLATTEN ALL TOOLS
==================================================

REMOVE the current mobile strategy which turns all Toolbox groups into
`display: contents`.

That approach does not scale.

Instead create:

[Narzędzia]

which opens a mobile tools sheet.

Reuse the SAME tool registry/actions.

Do not create a second mobile business-logic implementation.

Refactor Toolbox presentation if required into reusable content/sections.

==================================================
9. TASK-AWARE MOBILE TOOLS
==================================================

On mobile default the Tools sheet to the active task.

Construction:
- geometry
- timber
- supports

Openings:
- opening list
- add opening

Layers:
- membrane
- counter battens
- battens

Covering:
- covering assignment/product-level actions only if useful

Cuts:
- relevant fabrication navigation

Materials:
- relevant schedule navigation/filters only if useful

Allow access to other categories through an optional
"All tools" affordance if necessary.

Do not make the first sheet contain the entire project toolbox.

==================================================
10. MOBILE INSPECTOR MODEL
==================================================

Selecting an object on the canvas must NOT immediately cover half the screen.

Default interaction:

tap object
→ select
→ show compact selection peek

Example:

K1-08 · Krokiew zwykła        [Edytuj]

or:

O2 · Okno dachowe             [Edytuj]

Tapping Edytuj opens Inspector sheet.

The Inspector sheet may use approximately:

half-height
and optional expanded/full state

but should not automatically open full-height for every selection.

==================================================
11. ONE MOBILE SHEET SYSTEM
==================================================

Create/reuse one coherent sheet primitive.

Requirements:

- title/header,
- close action,
- optional expand/collapse,
- safe-area support,
- controlled maximum height,
- internal scrolling,
- body scroll remains predictable,
- Escape closes on keyboard devices,
- proper aria role/label,
- focus management where practical.

If a generic workbench-neutral primitive cleanly belongs in `@cieslacalc/ui`,
add it there.

Do NOT move workbench-specific store logic into packages/ui.

If extraction would overcomplicate the iteration,
keep a clean local reusable `MobileSheet`.

==================================================
12. SHEET COORDINATION
==================================================

Only one major contextual mobile surface at once.

Opening:

tools

closes:

inspector/view.

Opening:

inspector

closes:

tools/view.

Opening a:

Detail Drawer

closes/suspends normal Inspector.

Closing detail restores meaningful selected context,
not necessarily the previous physical sheet height.

==================================================
13. DETAIL DRAWER MOBILE UX
==================================================

Cuts are an important mobile workflow.

Reuse the sheet architecture rather than maintaining a second independent
fixed-bottom layout.

On mobile Detail should offer clear local navigation:

Rysunek
Wymiary
Kroki

or an equivalent compact structure based on the existing data.

Do not place a desktop multi-column detail layout inside a narrow sheet.

Focus mode may become near-full-screen.

==================================================
14. COVERING UX CONSOLIDATION
==================================================

V19 currently exposes:

Covering editor
+
Covering canvas
+
separate Covering Inspector.

This is too much UI competition.

Refactor responsibility.

CENTER WORKSPACE should primarily contain:

- product/source identity,
- compact layout status,
- compatibility warning,
- plane tabs,
- coverage drawing,
- compact geometric quantity facts.

EXACT PRODUCT/LAYOUT PARAMETERS belong in:

CoveringInspector.

Move/refactor the current manual product editing controls into the Inspector.

Do NOT duplicate editable fields between workspace and Inspector.

==================================================
15. COVERING MOBILE UX
==================================================

On mobile:

resolved covering should default to DRAWING.

If layout is incomplete/incompatible:

make the "Parametry / Popraw" action obvious and open Covering Inspector.

A compatibility CTA such as:

"Przejdź do łat"

must:

switch to Layers → Battens
close covering sheet
bring the relevant layer context into view.

Do not stack:

canvas
then complete editor
then inspector

into one long page.

==================================================
16. MATERIALS MOBILE UX
==================================================

The existing:

[ Zestawienie ] [ Rysunek ]

mobile strategy is good.

Retain and polish it.

Make this segmented surface-switch pattern reusable where useful.

Do not render:

full schedule
+
full canvas

at once on a phone.

==================================================
17. LAYERS MOBILE UX
==================================================

The active build-up layer should be visible without scrolling through unrelated
controls.

Keep the existing secondary layer context:

Przegląd
Membrana
Kontrłaty
Łaty

but on mobile make the active layer obvious.

Exact fields stay in Inspector sheet.

The central workspace remains visual/result-oriented.

==================================================
18. CONTEXT BAR MOBILE
==================================================

Desktop context bar may remain rich.

Mobile should use a compact single-row form.

Examples:

Konstrukcja · K1-08

Otwory · O2

Warstwy · Łaty

Pokrycie · Dachówka

Cięcia · K1-08 · Z1

Avoid multiple rows of chips above the canvas.

Opening statistics can move behind an optional expansion or Tools context.

==================================================
19. CANVAS MOBILE HEIGHT
==================================================

Current narrow SkeletonCanvas height is fixed around 400px.

Audit this against actual viewport height.

On mobile Builder the workspace should use available dynamic viewport space.

Prefer a bounded formula based on:

100dvh
minus compact header
minus task dock
minus necessary context controls

rather than one fixed 400px for every phone.

Do not let a sheet permanently cover the only useful canvas area.

Landscape phone must also remain usable.

==================================================
20. PINCH-TO-ZOOM
==================================================

Implement real touch camera gestures for SkeletonCanvas.

Required:

one-finger background drag:
pan

two-finger gesture:
pinch zoom around the gesture midpoint
+
two-finger pan

Use Pointer Events.

Do not implement geometry from screen coordinates.

Camera gesture is transient.

No project history.

Keep:

wheel pointer-centred zoom
+/- controls
Fit

for desktop/accessibility.

==================================================
21. TOUCH GESTURE STATE
==================================================

Current canvas drag state models one pointer.

Introduce a clean touch-camera gesture boundary.

Do not sprinkle special cases across every member renderer.

The gesture implementation should maintain a small pointer map or equivalent.

When second touch begins during a background pan:

transition safely to camera gesture.

If a second touch appears during a canonical object edit:

prefer cancelling/restoring the edit before switching to camera
rather than committing an accidental modification.

Document the exact contract.

==================================================
22. ACCIDENTAL DRAG PROTECTION
==================================================

On touch devices a tap naturally moves a few pixels.

Do not immediately treat every small movement as a canonical edit.

For roof windows and direct-manipulation handles introduce a small screen-space
drag activation threshold.

Concept:

0–6px:
tap/select

beyond threshold:
start drag transaction

Do not use the threshold as canonical geometry.

The resulting geometry remains exact mm.

One drag:
one Undo entry.

Tap without drag:
zero project history.

==================================================
23. TOUCH HIT TARGETS
==================================================

Thin rafters/supports can be difficult to tap.

Audit member hit areas.

Where necessary add invisible SVG hit geometry with:

transparent stroke
sensible non-scaling screen width

without changing visual line/face geometry.

Battens/counter battens already demonstrate the correct hit-target concept.

Apply the same interaction philosophy to other hard-to-hit physical elements.

Do not make overlapping hit corridors so large that selection becomes random.

Selected/priority object may win overlap resolution.

==================================================
24. WINDOW MOBILE WORKFLOW
==================================================

Verify on touch:

+ Add window
choose plane
place
select
drag
duplicate
multi-select
align
distribute
framing

No step may depend on:

hover
Shift
Ctrl/Cmd

Desktop shortcuts remain.

Explicit mobile buttons remain available for group selection and actions.

==================================================
25. SMART VIEW CONTROLS
==================================================

Mobile currently exposes several persistent view controls.

Reduce permanent chrome.

Move low-frequency controls such as:

isolation
dimension level
layer visibility
legend

into the View sheet.

Keep immediately accessible:

Fit
Measure

only where their current task makes sense.

Do not hide every important control behind three taps.

==================================================
26. LEGEND
==================================================

On phone:

legend should be collapsed by default.

It belongs inside View/details context.

Do not permanently consume workspace height with it.

==================================================
27. QUICK MODE MOBILE
==================================================

Do not rebuild Quick from scratch.

Retain:

inputs
live result
cut previews

but improve:

compact header
vertical spacing
touch target consistency
detail bottom-sheet behavior.

Quick must remain simpler than Builder.

Do NOT add Builder task navigation to Quick.

==================================================
28. RESPONSIVE BREAKPOINT POLICY
==================================================

Document breakpoint roles.

For example conceptually:

desktop:
> 1100

compact desktop/tablet:
801–1100

mobile workbench:
<=800

narrow phone:
<=600

Do not let styles at 600 and 800 accidentally fight each other.

Prefer semantic responsive classes/components where necessary
over hundreds of override rules.

==================================================
29. CSS CLEANUP
==================================================

V20 may refactor responsive CSS substantially.

Do not perform a visual redesign of the brand.

Preserve:

technical green/teal language
selected/related/warning semantics
existing typography character
professional restrained aesthetic.

Reduce:

duplicate mobile rules
fixed-height conflicts
z-index competition
unnecessary `display: contents`
horizontal overflow hacks.

==================================================
30. SCROLL OWNERSHIP
==================================================

Define one clear scroll owner.

Desktop:
sidebars may scroll internally where needed.

Mobile normal Builder:
page/workspace should not become an extremely long stack of every panel.

Mobile sheet:
sheet body scrolls internally.

Canvas gesture:
does not unexpectedly scroll document.

Avoid nested-scroll hell.

==================================================
31. SAFE AREAS
==================================================

Respect:

env(safe-area-inset-top)
env(safe-area-inset-bottom)

for modern phones.

The bottom task dock and sheets must not sit underneath browser/home indicator UI.

==================================================
32. ACCESSIBILITY
==================================================

Preserve/improve:

44px approximate touch targets
keyboard navigation
visible focus
aria-selected
aria-pressed
role=tablist
role=dialog where appropriate.

Do not encode state by color alone.

Mobile short labels must still expose full accessible labels.

==================================================
33. VIEW STATE IS NOT PROJECT STATE
==================================================

Everything introduced for mobile layout remains transient:

mobile active panel
sheet height/mode
task dock
selected local workspace surface
view popover
legend expansion

Do NOT serialize these into ProjectDocument.

Do NOT add Undo entries.

==================================================
34. PERFORMANCE
==================================================

Opening:

Tools
Inspector
View
task dock
selection peek

must NOT rerun:

roof template geometry
opening framing
surface geometry
Tile Engine
Quantity Engine

Use narrow Zustand selectors where helpful.

Camera pinch/pan remains local canvas state.

Do not write camera movement into global project store.

==================================================
35. COVERING DOMAIN MUST NOT CHANGE
==================================================

This is a UI/UX iteration.

Do not change correct V19 calculation semantics merely to simplify UI.

Preserve:

technical snapshots
course patterns
batten source-of-truth
opening clipping
hip plane handling
quantity source
declared-consumption reference
no-price boundary.

Only repair a domain defect if V20 QA proves a real existing bug.

==================================================
36. DO NOT START METAL COVERINGS
==================================================

Explicit V20 non-goals:

- modular sheet engine,
- cut-to-length sheet engine,
- standing seam engine,
- catalogue API,
- database,
- prices,
- Cost Engine,
- PDF/XLSX,
- new roof topology,
- collar ties,
- posts/braces,
- dormers/chimneys.

Metal coverings move to V21.

==================================================
37. TESTS — MOBILE VIEW STATE
==================================================

Add tests for:

- mobile Builder opens with no large contextual sheet,
- task dock changes preset with zero history,
- all six tasks accessible,
- opening Tools closes Inspector,
- opening Inspector closes Tools,
- Detail closes/suspends Inspector,
- task change clears irrelevant sheet,
- mobile panels not serialized,
- mobile panels not in Undo history.

Mock matchMedia cleanly.

==================================================
38. TESTS — MOBILE TOOLBOX
==================================================

Verify:

- current mobile `display everything` behavior is no longer the interaction model,
- Construction shows construction tools first,
- Openings exposes window list/add,
- Layers exposes build-up controls,
- explicit non-hover window multi-select remains available,
- desktop Toolbox behavior remains intact.

==================================================
39. TESTS — COVERING UX
==================================================

Verify:

- covering workspace has no duplicated full editor,
- exact product fields exist in Covering Inspector,
- resolved mobile covering emphasizes drawing,
- incompatible layout offers parameter action,
- batten issue navigation enters Layers/Battens,
- covering edits still produce canonical single-step history,
- drawing/view switches produce zero history.

==================================================
40. TESTS — TOUCH CAMERA
==================================================

Pure/helper/component tests where practical:

- one touch background pan,
- two-pointer pinch zoom,
- zoom midpoint stability,
- two-finger pan,
- camera gesture creates zero history,
- second pointer safely cancels incompatible canonical drag,
- no NaN/Infinity viewport,
- viewport clamping remains valid.

==================================================
41. TESTS — DRAG THRESHOLD
==================================================

Test:

roof window touch tap:
select only
zero history

movement below threshold:
zero geometry change

movement beyond threshold:
one transaction

pointer cancel:
exact restore

same contract where applied to direct manipulation handles.

Mouse behavior must not regress.

==================================================
42. REAL DEVICE / BROWSER QA
==================================================

If a real browser is available, test:

1440x900 desktop
1024 tablet
768 tablet portrait
430x932
390x844
360x800
844x390 landscape phone

Test both:
gable
hip

Test:

Quick
Construction
Openings
Layers
Covering
Cuts
Materials

Especially test:

mobile task switching
Tools sheet
Inspector sheet
Detail sheet
safe-area bottom dock
no horizontal page overflow
canvas visibility
pinch zoom
pan
tap selection
window manipulation
virtual keyboard/input editing
covering parameter editing
schedule/drawing switch.

If physical touch is unavailable:
state that explicitly.

Do not claim touch QA from mouse emulation.

==================================================
43. BUNDLE / CSS AUDIT
==================================================

V19 main is around the 500kB Vite advisory.

V20 should avoid meaningfully increasing initial JS merely for responsive chrome.

Where clean:

lazy-load mobile-only heavy sheet content
or reuse existing lazy task modules.

Do not split tiny components pointlessly.

Record:

main JS before/after
CSS before/after
lazy chunks.

Also report whether responsive CSS grew or was consolidated.

==================================================
44. ARCHITECTURE DOCUMENT
==================================================

Create:

docs/ARCHITECTURE_V20_MOBILE_WORKBENCH_UX.md

Document:

- desktop vs mobile shell,
- task dock,
- mobile sheet state,
- Toolbox reuse,
- Inspector model,
- sheet exclusivity,
- canvas gestures,
- drag threshold,
- hit target strategy,
- Covering responsibility refactor,
- transient/history boundary,
- breakpoint policy,
- safe areas,
- accessibility,
- performance.

Also create:

docs/PROMPT_ITERATION_020_MOBILE_WORKBENCH_UX.md

containing the actual V20 contract.

==================================================
45. FINAL VALIDATION
==================================================

Run:

npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check

Run repository Prettier validation for changed files.

Record exact:

test count
bundle sizes
warnings
QA.

==================================================
46. PROJECT BLUEPRINT
==================================================

Update PROJECT_BLUEPRINT -> WORK CHECKPOINT.

Record:

- V19 audit,
- source-level mobile problems,
- mobile shell implementation,
- task dock,
- tools sheet,
- Inspector sheet,
- Detail coordination,
- Covering UX refactor,
- touch camera,
- drag threshold,
- hit target improvements,
- responsive CSS cleanup,
- accessibility,
- exact automated results,
- real-device/browser QA status,
- remaining limitations.

Set NEXT ACTION:

Iteration 021 — modular sheet / cut-to-length sheet and standing-seam engines
on the existing covering-core contracts and the now-stable responsive workbench.

Do not begin V21 automatically.

Do not commit or push unless explicitly requested.