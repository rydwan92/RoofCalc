# CieślaCalc — PROJECT BLUEPRINT

> **Status:** living source of truth for architecture, product direction, UX rules, engineering rules and AI-agent continuity.
>
> **Rule:** every Copilot/Codex iteration must read this file before changing the project and update the `WORK CHECKPOINT` section before ending.

---

## 1. Product vision

**CieślaCalc** is the working name of a modern, reactive web application/PWA for carpenters, roofers, roofing-company owners and people preparing roof work.

This is **not** intended to become a loose collection of unrelated calculators. The long-term product is a modular technical workbench that converts a small number of real-world measurements into:

- reliable geometric calculations,
- clear technical dimensions,
- dynamic 2D technical drawings,
- practical marking/cutting guidance,
- project history,
- reusable saved calculations,
- printable/exportable documentation,
- eventually material/cut lists and company workflows.

The first version is completely free. The architecture must, however, allow individual modules or capabilities to become paid later without coupling calculation code to a billing provider.

The application should feel:

- fast,
- modern,
- professional,
- mobile-first,
- technically trustworthy,
- visually attractive,
- simple enough to use on a construction site,
- powerful enough to become a daily tool.

**Design quality and technical correctness are equally important.**

---

## 2. Core product principles

### 2.1 Reactive by default

A user changing an input must see relevant results and drawings update immediately.

Normal geometric calculations happen **locally in the browser**. Do not send a request to the backend merely to calculate trigonometry.

Typical flow:

```text
input change
    ↓
validation
    ↓
pure calculation function
    ↓
result model
    ↓
drawing model
    ↓
SVG renderer
    ↓
updated UI
```

### 2.2 Modular calculators

Every technical calculator is an independent module with a stable ID and version.

Examples of future modules:

- common rafter,
- hip rafter,
- valley rafter,
- jack rafters,
- birdsmouth/notch,
- ridge cuts,
- roof pitch,
- gable roof,
- hip roof,
- roof area,
- rafter spacing,
- battens,
- tiles/sheets,
- membrane,
- timber quantities,
- gutters,
- material/cut lists.

Adding one module must not require modifying the mathematical internals of unrelated modules.

### 2.3 Useful on site, not only mathematically correct

The application should translate calculations into practical work.

A result should be able to evolve from:

> `Length: 5249 mm`

into:

> `Measure 4612 mm from the reference edge → mark a 35° line → mark a 168 mm seat → notch depth 52 mm.`

The UI should ultimately support views such as:

- geometry,
- dimensions,
- marking/trasowanie,
- cutting,
- project summary.

### 2.4 Progressive complexity

A casual user should be able to perform a fast calculation without creating an account or project.

Advanced users should later be able to:

- save to a project,
- return to history,
- duplicate calculations,
- export,
- share,
- work in a company/team context.

### 2.5 No false structural-engineering claims

Geometric calculations and structural verification are separate domains.

Do not claim that a structural member is safe merely because its geometry is calculated correctly. Any future structural/loads module requires its own validated engineering specification.

---

## 3. Initial scope

The first functional area starts with rafter geometry, inspired by the general problem shown in the reference application, but **designed from scratch** with a better workflow and interface.

Initial technical direction:

1. right-triangle / roof-slope geometry,
2. common rafter,
3. hip rafter,
4. reactive 2D drawing,
5. technical dimensions and labels,
6. later: birdsmouth/notch,
7. later: jack rafters.

Do not copy the referenced application's UI or data-entry model. Improve the workflow.

A calculator should eventually allow the user to enter whichever sensible dimensions they know rather than forcing one rigid input path.

---

## 4. Modes of use

The architecture should support both:

### Quick / loose calculation

No project is required.

Use case:

```text
Open calculator → enter values → see result immediately.
```

### Project mode

A saved calculation can belong to a larger project.

Do not fully define the complete future project hierarchy yet. Keep the model extensible and avoid prematurely deciding what a whole roof project must contain.

---

## 5. Internationalization and branding

The product starts in Polish but must be ready for multiple languages.

Rules:

- no user-facing text hard-coded inside domain/calculation code,
- use translation keys in UI,
- prepare `pl` first and an `en` skeleton/translation when practical,
- use locale-aware decimal formatting,
- route structure and module IDs must not depend on Polish labels,
- brand name must be configurable; `CieślaCalc` is a working name, not a domain invariant.

Recommended UI stack:

- `i18next`
- `react-i18next`
- `Intl.NumberFormat`

Module IDs should remain language-neutral, e.g.:

```text
common-rafter
hip-rafter
birdsmouth
```

---

## 6. Units and precision

Unit handling is a first-class concern.

### Internal canonical units

For geometry domain logic:

- length: **millimetres**
- angles at public domain boundaries: **degrees**
- trigonometric implementation: radians internally as required by JavaScript

Do not scatter manual unit conversions through React components.

Centralize conversion/formatting.

The UI should be able to switch reactively between user unit systems without changing the stored canonical value.

Initial unit support should be architected for:

- mm,
- cm,
- m,

and later:

- inch,
- foot/inch.

Example:

```text
canonical: 4300 mm

display:
4300 mm
430 cm
4.300 m
169.291 in
```

### Precision rule

Never round intermediate mathematical values.

Example:

```ts
const exact = 5249.374921...
```

Only the presentation layer chooses whether to display:

```text
5249 mm
5249.4 mm
5.249 m
```

Persist canonical inputs/results with sufficient precision.

---

## 7. Recommended technology stack

### Frontend

- React
- TypeScript
- Vite
- React Router
- Tailwind CSS
- React Hook Form
- Zod
- Zustand
- TanStack Query
- `i18next` + `react-i18next`
- SVG for technical drawings
- `vite-plugin-pwa` when PWA work begins

### Backend

- Node.js
- Express
- TypeScript
- Zod
- Drizzle ORM
- `mysql2`
- MySQL / MariaDB

### Quality

- pnpm workspaces
- Vitest
- Playwright
- ESLint
- Prettier
- TypeScript strict mode

Do not require Docker for production. It may be optional locally later.

---

## 8. Deployment constraint

The initial deployment target is ordinary hosting that supports:

- Node.js applications,
- MySQL/MariaDB,
- one public domain.

Production should be buildable into a simple shape:

```text
Node / Express
    ├── /api/*  -> REST API
    └── /*      -> built React application

MySQL
```

The app must not depend on Kubernetes, Docker, Redis, serverless-only APIs or a complicated reverse-proxy topology to run.

The architecture should still make later VPS/cloud migration straightforward.

---

## 9. Repository architecture

Use a pnpm monorepo:

```text
cieslacalc/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── roof-math/
│   ├── calculator-core/
│   ├── drawing-engine/
│   ├── ui/
│   └── shared/
│
├── docs/
├── migrations/
├── PROJECT_BLUEPRINT.md
├── pnpm-workspace.yaml
└── package.json
```

### `apps/web`

Responsibilities:

- React UI,
- routes,
- forms,
- local calculator interaction,
- project screens,
- SVG rendering components,
- responsive/mobile UX,
- i18n integration,
- frontend API client.

It must **not** contain raw mathematical formulas that belong in `roof-math`.

### `apps/api`

Responsibilities:

- REST API,
- authentication later,
- users later,
- projects/history later,
- persistence,
- sharing later,
- e-mail/export orchestration later.

It must not be required for basic geometric calculation.

### `packages/roof-math`

The most important technical domain package.

Rules:

- pure TypeScript,
- pure functions where practical,
- no React,
- no DOM,
- no Express,
- no database imports,
- no translations,
- deterministic,
- extensively unit-tested.

Possible internal structure:

```text
roof-math/
├── geometry/
│   ├── angles.ts
│   ├── triangle.ts
│   ├── vectors.ts
│   └── units.ts
├── rafters/
│   ├── common-rafter.ts
│   ├── hip-rafter.ts
│   ├── valley-rafter.ts
│   └── jack-rafter.ts
├── cuts/
│   ├── birdsmouth.ts
│   ├── ridge-cut.ts
│   └── plumb-cut.ts
└── roofs/
    ├── gable-roof.ts
    └── hip-roof.ts
```

Create only files required by the current iteration. Do not fill the tree with fake implementations.

### `packages/calculator-core`

Responsibilities:

- calculator/module contract,
- module metadata,
- module registry,
- calculator versioning,
- input/result generic types,
- feature/access metadata hooks.

Example conceptual contract:

```ts
export interface CalculatorDefinition<I, O> {
  id: string;
  version: string;
  category: string;
  inputSchema: unknown;
  calculate(input: I): O;
  createDrawing?: (input: I, output: O) => DrawingModel;
  requiredEntitlement?: string;
}
```

Use real strongly typed Zod schemas in implementation rather than `unknown`.

### `packages/drawing-engine`

Responsibilities:

- renderer-agnostic technical drawing model,
- drawing primitives,
- geometry/layout helpers,
- dimension model,
- viewport/fit helpers.

The drawing domain must not depend on a specific calculator.

Initial primitives should be designed for:

- Line
- Polyline
- Polygon
- Arc
- Label
- LinearDimension
- HorizontalDimension
- VerticalDimension
- AlignedDimension
- AngularDimension
- ReferenceLine
- CutLine
- Marker

Do not implement a CAD system. Start small.

### `packages/ui`

Responsibilities:

- design tokens,
- reusable form controls,
- cards/panels,
- segmented controls,
- buttons,
- responsive calculator layout,
- technical-result components,
- accessibility patterns.

Do not put calculation logic in UI components.

### `packages/shared`

Responsibilities:

- shared serializable types,
- API contracts where appropriate,
- generic utilities,
- common constants.

Avoid turning `shared` into a dumping ground.

---

## 10. Drawing architecture

Dynamic drawings are a core product feature, not decoration.

Calculator code should produce a renderer-independent `DrawingModel`.

Example concept:

```ts
type Point = {
  x: number;
  y: number;
};

type DrawingModel = {
  bounds: Bounds;
  lines: DrawingLine[];
  dimensions: DrawingDimension[];
  labels: DrawingLabel[];
  angles: DrawingAngle[];
};
```

Rendering flow:

```text
calculator result
      ↓
createDrawing()
      ↓
DrawingModel
      ↓
React SVG renderer
      ↓
responsive SVG
```

### Coordinate rule

Use geometry/domain coordinates that reflect actual proportions.

Do not encode business geometry directly in pixels.

The SVG renderer handles:

- scaling,
- padding,
- viewBox,
- responsive fitting,
- label placement refinements.

A 2.5 m and a 13 m rafter must both fit the same UI without corrupting the mathematical model.

### Drawing UX

Eventually support:

- fit to view,
- dimension visibility toggles,
- selected element highlighting,
- zoom if required,
- detail view of a cut/notch,
- print-friendly mode.

---

## 11. UI/UX direction

Design is a first-class requirement.

The product should look like a modern technical tool, not an old mobile form.

### General character

- modern,
- restrained,
- technically confident,
- high contrast,
- clean typography,
- strong numerical hierarchy,
- excellent mobile layout,
- subtle motion only where it helps comprehension,
- no visual clutter.

### On construction-site use

Assume:

- phone use,
- sunlight,
- gloves/dirty hands,
- short attention span,
- intermittent network,
- need to read dimensions quickly.

Therefore:

- touch targets around 44px or larger,
- inputs at least 16px text on mobile,
- large result values,
- clear active/selected states,
- no essential hover-only interactions,
- immediate validation,
- avoid modal-heavy workflows.

### Preferred calculator layout

Desktop:

```text
┌──────────────────────┬────────────────────────────┐
│ Inputs / parameters  │ Dynamic technical drawing  │
│                      │                            │
│ quick presets        │ dimensions / labels        │
│ unit selector        │                            │
└──────────────────────┴────────────────────────────┘
│ Results / work instructions / details             │
└───────────────────────────────────────────────────┘
```

Mobile:

```text
Parameters
Drawing
Key results
Detailed dimensions
Work/marking guidance
```

The result must not be hidden behind unnecessary navigation.

---

## 12. Free now, monetization-ready later

Version 1 is fully free.

Do **not** implement payments now.

The architecture must avoid hard-coding “everything is always free” into module logic.

Introduce stable capability/entitlement keys conceptually:

```text
calculator.common-rafter
calculator.hip-rafter
calculator.birdsmouth
export.pdf
projects.cloud-history
company.team
```

A calculator may declare:

```ts
requiredEntitlement?: FeatureKey
```

During the free phase the access policy simply grants all launched modules.

Future billing logic must live outside the mathematical packages.

Target abstraction:

```text
UI asks:
canUse("calculator.hip-rafter")?

AccessPolicy / EntitlementService
          ↓
today: free provider
future: account/subscription/module purchases
```

Do not couple the application to Stripe, Tpay or any other provider at this stage.

---

## 13. Local state vs server state

Use Zustand for ephemeral local application/editing state such as:

- current unsaved calculation,
- selected calculator mode,
- drawing visibility options,
- selected display unit,
- local UI preferences.

Use TanStack Query for remote/server state such as:

- saved projects,
- history,
- account,
- share data.

Do not mirror the same remote object into Zustand without a reason.

---

## 14. Persistence direction

Do not implement database tables until the persistence iteration.

Likely future minimum:

### users

```text
id
email
password_hash
name
created_at
updated_at
```

### projects

```text
id
user_id
name
description
created_at
updated_at
```

### calculations

```text
id
project_id nullable
user_id
calculator_type
calculator_version
input_json
result_json
created_at
updated_at
```

JSON snapshots are preferred over a separate SQL table for each calculator.

Do not persist a drawing snapshot unless a concrete need appears. A drawing can normally be recreated from versioned inputs/results.

---

## 15. Calculator versioning

Every calculator has a stable version:

```text
common-rafter@1.0.0
hip-rafter@1.0.0
```

Saved calculations must retain the version used.

This prevents future algorithm changes from silently changing historical results.

Breaking mathematical behavior requires an explicit version decision.

---

## 16. Validation and errors

Never allow UI output such as:

```text
NaN mm
Infinity°
undefined
```

Validate at boundaries.

Handle:

- empty values,
- zero where invalid,
- negative values,
- impossible geometry,
- extreme values,
- invalid decimal separators,
- unsupported unit input.

Use helpful domain messages rather than generic “invalid input”.

---

## 17. Testing requirements

Mathematical correctness is non-negotiable.

Every domain calculation should have:

```text
file.ts
file.test.ts
```

Tests should include:

- known reference cases,
- boundary values,
- invalid input cases,
- unit conversion cases,
- precision/regression cases.

Example basic reference:

```text
run = 1000 mm
pitch = 30°

rise ≈ 577.350269...
rafter length ≈ 1154.700538...
```

UI development must not be allowed to silently alter calculation behavior.

Use Playwright later for critical flows such as:

```text
enter dimensions
→ result updates
→ unit switch changes display only
→ save project
→ reopen same result
```

---

## 18. PWA and offline direction

PWA is a planned product capability.

Basic calculations should eventually work without an active connection because math and drawing run locally.

Do not implement complex offline cloud synchronization in the first iteration.

Architect so that future behavior is possible:

```text
local calculation works
saved locally if needed
network returns
sync later
```

---

## 19. Export, e-mail and sharing direction

Future services should be separated:

```text
Calculation / Project
        ↓
ExportService
        ↓
PDF / printable representation

Project
        ↓
ShareService
        ↓
read-only public link

Export
        ↓
EmailService
```

Do not put e-mail logic in calculator modules.

The same `DrawingModel` should eventually be reusable in browser, print and PDF workflows where practical.

---

## 20. SEO direction

Public calculators may later become high-value landing pages.

Stable calculator identity must be language-neutral.

Possible localized public URLs later:

```text
/pl/kalkulatory/krokiew-zwykla
/en/calculators/common-rafter
```

Do not prematurely lock the SPA routing model around one language.

The calculation engine itself has no SEO responsibilities.

---

## 21. Security direction

When backend/user features arrive:

- HTTPS,
- secure HTTP-only session cookies,
- strong password hashing,
- backend Zod validation,
- rate limits,
- SQL through Drizzle/prepared parameters,
- secrets only in environment variables,
- authorization checked on the server,
- no trust in client-side entitlement flags.

Do not implement auth prematurely in iteration 1.

---

## 22. Coding rules

1. TypeScript strict mode.
2. Prefer named domain types over unstructured objects.
3. Pure math stays in `roof-math`.
4. UI formatting stays in UI/presentation code.
5. No unit conversion scattered through components.
6. No translation strings in math/domain packages.
7. No API dependency for normal geometry.
8. No premature abstractions with only hypothetical consumers.
9. No fake placeholder business logic.
10. No destructive Git commands unless explicitly requested.
11. Keep public module IDs stable.
12. Add tests with new mathematical behavior.
13. Do not silently change a calculator algorithm/version.
14. Keep mobile responsiveness part of every UI iteration, not a later cleanup.
15. Accessibility is part of the definition of done.

---

## 23. Git and iteration discipline

Work in small, reviewable iterations.

Before changing code:

```bash
git status
git diff
```

Do not discard existing user changes.

Avoid:

```bash
git reset --hard
git clean -fd
git checkout -- .
```

unless the user explicitly authorizes it.

After a meaningful iteration:

- run relevant tests,
- run typecheck,
- run build,
- inspect `git status`,
- update the checkpoint below.

Atomic commits are recommended only when the user/working environment expects the agent to commit. Do not fabricate a successful commit.

---

## 23A. Parametric timber workbench architecture

The product is evolving from a calculator preview into a **parametric carpentry workbench**.

The application must distinguish between:

```text
Roof / assembly intent
        ↓
Member placement
        ↓
Support / joint resolution
        ↓
Fabrication member
        ↓
Cuts + marking stations
        ↓
DrawingModel
        ↓
SVG / print / PDF
```

### A. Assembly model

The assembly model describes how elements relate in the roof, not how they are drawn.

Future examples:

- roof plane,
- ridge,
- wall plate,
- purlin,
- custom horizontal support,
- rafter,
- hip/valley member.

A support must be modeled generically enough that a wall plate and a purlin can share common geometric behavior without pretending they are the same construction element.

Do not hard-code every future transverse beam as a separate calculator.

### B. Timber/fabrication model

Introduce a dedicated package when Iteration 002 begins:

```text
packages/timber-model
```

Its purpose is to represent a real timber workpiece independently of React and SVG.

Core concepts should include, only as needed:

```text
TimberSection
TimberMember2D
MemberEdge
DatumPoint
Support2D
FabricationOperation
EndCut
SeatNotch
MarkingStation
FabricationInstruction
```

A member uses its own local coordinate system:

```text
x = longitudinal direction along the timber
y = depth through the timber in the side elevation
```

World/roof placement is a transform of the member geometry, not the source of its manufacturing dimensions.

### C. Datums and practical measurement

Every manufacturing dimension must say **where it is measured from and on which edge**.

Never emit a vague result such as:

```text
cut position = 3217 mm
```

Prefer a model capable of expressing:

```text
datum: A — eave end / top edge
target: B — wall-plate heel / top edge
distance: ...
```

The same vertical/plumb cut can intersect the top and bottom edge at different longitudinal positions. Therefore marking instructions must explicitly reference the chosen edge.

Future UI should label important points A, B, C, D and provide a chain of dimensions.

### D. Fabrication operations

Cuts are domain objects, not decorative SVG shapes.

Initial operation families:

```text
EndCut
SeatNotch / Birdsmouth
```

Future families:

```text
Bevel
CompoundCut
Housing/Notch
Drill/Mark
CustomCut
```

Each operation should be able to expose:

- geometry,
- affected member edge(s),
- marking/cut lines,
- useful angles,
- reference points,
- human-readable instruction data,
- optional relation to a support/joint.

Do not put user-facing translated prose in the domain package. Produce structured instruction data and translate it in the UI.

### E. Birdsmouth geometry

The first birdsmouth implementation must have an explicit geometric contract.

For a horizontal seat length `s` and roof pitch `θ`:

```text
vertical rise across seat = s * tan(θ)
normal depth removed      = s * sin(θ)
```

The calculation must expose:

- seat length,
- normal notch depth,
- remaining member depth,
- removed-depth ratio.

Do not classify the notch as structurally "safe" using an arbitrary percentage rule. Structural limits must later come from an explicitly selected engineering/normative model.

Wall-plate width and seat length are distinct concepts. The UI may constrain the requested seat to the support width, but must not silently assume they are always equal.

### F. Ridge end cut

When the roof run is defined to the ridge axis and a vertical ridge board has horizontal thickness `t`, the near ridge face in a symmetric case is conceptually:

```text
x = run - t / 2
```

The exact fabrication line must be derived from the explicit roof/member reference model and tested. Do not spread ad-hoc ridge deductions through UI code.

### G. Drawing views

The workbench should evolve toward coordinated 2D views before adding 3D:

```text
1. Assembly / construction view
2. Member / fabrication view
3. Selected joint detail
4. Cut / marking list
```

The assembly view answers:

> Where is the rafter/support in the roof?

The fabrication view answers:

> What exactly do I mark and cut on this piece of timber?

The detail view answers:

> What is the geometry of this selected joint?

Do not jump to 3D before the parametric 2D member/joint model is correct. A future 3D renderer must consume the same domain model rather than create a second geometry system.

### H. Builder / toolbox UX

The desired direction is a visual workbench rather than an administrative sidebar.

Desktop target:

```text
┌──────────────┬──────────────────────────┬──────────────────┐
│ TOOLBOX      │                          │ INSPECTOR        │
│              │      MAIN CANVAS         │                  │
│ Geometry     │                          │ selected object  │
│ Timber       │  assembly / member SVG   │ exact dimensions │
│ Supports     │                          │ parameters       │
│ Cuts         │                          │                  │
└──────────────┴──────────────────────────┴──────────────────┘
│ FABRICATION STRIP / CUT LIST / MARKING INSTRUCTIONS       │
└───────────────────────────────────────────────────────────┘
```

Candidate toolbox groups:

```text
Roof geometry
Timber section
Supports
  - wall plate
  - ridge
  - purlin later
Cuts
  - end/plumb cut
  - seat notch
Measurements
```

Click/tap on a support or cut in the canvas selects it and opens its inspector.

Precise numeric editing must always exist even if drag handles are added later.

Mobile should use the same model with:

- a large canvas,
- compact mode/view tabs,
- bottom sheet or accordion inspector,
- large add/select actions.

### I. Current implementation review

Iteration 001 is a useful foundation but must not become the final UI architecture.

Current limitations to address gradually:

- `DrawingModel` represents mostly lines/dimensions/angles, not timber/support/cut domain objects.
- `Drawing.tsx` contains too much dimension-layout knowledge and hard-coded presentation geometry.
- `App.tsx` is too large for a future modular workbench.
- `packages/ui` currently contains only a minimal component foundation.
- the common-rafter drawing is a geometry triangle, not a fabrication-ready timber profile.

Preserve the good foundations:

- monorepo,
- pure `roof-math`,
- canonical units,
- calculator versioning,
- tests,
- i18n,
- local reactive calculations,
- Express separated from geometry.

Do not rewrite those foundations merely to redesign the UI.

# 24. AI AGENT CONTINUITY PROTOCOL

This section is a safeguard against interrupted Copilot/Codex work, context limits or token exhaustion.

## Mandatory start procedure

At the beginning of **every** new agent session/iteration:

1. Read this entire file.
2. Read the `WORK CHECKPOINT` below.
3. Run:

```bash
git status
git diff --stat
git diff
```

4. Inspect files listed under `Files changed / WIP`.
5. Continue from `NEXT ACTION`.
6. Never assume an unfinished change was discarded just because the previous agent stopped speaking.

## Mandatory checkpoint procedure

Update `WORK CHECKPOINT`:

- after each meaningful subtask,
- before starting a large refactor,
- before running a potentially long operation,
- whenever context/token budget appears to be getting low,
- before ending the session.

If interrupted unexpectedly, the next session must treat the working tree as WIP and reconstruct state from Git + this checkpoint.

## Interruption safety rules

When token/context budget appears low:

1. **Stop starting new features.**
2. Finish the smallest safe syntactic unit possible.
3. Do not revert or discard unfinished files.
4. Run the fastest relevant validation that still fits the remaining time.
5. Run `git status`.
6. Record exact WIP state below.
7. Write one precise `NEXT ACTION`.
8. End.

If code is temporarily incomplete, explicitly list:

- which file,
- which function/component,
- what remains,
- whether it currently compiles,
- the exact next edit.

---

# 25. WORK CHECKPOINT

> This block is intentionally mutable. The agent must keep it current.

**Iteration:** `002 — parametric rafter workbench`

**Status:** `IMPLEMENTED — BROWSER_VISUAL_QA_PENDING`

**Goal of current iteration:**

- Preserve Iteration 001 foundations and deliver the first parametric common-rafter fabrication workbench.
- Introduce a real timber profile, wall plate, symmetric ridge board, actual birdsmouth removal, plumb cuts and explicit top-edge marking datums.

**Completed:**

- Read the full blueprint and iteration prompt; baseline typecheck, 57 tests and web/API build passed before implementation.
- Moved the sole blueprint from `.md/PROJECT_BLUEPRINT.md` to repository root and added it to the Git index, without creating a commit. README links updated.
- `packages/timber-model`: pure TypeScript section/member/local frame/support/cut/datum/marking types, independent of UI and renderers.
- `roof-math`: pure birdsmouth, ridge-cut, frame transforms and retained fabrication profile with Zod validation and tests.
- Same stable calculator ID with explicit `common-rafter@2.0.0` as the launched workbench. `common-rafter@1.0.0` is retained unchanged in a versioned registry with regression tests.
- Drawing engine supports generic polygons, selection IDs, datums, annotation layout and polygon clipping. Calculator-core adapts domain geometry into assembly/member/joint-detail models.
- Refactored UI into WorkbenchPage, WorkbenchTools, Canvas, DrawingLayers, Inspector and FabricationSummary. The old monolithic App and triangle-only Drawing have been replaced.
- Desktop toolbox/canvas/inspector and mobile local tool strip + expandable inspector; assembly, member and selected joint detail modes, click/keyboard object selection, dimension visibility and zoom/fit.
- Reactive geometry/timber/plate/seat/ridge editing, separate canonical nested input and text drafts, display-only mm/cm/m switching, complete PL/EN UI.
- Actual concave cut profile, top-edge A–D chain, minimum stock envelope, removed depth percentage and structured marking steps. No invented structural safety threshold.
- Full mathematical contract recorded in `docs/RAFTER_WORKBENCH_GEOMETRY.md`.
- Prompt history is excluded only from formatting so supplied instructions remain untouched. XAMPP rules include the moved blueprint among internal project documents.

**Mathematical assumptions / user decisions:**

- On 2026-09-09 the user explicitly resolved the contradictory placement in the prompt: keep the seat at y=0 from x=0 to x=s, and lower the uncut lower edge to `y=(x-s)*tan(theta)`.
- Upper edge is lower edge plus `depth/cos(theta)` vertically; normal section depth is preserved.
- Heel cut is vertical at x=0. Seat toe is (s,0). The triangle inside the uncut timber is removed from the actual polygon.
- Notch vertical height `s*tan(theta)`, normal removed depth `s*sin(theta)`, remaining depth `d-s*sin(theta)`, removed ratio `s*sin(theta)/d`.
- Ridge face `x=run-thickness/2`; slope deduction `thickness/(2*cos(theta))`. Plumb-line angle to member `90-theta`; top/bottom longitudinal station offset `d*tan(theta)`.
- A/B/C/D are on the TOP edge at world x=-overhang, 0, seat, run-thickness/2. With the approved correction, B identifies the physical heel plumb cut; C is the vertical projection of the seat toe, not a second notch cut.
- A→B=e/cos(theta), B→C=s/cos(theta), C→D=(run-thickness/2-s)/cos(theta). Their sum equals A→D.
- Minimum rectangular stock length is A→D+d*tan(theta), without kerf, trimming or defect allowances.
- Plate width and seat length are independent. Seat <= plate width; normal notch depth < member depth; ridge face must be beyond the full plate width.

**Files changed / WIP:**

- `PROJECT_BLUEPRINT.md`, `README.md`, `docs/RAFTER_WORKBENCH_GEOMETRY.md`.
- New `packages/timber-model/**`.
- New `roof-math/src/cuts/{birdsmouth,ridge-cut}.ts` and tests; frame2d and rafter-workbench modules/tests; package exports/dependencies.
- `calculator-core/src/workbench.ts` and tests, current/versioned registry; drawing-engine primitives/layout/clip helpers and tests.
- `apps/web/src/workbench/**`, App.tsx, store.ts/tests, App.test.tsx, i18n.ts, styles.css, web package dependencies. Removed superseded Drawing.tsx.
- `pnpm-lock.yaml`, `.prettierignore`, `.htaccess`.
- No unfinished syntax or placeholder geometry. User's prompt and `RoofCalc.zip` preserved; no commits made.

**Validation already run:**

- Baseline: typecheck, 57 tests, web/API build — PASS.
- Final `npx pnpm@10.15.1 typecheck` — PASS.
- Final `npx pnpm@10.15.1 test` — PASS: 103 tests across 14 files.
- `npx pnpm@10.15.1 lint` — PASS.
- `npx pnpm@10.15.1 build` — PASS: React/Vite + Express/tsup.
- Tests include birdsmouth references and invalid/full-depth cases; actual removed polygon area; coordinate round trips; ridge near-face intersections; additive datum chain; minimum stock; zero overhang/thickness; section reactivity; display-unit invariance; stale-result removal; keyboard selection; view switching and translations.
- Browser requested via plugin; `iab` is unavailable in this session. No other browser surface was substituted. Browser layout/visual testing is not claimed.
- Final format:check — PASS. XAMPP root redirects to the new build; HTML, JS and CSS return HTTP 200. Git status/diff inspected; root blueprint is staged and tracked, no commit made.

**Known limitations / remaining QA:**

- Desktop and ~360px mobile visual review remains pending because Browser is unavailable. jsdom checks interactions, not screen layout; the full Definition of Done is not yet claimed.
- Plate block height (140 mm) and ridge block extension below the joint (70 mm) are schematic visual extents, explicitly marked in Support2D and documentation; they do not affect fabrication math.
- At compact widths, the full chain is in the summary strip; broad-view SVG labels reduce to A→D. Detail dimensions remain visible.
- Supported numerical ranges are stated in the geometry contract. Defaults are examples, not engineering recommendations.
- No structural verification, kerf or production allowance, extra supports, compound cuts, persistence, auth, payments, PDF, email, PWA sync or 3D.

**NEXT ACTION:**

> Finish Iteration 002 visual QA in the requested Browser when available: open http://localhost/projects/RoofCalc/, review desktop and 360px layouts, verify no page overflow, select timber/plate/ridge cuts by touch and keyboard, switch all three views, inspect notch and ridge detail at 1/35/80 degrees and zero overhang/ridge thickness, confirm unit switches and readable datum labels. Fix evidenced UI issues and record verification. Do not automatically start Iteration 003.

---

## 26. Planned iterations

### Iteration 001 — foundation

- pnpm monorepo,
- apps/web,
- apps/api,
- core packages,
- TypeScript strict,
- lint/format/test,
- design tokens and responsive shell,
- i18n foundation,
- basic geometry helpers,
- simple common-rafter proof of concept,
- basic DrawingModel,
- simple reactive SVG,
- `/api/health`.

### Iteration 002 — common-rafter domain

- define user input model,
- flexible known-value approach,
- validated common-rafter calculations,
- strong test vectors,
- richer dynamic drawing,
- unit-switch UX.

### Iteration 003 — drawing engine

- reusable dimensions,
- labels,
- technical angle annotations,
- responsive viewport,
- drawing-detail mode.

### Iteration 004 — hip-rafter domain

- validated geometry,
- test vectors,
- dynamic drawing,
- useful roofer-oriented output.

### Iteration 005 — birdsmouth/notch

Only after exact geometric assumptions and practical input model are explicitly specified and validated.

### Later

- jack rafters,
- roof types,
- projects,
- history,
- account/auth,
- database,
- exports/PDF,
- e-mail,
- sharing,
- PWA/offline,
- company/team features,
- optional monetized modules.

---

## 27. Definition of done for each iteration

An iteration is not complete until:

- intended behavior works,
- relevant tests pass,
- TypeScript passes,
- build passes,
- UI works at mobile width,
- no `NaN`/`Infinity` leakage,
- new user-facing text is translatable,
- math is not embedded in React,
- architecture rules remain intact,
- this file's `WORK CHECKPOINT` is updated with the next exact action.
