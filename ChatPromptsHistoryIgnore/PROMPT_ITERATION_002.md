# PROMPT — ITERATION 002: PARAMETRIC RAFTER WORKBENCH

You are continuing the existing CieślaCalc / RoofCalc repository.

This is NOT a greenfield rewrite.

The current repository already contains a useful Iteration 001 foundation:
- pnpm monorepo,
- React/Vite frontend,
- Node/Express API,
- pure `roof-math`,
- unit conversion,
- tests,
- i18n,
- versioned calculator definition,
- minimal renderer-independent DrawingModel,
- reactive common-rafter proof of concept.

Your goal is to preserve those foundations while evolving the product from a triangle calculator into the first **parametric timber fabrication workbench**.

## Mandatory start

1. Ensure `PROJECT_BLUEPRINT.md` exists at the repository ROOT and is tracked by Git.
   - The previous workspace stored it under a hidden `.md` directory and a shared ZIP omitted it.
   - Move it to the root if necessary.
   - Update README links accordingly.
2. Read the ENTIRE `PROJECT_BLUEPRINT.md`, including the new section `Parametric timber workbench architecture` and `WORK CHECKPOINT`.
3. Run:
   - `git status`
   - `git diff --stat`
   - `git diff`
4. Do not discard user changes.
5. Establish a baseline:
   - typecheck
   - tests
   - build
6. Only then begin Iteration 002.

## Product outcome of this iteration

The existing page must stop feeling like a static old-style calculator with a triangle preview.

Build the first version of a visual technical workbench where the user edits a real rafter and its first joints.

The user should be able to understand:

- the roof geometry,
- the actual timber section,
- where the wall plate is,
- where the ridge/reference is,
- where the birdsmouth is cut,
- where the ridge/end plumb cut is,
- what distances are measured from which datum,
- what angles/lengths are used to mark the timber.

The interface must remain highly reactive: changes update math, member shape, supports, dimensions and output immediately.

Do NOT implement a whole roof CAD system in this iteration.

---

## 1. Architecture: add timber-model

Add:

`packages/timber-model`

This package must be pure TypeScript and independent of:
- React,
- SVG,
- DOM,
- Express,
- database,
- translations.

Create only the minimum real concepts needed by this iteration.

Design strongly typed concepts around:

- `TimberSection`
  - widthMm
  - depthMm

- `MemberEdge`
  - top
  - bottom

- `DatumPoint`
  - id
  - selected/reference edge
  - local point or station information

- `TimberMember2D`
  - id
  - section
  - reference length / stock geometry
  - local coordinate system

- `Support2D`
  - id
  - kind (`wall-plate`, `ridge`, with architecture open for `purlin` later)
  - world/reference geometry needed for visualization

- `FabricationOperation`
  discriminated union, initially:
  - `EndCut`
  - `SeatNotch`

- `MarkingStation` / structured instruction data

Do not put translated prose in this package.

The member-local coordinate system is conceptually:

- x: along the timber,
- y: through its depth in side elevation.

Do not store UI pixels in the domain.

---

## 2. Explicit reference geometry

For the initial common-rafter workbench use an explicit side-elevation coordinate contract.

World coordinates:

- x: horizontal roof run, positive toward ridge,
- y: vertical, positive upward.

Reference setup:

- wall-plate heel/reference at x = 0,
- wall-plate top surface at y = 0,
- roof ascends to the right,
- horizontal overhang extends into negative x,
- run is measured from the wall-plate reference to ridge AXIS,
- pitch is measured above horizontal.

Represent the rafter as an actual band/profile with a real section depth, not one line.

The un-notched lower rafter edge passes through the wall-plate heel reference.

Its upper edge is a parallel offset based on actual rafter depth.

Keep the mathematical contract documented and tested.

---

## 3. New inputs for the workbench

Extend the current common-rafter input/workbench state with a clear distinction between roof geometry and timber/joint parameters.

Required for this iteration:

Roof geometry:
- horizontal run
- pitch
- horizontal overhang

Timber:
- rafter width
- rafter depth

Wall plate:
- wall-plate width
- requested seat length

Ridge:
- ridge-board thickness, allow zero

Canonical lengths remain millimetres.

UI can display mm/cm/m using the existing unit system.

Do not couple width/depth to display units incorrectly.

Use realistic editable default values but do not claim they are engineering recommendations.

---

## 4. Birdsmouth calculation

Add a dedicated pure module in `roof-math`, e.g.:

`cuts/birdsmouth.ts`

Use an explicit contract.

For:
- pitch `theta`,
- horizontal seat length `s`,
- rafter section depth `d`,

calculate at least:

- seatLengthMm
- verticalRiseAcrossSeatMm = s * tan(theta)
- normalDepthMm = s * sin(theta)
- remainingDepthMm = d - normalDepthMm
- removedDepthRatio = normalDepthMm / d

Validate:
- finite values,
- pitch in the supported range,
- s > 0,
- d > 0,
- seat length cannot exceed wall-plate width at the workbench validation boundary,
- reject geometry where the notch fully consumes/exceeds member depth.

IMPORTANT:
Do NOT label a notch "safe" or "unsafe" according to an invented percentage limit.
Display the removed-depth percentage factually and add a translated note that structural limits must follow the project/engineering requirements.

Add strong Vitest coverage.

---

## 5. Birdsmouth placement geometry

For the initial wall-plate model:

- wall-plate top is horizontal at y = 0,
- wall-plate outer/heel reference starts at x = 0,
- seat extends horizontally toward the ridge by `seatLengthMm`.

The removed notch region in side elevation is derived from:
- the original lower rafter edge,
- horizontal seat line,
- vertical/plumb notch line.

Do not simply paint a red triangle over an unmodified line.

Produce an actual fabrication/member profile or structured cut geometry that the renderer can consume.

The drawing should visually show that timber has been removed.

Keep support width separate from seat length.

Show the wall plate as a support block beneath the member.

---

## 6. Ridge / top end cut

The current `run` terminates at the ridge axis.

Introduce ridge-board thickness.

For a symmetric vertical ridge board, establish/test the near face from the explicit reference model instead of arbitrary UI deductions.

Conceptually the face offset is `ridgeThickness / 2` from the ridge axis.

Generate a real vertical/plumb end cut against that face.

The rafter member profile must end at the calculated cut line.

Expose structured result data for:
- cut/reference position,
- useful marking angle relative to the member,
- ridge deduction/reference distance.

Document assumptions.

Do not implement compound hip-rafter bevels here.

---

## 7. Datums and workshop dimensions

This iteration must introduce practical datum-based output.

Create named drawing/manufacturing reference points such as:

- A — eave/end reference,
- B — wall-plate heel,
- C — wall-plate notch plumb line,
- D — ridge cut/reference.

Exact definitions must be documented.

A manufacturing distance must specify:
- source datum,
- target datum or cut,
- which member edge is used if relevant,
- distance.

The UI should display a clear dimension chain and/or structured cut list.

Do not output ambiguous statements like `cut at 3150 mm` without saying from where.

---

## 8. Drawing engine evolution

Preserve renderer independence.

Extend `drawing-engine` only as needed to represent:

- actual member/profile shape (polygon/polyline),
- support blocks,
- cut regions or cut lines,
- datum markers,
- dimensions with better placement metadata,
- selection IDs / semantic object IDs.

Do NOT make `drawing-engine` know what a wall plate is in business terms.

It should know generic drawing primitives.

Move hard-coded technical layout logic out of the giant React `Drawing.tsx` where reasonable.

It is acceptable to have React SVG renderer components such as:

- `MemberShape`
- `SupportShape`
- `DimensionLayer`
- `DatumLayer`
- `CutLayer`

Do not build a general CAD library.

---

## 9. Workbench UI redesign

The current desktop administrative/sidebar composition is not the target.

Create the first version of a technical workbench.

Desktop concept:

TOOLBOX | MAIN CANVAS | INSPECTOR

and below/adjacent:
FABRICATION / CUT LIST

The main canvas must be visually dominant.

### Toolbox

Group tools/settings conceptually:

- Geometry
- Timber
- Supports
- Cuts

For Iteration 002 the available editable items are:
- roof/common-rafter geometry,
- rafter section,
- wall plate,
- ridge,
- birdsmouth,
- ridge end cut.

A future `Add purlin` item may be shown as "planned" only if it helps communicate direction, but DO NOT implement fake calculations for it.

### Canvas

Provide view tabs/modes:

- `Konstrukcja`
- `Element`
- `Detal`

For this iteration:

`Konstrukcja`
shows rafter + wall plate + ridge/reference in side elevation.

`Element`
shows the timber workpiece/fabrication profile with dimensions and datum labels.

`Detal`
shows an enlarged selected birdsmouth or ridge cut.

Selection:
- tapping/clicking wall plate, birdsmouth or ridge cut selects it,
- selected item is visually highlighted,
- inspector changes to the selected object.

Do not require hover.

### Inspector

The inspector edits precise values for the selected block.

Examples:
- selecting rafter -> width/depth,
- selecting wall plate -> width/seat length,
- selecting ridge -> ridge thickness,
- selecting geometry -> run/pitch/overhang.

Keep direct numeric editing available even if drag interactions are later added.

### Fabrication strip

Add a clear summary area:

- total/reference member length,
- A→B distance,
- relevant B/C dimensions,
- ridge cut information,
- birdsmouth seat/depth,
- cut angles,
- removed-depth percentage,
- structured step/marking information.

This section should feel useful to a carpenter standing at a saw/bench.

---

## 10. Responsive/mobile UX

Mobile is not a collapsed desktop admin panel.

Use:
- large canvas,
- compact top controls,
- touch-friendly mode tabs,
- bottom sheet / accordion inspector or equivalent,
- large result values,
- no hover-only information.

At ~360px width the primary workflow must remain usable without horizontal page scrolling.

---

## 11. Component refactor

The current `App.tsx` is too monolithic for the next phase.

Refactor into focused components/features, for example:

- `WorkbenchPage`
- `WorkbenchToolbar`
- `Toolbox`
- `Canvas`
- `Inspector`
- `FabricationSummary`
- `views/AssemblyView`
- `views/MemberView`
- `views/JointDetailView`

Names may differ.

Do not create component files merely to move five lines around; split by actual responsibility.

Keep calculation/domain logic outside React.

---

## 12. State

Evolve Zustand state toward a workbench session rather than a flat three-input form.

It should cleanly separate:
- canonical calculation data,
- editable text draft where needed,
- display unit,
- selected workbench object,
- active view,
- drawing visibility options.

Do not introduce server state or persistence yet.

---

## 13. Visual quality

This iteration must materially improve visual quality.

The product should feel like a modern professional measuring/fabrication tool.

Priorities:
- canvas dominance,
- clear member/support geometry,
- strong numeric hierarchy,
- restrained visual system,
- readable technical dimensions,
- clear selection state,
- consistent spacing,
- useful empty/error states,
- polished desktop and mobile.

Avoid:
- excessive decorative cards,
- tiny admin navigation,
- large marketing copy inside the actual tool,
- gradients/glow for no purpose,
- old-form style input grids.

The workbench itself should be the hero.

---

## 14. Do NOT implement in this iteration

- hip rafter,
- valley rafter,
- purlin cutting logic,
- arbitrary multi-support solver,
- 3D,
- database,
- auth,
- payments,
- PDF/e-mail,
- structural capacity checks.

Do not let the scope expand.

---

## 15. Tests

Add/maintain tests for:

- birdsmouth geometry,
- member/profile geometry,
- ridge end cut assumptions,
- unit switching,
- current common-rafter regression cases,
- invalid notch geometry,
- UI reactive update of at least one timber/cut parameter.

No `NaN`, `Infinity` or undefined drawing data may reach the UI.

---

## 16. Validation and completion

Before ending:

- run typecheck,
- run tests,
- run lint,
- run build,
- inspect git diff/status.

Update `PROJECT_BLUEPRINT.md` WORK CHECKPOINT.

Record:
- files changed,
- mathematical assumptions,
- tests added,
- UI architecture decisions,
- any known geometry limitations,
- exact NEXT ACTION.

Do not automatically start Iteration 003.

When finished, report:
1. what changed architecturally,
2. what changed visually/functionally,
3. exact formulas/assumptions implemented,
4. test/typecheck/build results,
5. what NEXT ACTION says.
