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

> Updated 2026-09-11. Iteration 012 is implemented in commit `f819085`; the V13 preflight audit repaired the stale checkpoint before new interaction work.

**Iteration:** `012 — roof features, roof windows, battens, view system 2.0 and composition boundary`

**Status:** `IMPLEMENTED — DOCUMENTATION REPAIRED; V13 PREFLIGHT FOUND TWO BASELINE VALIDATION DEFECTS`

**Actual Iteration 012 implementation:**

- Added canonical `RoofWindowFeature`, `RoofPlanePosition`, `BattenLayoutSpec`, `RoofBuildUp` and renderer-neutral `RoofAssembly` types. `RoofProjectDocumentV1` now round-trips roof features and build-up data while accepting earlier schema-version-1 documents without those optional keys.
- Added pure roof-plane local/world transforms for all current gable and regular-hip planes, clamping/default-window placement, structured K1/H1/J1 geometric collision projection, nearest geometric rafter-bay placement and deterministic batten rows with clipping around windows.
- Extended canonical history so window add/remove/update/drag/place-between and batten-layout changes snapshot the complete project document. Selection, presets, layer visibility, Inspector/Drawer and camera remain transient.
- Added the `Konstrukcja / Otwory / Łacenie / Cięcia` presets, compact advanced visibility control, Toolbox feature/build-up groups, roof-window Inspector, direct window-body drag, collision status, place-between action, derived batten rendering and batten totals.
- Removed the obsolete visible purlin drag dots while retaining body drag and the exact Inspector input.
- Preserved Quick Calc scope and the existing K1/H1/J1 fabrication pipeline.

**V12 audit / incomplete requirements:**

- Added the missing `docs/ARCHITECTURE_V12_ROOF_FEATURES_BATTENS_AND_COMPOSITION.md`, which records the coordinate, composition, collision, build-up and persistence contracts plus the exact incomplete items.
- Window creation still inserts immediately on the default left plane; it is not yet a cancellable choose-plane/click-location tool.
- Feature/batten numeric fields commit per keystroke rather than draft -> one commit. Window keyboard nudge, coordinated member warning, placement ghost/status, batten row selection, top batten summary, professional `Widok` Fit/options, pointer-centred zoom/Space-pan/double-click focus and explicit three-state Detail Dock remain V13 work.
- V12 browser/mobile QA was not recorded. No hardware pointer/touch claim is made.
- V13 baseline: typecheck and web/API build pass. Lint fails on one unused `SkeletonMember3D` import in `roof-features.ts`; tests pass 282/283, with one legacy test still querying the removed visible purlin slider.

**Files changed by V12:**

- Domain/persistence: `packages/timber-model/src/index.ts`, `packages/roof-math/src/{roof-features,index}.ts`, feature tests, `packages/calculator-core/src/project-document.ts` and its tests.
- Web workbench: `apps/web/src/assembly/{Inspector,Page,SkeletonCanvas,Summary,Toolbox,WorkbenchControls,selection,store,styles,translations,workbench}.*` and corresponding tests.
- Documentation: V12 prompt; the missing V12 architecture document and this corrected checkpoint were added at the start of V13.

**Known boundary:**

- Window rectangles, clearance, collisions, bay placement and batten spacing are generic geometry only. They are not manufacturer opening requirements, structural approval or covering-specific installation guidance.
- No opening framing, dormer, chimney, statics, covering catalogue, prices, estimating, auth/database, PDF or full 3D was started.

**NEXT ACTION:**

> Execute `PROMPT_ITERATION_013_INTERACTION_LAYER_WORKBENCH.md`: first restore a green baseline, then implement the transient placement tool, interaction/history hardening, selectable batten workbench, professional view/dock/canvas controls, responsive layout and complete automated/browser QA. Do not begin Iteration 014.

---

**Previous checkpoint — Iteration 011:**

**Iteration:** `011 — Quick detail dialogs, direct purlin drag and geometric purlin layout`

**Status:** `COMPLETE — AUTOMATED VALIDATION PASS; BROWSER QA COMPLETED WITH AUTOMATION LIMITATION NOTED`

**Iteration 011 completed:**

- Preserved the clean Iteration 010 baseline: typecheck, build and **266 tests across 31 files** passed before source work. No user work was discarded, committed or pushed.
- Reworked Quick Calc desktop composition to use the available work area: the input column remains bounded while the results, member drawing and two canonical cut cards occupy the larger responsive column. Phone/tablet remains a simple stacked flow.
- Turned K1 and H1 cut cards into keyboard-operable semantic buttons. They open `QuickDetailDialog`, which reuses `DetailPreviewModel`, `DetailPreviewDrawing`, dimensions, marking steps and warning keys already shared with Builder. No preview calculation or translated domain text was added.
- Added a focus-restoring, focus-contained Quick dialog: desktop uses a large technical modal; narrow layouts use a bottom sheet. It supports close button, Escape, outside press, Before/After state, accessible title and background-scroll lock. H1 keeps its backed-versus-dropped limitation visible.
- Added transient Quick-to-Builder handoff. It preserves the existing template, units, supports and timber inputs; activates the exact stable preview operation, selects the relevant prototype/operation, opens Builder in `Cięcia` and opens its existing canonical Detail Drawer. It creates no document/history entry.
- Added pure `distributePurlins()` in `roof-math`. It validates the selected real purlins, preserves stable P-number order, calculates equal free gaps from wall-plate clearance to ridge-face clearance, supports varied purlin widths, never uses an end boundary, and rejects invalid/no-clearance requests explicitly. It is a geometric operation only.
- Added one canonical `distributePurlins()` Zustand action. Applying a proposal updates all current intermediate supports together and creates exactly one Undo/Redo history entry; opening/cancelling the Toolbox proposal does not alter the document or history.
- Reorganized existing supports in Toolbox as a `Płatwie (n)` group with individual P1...Pn controls and a compact action menu. The proposal displays current-to-proposed positions, then prominently states that count, section and position need structural verification. No structural recommendation, automatic count, sizing or safety language was added.
- Made intermediate purlin timber directly draggable from its rendered body. A 32 px invisible SVG hit target routes to the existing `startDrag` -> `valueFromAxisDrag` -> `clampPurlinPlacement` -> `movePurlin` transaction. Wall plate and ridge do not inherit this behavior; the previous precision handle remains available. Hover/selected/grabbing states and an active placement guide/position chip are visible, while exact Inspector input remains the fallback.

**V11 interaction and state contract:**

- Purlin body movement changes only canonical `SupportSpec.placement.xMm` through the existing support resolver. The normal roof projection therefore recalculates associated K1 purlin joints, profiles, datums, stations and previews live; it does not use pixel construction data or a second solver.
- `QuickDetailDialog`, its Before/After tab and the Toolbox distribution proposal are component-local transient UI state. Only applying a distribution or completing a purlin drag changes `RoofProjectDocumentV1.project.roof`.
- Equal distribution means equal clear geometric gaps around the current purlins inside the already modeled wall/ridge limits. It does not choose a purlin quantity or assess structural suitability.

**Files changed:**

- Domain and regression coverage: `packages/roof-math/src/assembly.ts`, `packages/roof-math/src/assembly.test.ts`.
- Web workbench and coverage: `apps/web/src/assembly/{DetailPreview,Page,SkeletonCanvas,Toolbox,store,workbench}.tsx` where applicable, corresponding `Page.test.tsx` and `store.test.ts`, translations and responsive styles.
- Documentation: this checkpoint only. No dependency or lockfile change, persistence, database/auth, PDF/export, estimates, covering, openings, new members, statics or full 3D work was started.

**Validation, performance and QA:**

- Final direct-worktree validation passes: `npx pnpm@10.15.1 typecheck`, **275 tests across 31 files**, ESLint with no warnings/errors, web/API production build and `git diff --check`.
- Added test coverage for equal-gap distributions of one/two/three purlins, invalid distribution requests, single Undo/Redo application, proposal/document exclusion, K1 modal opening/close/Escape/Before-After/handoff, H1 warning visibility, purlin body drag, active guide and non-draggable wall/ridge. Existing K1/H1/J1, multiple-support, spacing `940/800`, project-boundary and resolver tests remain green.
- Actual web build: main **460.10 kB / 132.01 kB gzip**, CSS **70.18 kB / 14.16 kB gzip**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **11.10 / 2.43 kB**. The main Vite advisory remains absent. Relative to V10, this adds about 7.4 kB JS and 4.6 kB CSS pre-gzip for the modal, Toolbox and interaction surface.
- Browser QA against the current XAMPP production build passed at desktop `1440 x 900`: K1 modal measured **1080 x 573**, Before/After changed removed-material geometry from one polygon to zero, H1 warning was visible and no horizontal overflow occurred. Builder showed P1-P3 grouped proposal, non-structural warning, Apply and direct P2 body-drag state/guide with canonical position update from **2984.5** to **3839 mm**. A synthetic Playwright pointer reports the expected `setPointerCapture` limitation because no active native pointer exists; jsdom pointer tests cover transaction/cancel behavior. A raw Playwright mouse move did not reliably dispatch into the SVG hit region, so no hardware mouse/touch claim is made.
- Browser QA at `360 x 800` passed for Quick: the detail sheet measured **360 x 736**, close and Builder actions remained reachable, and `scrollWidth <= clientWidth`.

**Known limitations / assumptions:**

- H1 remains the existing coordinated compound-cut explanation, not a complete saw-face solid. J1 remains measured to the theoretical H1 centre plane with no physical face deduction, J1-to-purlin joinery or invented J1 cut detail.
- Equal distribution uses the explicit current wall/ridge placement limits and real member widths. It intentionally has no structural load/span/material logic and does not add snap modes beyond the existing constrained drag behavior.
- Automated browser pointer injection cannot substitute for physical mouse/pen/touch verification of the SVG target, although the native production visual state, dispatched flow and unit tests pass.

**NEXT ACTION:**

> Review Iteration 011 in the browser on an actual mouse/touch device: drag every P1/P2/P3 body, cancel with Escape, test Undo/Redo after drag and distribution, inspect Quick K1/H1 dialog focus restoration and sheet scrolling. Fix only evidenced defects, then stop for user review/commit. Do not begin Iteration 012 automatically.

**Previous checkpoint — Iteration 010:**

**Iteration:** `010 — member instance workflow + spatial detail overlays + workbench UX hardening`

**Status:** `COMPLETE — AUTOMATED VALIDATION PASS; NATIVE BROWSER QA UNAVAILABLE`

**Iteration 010 completed:**

- Confirmed the clean `main` baseline at `7f98a858f13e7d1d2b13e6538cdb15f02f8a7f1c` (`V9 prompt 11.09`). Baseline typecheck/build pass; the established suite contains 252 tests across 29 files.
- Read the complete AGENTS/Blueprint/North Star/V3–V9 architecture, H1/J1 geometry, research roadmap, approved V9 prompt and both user-supplied V10 briefs before source work. Added the approved synthesis in `docs/PROMPT_ITERATION_010.md` and established `docs/ARCHITECTURE_V10_MEMBER_INSTANCE_WORKFLOW.md` before implementation.
- Added renderer-neutral `MemberInstanceContext` and `MemberInstanceOperationContext` projections in calculator-core. Every selectable K1/H1/J1 physical member maps to its stable instance ID, shared fabrication prototype, exact deterministic length group, section, spatial identity, existing package operations, member-axis world anchors and explicit limitations. No cut formula, translation, pixel or React concern entered the domain projection.
- Added pure family/current/previous/next, instance-to-fabrication and instance-to-operation selectors. Ordering is deterministic: K1 station/side, four H1 corners, and J1 corner/plane/ordinal. Mirrored pieces retain separate IDs; K1/H1 reuse shared fabrication definitions; every J1 maps by ID to its exact length group.
- Extended transient `WorkbenchViewState` with `selectedInstanceId`, safe instance navigation and operation → instance → roof `Escape` steps. Instance, isolation, detail and navigation actions do not mutate `RoofProjectDocumentV1` or create Undo/Redo history. Global shortcuts are ignored while an exact form input is active; invalid/stale instance selection falls back safely after a canonical layout change.
- Added an interactive roof/family/instance/operation breadcrumb and compact instance navigator with previous/next, family index, exact length, shared prototype, active length group, `Pokaż na dachu` and isolation. Navigation keeps a compatible active operation and returns to the exact instance after closing a detail.
- Added the physical-instance Inspector and an orientation minimap derived from the existing canonical skeleton. The Inspector exposes family, index/count, stable ID, side/plane/corner, station, exact length, section, group, prototype sharing, operations and honest H1/J1 limits; it does not add per-instance overrides.
- Added pointer- and keyboard-operable semantic operation markers to the selected physical member. Marker anchors come from resolved package stations/endpoints projected through the same skeleton viewport. Deterministic collision layout prioritizes the active operation, compacts secondary/narrow markers and keeps full information in Inspector/Drawer.
- Unified marker, Inspector, Preparation Plan and Detail Drawer activation through the same operation state. Real K1/H1 previews switch to Cuts and open the canonical Before/After detail while preserving instance context; unsupported J1 operations close stale preview content and keep their theoretical-H1-face/purlin-joinery limitations visible instead of inventing geometry.
- Added explicit K1 local-detail orientation labels for upper/lower edge, outer-eave datum and eave-to-ridge direction. H1 retains coordinated plan/elevation/top-face references and its backed-versus-dropped warning. J1 remains an exact instance/length/group workflow without a fabricated cut drawing.
- Hardened composition by extracting `Inspector`, `WorkbenchContextBar`, `MemberInstanceInspector`, `MemberInstanceOverlay` and `OrientationMiniMap`; `AssemblyPage` now composes them. `workbench-project.ts` owns one memoized template projection for resolved roof, skeleton, fabrication package, instances and previews.
- Removed the hidden duplicate resolver call: new `createRoofSkeletonFromResolved()` plus gable/hip resolved-skeleton entry points build the skeleton from the already-resolved roof. A measured resolver test proves repeated transient selections, operations, isolation and zoom context reuse one projection; a new canonical template identity resolves exactly once again.
- Added responsive/focus styling for the context bar, navigator, minimap, Inspector and operation overlay. A simulated 360 px `ResizeObserver` DOM test confirms narrow markers collapse to tappable codes and the four-action navigator remains present; native layout/overflow acceptance is still outstanding because no browser surface exists.

**Final instance/operation contract:**

- Persisted/revision-ready state remains exactly `RoofProjectDocumentV1.project.roof`; instance, operation, navigation, breadcrumb, drawer, isolation and camera state remain transient.
- `MemberInstanceContext` carries `instanceId`, `prototypeId`, `familyCode`, physical kind/order, side/plane/corner/station, exact length, stable length-group ID, section, related instances/operations and warnings. `MemberInstanceOperationContext` carries the existing operation ID/code/status/support/station, normalized member-axis position, canonical world point, reference direction, material-removal semantic, optional real preview ID and warnings.
- An absent `detailPreviewId` is a supported state, not an error. It selects and explains the operation without displaying a false cut detail.

**Files changed:**

- Documentation/checkpoint: `docs/PROMPT_ITERATION_010.md`, `docs/ARCHITECTURE_V10_MEMBER_INSTANCE_WORKFLOW.md`, `PROJECT_BLUEPRINT.md`.
- Domain/math: new calculator-core `member-instance.ts` and tests plus barrel export; new resolved-skeleton entry points in roof-math `gable-roof.ts`, `hip-roof.ts` and `roof-template.ts`.
- Web architecture/UI: new `workbench-project.ts` and test, `Inspector.tsx`, `WorkbenchContextBar.tsx`, `MemberInstanceInspector.tsx`, `MemberInstanceOverlay.tsx`, `OrientationMiniMap.tsx`; updated Page, SkeletonCanvas, WorkbenchControls, PreparationPlan, DetailPreview, workbench/store logic and tests, translations and responsive styles.
- No dependency/lockfile change, database/auth/PDF/export work, commit or push was made.

**Validation, performance and QA:**

- Final pinned checks pass: TypeScript, ESLint, `git diff --check`, web production build and API production build.
- Final tests: **266 passed across 31 files**, up from 252/29. Coverage includes mirrored K1 instances, all four H1, exact multiple J1 groups, deterministic wrap navigation, operation anchoring/no-preview safety, document/history exclusion, shared Quick/Builder math, 940/800 spacing, multiple purlins, keyboard markers, breadcrumb/navigator/locator, Cuts/Drawer synchronization, `Escape` return, form-shortcut exclusion and narrow marker behavior.
- The actual expensive projection resolves once per canonical template identity; skeleton generation now consumes the resolved roof and does not invoke the roof solver a second time. View-only changes are excluded from the resolver input and covered by a call-count test.
- Final web build: main **452.70 kB / 130.01 kB gzip**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **10.75 / 2.39 kB**, CSS **65.54 / 13.30 kB**. The Vite 500 kB advisory remains absent. The feature increases the V9 main chunk by about 17.1 kB and CSS by about 7.0 kB before gzip; no broad performance-regression claim is made beyond the measured build and resolver boundary.
- The requested Computer Use/Browser skill was used, but `iab` returned `Browser is not available` and the complete browser/application inventory was empty. Therefore no native 1440×900, 768 px, 360×800, screenshot, horizontal-overflow or hardware touch claim is made. DOM, geometry, keyboard, simulated narrow-resize and responsive-CSS checks pass.

**Known limitations / assumptions:**

- H1 is still the approved coordinated compound-cut explanation, not a complete saw-face solid; backing versus dropping remains explicit. J1 remains measured to the theoretical H1 centre plane; physical H1-face deduction, J1-to-purlin joinery and dedicated J1 cut previews remain intentionally unresolved and visible.
- K1/H1/J1 fabrication remains shared by prototype/length group; individual production overrides were deliberately not introduced. Length-group IDs depend on deterministic package order and never on rounded display values.
- Native browser acceptance is the only unfinished Iteration 010 validation item. Persistence/database, login, projects/revisions UI, PDF/export, costing, covering, openings, new roof types, structural verification, full CAD/Three.js and other excluded scope were not started.

**NEXT ACTION:**

> When a Browser surface is available, run the production build through the Iteration 010 desktop 1440×900, tablet 768 px and mobile 360×800 acceptance matrix: gable with two purlins, rectangular/square hip, representative K1/all H1/several J1, breadcrumb/navigator/locator, marker collisions, isolation, Cuts, Before/After, `Escape`, Undo/Redo, pan/zoom/Fit and horizontal overflow. Fix only evidenced defects, then stop for user review/commit. Do not begin Iteration 011 automatically.

**Previous checkpoint — Iteration 009:**

**Iteration:** `009 — project workbench + smart views + fabrication package`

**Status:** `COMPLETE — AUTOMATED VALIDATION PASS; NATIVE BROWSER QA UNAVAILABLE`

**Iteration 009 completed:**

- Read the complete mandatory AGENTS/Blueprint/North Star/V3–V9 architecture, H1/J1 geometry, research roadmap, approved V9 prompt and user-supplied problem statement before editing source. Preserved the untracked user file `git.txt`; no unrelated work was discarded.
- Added the schema-versioned `RoofProjectDocumentV1` as the explicit serializable boundary for the canonical `RoofTemplateSpec`, including strict parse/create/serialize entry points. Zustand keeps this document synchronized with canonical edits, and Undo/Redo snapshots now contain the versioned document rather than ad hoc UI state.
- Consolidated session-only state under `WorkbenchViewState`: Quick/Builder mode, selection/prototype, canvas context, view preset, isolation/focus, dimension level, whole-Toolbox and per-group collapse, Inspector, preparation workflow and Detail Drawer state. Units and raw/invalid drafts remain documented transient presentation/editor state; camera/drag hover state remains component-local. None of these values creates a project-history entry or enters serialization.
- Added derived semantic projection policy for the intelligent `Konstrukcja` / `Cięcia` presets. Construction retains roof context, structural families, supports and direct handles; Cuts switches to cut datums/markers, active-operation context and heavy muting while disabling construction handles. Existing K1/H1 detail canvases remain contextual views rather than primary global modes.
- Added `Izoluj element` / `Pokaż cały dach`, with roof planes retained as ghost context and selected, directly related and muted geometry distinguished consistently. Returning to roof selection exits isolation; isolation/focus is tested not to alter geometry, the canonical document or history.
- Centralized `Minimalne` / `Robocze` / `Pełne` dimension policy. Working is the default, selection/focus unlocks useful support context, Full allows every available technical dimension on desktop, and narrow canvases automatically cap Full at Working while exact Inspector/Drawer values remain available.
- Added a collapsible dynamic legend derived from the actual scene: gable exposes K1, hip adds H1/J1, and real purlins use stable P1/P2… labels. Selected, removed-material and guide semantics are separate from family styling.
- Formalized pure `FabricationOperationSummary`, `MemberFabricationPackage` and `RoofFabricationPackage` projections. K1 reuses every existing wall/purlin notch and ridge-cut preview; H1 reuses the supported compound upper-cut preview; J1 groups exact varying instance lengths and exposes only the valid wall-seat/theoretical-H1 facts with explicit physical-face and purlin-joinery limitations.
- Replaced the generic `Pokaż trasowanie` mental model with `Przygotowanie elementu` and `Plan przygotowania dachu`. K1/H1/J1 family cards expose physical quantities, section, grouped lengths, ordered operations, exact dimensions, steps, limitations and previous/next navigation; selecting an operation coordinates selection, the Cuts preset, contextual member view and Detail Drawer.
- Added `Przed cięciem` / `Po cięciu` projections to canonical K1 and H1 details. Both states reuse one resolved operation: Before shows stock, cut lines and removed material; After shows the retained profile without a second cut formula. Quick compact cards and Builder details are derived from the same roof package.
- Replaced inline Toolbox growth logic with typed web-layer tool descriptors for only the implemented roof, K1, conditional H1/J1, wall plate, real purlins, ridge and `+ Dodaj płatew`. Per-category collapse state is ready for a future real `+ Dodaj element` without adding fake tools or React concerns to domain packages.
- Memoized roof resolution, skeleton and fabrication-package derivation across transient view changes. The skeleton now subscribes only to state used by its renderer and is memoized, so drawer-only state changes do not recompute the full scene. A small Rollup vendor split reduced the main application chunk below the Vite advisory threshold.

**Project/view and fabrication contracts:**

- Canonical persisted/revision-ready data is exactly `RoofProjectDocumentV1 { schemaVersion: 1, project: { roof } }`. `template` and `spec` are runtime access/solver projections; project history stores document snapshots. No persistence service exists yet.
- `WorkbenchViewState`, units, drafts and component-local camera/gesture state are transient. View presets, isolation, dimensions, collapse, language, selection, focus and drawer state are deliberately outside Undo/Redo.
- `RoofFabricationPackage` is a pure derivation from one resolved roof template. It contains ordered member-family packages; operation summaries link back to existing canonical plans/previews and never recalculate joinery.

**Files changed / WIP:**

- Canonical/project and fabrication: new `packages/calculator-core/src/project-document.ts`, `fabrication-package.ts` and tests; updated detail-preview projections/tests and calculator-core exports; extended renderer-neutral preview state in `packages/drawing-engine/src/index.ts`.
- Web workbench: new `workbench.ts`, `WorkbenchControls.tsx`, `Toolbox.tsx`, `PreparationPlan.tsx` and tests; updated store/Page/Canvas/SkeletonCanvas/DetailPreview, integration tests, translations and responsive styling.
- Performance/configuration: `apps/web/vite.config.ts`. Documentation: this checkpoint. `git.txt` remains an untracked user file and was not modified. There is no dependency/lockfile change, commit or push.

**Performance before / after:**

- Baseline: main `index-BPHbirx3.js` **531.08 kB / 156.46 kB gzip**, CSS **52.71 kB / 11.17 kB gzip**, with Vite's >500 kB advisory.
- Final measured build: main application chunk **435.63 kB / 125.56 kB gzip**, plus `react-vendor` **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB** and icons **10.27 / 2.30 kB**; CSS **58.59 / 12.14 kB**. The main-chunk advisory is gone. Splitting improves caching/load scheduling; it is not claimed as a reduction of all transferred JavaScript.

**Iteration 009 validation and QA:**

- Baseline passed typecheck, **237 tests across 26 files**, and web/API build. Final repository-pinned validation passes typecheck, lint, web/API production build, `git diff --check` and **252 tests across 29 files**.
- Coverage includes project serialization/version rejection, exclusion of UI state, canonical Undo/Redo isolation, both view policies, all dimension levels and narrow fallback, gable/hip/P1 legend contents, typed tools, K1/H1 operation mapping, K1/H1/J1 quantities and deterministic length grouping/order, shared before/after geometry, Quick/Builder package equivalence, operation navigation for multiple real purlins and the unchanged 940/800 spacing contract.
- The production preview returns HTTP 200. The requested Browser skill was used, but `iab`, Edge and Chrome each returned `Browser is not available`, and the browser inventory was empty. No native desktop/360 px screenshot, visual-overflow or hardware touch claim is made. Narrow dimension fallback, mobile bottom-sheet/layout rules and mouse/touch pointer flows remain covered by unit/jsdom/CSS checks.

**Known limitations:**

- H1 remains the approved coordinated top-face compound-cut projection with the explicit backed-versus-dropped warning; it is not a complete 3D saw-face model.
- J1 remains measured to the theoretical H1 center plane. Physical H1-face deduction, J1-to-purlin joinery and a dedicated J1 cut drawing are intentionally not invented; the package reports these limits.
- The optional controlled inline-edit proof was not added because the existing exact Inspector inputs already share the canonical validation path and the higher-priority project/view/fabrication boundary was completed without duplicating an editing surface.
- Native desktop/mobile acceptance is outstanding only because no Browser surface was available. Persistence/database, auth, PDF, structural verification, collar ties, windows, covering and other Iteration 010+ scope were not started.

**NEXT ACTION:**

> When a Browser surface is available, run the Iteration 009 desktop and 360 px acceptance matrix against the production build: gable presets/isolation/dimensions/K1 operations/before-after/package; multiple-purlin mapping; hip H1/J1 grouping/limitations; Quick handoff; bottom-sheet usability and horizontal overflow. Then stop and await a new explicit user-approved iteration prompt. Do not begin Iteration 010 automatically.

**Previous checkpoint — Iteration 008:**

**Iteration:** `008 — cut detail previews + smart detail drawer + explicit spacing policies`

**Status:** `COMPLETE — AUTOMATED VALIDATION PASS; NATIVE BROWSER QA UNAVAILABLE`

**Iteration 008 completed:**

- Read the mandatory blueprint, V3–V8 architecture, hip geometry, research roadmap, V8 review/prompt and the complete V8.1 spacing audit before editing source.
- Replaced ambiguous spacing names with the discriminated `max-even-spacing`, `target-even-spacing` and `fixed-module` policies. Fixed module has an explicit `require-both-ends` / `allow-open-end` policy; the target policy records signed millimetre and ratio deviation. Maximum even spacing remains the conservative default.
- Kept `resolveRafterSpacing()` as the single resolver for gable K1 pairs, the hip common-rafter ridge region and the hip half-run stations that generate J1. Hip summaries now expose the common K1 and jack J1 regions separately when both exist, because their resolved actual spacing can differ.
- Preserved the required `940 / 800` maximum result: 2 bays, 3 pairs and 470 mm actual spacing. Inspector/roof summary show requested value, actual value, bays, stations/pairs and the reason. Target mode resolves 1 bay, 2 pairs, 940 mm and `+17.5%`; fixed module exposes the final bay or open-end remainder.
- Added station-axis guides, up to four adjacent bay dimensions and an overall `N × actual spacing` skeleton annotation without duplicating long runs of labels.
- Added renderer-neutral `DetailPreviewModel` data and pure preview factories. K1 birdsmouth and ridge-cut details come from the exact resolved assembly/fabrication plan; the H1 top-face double-cheek preview consumes the resolved compound cut and backing values. The removed birdsmouth profile is the canonical cut polygon, not a decorative approximation.
- Added compact K1/H1 cut previews to Quick Calc and a responsive smart detail drawer to Builder. The drawer auto-opens for direct cut selection, supports collapse, close, pin, tabs and “zoom to detail”, and shows close-up geometry, key dimensions, reference frames, ordered marking steps and explicit H1 backing/drop warning.
- Synchronized drawing, toolbox, inspector, contextual results and fabrication context around the same selection IDs. The toolbox now has collapsible groups, a compact collapsed state, active-selection feedback and direct detail shortcuts.
- Updated Polish/English Model 8.0 copy and README, including the working XAMPP URL. No new calculator family, 3D engine, persistence, auth/database, PDF or structural claim was added.

**Spacing audit assumptions and contract:**

- `max-even-spacing` means both end stations plus the minimum evenly distributed bay count that does not exceed the request. `target-even-spacing` uses `max(1, round(L / target))` and reports signed deviation. `fixed-module` starts at zero and only adds the building-end station when its explicit policy requires it.
- A fixed-module open end can legitimately resolve one station and zero complete bays when the requested module exceeds the building length; the remainder is reported rather than silently creating another axis. Structural suitability is deliberately not inferred.
- There is no saved-template persistence in the current product, so no legacy-state migration is active. Any future persistence layer must map old `fit-evenly` / `fixed-spacing` values explicitly instead of silently reinterpreting them.

**Files changed / WIP:**

- Domain/math: `packages/timber-model/src/index.ts`, `packages/roof-math/src/gable-roof.ts` and its tests, `packages/roof-math/src/hip-roof.test.ts`.
- Shared preview/drawing: `packages/drawing-engine/src/index.ts`, `packages/calculator-core/src/assembly.ts`, new `packages/calculator-core/src/detail-preview.ts` and its tests, plus the calculator-core barrel export.
- Web: new `apps/web/src/assembly/DetailPreview.tsx`; updated Page, Inputs, Canvas, SkeletonCanvas, Summary, selection/store and their tests, styles and translations.
- Documentation: `README.md` and this checkpoint. The four user-supplied V8 documents remain untracked and untouched. There is no dependency/lockfile change, unfinished syntax, commit or push.

**Iteration 008 validation:**

- Baseline passed typecheck, 217 tests across 25 files and web/API production build. Final repository-pinned validation passed `typecheck`, `lint`, `git diff --check`, web/API production build and **237 tests across 26 files**.
- Regression coverage includes every V8.1 spacing case, invalid/non-finite and short inputs, display-unit invariance, fixed end policies, Undo/Redo, gable/hip/J1 shared resolver behavior, exact canonical preview values and removed profile, Quick K1/H1 previews, 940/800 UI explanation, station guides, direct cut selection, drawer open/zoom and H1 context.
- Build output is valid. Vite still reports the known advisory that the main minified JavaScript chunk is above 500 kB; this is a performance follow-up, not a build failure.
- The production XAMPP URL returned HTTP 200. The requested Browser skill was initialized, but the in-app surface returned exactly `Browser is not available: iab` before navigation. No native desktop/360 px screenshot, visual-overflow, pointer or touch claim is made. Responsive drawer/bottom-sheet behavior is covered by CSS and jsdom interaction tests only.

**Known limitations:**

- H1 close-up is a coordinated top-face cutting/marking projection from the resolved double-cheek angles; it is not a full 3D saw-face model and retains the explicit backed-versus-dropped warning.
- J1 still ends at the theoretical H1 center plane and has no dedicated cut preview, physical H1-face deduction or purlin joinery. Kerf, allowances, structural sizing and print/export remain outside this iteration.
- Native visual/mobile acceptance remains outstanding solely because the requested in-app Browser surface was unavailable.

**NEXT ACTION:**

> When the in-app Browser is available, run desktop and 360 px acceptance QA against the production build: verify 940/800 in all three policies, gable station labels, Quick K1/H1 previews, drawer selection/pin/close/zoom and toolbox/inspector overflow. Then obtain an explicit domain decision for H1 backed-versus-dropped geometry and J1 physical-face/purlin joinery before extending fabrication. Do not begin Iteration 009 without a new approved prompt.

**Previous checkpoint — Iteration 007:**

**Iteration 007 completed:**

- Added first-class J1 jack-rafter domain types, pure geometry/fabrication results, deterministic physical instance IDs and one shared variable-length fabrication prototype. The hip-template resolver now generates 8 J1 members for every interior station, with exact world endpoints on all four roof planes; the default example resolves 32 physical jacks.
- Kept K1, H1 and J1 in one template/model pipeline. Hip roofs now expose prototype summaries with physical counts, sections, instance IDs, length ranges and shared-versus-variable fabrication modes; gable roofs expose the same K1 prototype shape.
- Added the explicit regular equal-pitch J1 geometry contract in `docs/JACK_RAFTER_GEOMETRY.md`, including wall-run/line-length equations, referenced plumb/plan/top-face angles, exact count rules and regression values. J1 reuses the canonical K1 wall-seat result rather than duplicating birdsmouth math.
- Added selection-aware roof, prototype, physical-instance, support, seat-notch and end-cut contexts. Builder results, inspector and preparation panel now follow the active selection while Quick Calc retains the existing compact K1/H1 workflow.
- Made fabrication a first-class Builder panel: whole-roof K1/H1/J1 groups, prototype quantities and ranges, exact per-instance J1 length/plane/station, ordered preparation steps and explicit unresolved H1-face/purlin-joinery notices.
- Added real selectable J1 timber solids to the skeleton, end-plane K1 members, stronger H1/primary hierarchy, lighter secondary J1 treatment, ghost roof fills and selected/related/muted/hover/focus states. Background selection returns to the whole-roof context.
- Updated Polish/English copy, Model 7.0 product documentation, responsive styles and automated UI/domain regression coverage. No 3D engine, persistence, auth, database, PDF or additional roof type was added.

**J1 formula and reference contract:**

- For station `d` measured on the wall from a hip corner, common pitch `theta` and overhang `e`: wall run is `d`, total horizontal run is `d + e`, rise from the outer-eave station is `(d + e) * tan(theta)` and outer-eave-to-theoretical-hip-center-plane line length is `(d + e) / cos(theta)`.
- J1 plumb is referenced to its member axis as `90deg - theta`; the plan meeting line is referenced to the J1 plan axis as `45deg`; the top-face trace is referenced to the J1 axis as `atan(cos(theta))` for the documented equal-pitch vertical hip-center-plane model. Intermediate calculations are never rounded.
- A station must satisfy `0 < d < halfRun`. The resolver deliberately excludes the corner and apex/ridge endpoints. It applies no allowance, kerf or unverified deduction from the theoretical H1 center plane to an H1 timber face.

**Iteration 007 validation:**

- Preflight on the clean tracked baseline passed typecheck, 205 tests across 24 files and production build. The three supplied V7 documents were untracked user files and remain preserved.
- Final `npx pnpm@10.15.1 typecheck`, `lint`, web/API production `build` and `git diff --check` passed. Vitest passed **217 tests across 25 files**, including 6 new pure J1 tests, expanded hip-template tests and 20 Builder/Quick interaction tests.
- Automated coverage includes exact and monotonic J1 lengths, stable IDs, all roof planes/corners, K1/H1/J1 prototype counts, pyramid common members, invalid/non-finite inputs, purlin limitation flags, roof/prototype/instance/support/joint contexts, selection hierarchy and contextual fabrication.
- The requested in-app Browser was initialized after the production build but returned `Browser is not available: iab`. No desktop/mobile screenshot, visual-overflow, native pointer or touch claim is made for V7; responsive behavior is covered by CSS and jsdom interaction tests only.

**Files changed / WIP:**

- Domain/math: `packages/timber-model/src/index.ts`; new `packages/roof-math/src/jack-rafter.ts` and test; hip/gable resolvers, hip tests and barrel export.
- Web: new `apps/web/src/assembly/selection.ts`; updated page, skeleton/cross-section canvases, contextual results/fabrication, translations, styles and page tests.
- Documentation: `README.md`, new `docs/JACK_RAFTER_GEOMETRY.md` and this checkpoint. The user-supplied V7 architecture, review and prompt documents remain untracked and untouched. No dependency/lockfile change, unfinished syntax, commit or push.

**Iteration 007 limitations:**

- J1 fabrication ends at the theoretical H1 center plane. It intentionally does not select an H1 face deduction, backed-versus-dropped convention, saw allowance or kerf without a separately approved physical reference model.
- Intermediate purlins remain real shared supports, but J1-to-purlin notch/joinery is reported as unresolved. J1 has coordinated contextual facts and preparation steps, not a dedicated dimensioned per-piece cut drawing.
- Structural/member sizing, irregular or unequal-pitch hips, valleys, full 3D CAD, persistence, auth/database, PDF/export and additional roof systems remain outside V7.
- Native desktop/mobile/touch visual QA remains required because the requested Browser surface was unavailable in this session.

**NEXT ACTION:**

> Enable the in-app Browser and run desktop plus 360 px user-acceptance QA for J1 density, selection contrast, preparation-panel overflow and native pointer/touch behavior; then obtain an explicit domain decision for H1 face deduction/backed-versus-dropped geometry and J1-to-purlin joinery before extending fabrication. Do not begin Iteration 008 without a new approved prompt.

**Previous checkpoint — Iteration 006:**

**Iteration 006 completed:**

- Added the discriminated `RoofTemplateSpec = GableRoofTemplateSpec | HipRoofTemplateSpec`. Both variants retain canonical building length, half-run, pitch, overhang, spacing, K1 section, wall plate, ridge and intermediate supports; the hip variant adds an explicit H1 section. Pure adapters keep the existing `AssemblySpec` and K1 solver as the shared cross-section path.
- Added exact pure H1 geometry and structured `HipRafterSpec`, `HipRafterResult`, `CompoundEndCut`, `HipBackingDetail` and `HipFabricationPlan`. The versioned calculator registry now includes `hip-rafter@1.0.0` without altering historical K1 versions.
- Added a pure regular hip-template resolver for rectangular equal-pitch roofs. It resolves ridge height/length/endpoints, the square zero-ridge apex, the valid common-rafter region, the shared K1 calculation, one shared H1 calculation and four exact hip axes.
- The hip skeleton reuses V5 solid-prism rendering. It has four perimeter wall-plate members, an omitted ridge solid at zero ridge length, four visually stronger H1 solids, valid K1 pairs along the central ridge region, roof-plane guide polygons instead of fake jack rafters and purlins trimmed to the real hip boundaries.
- Physical hip IDs are `instance:hip:front-left`, `instance:hip:front-right`, `instance:hip:rear-left` and `instance:hip:rear-right`; all link to `member:hip-rafter-H1`. Selection identifies one corner instance while editing the shared prototype.
- Quick Calc now selects K1 or H1 while keeping the same canonical store. H1 retains only run, pitch and overhang as primary inputs, with H1 section/ridge thickness disclosed separately, immediate explicit lengths/angles and direct transfer to the hip Builder.
- Builder has one undoable gable/hip selector, preserves compatible values, initializes the H1 section explicitly, enforces `buildingLength >= full span`, updates K1/H1/skeleton together and reuses the existing history, direct pitch/span/length/purlin handles and viewport state.
- Added a coordinated H1 sheet with plan, elevation along the hip and ridge-cut/backing detail. It shows the outer eave, wall corner, 45-degree plan direction, ridge axis/face, tail, rise, theoretical/physical lengths, plumb/seat references, symmetric double-cheek layout and backing reference without adding permanent global view tabs.
- Updated PL/EN copy, context-aware workbench/member titles, Model 6.0 styling, responsive single-column H1 drawings at phone width and README architecture/limitations.

**H1 formula and reference contract:**

- With common run `r`, overhang `e`, ridge thickness `t` and common pitch `theta`: `rise = r*tan(theta)`, `hipPlanRun = r*sqrt(2)`, `hipTailPlanRun = e*sqrt(2)` and `lineFactor = sqrt(2 + tan(theta)^2)`.
- `theoreticalHipLine = r*lineFactor`, `tailLine = e*lineFactor`, `outerEaveToRidgeCenter = (r+e)*lineFactor` and `hipSlope = atan(tan(theta)/sqrt(2))`.
- `plumbToMember = 90deg - hipSlope`, `seatToMember = hipSlope`, `cheek = atan(sqrt(2)/lineFactor)` and `backing = atan(tan(theta)/lineFactor)`.
- Ridge deduction uses the V6 centerline-to-near-face convention: `ridgePlanDeduction = t/sqrt(2)`, `ridgeAxisDeduction = ridgePlanDeduction/cos(hipSlope)`, then subtracts the axis deduction from the theoretical wall-corner or outer-eave station. Intermediate math is never rounded.

**Iteration 006 validation:**

- Preflight on clean `main`: typecheck passed, 171 tests across 22 files passed, and web/API production build passed.
- Final typecheck and lint passed; Vitest passed **205 tests across 24 files**; the Vite web and tsup API production builds passed.
- New automated coverage includes the 1000 mm/30-degree and exact 6/12 H1 regressions, zero/nonzero overhang and ridge thickness, low/high pitch, invalid/non-finite inputs, template discrimination, gable regression, rectangular/square roofs, axes/IDs/prototype sharing, honest purlin trimming, K1/H1 shared reactivity, template-switch undo/redo, unit invariance and Quick/Builder/H1-sheet flows.
- XAMPP returned HTTP 200 for the newly built `apps/web/dist` artifact.
- Requested Browser QA could not run: `iab` reported unavailable and the browser inventory returned no browsers or tabs. No desktop screenshot, 360 px screenshot, native touch, pan/zoom or visual-overflow claim is made for V6. Responsive behavior is covered only by CSS and jsdom interaction tests until a browser becomes available.

**Files changed / WIP:**

- Domain/math: `packages/timber-model/src/index.ts`, new `packages/roof-math/src/{hip-rafter,hip-roof,roof-template}.ts`, their tests and barrel exports.
- Versioning/drawing: new `packages/calculator-core/src/hip-rafter.ts`, registry/tests, and generalized diagonal prism cross-section geometry/tests in `drawing-engine`.
- Web: union-aware `store.ts`, inputs/page/skeleton/summary/canvas, new `HipFabricationSheet.tsx`, PL/EN translations, responsive styles and interaction tests.
- Documentation: `README.md` and this checkpoint. No unfinished syntax or placeholder implementation; no dependency or lockfile change; no commit or push performed.

**Iteration 006 limitations:**

- V6 intentionally has no jack rafters/infill or jack cut list, valley/irregular/unequal-pitch roofs, arbitrary footprints, structural verification, per-instance fabrication overrides, allowances/kerf, persistence, PDF or full 3D CAD.
- Hip purlins are shown only on the two long roof planes and terminate at exact hip boundaries. End-plane infill remains guide geometry until a real jack-rafter solver exists.
- The H1 sheet explains a regular symmetric double-cheek/backing geometry but does not choose backing versus dropping or prescribe structural/member sizing.
- Native visual and touch QA remains the required user-acceptance step because the requested browser surface was unavailable in this session.

**Working repository:** `C:/xampp/htdocs/RoofCalc`, origin `https://github.com/rydwan92/RoofCalc.git`. The former nested gitlink `RoofCalc/` was promoted into this root on 2026-09-10 only after matching hashes for V4 source and documentation were verified, then removed.

**Iteration 005 completed:**

- `SkeletonMember3D` now represents a unique physical placement with `id`, shared `prototypeId`, semantic selection ID, real section, side and optional building station. A selected rafter instance highlights only that physical member while the Inspector identifies its common K1 fabrication prototype.
- `drawing-engine` provides pure rectangular timber-prism faces, stable axonometric face ordering, UI-only viewport transforms and a generic projected-axis drag mapper. The Skeleton SVG draws true 2.5D timber faces for rafters, wall plates, purlins and ridge without Three.js.
- Builder exposes explicit ridge/pitch, span, building-length and purlin handles. They write back only canonical template values, snap to 0.5 degrees or 10 mm as appropriate, preserve exact numeric inputs and refresh fabrication through the unchanged common assembly solver.
- Added legal free-segment resolution for dynamic intermediate supports. `+ Płatew` can allocate P1/P2/P3... with stable IDs while space remains; direct moves clamp to legal non-overlapping intervals and all resulting notches/stations remain ordered.
- Added bounded 40-snapshot canonical history with begin/commit/cancel transactions. Drag frames coalesce into one undo step; invalid drafts, unit/language/view changes and viewport motion are excluded. Undo/Redo has accessible toolbar buttons and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y shortcuts. Reset deliberately returns to the example and clears history.
- Skeleton supports native non-passive wheel zoom, background pan and Fit. Camera state remains local to the component and never affects construction data. Keyboard arrows provide exact alternatives for all direct handles.
- Contextual flow now opens a selected physical rafter in the fabrication view and offers a visible return to Skeleton. The Szkielet/Krokiew control remains as a compact fallback only. Quick Calc remains limited to the fast three-input path.
- Added `docs/SKELETON_INTERACTION_GEOMETRY.md` and updated README/product copy to Model 5.0.

**Iteration 005 validation:**

- `npx pnpm@10.15.1 typecheck` passed.
- `npx pnpm@10.15.1 test` passed: 171 tests across 22 files.
- `npx pnpm@10.15.1 lint` passed after removal of one unused UI binding.
- `npx pnpm@10.15.1 build` passed for Vite web and tsup API.
- `git diff --check` passed; only Windows LF/CRLF informational warnings were emitted.
- Browser QA at desktop: solid skeleton displays readable physical timber, ridge drag changed 35 degrees to 47.5 degrees and Undo restored 35 degrees, P2 drag changed its one canonical support position, span and building-length handles updated live, and wheel zoom changed 100% to 112% without page scrolling. Background pan changed only camera pixels and left Undo disabled/template unchanged.
- Browser QA at 360 px: Quick remains compact, Builder solid skeleton and all three initial handles remain visible, bottom inspector can collapse, and document width did not exceed viewport width.

**Iteration 005 limitations:**

- Pinch-to-zoom was not added; native touch pointer dragging is covered by simulated pointer tests and requires hardware QA later.
- The skeleton is intentionally explanatory 2.5D; there are no per-instance fabrication overrides, full 3D CAD, structural capacity claims or additional roof systems.
- Exact numeric purlin input uses the broad wall-to-ridge interval and reports a local invalid draft if it overlaps a support; direct manipulation clamps to the nearest legal free segment.

**Iteration 004 completed:**

- Added a pure `GableRoofTemplateSpec` with canonical building length, half-run, pitch, overhang, rafter section, supports and explicit spacing mode.
- Added pure `fit-evenly` and `fixed-spacing` resolvers, one cross-section AssemblySpec adapter and a world XYZ skeleton resolver for wall plates, ridge, repeated rafter pairs and optional purlins.
- Added a renderer-neutral axonometric projection helper and an SVG Skeleton context in Builder. Skeleton selection uses the same semantic member/support IDs as the fabrication view.
- Made the template the canonical Zustand state. AssemblySpec is now derived before the existing shared solver runs; Quick Calc and Builder cannot diverge.
- Builder defaults to `Szkielet` and offers compact `Szkielet` / `Krokiew` contexts. Existing rafter drawing, keyboard/mouse/touch purlin movement and contextual notch detail remain in `Krokiew`.
- Added exact building length and rafter-spacing fields, explicit spacing mode and compact pitch/spacing step controls. Invalid raw drafts preserve the last valid skeleton/fabrication result and show a local field error.
- Expanded the live result rail with rafter-pair count and actual spacing in skeleton context. Added PL/EN translations and responsive technical styling.
- Added focused tests for spacing, template-to-assembly synchronization, skeleton instances/purlins, projection and the complete Quick/Builder interaction path.

**Iteration 004 validation:**

- Final `npx pnpm@10.15.1 typecheck` passed.
- Final `npx pnpm@10.15.1 test` passed: 158 tests across 22 files.
- Final `npx pnpm@10.15.1 lint` passed.
- Final `npx pnpm@10.15.1 build` passed for Vite web and tsup API.
- After promoting the nested source to the root: `install`, typecheck, 158 tests across 22 files, lint, build and `git diff --check` all passed in the root workspace.
- Focused V4 tests passed: gable template (4), projection (6), store (5) and Builder integration (11).
- Browser QA passed at desktop and 360 px: Quick Calc, Builder skeleton, responsive controls and no horizontal mobile overflow were inspected. Label overlap at the ridge and clipped mobile pitch controls were found and corrected during QA.
- Root XAMPP build was verified at `http://localhost/RoofCalc/apps/web/dist/#/calculators/common-rafter`.
- Published to `origin/main` in commit `7ce50d4` (`feat: add reactive roof skeleton workbench`), which removes the former `160000 RoofCalc` gitlink.
- No Three.js, 3D solver, hip/valley geometry, persistence, authentication, billing or PDF work was added.

**Iteration 004 limitations:**

- The project is one flat repository at `C:/xampp/htdocs/RoofCalc`; future source work belongs there. The nested gitlink is gone.
- Purlin direct manipulation remains in the `Krokiew` profile where its constrained horizontal axis is exact; the skeleton shows and immediately reflects the moved support.
- The skeleton is a 2.5D explanatory view. Fabrication remains intentionally 2D and no structural safety inference is made.
- Native touch hardware was not available; touch pointer behavior is covered through the existing simulated Pointer Events integration tests.

**Goal of prior iteration 003:**

- Prove a shared parametric assembly/fabrication engine through Quick Calc, Visual Builder and a movable, real purlin support.
- Keep one rafter, wall plate, zero/one UI purlin and ridge; do not begin the next iteration.

**Completed:**

- Read the full blueprint, V3 architecture, iteration prompt and research roadmap; inspected initial Git status/diff and preserved pre-existing user changes.
- `timber-model`: editable `AssemblySpec`, typed support placement and joint preference, semantic `Datum`, `ResolvedAssembly`, resolved joints/end cuts and structured `FabricationPlan`.
- `roof-math`: line intersection, unit tangent/normal, parallel offset, projection and existing world/member transforms; one generic support/joint resolver for both wall plate and purlin. Actual notch triangles are removed from the retained profile.
- Schema validates finite ranges, unique IDs, wall origin, support fit/separation and notch geometry. Pure solver supports more than one purlin; UI intentionally exposes only one.
- Stable calculator ID now launches `common-rafter@3.0.0`. Historical `@1.0.0` and `@2.0.0` remain versioned and regression-tested, with no changes to their calculation functions. The previous UI remains an unlaunched historical regression fixture.
- Shared live Zustand AssemblySpec powers Quick and Builder. No QuickCalcMath/BuilderMath. Mode switches and mm/cm/m display switches preserve canonical values and added supports.
- Quick starts with run/pitch/overhang, discloses timber/support settings, shows immediate results and a compact sketch, and opens marking steps or Builder.
- Builder has a collapsible desktop toolbox, dominant SVG canvas, selected-element inspector, active add/remove purlin, and no permanent Construction/Member/Detail mode hierarchy.
- Mobile has a wrapping tool strip and non-modal bottom inspector; direct entry to Builder starts the sheet closed and element selection opens it.
- Pointer Events handle mouse/touch, screen-matrix inversion, inverse fit, grab offset, projection frozen during drag, snapping/clamping, guide/live dimension and canonical millimetre updates. Pointer-up commits; cancellation/lost capture/Esc restores the original position. Keyboard arrows move 1 mm, Shift+arrow 10 mm.
- Purlin position, width, height and joint parameter are editable numerically. Seat or normal depth can control the same resolver. Invalid drafts stay editable while stale geometry/plans disappear.
- Cut selection shows a contextual inset; Enlarge detail focuses the main canvas; back/Esc returns to assembly. All detail shapes come from the same retained profile.
- Dynamic semantic datums and from/to references remain stable in fabrication and drawing models. A/B/C… are separate generated display labels, including labels beyond Z.
- Dimension intents carry primary/support/joint groups and priority. Renderer assigns collision-aware lanes using projected spans/label footprints and expands fit bounds to keep labels visible. Compact views suppress secondary dimensions; full marking data stays available below.
- Fabrication plan contains ordered support joints, stations, stock/section data and mark-plumb/mark-seat/check-depth steps, translated in PL/EN by UI.
- Added `docs/ASSEMBLY_V3_GEOMETRY.md`; updated README, local run address and this checkpoint.

**Mathematical assumptions / user decisions:**

- Preserves the user-approved 2026-09-09 wall placement: seat `[0,s0]` at y=0, uncut lower edge `y=(x-s0)tan(theta)`, upper edge a parallel normal offset by member depth.
- Every horizontal support at left-face X=x seats at the lower-edge toe X=x+s. Its elevation follows this contact geometry. Purlin elevation is not an independent input.
- Notch normal depth `s sin(theta)`; vertical heel height `s tan(theta)`; remaining depth `d-s sin(theta)`. No arbitrary structural-safety threshold.
- Support width and seat length differ. Seat fits within width; notch removes strictly less than full depth. Support blocks cannot overlap and require 1 mm separation.
- Ridge near face `run-thickness/2`; top-edge length `(run-thickness/2+overhang)/cos(theta)`; minimum stock adds `d tan(theta)`. No kerf or production allowance.
- Moving the purlin changes its contact elevation, actual notch/profile points, top-edge datums, stations and inter-joint lengths. Fixed member endpoints mean total stock length remains unchanged.
- Canonical UI purlin position is horizontal X from the wall's left face. Drag limits: `plateWidth+1` to `run-ridgeThickness/2-purlinWidth-1`. Exact inspector input is validated rather than silently clamped/snapped.
- Zoom-aware grid: 1/5/10 mm; legal endpoints and midpoint are reference targets within 7 pixels capped at 40 mm. Screen coordinates are transient view/gesture data only.
- Every marking reference is explicit about its datum and top edge. Heel datum identifies the real plumb notch cut; toe datum is a vertical projection/reference, not another cut.

**Files changed / WIP:**

- `PROJECT_BLUEPRINT.md`, `README.md`, new `docs/ASSEMBLY_V3_GEOMETRY.md`.
- `packages/timber-model/src/index.ts`.
- New `packages/roof-math/src/assembly.ts`, `assembly.test.ts`, `geometry/lines.ts`, `geometry/lines.test.ts`; package barrel export.
- New `packages/calculator-core/src/assembly.ts`, `assembly.test.ts`; registry/export and historical registry test update.
- New `packages/drawing-engine/src/{interaction,lanes}.ts` and tests; drawing types and inverse fit extension.
- New `apps/web/src/assembly/{Page,Canvas,Inputs,Summary}.tsx`, `store.ts`, `translations.ts`, `styles.css`, Page/store tests; `App.tsx` entry, historical App test import and i18n bundle registration.
- No unfinished syntax or placeholder implementation. Dependencies installed using the existing frozen lockfile; no new libraries or lockfile changes. No commit or push performed.
- Preserved user changes: deletion/move of `docs/RAFTER_WORKBENCH_GEOMETRY.md` to `ChatPromptsHistoryIgnore/`, and untracked V3 architecture, research roadmap and iteration prompt. Do not revert these.

**Validation already run:**

- Before implementation: 103 baseline tests and web/API build passed. First typecheck attempt raced incomplete dependency installation (`tsc` unavailable); after installation, typecheck passed. This was resolved, not a remaining code error.
- Final `npx pnpm@10.15.1 typecheck` — PASS.
- Final `npx pnpm@10.15.1 test` — PASS: **151 tests across 21 files**, including 48 new tests across 7 files.
- Final `npx pnpm@10.15.1 lint` — PASS.
- Final `npx pnpm@10.15.1 build` — PASS: React/Vite and Express/tsup.
- Changed source/docs formatted with Prettier. `git diff --check` passed (only local Git LF/CRLF informational warnings).
- New coverage: hand-calculated two-support reference, independent wall notch, removed polygon area, semantic datum identity, three-support generalization/order, joint control conversion, invalid placement/IDs/cuts, supported endpoints, old V2 numerical regression at 1/30/35/80 degrees, zero ridge/overhang, purity, inverse screen transforms, snapping and lane collisions.
- Annotation fit tests confirm label bounds at 336px and 820px for assembly/joint detail at 1/35/80 degrees. These test renderer geometry, not actual browser CSS/font rendering.
- Ten new jsdom UI tests verify same-model Quick/Builder, purlin addition/removal, exact position, units, invalid-state recovery, selection, contextual/enlarged detail, keyboard movement, dimensions/toolbox/PL/EN and simulated mouse/touch drag/commit/cancellation.
- XAMPP serves `http://localhost/RoofCalc/apps/web/dist/#/calculators/common-rafter`; the root web build is the deployed local artifact.
- Requested Browser `iab` returned unavailable; subsequent browser inventory was empty. No browser screenshot, real layout or native touch verification is claimed.

**Known limitations / remaining QA:**

- Desktop and 360px Browser review now covers the V4 Quick Calc and Builder skeleton. Native touch hardware remains unverified; simulated Pointer Events cover touch gestures.
- One optional purlin in the UI. Solver can resolve multiple separated supports but no multi-purlin editor is exposed in this iteration.
- Purlin has a horizontal contact plane and automatic elevation. Arbitrary fixed elevations/rotated supports are out of scope.
- Wall/purlin height is real geometry. Ridge extension below the joint remains schematic and explicitly marked `visualExtentOnly`.
- Semantic dimension lanes are an initial layout engine, not a general CAD solver. Compact views keep primary annotations and expose full details through the plan/contextual view.
- No structural verification, allowances/kerf, persistence, accounts, payments, PDF, hip/valley members, CAD or 3D. Refresh discards the working session.

**NEXT ACTION:**

> Perform user-acceptance browser QA of Iteration 006 on desktop and at 360 px: compare rectangular and square/pyramid hip skeletons, select all four physical H1 instances, open the coordinated H1 sheet, edit pitch/span/building length/ridge thickness, verify Undo/Redo plus pan/zoom/Fit, and check overflow/readability. Fix only evidenced V6 issues. Do not begin Iteration 007 without a new explicit prompt.

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
