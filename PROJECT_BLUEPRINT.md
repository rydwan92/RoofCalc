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

> V30 started 2026-09-14 from clean `main` at `5ac5186` (`029 complete`). The
> user-approved V30 Document / Export Engine prompt supersedes V29's suggested
> connection-research next action. Baseline `pnpm verify` PASS: 647 tests in 67
> files, typecheck/lint/format/build PASS. Baseline `pnpm e2e` is running.
> Definition of Ready: `docs/ARCHITECTURE_V30_DOCUMENT_EXPORT_ENGINE.md`.

**Iteration:** `030 - Document / Export Engine`

**Status:** `IN PROGRESS`

**Current work:** Implement the pure document contract, web composition adapter,
project-level export configuration, print preview and offline A4 delivery. No
canonical/schema/geometry change; preserve truthful V27/V28 bases.

**NEXT ACTION:** Finish baseline E2E, implement and test V30, inspect desktop,
mobile and print output, then record final validation here. Do not commit/push
or begin V31.

---

> V29 began from clean `main` at `a37e98be7ababd7a10897a7d076173dd4b3f6486`
> (`028`), then its initial implementation became `6030930` (`029 begin`). The
> user-approved V29 closeout was audited from that clean HEAD on 2026-09-14.
> Baseline at the start of V29: `pnpm verify` PASS with 639 tests in 66 files.
> Closeout preflight: `pnpm verify` PASS with 646 tests in 67 files and
> `pnpm e2e` PASS with 18 browser scenarios. The Definition of Ready and final
> presentation boundaries are in `docs/ARCHITECTURE_V29_GUIDED_WORKFLOW_UX.md`.

**Iteration:** `029 — Guided project workflow and professional workbench UX`

**Status:** `COMPLETE — FULL VERIFY, 18/18 E2E AND FOUR VIEWPORTS REVIEWED`

**Completed:** The initial V29 implementation introduced six derived,
non-blocking stages, one next action, a compact project strip, a derived summary
inside Materials, three-level schedule disclosure, contextual K1 access and
desktop/mobile routes. Closeout corrected status honesty: stage counts retain
visible status text; opening surface issues and real layer warnings are included;
the next action routes layer warnings to layer tools; covering assignment alone
never reads as complete in summary or schedule; invalid opening geometry
withholds the net area. The opening Toolbox now explains its empty state, Quick
copy identifies the single-rafter task, and the strip stays one row at 1024 px.
No solver, quantity, procurement, schema or ProjectDocument changes were made.

**Changed / WIP files:** `apps/web/src/assembly/{project-workflow.ts,ProjectWorkflow.tsx,Page.tsx,MaterialSchedule.tsx,Toolbox.tsx,translations.ts,styles.css}`,
focused workflow/Page tests, `docs/ARCHITECTURE_V29_GUIDED_WORKFLOW_UX.md`
and this checkpoint. No unfinished source edit remains.

**Assumptions:** Completion is workflow readiness, not structural approval.
Absent openings and layers are optional. K1 can be offered only when V28's
physical blank requirement resolves; stock scenarios and plans stay local to
the planner session.

**Validation / visual and mobile QA:** Final `pnpm verify` PASS — typecheck,
lint, format, **647 tests in 67 files**, web/API build. Final `pnpm e2e` PASS —
**18/18** desktop/mobile scenarios, including Creator → covering → summary →
K1. Browser review at **1440×900, 1024×768, 390×844 and 360×800** covered the
gable drawing, summary, grouped schedule, mobile dock and K1 sheet; existing
E2E also covered hip K1-only access, covering quantities and mobile numeric
input, while unit/UI tests covered opening workflow. No page-level horizontal
overflow. Final web main chunk:
**562.79 / 162.97 kB gzip**; CSS: **130.45 / 24.48 kB gzip**; lazy
MaterialSchedule: **15.73 / 3.90 kB gzip**; lazy K1CuttingPlan:
**24.13 / 7.02 kB gzip**. The Vite >500 kB advisory remains. `git diff --check`
PASS.

**Known limitations:** Workflow availability is not a structural safety claim.
No cutting plan is persisted; after reopening a project, K1 remains ready for
planning rather than marked as previously calculated. Covering and layer
warnings direct users to existing editors; they do not invent missing technical
choices. The 390/360 px strip scrolls internally to show all six stages.

**NEXT ACTION / recommended V30:** Define an explicit, researched K1 ridge
connection intent and fabrication allowance contract, with hand-checked vectors
and schema/history analysis, before any further procurement member family.
Do not start V30 automatically; do not commit or push this closeout without a
separate user request.

---

> V28 started on 2026-09-14 from clean `main` at
> `01289fb8e19348c9718ca8778b9ac9777fabf067`, as required by the attached
> V28 prompt. Baseline `pnpm verify` passed typecheck and lint, then stopped at
> Prettier on 18 existing files. Baseline `pnpm e2e` could not start any of its
> 12 tests because the Playwright Chromium executable was absent; browser
> installation later succeeded. An initial run against the stale pre-build
> preview timed out; the rebuilt app passed the final browser suite. No user
> changes were present to discard.

**Iteration:** `028 — K1 fabrication blank → cutting plan`

**Status:** `COMPLETE — FULL VERIFY AND 16/16 REAL-BROWSER TESTS PASS`

**Completed:** `roof-math` now proves a physical rectangular K1 blank by
containing all currently modeled eave/ridge cuts, notches, finished-profile
vertices and datums, cross-checking the old stock envelope without renaming its
length. The pure application adapter intersects whole K1 schedule instances
with the resolved prototype and passes one traceable `RequiredPiece` per
physical rafter to unchanged `procurement-core`. The stock class comes from the
actual width/depth pair and stays opaque to procurement. H1, J1 and interrupted
opening rafters cannot enter this pilot.

**UX:** Zestawienie → Drewno → K1 now exposes one cutting CTA only when the
blank resolves. A focused desktop dialog / mobile sheet takes user commercial
lengths, optional finite availability, separate advanced kerf/end trim/remnant
settings and the three existing objectives. It shows a grouped material list,
copyable plain text, complete/partial stage states, assignment and loss figures,
actionable unassigned reasons and expandable proportional stock layouts. Long
timber-family length rows collapse by default with exact details retained.

**Files changed / WIP:** `packages/roof-math/src/k1-fabrication-blank*`,
`apps/web/src/assembly/k1-cutting-adapter*`, `K1CuttingPlan.tsx`,
`MaterialSchedule.tsx`, `Page.tsx`, translations/styles, package/lock,
focused UI/domain/E2E tests, architecture/acceptance docs and this checkpoint.
No incomplete source file remains. Baseline Prettier normalization leaves 18
unrelated files marked modified in `git status` on this Windows checkout but
with **no content diff** in `git diff`.

**Assumptions:** Commercial stock, cutting settings and the derived plan are
session-local. No ProjectDocument migration or structural verification.

**Validation / visual and mobile QA:** `pnpm verify` PASS — typecheck, lint,
Prettier, **639 tests in 66 files**, web/API build. `pnpm e2e` PASS — **16/16**
desktop/mobile cases. Browser screenshots visually reviewed at **1440×900,
1024×768, 390×844 and 360×800**; gable cutting and hip K1-only entry passed,
with no horizontal overflow. Final web output: main **547.89 / 159.25 kB
gzip** (V27 542.66 / 155.48), CSS **126.62 / 23.90 kB gzip** (V27
121.47 / 23.00), MaterialSchedule **17.13 / 4.71 kB gzip** (V27
12.93 / 3.29), lazy K1CuttingPlan **24.13 / 7.01 kB gzip**. The existing
Vite >500 kB main-chunk advisory remains. `git diff --check` PASS.

**Known limitations:** Only the modeled centered vertical ridge-board butt K1
cut is resolved; no structural approval or machining allowance. H1, J1,
opening-framing members, covering and membrane have no proven blank. Stock
options are user-entered, session-local and have no supplier, price or order
confirmation. Non-reusable waste and kerf follow V26 procurement semantics.

**NEXT ACTION / recommended V29:** Review the V28 pilot with carpenters, then
design an explicit ridge-connection intent and fabrication allowance contract
before extending procurement to any further connection/member family. Do not
start V29 from this checkpoint without a new approved iteration.

---

> V27 started on 2026-09-14 from `18ae1281b00c24f6fe797ba1051ab9f73c4a5eb8`
> (`main`, matching the requested baseline). The tracked tree was clean; the only
> pre-existing item was untracked `.claude/launch.json`, which is preserved
> untouched. Baseline typecheck and lint passed; `pnpm verify` stopped only
> because Prettier discovered that local untracked JSON. Chromium was absent,
> then installed with the repository command. The first 10-test E2E attempt with
> the default 10 local workers timed out during `page.goto`; this is recorded as
> the actual baseline and will be rechecked with the final harness. V27 is
> authorized by the attached prompt and supersedes the old V26 next action.

**Iteration:** `027 — Result Semantics, Professional Takeoff UX, Quantity-Basis Hardening and Procurement Readiness`

**Status:** `COMPLETE — FULL AUTOMATED GATE AND REQUIRED BROWSER MATRIX PASS`

**Completed:** `covering-core` and `quantity-core` now use discriminated,
renderer-independent quantity semantics instead of covering `piece` plus a
free-form basis. Roof tile/fixed sheet resolve to
`effective-coverage-position` / `coverage-position`; standing seam and
cut-to-length resolve to `geometric-panel-run` / `geometric-run`. Layout kind
and `geometric-only` readiness are explicit, declared consumption is a named
reference, and heterogeneous positions/runs are never added into one total.
Timber retains `axis-geometric` or `resolved-visible`, membrane is explicitly
`net-geometric`, and `limited` remains a result status rather than a basis.
All pre-V27 numerical geometry is unchanged and pinned by exact regression
expectations for the four covering strategies, membrane and timber.

**UX:** Pokrycia and Zestawienie use one reusable native-details basis pattern
and a contextual `Geometria → Wykonanie → Rozkrój → Zakup` disclosure. Copy in
Polish and English now says coverage positions or geometric runs, explains what
is absent, labels manufacturer consumption as a reference rather than an
order, and changes Quick's commercial-sounding “minimal material” to “minimum
geometric length”. Schedule cutting is pending; covering cutting is unavailable
without physical elements; purchase is pending everywhere. The 1024 px
progression uses two columns, and the mobile dock remains above workspace
surfaces. No result relies on colour alone and disclosure is keyboard/touch
operable.

**Boundaries and persistence:** no project schema or canonical state changed;
existing saved projects open unchanged. `procurement-core` remains isolated and
unwired. No overlap, allowance, fabricated blank, stock, order, price, cost,
waste optimizer, connection geometry, ProjectDocument V2 or compound-roof work
was added. The pre-existing untracked `.claude/launch.json` is untouched;
`.prettierignore` merely prevents the repository gate from formatting that
local tool state.

**Validation:** `pnpm verify` PASS — typecheck, ESLint, Prettier, **631 tests in
64 files**, web/API production build. `pnpm e2e` PASS — **12/12** tests on
desktop 1440×900 and responsive touch 390×844, including the new semantic
schedule flow and horizontal-overflow check. Chrome browser QA PASS on gable
and hip roofs; tile, fixed modular sheet, standing seam and cut-to-length; and
Material Schedule at **1440×900, 1024×768, 390×844 and 360×800**, each with zero
horizontal overflow. Final web output: main **542.66 / 155.48 kB gzip**, CSS
**121.47 / 23.00 kB gzip**, ResultBasis **2.05 / 0.66 kB gzip**, Material
Schedule **12.93 / 3.29 kB gzip**, Covering Workspace **40.99 / 8.09 kB gzip**.
The existing Vite >500 kB main-chunk advisory remains.

**Known truthful limitations:** timber rows still describe axes or resolved
visible lengths, not required fabrication blanks; membrane remains net roof
area without laps/upstands/rolls; covering positions/runs remain geometry,
without installation segmentation, accessories, waste or purchase units.

**NEXT ACTION / recommended V28:** one narrow `K1 Fabrication Blank → Cutting
Plan` vertical slice. Add an upstream K1 execution resolver that can prove a
physical required blank (including only explicitly modelled end treatments),
adapt those resolved blanks to `procurement-core` at the application boundary,
accept explicit stock lengths/kerf/end trim, and expose Wykonanie/Rozkrój. Keep
other timber families, covering, membrane, suppliers, prices and cost out until
their own researched execution resolvers exist.

---

> V26-INTEGRATION started on 2026-09-14 from clean commit `d59ee17710e52e008b4fd9ffa17ff714f810c7b9` (`V26D`) on the new branch `integration/v26-hardening`, created at that commit because the branch did not previously exist on either the local machine or the remote. The working tree was verified clean before any edit: the git index matched the V26D tree exactly (278 entries, zero staged differences) and 273 tracked files were compared by size against the index with zero mismatches, no untracked files and no mtime newer than the last git write. No user work was discarded and no reset, rebase or merge was performed.

**Iteration:** `026-INTEGRATION — Final integration and hardening pass: reconstructed engineering hardening on top of V26A–V26D`

**Status:** `COMPLETE IN SOURCE — FULL AUTOMATED GATE PASS; REAL-BROWSER SMOKE PASS ON 1440×900 AND 390×844`

**Scope:** reconstruct the prior architecture-hardening work — which existed only as a report from another machine and was never committed — independently re-verified against current V26 code, plus the engineering system (executable architecture checks, reference corpus, verify gate, CI, browser QA) and the current-state documentation set. No new product functionality. No Cost Engine, no prices, no covering-overlap correction, no membrane gross resolver, no timber connection redesign, no ProjectDocument V2, no compound roofs, and no procurement↔UI/quantity integration.

**Baseline measured before any change:** `pnpm install --frozen-lockfile` OK; typecheck PASS; ESLint PASS; **573 tests across 61 files PASS**; web/API build PASS with web main **538.25 / 154.12 kB gzip**; `git diff --check` clean. `pnpm format:check` **FAILED on 33 files**, and the exact cause was recorded before anything was normalized: zero committed blobs contain CRLF, and the failure count is identical with `--end-of-line auto`, so none of it was a line-ending problem. 25 of the 33 were markdown documents that `.prettierignore` fails to exclude because it contains the pattern `.md`, which matches only a file literally named `.md`; the remaining 8 were genuinely unformatted TypeScript, 6 of them newly added by V26 procurement work.

**Prior-audit themes re-verified against current code — all eight still present:** the `.prettierignore` `.md` defect and a missing `.gitattributes`; three semantic-ID defects in domain code; no architecture enforcement; the mobile exact-input defect reproducible unchanged; no browser QA; the V3–V9 reading list still mandatory in `AGENTS.md`; no architecture index, ADRs or schema registry; no CI. Each was fixed only after confirming it still existed.

**Formatting and line-ending policy:** `.prettierignore` now excludes `*.md` / `**/*.md` as originally intended, which removed 25 markdown files from the check without touching them. Only the 9 genuinely unformatted source files were reformatted — **no repository-wide churn**. A new `.gitattributes` sets `* text=auto eol=lf`: because every blob is already LF this adds zero commit churn, and it stops a Windows checkout producing the mixed working tree observed here (files written by tooling were LF, files written by git with `core.autocrlf` were CRLF), which is what made `format:check` fail on files nobody had edited.

**Semantic-ID fixes (ADR-007), with no serialization change:** `SkeletonMember3D` gained optional `sourceMemberId`, `sourceFeatureId` and `openingRole` — a derived runtime type, not a persisted schema, so every existing `RoofProjectDocumentV1` archive still parses unchanged. `roof-math/counter-battens.ts` no longer derives a member side from a roof-plane ID suffix with a silent `right` fallback (it now calls the new template-owned `roofPlaneSide()` and skips unknown planes) and no longer regroups rafter segments with a regular expression over member IDs. `quantity-core` no longer reads opening role from `member.id.endsWith(':upper')` nor provenance from a regex; the remaining `O<n>`/`P<n>` display codes are isolated in `schedule-family-code.ts` and recorded as a V2 migration item. `MemberInstanceContext.roofPlaneId` held a plane *role* word, not an ID, and is renamed `roofPlaneRole`. Four web components built translation keys by slicing `roof-plane:` out of an ID — an unknown plane would have rendered a raw key — and now resolve through one `roofPlaneShortLabelKey` boundary with a translated generic fallback; two hardcoded plane arrays now call `roofPlaneIds(template)`. Regression coverage: fixture 04 asserts the provenance fields, and `tools/architecture/opaque-ids.test.ts` rejects reintroduction.

**V26 procurement verified, not modified:** the V26D public contract is intact — `requiredBlankLengthMm` (never an ambiguous `lengthMm`), opaque `stockClassId`, indivisible blanks, kerf, stock end trim, reusable remnants, finite availability, the three objectives, bounded per-class search with deterministic heuristic fallback, honest `heuristic` / `proven-within-search-space` / `search-budget-exhausted` optimality, internal modularization behind a contract-only barrel, and its own golden fixtures. `procurement-core` depends on **no** workspace package, which is now asserted. Its six unformatted files were reformatted by Prettier only; no logic was touched. No quantity or UI integration was added.

**Engineering system added:** `tools/architecture/` makes the boundaries executable inside the normal test run — dependency direction and browser-global freedom for every pure package including `procurement-core`, no package importing an app, no pricing identifier in geometry/quantity/procurement/catalogue-technical code or the database schema, and the full opaque-ID rule set. The rules are written to avoid false positives: plural set membership (`planeIds.includes(id)`) stays legal, a local variable named `window` holding a roof window does not trip the browser-global check, and an ID *minter* reading its own namespace to allocate the next ordinal (`addPurlin`) is allowlisted as generation rather than inference. `fixtures/projects/` holds nine real `ProjectRecordV1` archives with aggregate-only invariants; procurement is deliberately **not** duplicated there. `pnpm verify` runs typecheck → lint → format:check → tests → build in one deterministic order, with `test:architecture`, `test:fixtures` and the individual commands kept for debugging.

**CI and browser QA:** `.github/workflows/ci.yml` runs `pnpm install --frozen-lockfile && pnpm verify` on push and pull request with **no database, no `DATABASE_URL` and no manufacturer API**, then `git diff --check` and a tracked-changes check. A second job runs Playwright on Chromium and uploads its report on failure. A third, MySQL/MariaDB catalogue job exists but is `workflow_dispatch` only and imports the DEMO fixture as a dry run. `pnpm e2e` covers desktop 1440×900 and mobile 390×844: Builder loads and fits with no horizontal overflow and no leaked translation key, all six task views open with no runtime error, exact roof geometry is reachable on mobile, semantic tokens resolve with no large SVG falling back to the initial black fill, and a project autosaves and reloads with every `/api/**` request blocked.

**Mobile exact-input defect fixed:** choosing the roof from the mobile Toolbox closed the sheet and led nowhere, because the roof is the default selection and is excluded from the selection peek, so span, pitch and overhang had **no exact numeric input at 390×844** — a violation of a non-negotiable rule. Selecting the roof on mobile now opens the Inspector sheet directly, covered by a new JSDOM regression and by E2E scenario B on both viewports.

**UI terminology:** the covering counters read `Arkusze w układzie` / `Pełne arkusze` / `Docinane arkusze`, naming a purchasable product for figures that are coverage positions in a resolved layout. The tile equivalents were already neutral (`Pozycje` / `Pełne` / `Docinane`), so the sheet labels were brought into line as `Pozycje krycia` / `Pozycje pełne` / `Pozycje docinane` (EN `Coverage positions` / `Full positions` / `Cut positions`). No other copy was changed, no execution result was invented, and the existing Material Schedule boundary sentence — geometric positions and runs, not a quote or order quantity — is unchanged.

**Other fixes:** the history helper evaluated a double `JSON.stringify` over the whole project document *before* short-circuiting on an open gesture transaction, so it ran on every drag frame; the operands are now cheap-first. Catalogue search passed the user term straight into a `LIKE` pattern, so `%` and `_` acted as wildcards and disagreed with the in-memory repository's literal substring match; metacharacters are now escaped and unit-tested. A new API test proves all four catalogue routes answer `503 catalog-unavailable` without `DATABASE_URL`.

**Documentation:** new `docs/ARCHITECTURE_INDEX.md` describing the current post-V26 system and the design → fabrication → requirement → quantity → procurement → future-cost pipeline, stating explicitly that `procurement-core` infers no installation or fabrication rules, and linking the V26C execution-semantics research; new `docs/adr/` with ten accepted ADRs including fabrication geometry upstream of procurement and `RequiredPiece` as a required physical fabrication blank; new `docs/SCHEMA_REGISTRY.md` covering all five persisted schemas plus the procurement contract, explicitly marked as a pure runtime/domain API and **not** ProjectDocument persistence; new `docs/ACCEPTANCE_SCENARIOS.md` with twelve flows including the procurement golden scenario and `COMPOUND-001` marked PLANNED; new `docs/UX_DESIGN_CONTRACT.md`. `AGENTS.md` drops the mandatory V3–V25 reading list, adds a 14-point Definition of Ready covering procurement and the future cost layer, and uses `pnpm verify` as preflight and definition of done. The V26C research documents are preserved unchanged and are now linked from the index. Nothing was deleted.

**Validation:** `pnpm verify` PASS end to end — typecheck PASS, ESLint PASS with zero warnings, `prettier --check` PASS across the repository for the first time, **629 tests across 64 files PASS** (baseline 573 across 61), web and API build PASS, `git diff --check` clean. `pnpm e2e` PASS: 10 tests, both viewports. Web bundle after: main **539.02 / 154.44 kB gzip**, CSS **118.11 / 22.51 kB**, covering-core **88.10 / 20.48 kB**, Covering Workspace **40.66 / 7.98 kB**, Product Picker **14.23 / 4.63 kB**; before: main **538.25 / 154.12 kB gzip**. The delta is **+0.77 kB raw / +0.32 kB gzip**, from the plane-label presentation helper. API output unchanged. The Vite >500 kB main-chunk advisory is unchanged.

**Not validated, stated plainly:** all gates ran in a Linux container on Node 22 against a faithful clone of this branch, not on the Windows machine — the desktop workspace shell was unavailable there. No MySQL instance was reachable, so the Drizzle repository was exercised only through its pure helpers and the in-memory implementation; no catalogue data was read or mutated and the optional CI database job has never been executed. Physical touch gestures, iOS Safari, real-hardware safe-area insets, the 1024/768/430/360 widths and screen-reader passes remain unverified.

**Deferred risks, recorded not fixed:** `AssemblyPage` subscribes to the whole Zustand store with no selector, so every transient change re-renders a 1531-line component; the solvers are protected by `useMemo`, so this is render cost, not recompute cost, and it needs measurement before a refactor. The main chunk stays above 500 kB, concentrated in `Page`/`store`/`Inspector`/`Summary`/`translations`; splitting `translations.ts` per language is the obvious next move. `quantity-core` display codes `O<n>`/`P<n>` still read generated IDs and will collide across structures in V2. `WorkbenchContextBar` still parses the app's own selection-ID vocabulary for labels — presentation, but a typed selection descriptor would be cleaner. The four direct `+ Add covering` actions remain in the assignment strip pending live interaction review. Counter-battens on hip roofs remain explicitly unsupported. The catalogue API has no rate limiting and no server-side logging. No adapter exists from the Material Schedule to `RequiredPiece[]`, by design.

**NEXT ACTION:** review this branch and promote `integration/v26-hardening` to `main` manually if satisfied; it was pushed but never merged and `main` is untouched at `adaef4f`. Then choose exactly one next iteration: (A) the quantity → procurement adapter, which is the smallest step that makes V26 visible to a user and whose allowance resolution is now governed by ADR-009/ADR-010; (B) the Price Lists / Cost Engine foundation, now that the geometry↔quantity↔procurement↔commerce boundary is executable; or (C) the dedicated ProjectDocument V2 compound-roof foundation, starting from the research list in `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` and ADR-008. Do not start any of them automatically. Run `pnpm e2e:install` once and `pnpm e2e` locally first, to confirm the browser harness works on the Windows checkout.

> V26A started on 2026-09-14 from clean commit `adaef4f8481bbedf8e37fa177b1ad50e81994292` (`025`) on `feature/v26-procurement-core`, under the attached isolated Timber Procurement Core contract. The branch/base matched exactly and the worktree was clean. Initial typecheck exposed an incomplete local dependency installation; `npx pnpm@10.15.1 install --frozen-lockfile` restored the lockfile-defined workspace without source changes. Baseline typecheck PASS; 537 tests across 59 files PASS with `--maxWorkers=2`; web/API build PASS with the known Vite >500 kB main-chunk advisory. Next action: create only the pure `packages/procurement-core` kernel, its tests and `docs/ARCHITECTURE_V26_TIMBER_PROCUREMENT_CORE.md`, then run the full definition-of-done suite. No UI, ProjectDocument, catalogue, price or Cost Engine integration.

**Iteration:** `026A — Timber Procurement Core Foundation`

**Status:** `COMPLETE IN SOURCE — FULL AUTOMATED VALIDATION PASS`

**Completed work:** Added pure `@cieslacalc/procurement-core` with serializable required-piece, opaque stock-class, commercial stock-option, cutting-settings, plan/result, unassigned-reason, remnant, summary and grouped-stock-requirement contracts. Required pieces remain indivisible and always belong to one stock item. Compatibility is exact `stockClassId` equality only; undefined availability is unlimited while an explicit nonnegative integer is enforced. The exact cutting convention removes `endTrimMm` from each end and charges one explicit kerf only between adjacent assigned pieces. Stock usages expose original/usable/used lengths, cut coordinates, kerf, trim loss, remaining length and `none`/`waste`/`reusable-remnant` classification. Summary output separates all requested length from assigned length, physical opened stock, kerf, trims, waste, reusable remnants and utilization. Structured unassigned reasons cover no compatible class, piece longer than every compatible usable option and exhausted availability. `aggregateStockRequirements()` groups by class, option and exact commercial length without prices.

The solver is the deterministic `best-fit-decreasing-v1` heuristic. It processes exact lengths descending, consumes the best compatible open remainder first, uses shortest immediate fit for `minimum-waste`, and uses bounded one-stock greedy look-ahead for `minimum-stock-count`. Stable class/length/ID tie-breaks and deterministic stock-instance IDs make identical inputs repeatable. It is explicitly not presented as a mathematically proven global optimum. Added `docs/ARCHITECTURE_V26_TIMBER_PROCUREMENT_CORE.md` covering quantity/procurement/cost layering, exact semantics, catalogue adapter boundary, multi-structure aggregation compatibility and non-goals.

**Changed files / WIP:** New `packages/procurement-core/package.json`, `packages/procurement-core/src/index.ts` and `packages/procurement-core/src/index.test.ts`; new V26A architecture document; additive empty workspace importer in `pnpm-lock.yaml`; this checkpoint only in `PROJECT_BLUEPRINT.md`. No unfinished source unit. No UI, quantity-core, timber-model, ProjectDocument, catalogue, API, database, pricing, architecture-index, AGENTS, CI/E2E, semantic-ID or Inspector file was modified. No commit or push was requested or performed.

**Assumptions and limitations:** End trim is per end, so usable length is `stock - 2 × endTrimMm`. Kerf exists only between adjacent planned pieces; one isolated piece has no inter-piece kerf. End trims plus short positive remainders form `wasteLengthMm`; kerf remains a separate loss and reusable remnants remain separate. A `1e-9 mm` epsilon only normalizes floating-point boundary subtraction. The V1 heuristic keeps one trailing remainder per stock item and reuses it within the same plan, but performs no exhaustive search, warehouse carry-over, splice/join, 2D nesting, structural decision, supplier choice or commercial valuation.

**Tests and validation:** 22 new pure tests cover one piece/stock, the 5600 + 1300 + 4 mm example, kerf blocking exact fit, two-end trim, 6000/7000/8000/12000 alternatives, determinism/non-mutation, compatible reuse, incompatible classes, reused remnant accounting, short/long remnant classification, overlong and missing-class reasons, no joining two remnants, finite/positive and duplicate-ID validation, explicit availability, aggregate stock requirements, summary/utilization, both objectives and a 24-piece K1/J1 fixture. Final repository-pinned typecheck PASS; **559 tests across 60 files PASS** with `--maxWorkers=2`; ESLint PASS; web/API production build PASS; new-file Prettier check PASS; `git diff --check` PASS with only local LF/CRLF informational warnings. The web build is unchanged at main **538.25 / 154.12 kB gzip** and retains the known Vite >500 kB advisory. Visual/mobile QA is not applicable because V26A adds no UI or renderer.

**Merge-conflict outlook:** The new package and uniquely named V26A document are isolated from the architecture-hardening file list. The additive `pnpm-lock.yaml` workspace importer may require a trivial merge if the other branch also changes the lockfile. This checkpoint is the other likely textual conflict if the other machine updates `PROJECT_BLUEPRINT.md`; retain both factual checkpoint records when merging. No explicitly forbidden overlap file was touched.

**NEXT ACTION:** Review the V26A pure API and heuristic contract, then commit/merge the isolated branch when approved. A future application adapter may map accepted physical quantity rows and external stock-class/catalogue facts into `RequiredPiece[]` and `StockOption[]`, but do not begin Material Schedule integration, ProjectDocument persistence, catalogue timber products, UI or Cost Engine/pricing without a separate explicit iteration.

---

**Previous checkpoint — Iteration 025:**

**Iteration:** `025 — Professional Covering Workbench, cut-to-length metal and future compound-roof scene audit`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; LIVE BROWSER/DEVICE QA UNAVAILABLE`

**Completed work:** V24 recovery confirmed the catalogue core, optional MySQL/Drizzle platform, five-table migration, immutable canonical importer, read API, Product Picker, exact technical snapshot and V23 local autosave path at expected clean commit `434eb01`. Covering now separates whole-assignment counts from selected-plane facts, emphasizes the primary result, groups exact Inspector editing, shows readable source/revision/variant labels and keeps geometric quantity boundaries in the result/schedule. Changing a catalogue-derived technical value detaches its exact catalogue reference in the same edit. The picker shows the current family and human-facing metal format/length range, supports cursor pagination beyond the first 30 results, and closes the mobile Inspector before opening its sheet. Auto/Detailed/Simplified drawing level is transient and has zero project history; simplified lines clip to the selected roof plane.

The new pure `cut-to-length-sheet-layout` adapter reuses the V22 variable-panel kernel for explicit opaque plane geometry, coherent effective-width U grid, roof/opening clipping and connected physical runs. It exposes stable run IDs, geometric length, exact length groups, per-plane/assignment counts and structured min/max/segmentation issues. Hip diagonal roof-edge cuts count as edge-cut strips even at full nominal width. It never invents order/manufacturing length or transverse joints. A manual metal assignment can choose cut-to-length format; a V24 catalogue revision with the same length model routes automatically to the identical resolver and quantity bridge. The DEMO fixture now includes one synthetic cut-to-length family/revision/variant. End-to-end tests prove canonical import, idempotency, immutable conflict/new revision, read API, exact selection snapshot, manual parity and offline reopen geometry. The existing one-primary-covering-per-plane resolver remains the sole ownership gate. SQL schema/migrations and prices are unchanged.

Created `docs/ARCHITECTURE_V25_CUT_TO_LENGTH_AND_WORKBENCH.md`, `docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md` and the V25 prompt document; updated official-source domain research. The future-scene audit explicitly records V1's one `project.roof`, candidate structure-local transforms, identity/namespace choices, a separate connection graph, structure/project quantity scope, UI/persistence migration and unresolved research. No multi-roof model or connection solver was implemented.

**Changed files / WIP:** covering-core schema/new resolver/tests; catalog-core preview/snapshot/tests; API DEMO fixture and integrated path test; web Page, Covering Workspace/Inspector, picker, schedule, i18n/styles and desktop/mobile tests; domain/architecture/prompt docs and this checkpoint. No unfinished source unit. The worktree is intentionally uncommitted; no push was requested.

**Assumptions and limitations:** `geometricLengthMm` is the connected component's V extent. The technical schema does not yet encode manufacturer-specific start/end allowances, module offset or manufacturing increment, so `orderLengthMm` remains absent. Overlong runs report `segmentation-required` with no joint location/overlap/support detail. The existing Add Covering direct actions remain visible pending live interaction review; the picker/category context and manual metal format now scale without showing solver IDs. A DEMO product is synthetic test data, not manufacturer authority. ProjectDocument V1, quantity and workbench are still single-roof; V2 is documentation only. No waste, offcut reuse, purchase optimization, accessories or prices.

**Validation:** direct `pnpm` is unavailable in this PowerShell environment, so checks used pinned `npx pnpm@10.15.1`. Final typecheck PASS; **537 tests across 59 files PASS** with `--maxWorkers=2`; ESLint PASS; changed-file Prettier PASS; web/API build PASS; `git diff --check` PASS. Final web main **538.25 / 154.12 kB gzip**, CSS **118.11 / 22.51 kB**, Product Picker **14.23 / 4.63 kB**, Covering Workspace **41.27 / 8.12 kB**, covering-core **88.10 / 20.48 kB**. API server **5.85 kB**, import CLI **5.69 kB**, shared domain chunk **30.96 kB**. Vite retains the known main-chunk >500 kB advisory. No new migration was generated. No `DATABASE_URL` or project `.env` is configured in this checkout, so no live MariaDB smoke/import was attempted; the importer/API path was tested in memory without modifying user data. The unconstrained baseline run had scheduling-sensitive `Page` failures; its 52 tests passed alone, and the final constrained full suite passed.

**Visual/mobile QA:** requested in-app Browser initialization returned `Browser is not available: iab`, and its inventory was empty. No 1440/1024/768/430/390/360 viewport, visual-overflow, hardware touch or real DB UI acceptance is claimed. Targeted JSDOM tests cover desktop Covering result/Inspector/source/LOD, mobile one-sheet cut-to-length editing and project history isolation; they are not physical viewport or touch tests. The user-provided text attachment contained the V25 prompt, not the referenced screenshots.

**NEXT ACTION:** Review V25 in the in-app Browser when a session is available, covering the specified desktop/mobile sizes, gable/hip cases, all four covering families, catalogue/manual choice, openings, LOD and autosave. Fix only evidenced V25 issues. After that user review, wait for an explicit choice before starting either a Price Lists/Cost Engine iteration or a dedicated ProjectDocument V2 compound-roof foundation iteration.

> Iteration 025 started on 2026-09-13 from clean commit `434eb01` (`024`) under the attached V25 Covering/cut-to-length/future-scene contract. The V24 catalogue, Drizzle schema, immutable importer, Product Picker, exact snapshot and V23 autosave path were confirmed in source. Preflight: typecheck PASS, lint PASS, build PASS, `git diff --check` PASS; the concurrent full baseline run had 516/520 tests passing with four `Page.test.tsx` failures, while that 52-test file passed when rerun alone, so the baseline failure is scheduling-sensitive. The direct `pnpm` command is unavailable; checks use the pinned `pnpm@10.15.1` via `npx`. The requested in-app Browser reports no available instances, and no viewport QA claim is made. V25 work is in progress; do not revert user work or begin V26.

> Iteration 024 completed in source on 2026-09-13 from clean commit `cc823db` (`023`) under the user-approved Catalog Platform Foundation contract. No commit or push was requested or performed.

**Iteration:** `024 — Catalog Platform Foundation: MySQL/Drizzle, immutable technical revisions, canonical imports and Product Picker`

**Status:** `COMPLETE IN SOURCE — AUTOMATED/REAL-MARIADB VALIDATION PASS; LIVE VIEWPORT QA UNAVAILABLE`

**Completed work:** V23 is truthfully closed below, and its remaining pure-core presentation leakage is removed: `project-core` now emits typed language-neutral import codes and accepts application-provided duplicate/default names, while the web owns Polish copy. New pure `@cieslacalc/catalog-core` owns strict serializable `Manufacturer`, `TechnicalProductFamily`, immutable `TechnicalProductRevision`, `CommercialVariant`, `CatalogImportBatchV1`, read-API contracts and the single mapping into the existing `CoveringProductSelection`. It reuses `CoveringTechnicalSpec` directly, rejects cross-reference/kind/duplicate errors and price fields, and proves that an R1 project snapshot still drives the existing Tile Engine after the catalogue advances to R2.

The backend now has optional MySQL/MariaDB connectivity through `DATABASE_URL`, five Drizzle tables with stable IDs/FKs/indexes/timestamps/active flags, JSON technical specs validated after a MariaDB-compatible decode, a committed generated migration, repository interfaces plus memory/Drizzle implementations, an immutable/idempotent transactional importer with audit rows, and a safe-by-default canonical JSON CLI. The read-only REST surface lists manufacturers, performs bounded deterministic cursor search, and returns validated product/exact-revision detail with stable error codes; no anonymous mutation/import route exists. Without database configuration the local calculator and health endpoint still run while catalogue routes return controlled `catalog-unavailable`.

The Covering task lazy-loads a typed TanStack Query Product Picker. It keeps server state outside Zustand, debounces/cancels search, filters by manufacturer and the requested covering kind, shows compact technical summaries and exact revision/source/variant detail, and has explicit loading/empty/unavailable/manual-fallback states. Desktop uses one focused dialog; mobile reuses one dominant expanded sheet with predictable detail → results → close navigation and touch-sized controls. Applying a product re-fetches and validates the exact revision, then makes one normal canonical covering edit containing only `catalogRef`, a small `displaySnapshot` and immutable `technicalSpecSnapshot`; the existing tile/modular-sheet/standing-seam engines remain unchanged. Manual products remain first-class. Header/Inspector source badges distinguish catalogue and manual input, and V23 autosave/reopen coverage proves the snapshot persists without a catalogue request.

**Changed files / WIP:** new `packages/catalog-core`; backend `apps/api/src/catalog`, `apps/api/src/db`, canonical import CLI and DEMO fixture; root Drizzle config, migration/meta and credential-free `.env.example`; typed/lazy web catalogue client/picker/tests plus Covering integration, query provider/chunk, translations/styles and catalogue autosave regression; `project-core`/web session i18n cleanup; V24 architecture/prompt documents and this checkpoint. There is no unfinished source unit. The worktree is intentionally uncommitted.

**Database/import validation:** on the user's local XAMPP MariaDB 10.4.27, the isolated `cieslacalc` database was recreated from the final generated migration. All five tables, three named foreign keys and Drizzle migration ledger exist. Applying the explicitly DEMO-labelled batch produced 1 manufacturer plus 3 product families, 3 immutable revisions and 3 variants; a subsequent dry-run reported all entities `unchanged` with zero conflicts. The built CLI also completed that dry-run. This is local development data, not a production deployment or authoritative manufacturer catalogue.

**Validation and bundles:** pinned typecheck PASS; **520 tests across 57 files PASS**; ESLint PASS; changed-file Prettier validation PASS; web/API production build PASS; generated-schema check reports no migration changes; `git diff --check` PASS. Production HTTP smoke test reports web 200, health `ok`, three catalogue results covering `roof-tile`, `modular-sheet` and `standing-seam`, and structured 404 for a write attempt. Final web main **536.11 / 153.60 kB gzip**, CSS **116.85 / 22.30 kB**, lazy Product Picker **12.56 / 4.20 kB**, TanStack Query vendor **38.23 / 11.72 kB**, lazy Covering Workspace **35.19 / 7.50 kB**, covering-core **83.57 / 19.94 kB**. API output is server **5.85 kB**, import CLI **5.69 kB**, shared bundled domain chunk **29.60 kB**. Vite retains the known main-chunk >500 kB advisory.

**Assumptions and limitations:** technical revision identity is stricter than spec-only immutability: changing revision code, product reference, provenance or spec under an existing ID conflicts. Manufacturer display metadata and safe commercial-variant fields may update; family manufacturer/kind and variant product ownership may not. Imports are canonical full batches after a future provider adapter; V24 deliberately has no XLSX/XML/CSV/API adapter implementations, auth/admin writes, prices/Cost Engine, automatic revision upgrade or complete catalogue. Search uses an opaque deterministic offset cursor, suitable for the current foundation but not snapshot-consistent under concurrent catalogue mutation. Database rollback remains reviewed forward recovery or backup restore. The in-app Browser runtime exposed no browser instances, so no 1440/1024/768/430/390/360 visual acceptance is claimed; focused JSDOM desktop/mobile picker tests cover source choice, filters/search, loading/empty/error, one-sheet navigation, exact selection and manual fallback.

**NEXT ACTION:** Iteration 025 — cut-to-length metal covering strategy using the V22 variable-panel kernel and V24 catalogue product path, unless user review explicitly prioritizes Price Lists / Cost Engine first. Do not begin V25 automatically.

> Iteration 024 started on 2026-09-13 from clean commit `cc823db` (`023`) under the user-approved Catalog Platform Foundation contract. Baseline audit: `git status`/diff clean; typecheck PASS; current unit/UI/API suite PASS; lint PASS; web/API build PASS; `git diff --check` PASS. The web build reports main **536.23 / 153.56 kB gzip**, lazy Covering Workspace **33.03 / 6.94 kB**, Material Schedule **11.96 / 3.01 kB**, covering-core **83.25 / 19.83 kB**, and API **1.11 kB**, with the known Vite >500 kB main-chunk advisory. The shell has no direct `pnpm` command and its bundled Corepack has stale signing keys; validation uses the repository-pinned `pnpm@10.15.1` through `npx` without changing project files. Next action: clean the remaining project-core presentation leakage, add pure catalog-core contracts, then implement the transactional Drizzle/MySQL repository/import/read-only API and lazy catalogue picker over the existing technical snapshot calculation path. No commit or push.

> Iteration 023 completed in commit `cc823db` (`023`). Source audit confirms the separate versioned `ProjectRecordV1` envelope/repository contract, resilient indexed `LocalProjectRepository`, stable IDs, Builder-only active session, 800 ms transaction-aware autosave, atomic `replaceProjectDocument`, deterministic create/open/rename/duplicate/delete fallback, last-active restore, validated archive/legacy import, export, save states and desktop/mobile project manager. Project name/timestamps remain outside `RoofProjectDocument`; view state and Undo history are neither stored nor exported; Quick remains ephemeral until Builder handoff. Regression coverage includes the pure envelope/helpers, repository corruption/write failures, lifecycle/session/autosave/history isolation and manager UI. The V23 architecture document truthfully records the remaining localStorage transactional limitation and lack of cloud/auth. The one demonstrated closeout defect is presentation-language leakage in pure `project-core`; Iteration 024 explicitly owns that cleanup before catalogue work.

**Iteration:** `023 — Professional local project lifecycle`

**Status:** `COMPLETE IN SOURCE AND COMMITTED — AUTOMATED VALIDATION PASS; PRESENTATION-STRING CLEANUP MOVED TO V24`

**V23 validation at the V24 gate:** typecheck PASS; current full tests PASS; ESLint PASS; web/API build PASS; `git diff --check` PASS. Live browser/device acceptance was not recorded in V23. No V23 functionality is being reimplemented.

> Iteration 023 started on 2026-09-13 from clean `cac4b51` (`V22`), authorized by the attached V23 prompt. Preflight: typecheck PASS, 475-test V22 suite in progress at start, lint PASS, build PASS (main 518.58 kB / 148.17 kB gzip; known Vite >500 kB advisory), `git diff --check` PASS. V22 recovery gate confirmed standing-seam assignment, width modes, panel runs/openings/length limits, quantity rows, compact disclosure and serialization through the existing source/tests. This checkpoint supersedes V22's old NEXT ACTION while V23 is being implemented. Next action: implement pure project envelope/repository contract, atomic store replacement, web local repository/session and manager; then validate and record final status. No commit or push.

> Iteration 022 completed in source on 2026-09-13 from clean `b0a7f10` after the explicit attached V22 contract. Baseline: pinned typecheck PASS, 454 tests in 46 files PASS, lint PASS, web/API build PASS, clean Git status. The V21.1 recovery audit confirmed compact default build-up rows, exact expansion, unchanged quantity-core grouping, conditional Material Inspector, generic Pokrycia title, distinct tile/sheet labels, fitted gable/hip covering drawing tests, responsive assignment strip and mobile-sheet regressions. No evidenced V21.1 source defect required a fix. V21.1 remains complete in source with live visual acceptance unverified because the requested in-app Browser returned `Browser is not available: iab` and browser discovery returned `[]`.

**Iteration:** `022 — Recovery Closeout, Variable-Length Panel Core, Standing Seam Engine and Professional Covering UX`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; LIVE BROWSER/DEVICE QA UNAVAILABLE`

**Completed work:** V22 reverified current official Ruukki, Blachotrapez and Blachy Pruszyński standing-seam technical material and updated `docs/domain/COVERING_PRODUCT_MODEL.md`. The pure covering-core variable-panel kernel uses one canonical-mm U grid per plane, clips convex gable/hip roof polygons, subtracts convex void polygons or rectangular openings, groups connected visible pieces into deterministic contiguous runs, classifies edge widths and reports min/max run-length issues without placing transverse joints. The standing-seam strategy selects an explicit effective-width mode, checks declared pitch, returns whole-assignment/per-plane counts and lengths, and maps overlong runs to `transverse-joint-required`. `quantity-core` keeps physical geometric run count and total length separate, with exact-length groups using numerical tolerance rather than display rounding. Assignment serialization stores only the technical snapshot, selected mode, layout intent and plane IDs; derived runs stay outside ProjectDocument. The existing plane ownership resolver excludes conflicts.

The shared Covering workspace now adds manual standing seam, editable/multiple width modes, compact whole-assignment and selected-plane summaries, technical run polygons, openings and simplified linework for more than 1200 fragments. The Inspector/mobile sheet edits exact values, the generic Pokrycia schedule starts with compact count/total length and expands exact groups. PL/EN labels and semantic styles were extended; Quick Calc, tile and fixed-sheet engines remain unchanged. The user-supplied contract was copied to `docs/PROMPT_ITERATION_022_VARIABLE_PANEL_STANDING_SEAM.md`; the new architecture document records the implementation boundary.

**Changed files / WIP:** new covering-core variable-panel and standing-seam resolver/tests; covering schema/export; quantity source, row and test; web Page, CoveringWorkspace, MaterialSchedule, presentation labels, translations, styles and desktop/mobile/history tests; ProjectDocument regression test; research, prompt, architecture and this checkpoint. No unfinished source unit. No commit or push.

**Assumptions and limitations:** run length is the maximum V extent of one connected visible component; a hip-cut run touching a ridge point may therefore require the full-slope geometric length. Convex roof/void polygons are supported; the current roof-window model supplies rectangles. A partial-width opening can leave a connected notched run, but fabrication/flashing is unresolved. A too-short/too-long run remains a geometric fact with a limitation; no joint location, manufacturing allowance, order quantity, waste, offcut reuse, accessories or price is inferred. Multiple selected widths are supported as modes per assignment, not mixed widths within one plane. The in-app Browser was unavailable, so no 1440/1024/768/430/390/360 px visual, sticky/overflow, black-SVG or physical-touch acceptance is claimed; JSDOM covers the mobile Inspector path and source CSS keeps bounded strips and a compact summary.

**Validation and bundles:** pinned typecheck PASS; **475 tests across 48 files PASS**; ESLint PASS; Prettier check PASS for all changed files; web/API build PASS; `git diff --check` PASS. Final web main **518.58 / 148.17 kB gzip**, CSS **109.95 / 21.12 kB**, lazy Covering Workspace **33.03 / 6.94 kB**, lazy Material Schedule **11.96 / 3.01 kB**, covering-core **83.25 / 19.83 kB**, lazy Skeleton Canvas **38.98 / 11.99 kB**, API **1.11 kB**. Vite retains the known main-chunk >500 kB advisory. Automated coverage includes rectangular/triangular/trapezoidal planes, grid alignments, convex voids, one/multiple openings, deterministic IDs, finite/length limits, width modes, pitch, quantities/grouping, ownership conflicts, history/serialization, desktop and mobile UI, and tile/fixed-sheet regressions.

**NEXT ACTION:** Iteration 023 — professional Project lifecycle: named projects, local autosave, open/duplicate/delete, versioned import/export and a repository abstraction ready for future cloud/API storage. First complete the outstanding V21.1/V22 live desktop/mobile Browser acceptance when that browser is available. Do not begin V23 automatically.

> Iteration 021.1 started on 2026-09-13 from clean commit `bcb4aac10d35193cbf45cbd4be553185df78aebd` (`V21`). The attached V21.1 closeout contract supersedes the V21 `NEXT ACTION` for this small presentation-only pass. Canonical quantity exact-length semantics and V21 covering geometry remain unchanged; V22 is not started.

**Iteration:** `021.1 — Professional UX Closeout: Material Schedule Compaction and Covering/Workbench Polish`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; LIVE BROWSER/DEVICE QA UNAVAILABLE`

**Completed work:** Material Schedule now projects canonical build-up rows into one compact default summary per member kind and section. Exact equal-length rows, quantities, useful totals and source drill-down remain reachable in a native collapsed detail without changing `quantity-core`, stock semantics, project history or serialization. Materials uses a 32/68 drawing/schedule split and a compact sticky context drawing. The desktop Inspector column is absent until an exact schedule row is selected; selection opens the existing Inspector, including the mobile sheet path.

Covering add controls now have complete PL/EN keys and tests reject `assembly.roofTile`, plane IDs and `manual-standard` leakage. The generic schedule heading is `Pokrycia / Coverings`; row type is derived from structured quantity basis and shown distinctly as roof tile or modular sheet independently of product display names. The Covering SVG receives a small presentation-only fit margin and geometry-derived aspect ratio with viewport-aware CSS bounds; gable rectangle, hip trapezoid and hip triangle paths are covered. Assignment chips stay on one bounded horizontal strip. Desktop task controls remain sticky on an opaque bordered surface, the context bar no longer floats over the drawing, and Builder top spacing is reduced without changing Quick Calc.

**Files changed:** `PROJECT_BLUEPRINT.md`; web `MaterialSchedule`, `CoveringWorkspace`, `Page`, `SkeletonCanvas`, translations and styles; focused desktop and mobile Page tests. No domain package, canonical geometry, history semantics, dependency, lockfile, commit or push change.

**Validation and bundles:** final repository-pinned typecheck PASS; **454 tests across 46 files PASS**; ESLint PASS; changed-source Prettier check PASS; production web/API build PASS; `git diff --check` PASS. Versus V21: main web **515.37 / 147.35 kB gzip** (+0.52 / +0.12), CSS **108.68 / 20.91 kB** (+1.43 / +0.22), Material Schedule **11.13 / 2.87 kB** (+1.43 / +0.29), Covering Workspace **23.20 / 5.54 kB** (+0.19 / +0.09), Skeleton Canvas **38.98 / 11.99 kB** (+0.06 / +0.04); covering-core **74.11 / 17.32 kB** and API **1.11 kB** unchanged. Vite retains the known >500 kB main-chunk advisory.

**Visual/mobile QA and limitations:** the explicitly requested in-app Browser returned `Browser is not available: iab`, so no live desktop/mobile screenshot, computed-layout, horizontal-overflow, scroll/sticky or physical-touch claim is made. JSDOM covers compact/expanded schedules, unchanged totals, 46 exact hip length groups, zero-history disclosure, conditional desktop Inspector, mobile Inspector sheet, translated add controls, distinct covering rows and the gable/hip plane-shape matrix. Live visual acceptance remains outstanding.

**NEXT ACTION:** perform browser acceptance of V21.1 at normal desktop and 360–430 px when the in-app Browser is available, focusing on schedule density, sticky boundaries, covering canvas fit and assignment overflow. Fix only evidenced closeout defects. Do not begin V22 without a new explicit prompt.

> Iteration 021 completed in source on 2026-09-13 from clean commit `3efa87c3c919b7e17bfc2f1af9eb78171cd68601` (`V20`). The user-approved attached V21 contract superseded the V20 metal-covering `NEXT ACTION` and deliberately narrowed it to fixed-size modular sheets; cut-to-length and standing seam move to V22.

**Iteration:** `021 — Professional Workbench Hardening, Covering Assignment Management, Design Token Correctness and Fixed Modular Sheet Engine`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; LIVE BROWSER/DEVICE QA UNAVAILABLE`

**V20 audit and baseline:** clean `main` at `3efa87c`; typecheck PASS; **414 tests across 43 files** PASS; lint PASS; web/API build PASS; `git diff --check` PASS. Main web **510.40 / 146.06 kB gzip**, CSS **104.57 / 20.04 kB**, covering-core **65.60 / 16.06 kB**, lazy Covering Workspace **14.77 / 4.11 kB**, Skeleton Canvas **38.92 / 11.95 kB**. The explicitly requested in-app Browser setup failed with `Browser is not available: iab`, so implementation proceeded with source, CSS-contract and JSDOM evidence only.

**Screenshot defect and token fix:** source audit confirmed the Covering SVG consumed assembly variables including `--a-canvas`, `--a-accent` and `--a-line-strong` that were not all guaranteed by `.assembly-app`; invalid SVG presentation could therefore fall through to initial black fill. Added a shared semantic `--ui-*` contract for background/surfaces/canvas/panel, line/text states, interaction states and domain colours; bridged every required value to explicit `--a-*` aliases; added concrete fallback fills before `color-mix()` for plane/full/cut/opening shapes; and added an 18-case token/fallback contract suite. Tile geometry was not altered to compensate for CSS.

**Workbench/presentation hardening:** Builder's desktop introduction is compact while Quick Calc retains onboarding. Desktop Toolbox now defaults to the active task and retains `Wszystkie narzędzia` as a full-model escape without duplicating actions; mobile keeps its strict DOM-level task filtering. Layer projections retain materially stronger but subordinate rafter context. One web/i18n presentation helper now supplies human roof-plane labels and installation-mode labels, so `left`, `right` and `manual-standard` stay internal. The Covering centre owns drawing and assignment/selected-plane summaries; exact parameters and removal remain in the Inspector.

**Assignment manager and exclusivity:** added transient, unserialized and zero-history `selectedCoveringAssignmentId`. Selection survives valid edits; active removal chooses the deterministically clamped neighbour; add/edit/remove remains one canonical history step. The compact Covering selector supports only implemented manual roof-tile and fixed modular-sheet assignments. Pure `resolvePrimaryCoveringAssignments` enforces one primary covering per plane, reports structured conflicts without rewriting old documents and removes conflicted planes from every trusted strategy/quantity input. The tile quantity bridge was also hardened to reject a resolved zero-plane/zero-position source.

**Research and fixed-sheet contract:** revalidated current official Budmat Garda/Murano and Ruukki Modular/Finnera material. Evidence distinguishes total dimensions from effective coverage dimensions, includes 330 and 350 mm module examples and records minimum pitch and module/batten relationships without creating catalogue data or manufacturer branches. Added the backward-compatible `CoveringLayoutIntent` union with a genuine modular-sheet intent. Cut-to-length remains parseable but resolves explicitly as `limited / cut-to-length-not-supported`.

**Pure Sheet Engine:** added `resolveModularSheetLayout` in `covering-core`. Fixed sheets use effective width/length for one deterministic plane-local grid, eave-based V rows and centred/from-U-min/manual coherent U alignment. Generic clipping handles rectangular and narrowing hip polygons; canonical openings produce full, roof-edge cut, opening cut and split-by-opening classifications with stable IDs/order. Compatibility reports missing battens, regular module-spacing mismatch, minimum-pitch mismatch and invalid/non-finite geometry without changing the canonical batten system. Derived rows/positions/fragments never serialize.

**Workbench, quantities and performance:** the shared lazy Covering shell now renders tile or fixed modular sheet, keeps the plane/grid/opening/cut legend visible, exposes assignment totals plus an explicitly local selected-plane strip and retains the 1,200-fragment simplified rendering threshold. Manual and future catalogue snapshots use the same strategy path. Only resolved, non-empty, non-conflicted layouts emit a `piece` source; the schedule labels sheet rows as geometric sheets/modules and preserves no-purchase/no-waste/no-offcut-reuse boundaries. Tile and sheet rows remain separate.

**Files changed / WIP:** covering-core schema/conflict resolver, tile quantity hardening and new modular-sheet strategy/tests; web Page, Covering Workspace, schedule, Toolbox, store/workbench, translations/styles, token and presentation tests/helper; shared UI tokens; covering research; V21 prompt/architecture docs; this checkpoint. No unfinished source file, commit or push.

**Validation, bundles and QA:** final repository-pinned typecheck PASS; ESLint PASS; changed-file Prettier check PASS; **450 tests across 46 files PASS**; production web/API build PASS; `git diff --check` PASS. The requested whole-repository `format:check` was also run and remains red on **65 pre-existing untouched files**; no V21 changed file is in that report. Main web **514.85 / 147.23 kB gzip** (+4.45 / +1.17 versus V20), CSS **107.25 / 20.69 kB** (+2.68 / +0.65), covering-core **74.11 / 17.32 kB** (+8.51 / +1.26), lazy Covering Workspace **23.01 / 5.45 kB** (+8.24 / +1.34), Material Schedule **9.70 / 2.58 kB**, Skeleton Canvas unchanged at **38.92 / 11.95 kB**, API **1.11 kB**. Vite retains the known >500 kB main-chunk advisory. Automated coverage includes fixed/effective grids, all alignments, hips, edges, one/multiple openings and splits, stable ordering, multiple planes, pitch/batten/cut-to-length/finite boundaries, quantities, conflicts, history/non-serialization, labels, token fallbacks, desktop full-model access, mobile filtering and tile regressions.

**Visual/mobile QA and limitations:** no claim is made for live 1440/1024/768/430/390/360/phone-landscape rendering, computed styles, horizontal overflow, physical touch or the requested gable/hip screenshot matrix because the in-app Browser surface was unavailable. Source CSS now provides light concrete and semantic fallback fills, and JSDOM verifies assignment/mobile/label responsibilities, but final visual acceptance on a real browser/device remains outstanding. Fixed sheets are geometric coverage positions, not purchase sheets; manufacturer-specific first/eave/ridge supports, transverse joints, cut-to-length segmentation, standing seam, accessories, fastening, waste, breakage, offcuts, packs, stock, prices, structural/watertight approval, catalogue/backend, persistence and exports remain intentionally absent.

**NEXT ACTION:**

> Iteration 022 — variable-length metal-covering architecture, with standing seam and/or cut-to-length strategy developed from reverified manufacturer technical rules without contaminating the fixed modular-sheet engine. Do not begin V22 automatically; do not add catalogue/pricing/persistence/export scope without a separately approved contract.

---

> Iteration 020 completed in source on 2026-09-13 from clean commit `c1b07b48e4465f52feb37df90750947ae1ff62f0` (`V19`). The user-approved attached V20 mobile workbench contract superseded the V19 metal-covering `NEXT ACTION`; metal covering engines move to V21.

**Iteration:** `020 ? Mobile-First Professional Workbench, Unified Context Sheets and Touch Camera`

**Status:** `COMPLETE IN SOURCE ? AUTOMATED VALIDATION PASS; LIVE BROWSER/DEVICE QA UNAVAILABLE`

**V19 audit and baseline:** clean `main`; typecheck PASS; **405 tests across 41 files** PASS; lint PASS; build PASS; `git diff --check` PASS. Main web **500.16 / 143.80 kB gzip**, CSS **98.75 / 19.16 kB**, covering-core **65.60 / 16.06 kB**, lazy Covering Workspace **14.16 / 4.00 kB**, Skeleton Canvas **36.99 / 11.40 kB**. The requested in-app Browser had no available instance (`agent.browsers.list() ? []`).

**Source-level mobile problems:** <=800px CSS stacked the desktop grid; flattened all Toolbox groups with `display: contents`; hid their summaries; made the six-task ribbon scroll horizontally; independently fixed Inspector at up to 55dvh and Detail Drawer to the bottom; and placed Covering's complete editor next to/before its drawing. SkeletonCanvas used a fixed 400px narrow height, one-pointer camera state and immediate touch edit transactions. This produced competing surfaces and poor canvas access on a phone.

**Implemented mobile shell and context:**

- Builder now opens with compact brand/mode/Undo/Redo/settings header, context row, primary workspace and a fixed six-task dock. All six tasks fit at 360px, with full accessible names and bottom safe-area padding; desktop keeps its ribbon and three columns. A coarse-pointer short landscape viewport also uses the mobile shell. Quick Calc retains its separate simple workflow.
- `MobilePanel` (`none | tools | inspector | view`) and viewport-class detection are transient. Task changes close irrelevant sheets/detail without project history or serialization. One `MobileSheet` handles Tools, Inspector, View and mobile Detail, with bounded scrolling, expand, Escape, focus trapping/restoration and safe areas. Canvas selection initially shows a small Edit peek rather than opening the Inspector.
- The existing Toolbox registry/actions render task-aware sections in the mobile sheet; All Tools is explicit. Window list/add and non-hover group-selection buttons remain available. Mobile View contains isolation, dimensions, layer visibility and legend; low-frequency view chrome no longer occupies the canvas. Layers retain a visible secondary switch; Materials retains the schedule/drawing switch. Preparation/result panels move out of the long mobile page and into context.
- Covering's workspace is drawing/status/quantity oriented. The exact technical product, mode, alignment, assignment and removal controls now live only in `CoveringInspector`. Parametry / Popraw opens that Inspector; batten issues navigate to Layers/Battens and close the sheet. V19 Tile Engine, quantities and snapshots were not changed.
- SkeletonCanvas now sizes its mobile drawing from dynamic viewport height, pans with one background finger, zooms about the midpoint and pans with two fingers. A second finger cancels/restores an active canonical edit. Touch window/handle drags begin only after a six-pixel activation threshold; tap or subthreshold movement makes no geometry/history change, committed drag makes one Undo entry, cancellation restores exactly. Thin members get a transparent non-scaling hit corridor. Camera and gesture state stay local to the canvas.
- `Page` now memoizes roof-window and tile-assignment lists so panel/task changes do not invalidate opening-framing or Tile Engine memo dependencies. No domain or commercial package changed.

**Files changed / WIP:** `PROJECT_BLUEPRINT.md`; new V20 prompt and architecture docs; web `Page`, `Toolbox`, `WorkbenchControls`, `CoveringWorkspace`, `DetailPreview`, `SkeletonCanvas`, `store`, `workbench`, translations and styles; new `MobileSheet`, `MobileTaskDock`, `mobile-workbench`, `touch-camera`; new mobile and camera tests plus store tests. No unfinished source file, commit or push.

**Validation, bundle and QA:** final typecheck PASS, ESLint PASS, **414 tests across 43 files PASS** (with the four mobile UI tests rerun after the final focus-trap change), web/API build PASS, changed-file Prettier check PASS and `git diff --check` PASS. Added nine tests across two new files and the store suite. Automated coverage includes six mobile tasks, sheet exclusivity, selection peek, Covering parameter routing, exact/history isolation, touch tap/drag/cancel, second-finger edit cancellation, pinch midpoint, two-finger pan and finite camera clamping. Main web **510.40 / 146.06 kB gzip** (+10.24 / +2.26 versus V19); CSS **104.57 / 20.04 kB** (+5.82 / +0.88, responsive CSS grew while old flattening/fixed-sheet rules were removed); lazy Covering Workspace **14.77 / 4.11 kB**; Skeleton Canvas **38.92 / 11.95 kB**; Material Schedule **9.62 / 2.54 kB**; covering-core **65.60 / 16.06 kB**; API **1.11 kB**. Vite still emits the >500 kB main-chunk advisory. Mobile chrome increased initial JS by about 2.26 kB gzip.

**Visual/mobile QA and limitations:** The explicitly requested in-app Browser initialized but returned no available browser instance, so no real 1440/1024/768/430/390/360/844-landscape rendering, horizontal-overflow, safe-area, virtual-keyboard, physical pinch or native touch claim is made. JSDOM Pointer Events and CSS/source inspection are the available checks; the listed browser/device matrix remains for live acceptance. Mobile Detail offers Drawing/Dimensions/Steps tabs; exact layout and actual hit competition still require live visual review. The source uses a 6px touch activation threshold and a 15px member hit corridor, both presentation values rather than canonical millimetres.

**NEXT ACTION:**

> Iteration 021 ? modular/fixed or cut-to-length sheet and standing-seam engines on the existing covering-core contracts and the responsive workbench. Reverify current official technical revisions before domain implementation. Do not begin V21 automatically; pricing, catalogue backend and exports remain outside this action.

---

> Iteration 019 completed in source on 2026-09-12 from clean commit `af635994e9cf3f7b72153319b4c10d733376661e` (`V18`). The user-approved attached V19 contract superseded the V18 `NEXT ACTION`.

**Iteration:** `019 — Roof Tile Engine, Covering Workbench, Batten-Aware Tile Layout and Covering Quantities`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; REQUIRED LIVE BROWSER/DEVICE QA UNAVAILABLE`

**V18 audit and baseline:** clean `main`; typecheck PASS; **386 tests across 40 files** PASS; lint PASS; production build PASS; `git diff --check` PASS. Baseline web main **548.10 kB / 154.37 kB gzip**, lazy Skeleton Canvas **36.95 / 11.38 kB**, Material Schedule **8.28 / 2.27 kB**, CSS **94.80 / 18.50 kB**. The V18 covering snapshot/catalogue/pricing boundary and all opening productivity, units, framing, build-up and quantity regressions remained intact.

**Research revalidation and domain contract:**

- Rechecked official current BMI Braas Teviva, Wienerberger Koramic Alegra 8 and BMI Braas Opal technical material for physical size, cover width, gauge, declared consumption, pitch and straight/staggered/scale/crown course behavior. Updated the dated evidence in `docs/domain/COVERING_PRODUCT_MODEL.md`; manufacturer facts remain research/test-fixture evidence and do not form a production catalogue.
- Extended the existing V18 roof-tile installation mode additively with a generic `coursePattern`: normalized per-layer cover-width offsets plus a repeating batten-row offset cycle. Old V18 snapshots still parse. Missing pattern information is valid snapshot data but produces explicit incomplete layout issue `tile-placement-pattern-required`; no straight pattern is guessed.
- Added canonical `RoofTileLayoutIntent` on covering assignments for centered, from-U-min and manual per-plane offsets in millimetres. Derived courses/positions/fragments/counts and selected plane remain outside `ProjectDocument`. Store/UI mutations are canonical, one-step Undo/Redo edits; task and plane selection remain zero-history view state.

**Tile Engine:**

- Added a pure `RoofTileLayoutStrategy` in `@cieslacalc/covering-core` over neutral plane polygons, rectangular openings and renderer-neutral resolved batten rows. `covering-core` imports neither `roof-math` nor `timber-model` and contains no React, DOM, database, catalogue, price or manufacturer branching.
- Resolved battens are the only vertical course source. Actual adjacent row spacings are checked against the selected mode range; absent/single-row battens and too-small/too-large gauges produce structured incomplete/incompatible issues with no automatic repair.
- Uses one deterministic cover-width U grid per plane. Centered, edge-anchored and manual origins remain coherent around openings; row/layer offsets move the shared grid rather than restarting columns at batten segments. Stable IDs/order derive from assignment, plane, row, layer and column.
- Clips coverage cells against generic gable and hip polygons and subtracts canonical roof windows. Results distinguish full, roof-edge cut, opening cut and disconnected split-by-opening positions while preserving visible fragments and explicitly avoiding any offcut-reuse claim. Non-finite/invalid inputs cannot leak NaN/Infinity into trusted output.
- Declared pcs/m² produces a separate net-area reference range. Only resolved layouts emit `piece` quantity sources with stable geometric basis and explicit no-waste/breakage/accessory warnings.

**Workbench and schedule:**

- Added the real Builder-only `Pokrycie / Covering` task in the requested task order; Quick Calc is unchanged. The lazy `CoveringWorkspace` provides a practical manual product path, exact unit-aware primary/advanced fields, optional installation-mode selection, plane assignment, three pattern configurations, alignment intent, compatibility status and navigation to `Warstwy → Łaty`.
- Added a plane-local coverage SVG with light batten context, openings, visibly distinct full/edge/opening/split fragments and plane tabs. Above **1,200 visible fragments**, rendering switches to course lines while exact domain counts remain unchanged. Responsive CSS stacks the canvas/editor and keeps controls touch-accessible.
- Added compact status/course/position/full/cut/cover-width facts, manual-source and no-waste messaging, and a contextual covering Inspector. `Zestawienie` now has a separate covering-product section with geometric pieces, full/cut counts, net area and declared-consumption reference; it never mixes pcs with timber/build-up totals.
- Added a dedicated `covering-core` production chunk plus lazy covering UI boundaries. No fake catalogue, sheet/seam controls, pricing, VAT, discount or Cost Engine UI was added.

**Files changed:**

- Covering domain/engine/tests: `packages/covering-core/src/{index,tile-layout}.{ts,test.ts}`.
- Quantity/project boundaries and tests: `packages/quantity-core/src/index.{ts,test.ts}` and `packages/calculator-core/src/project-document.test.ts`.
- Web workbench/tests: new `apps/web/src/assembly/CoveringWorkspace.tsx`; `Page`, `MaterialSchedule`, `WorkbenchControls`, `store`, `workbench`, translations, responsive styles and `apps/web/vite.config.ts`.
- Documentation: actual V19 prompt, V19 architecture, revalidated covering research and this checkpoint.

**Validation, performance and QA:**

- Final repository-pinned typecheck PASS; ESLint PASS; **405 tests across 41 files PASS**; production web/API build PASS; `git diff --check` PASS. Changed source/docs were formatted with repository Prettier; the verbatim user contract is intentionally byte-text equivalent after newline normalization.
- Final web output: main **500.16 kB / 143.80 kB gzip**, dedicated covering-core **65.60 / 16.06 kB**, lazy Covering Workspace **14.16 / 4.00 kB**, Material Schedule **9.62 / 2.54 kB**, Skeleton Canvas **36.99 / 11.40 kB**, CSS **98.75 / 19.16 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **17.08 / 3.64 kB**; API ESM **1.11 kB**. The main is down **47.94 kB / 10.57 kB gzip** versus V18 through the explicit covering-core chunk, but Vite still emits its known >500 kB advisory at 500.16 kB.
- Pure/store/jsdom tests cover backward parsing, patterns, deterministic gable/hip grids, edges, openings/splits, multiple planes, actual gauge/pitch failures, declared reference, trusted/untrusted quantities, history, responsive task reachability, empty/manual UI, batten navigation, grid/opening rendering, schedule rederivation and absence of price/catalogue controls.
- The explicitly requested in-app Browser was initialized according to its skill protocol and returned no available browser instance both before and after implementation (`agent.browsers.list() → []`). Therefore no live 1440×900/1024/768/360×800 rendering, native pointer/touch, clipping or horizontal-overflow claim is made.

**Known limitations / assumptions:**

- V19 positions are geometric coverage cells, not physical profiled tile outlines or purchase quantities. Eave/ridge special courses, half/verge/ridge/ventilation tiles, fastening, accessories, waste, breakage, packages, offcut optimization, stock, prices, structural verification and exports are intentionally absent.
- Current openings are rectangular roof-window voids and current roof topology is gable/hip. A split position does not guarantee all fragments can be cut from one purchased tile.
- Compatibility covers implemented pitch and actual regular batten-spacing facts only; it is not a safety, waterproofing or installation approval. Conditional underlay/manufacturer requirements remain external documentation.
- The workspace currently edits the first roof-tile assignment; the canonical model and quantity engine support deterministic multiple assignments, while assignment management/catalogue selection remains future UI work.
- Live visual/mobile acceptance remains outstanding only because the required in-app Browser surface was unavailable.

**NEXT ACTION:**

> Prepare Iteration 020 — metal covering engines for modular/fixed or cut-to-length sheet and standing seam on the same neutral covering layout/quantity contracts. Reverify current official technical revisions first. Do not begin V20 automatically; do not add pricing or a catalogue backend without a separately approved iteration.

---

> Iteration 018 started on 2026-09-12 from clean commit `5d3442baf3968ffcb6b03c504c70a8e27658124f` (`V17`). The user-approved attached V18 contract supersedes the V17 browser-only `NEXT ACTION`.

**Iteration:** `018 — Opening Productivity and Covering Platform`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; REQUIRED LIVE BROWSER/DEVICE QA UNAVAILABLE`

**V17 audit and baseline:** clean `main`; typecheck PASS; **354 tests across 39 files** PASS; lint PASS; production build PASS; `git diff --check` PASS. Baseline web main **530.03 kB / 150.05 kB gzip**, lazy Skeleton Canvas **35.36 / 10.94 kB**, lazy Material Schedule **8.28 / 2.26 kB**, CSS **92.96 / 18.22 kB**. V17 canonical units, spacing, Measure, Focus, camera, ridge, opening/framing, layer and quantity boundaries were retained. The explicitly requested in-app Browser returned `Browser is not available: iab` before implementation, so live visual/device QA is not claimed.

**Completed roof-window productivity:**

- Added source-based duplicate placement from the Inspector and `Ctrl/Cmd+D`. Starting/cancelling is transient with zero history; the same roof plane is initially active; width, height and clearance copy into a ghost; one click creates one stable new opening ID and one Undo item. Accepted framing, collision/bay results, derived batten splits, quantities and view state do not copy.
- Added transient primary-plus-set roof-window selection. Shift-click works on the drawing, and each Toolbox row has an explicit keyboard/mobile group-selection control. The selection set, feedback, placement and guides remain outside `ProjectDocument` and history.
- Added pure lower-edge, centre and upper-edge alignment in plane-local `v`, with the primary opening fixed and exact same-plane/fit rejection. Added pure equal-clear-gap distribution for 3+ differently sized openings, preserving the outer anchors. Store Apply is one canonical history item and Undo restores the exact document; distribution has a zero-history preview.
- Added same-plane lower/centre/upper drag snapping. The threshold is derived from screen ergonomics, but the written target is exact canonical millimetres. The guide is transient and restrained; Alt disables snapping. Opening context now shows compact counts for openings, collisions, accepted framing and review-required framing.

**Completed covering platform:**

- Researched current official technical data for interlocking/plain tiles, fixed modular sheets, cut-to-length sheet tile and standing-seam panels; recorded sources and modelling conclusions in `docs/domain/COVERING_PRODUCT_MODEL.md`.
- Added pure `@cieslacalc/covering-core` with explicit Zod/TypeScript unions for `roof-tile`, `modular-sheet` and `standing-seam`, stable language-neutral installation modes, physical/effective dimensions, gauge/panel ranges, pitch constraints, versioned technical snapshots, optional catalogue revision references, assignments, structured compatibility results and future layout/quantity interfaces. It has only Zod as a dependency and contains no React, Zustand, DOM, server, database, HTTP, translation, manufacturer records or prices.
- Added optional `project.coverings`, normalized to `[]` for old V17/V1 documents. Canonical mutations preserve the assignments; covering intent participates in Undo/Redo; manual and catalogue-referenced products serialize through the same technical snapshot contract. Transient selection and hypothetical catalogue filters are stripped/not serialized.
- Documented immutable technical revision snapshots, explicit future refresh, conceptual Manufacturer/Product Family/Technical Revision/Commercial Variant/Price List entities, the `Covering Engine → Quantity Source → quantity-core → Cost Engine` boundary and why no database/API/UI/quantity algorithm belongs in V18. Updated only the clarified covering section of the Product North Star.

**Files changed:**

- Opening math/tests: `packages/roof-math/src/roof-features.{ts,test.ts}`.
- Covering domain: new `packages/covering-core/{package.json,src/index.ts,src/index.test.ts}`, workspace manifests and lockfile.
- Project boundary/tests: `packages/calculator-core/src/project-document.{ts,test.ts}`.
- Web workbench/tests: `apps/web/src/assembly/{Inspector,Page,SkeletonCanvas,Toolbox,WorkbenchContextBar,store,workbench}` plus translations and responsive styles.
- Documentation: V18 prompt, V18 architecture, covering catalogue/pricing boundary, covering product research, Product North Star and this checkpoint.

**Validation, performance and QA:**

- Final repository-pinned typecheck PASS; ESLint PASS; **386 tests across 40 files PASS**; changed-file Prettier PASS; `git diff --check` PASS; production web/API build PASS.
- Production HTTP smoke: `/api/health` returned 200 with the expected service payload and `/` returned 200 with the app root.
- Final web output: main **548.10 kB / 154.37 kB gzip**, lazy Skeleton Canvas **36.95 / 11.38 kB**, Material Schedule **8.28 / 2.27 kB**, CSS **94.80 / 18.50 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **15.79 / 3.42 kB**; API ESM **1.11 kB**. The main grew **18.07 kB / 4.32 kB gzip** and still triggers the known Vite >500 kB advisory.
- jsdom covers duplicate keyboard discovery, explicit non-hover multi-selection, group alignment and compact context facts in addition to pure/store regressions. The requested in-app Browser was unavailable, so no live 1440/1024/768/360, native pointer/touch, clipping or horizontal-overflow claim is made.

**Known limitations / assumptions:**

- V18 intentionally exposes no `Pokrycie` task, catalogue/API/database, price/cost state or tile/sheet/seam quantity/layout implementation. Manufacturer facts are a dated research baseline and must be reverified for each future technical revision.
- Alignment/snap candidates are roof windows on one roof plane. Distribution needs at least three and preserves the first/last geometric `u` anchors; rejected operations never clamp into an approximate answer.
- Covering compatibility checks compare declared pitch/gauge constraints only and are not structural, installation or waterproofing approval.
- Live device acceptance remains outstanding only because the required in-app Browser surface was unavailable.

**NEXT ACTION:**

> Prepare Iteration 019 — Tile Engine on top of the proven `covering-core` contracts. Reverify the chosen tile technical revisions, design pure plane/opening-aware tile layout intent/results and quantity-source output, then expose a real-value `Pokrycie` task. Do not begin V19 automatically. Do not add pricing or sheet/seam layout in V19.

---

> Iteration 017 completed in source on 2026-09-11 from clean commit `162613584d7f1d0f09f226bf4d691fd0ee223c74`. The user-approved attached V17 contract superseded the V16 browser-only `NEXT ACTION`.

**Iteration:** `017 — Professional Workbench Polish, Units 2.0, smart dimensioning, measurement and ridge completion`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; REQUIRED LIVE BROWSER/DEVICE QA UNAVAILABLE`

**Baseline and V16 audit:**

- Clean `main` at `1626135`; `git diff`, `git diff --stat` and `git diff --check` were empty/pass.
- The shell has no global `pnpm`; the repository-pinned `npx pnpm@10.15.1` path passed typecheck, **339 tests across 36 files**, lint and production build.
- Baseline web build: main **554.23 kB / 156.87 kB gzip**, Material Schedule **8.34 / 2.25 kB**, CSS **90.96 / 17.81 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **15.18 / 3.35 kB**; the known Vite >500 kB main-chunk advisory remains.
- The audit confirmed duplicated `unit: 'mm'` defaults, no persisted display preference, literal millimetre presentation in Skeleton/Inspector/Schedule, repetitive SVG bay labels in Working mode, dense ungrouped roof Inspector controls and a ridge quantity override that is always partial because canonical ridge intent has thickness only.
- The explicitly requested in-app Browser was initialized according to its skill protocol and returned `Browser is not available: iab`; no live visual/device QA is claimed.

**Completed V17 architecture and behavior:**

- Added one versioned, fault-tolerant web preference boundary with first-visit `cm`. Both Quick and Builder stores load/save through it; project reset preserves the preference, and unit changes remain outside project data and Undo/Redo.
- Made the display precision policy explicit in the shared formatter: at most 1 decimal in mm, 2 in cm and 3 in m with no canonical rounding. Audited the skeleton, placement/drag/window/batten HUDs, Inspector, Material Schedule, context strip and 2D drag hints so ordinary lengths respect the current unit. Explicit aggregate lengths, areas and volumes retain m, m² and m³.
- Added pure drawing-engine spacing presentation. Minimal has no bay labels; default Working collapses consecutive equal bays to an exact representative `count × spacing` and preserves a distinct remainder; Full exposes every exact bay on alternating lanes. The roof spacing solver and canonical stations are unchanged.
- Added a deterministic screen-label priority helper. Selected/warning labels are protected and lower-priority overlapping roof-window labels are suppressed without creating a generic CAD label engine.
- Added restrained local hover/selection feedback for physical skeleton members. The canvas HUD shows the generated physical code, exact 3D axis length and known section; the Inspector remains the exact/full edit surface.
- Refined the context strip around the current task and selection, including physical member codes and schedule family/length/count context. Reorganized the roof Inspector into main parameters, layout, result and collapsed advanced section controls. Toolbox remains the select/add/enable surface; layer enable controls are explicit keyboard-operable ARIA switches.
- Added desktop bounded sticky Toolbox/Inspector plus sticky task/context controls. Added transient workspace focus, which remembers/restores panel state with Escape and is separate from camera Fit.
- Added a transient canonical 3D Measure tool with toolbar action and `M` shortcut. It snaps to memoized member endpoints, roof-plane vertices and projected roof-window corners; screen coordinates choose a candidate only, while the exact result is `Math.hypot(dx,dy,dz)` over canonical world millimetres. It blocks construction drags while active, restarts cleanly, cancels on Escape/task switch and creates no project/history/serialization state.
- Added optional canonical `ridge.depthMm` with schema-V1 backward compatibility, exact Inspector input, clear/unset behavior, Undo/Redo and serialization. Quantity volume remains partial for old/incomplete ridge intent and includes the ridge only when the complete manual rectangular section exists. The previous skeleton depth fallback remains visual only and is not interpreted as quantity or structural advice.
- Separated latest candidate fit bounds from the active skeleton camera fit. Canonical edits preserve the current projection/pan/zoom; explicit Fit or a viewport-size change adopts current bounds. `SkeletonCanvas` is now a task-level lazy chunk.
- Added `docs/ARCHITECTURE_V17_UNITS_DIMENSIONS_MEASUREMENT_UX.md` and the repository V17 contract.

**Files changed:**

- Web preference/formatting: `apps/web/src/{unit-preference,format,store}.{ts,test.ts}` where applicable.
- Web workbench: `apps/web/src/assembly/{Canvas,Inputs,Inspector,MaterialSchedule,Page,SkeletonCanvas,Toolbox,WorkbenchContextBar,WorkbenchControls,store,workbench}.tsx`/`.ts` where applicable, tests, translations and responsive styles.
- Pure presentation/measurement: new `packages/drawing-engine/src/dimension-presentation.ts`, `measurement.ts`, their tests and barrel exports.
- Ridge contract/coverage: timber-model ridge type, roof-math assembly/gable/hip schemas and skeleton projections, calculator-core project-document tests and quantity-core tests.
- Documentation: the two V17 documents and this checkpoint. No dependency/lockfile change, commit, push, persistence service, product/costing, export or structural module was added.

**Validation, performance and QA:**

- Final repository-pinned TypeScript and ESLint checks pass with no warnings/errors.
- Vitest passes **354 tests across 39 files**, up from 339/36. New coverage includes first/restored cm, all-unit preference round trips, reset/history isolation, precision examples, spacing grouping/remainder/full lanes, label priority, member HUD, placement ghost units, layer switch semantics, focus restore, exact Measure state/result/unit/Escape/task clearing/no history, no pixel distance, active-fit camera preservation and ridge partial/complete/undo/round-trip behavior.
- Production web/API build passes. Web output: main **530.03 kB / 150.05 kB gzip**, lazy Skeleton Canvas **35.36 / 10.94 kB**, lazy Material Schedule **8.28 / 2.26 kB**, CSS **92.96 / 18.22 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **15.18 / 3.35 kB**; API ESM **1.11 kB**. Relative to V16, the main chunk is **24.20 kB smaller** before gzip despite V17 functionality. Vite still reports its >500 kB advisory for the main chunk.
- Changed-file Prettier verification and `git diff --check` pass.
- jsdom covers the 360 px workbench route already established by V16 plus the new touch-sized Measure hit policy and transient interactions. The requested in-app Browser returned `Browser is not available: iab`, so no live 1440×900/1024/768/360×800, native pointer/touch, clipping or horizontal-overflow claim is made.

**Known limitations / assumptions:**

- Measure V17 exposes exact direct 3D distance only. It does not invent plane-local deltas where two points lack one rigorous shared plane, and it does not persist measurements as construction objects.
- The small collision policy currently governs the labels introduced/affected in this pass; it is intentionally not a general annotation-layout engine. Full mode can remain dense by user choice, while narrow policy still caps it to Working.
- Ridge depth is manual geometric intent, not a default, migration, recommended section or structural verification. Old documents remain partial until the user supplies it.
- The main chunk is reduced but remains above Vite's advisory threshold. Further splitting should follow measured task boundaries rather than fragmenting primitives.
- Live visual/device acceptance remains outstanding only because the explicitly requested Browser surface was unavailable.

**NEXT ACTION:**

> When the in-app Browser is available, run the V17 production acceptance matrix on gable and hip at 1440×900, 1024, 768 and 360×800. Include a long 19-bay gable in Working and Full, cm/mm/m, member hover/selection HUD, opening placement ghost, all layer switches, long Inspector scrolling, workspace focus restore, Measure by mouse and touch, camera preservation through pitch/span/length edits, explicit Fit and horizontal overflow. Fix only evidenced V17 defects, rerun the definition-of-done suite, then stop for user review. Do not begin V18 automatically.

---

**Previous checkpoint — Iteration 016:**

> Iteration 016 completed 2026-09-11 from clean commit `de1cbd2fef06f52015f2b85425a88b001927237b`. The attached V16 contract superseded the prior V15 `NEXT ACTION`. Baseline before edits: typecheck PASS, 324 tests across 34 files PASS, lint PASS, build PASS with main web chunk 536.23 kB / 151.73 kB gzip, `git diff --check` PASS.

**Iteration:** `016 — Professional Workbench 2.0 and roof build-up geometry`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; REQUIRED LIVE BROWSER/DEVICE QA UNAVAILABLE`

**V15 prerequisite audit:**

- `quantity-core` remained pure and derived from the accepted composed physical skeleton. Opening-framing proposals were not counted; accepted framing replaced the interrupted K1 with its physical headers/segments, and schedule selection stayed transient.
- Battens remained resolved visible geometry rather than commercial pieces; Quick Calc exposed no material quantities; incomplete ridge section kept timber volume explicitly partial; no derived quantity result entered the serialized project document.

**Completed V16 architecture and behavior:**

- Added pure `resolveRoofSurfaceGeometry` for gable and hip templates. It returns deterministic roof-plane local/world polygons, gross/opening-union/net area and eave/ridge/hip boundary metrics. Openings are clipped to their assigned plane, overlaps are counted once through exact polynomial cell partitioning, and invalid/outside/unknown cases return deterministic finite issues.
- Extended canonical `RoofBuildUp` with optional membrane and counter-batten intent while preserving schema-version-1 compatibility. Derived geometry and all task/subview/schedule state remain absent from serialization.
- Added pure gable `resolveCounterBattenLayout` from accepted physical common-rafter axes. Accepted opening segments regroup to one source rafter, rows extend over the real plane and split around roof windows without duplicate quantities. Hip counter-battens return an explicit `limited` status instead of guessed H1/J1 geometry.
- Extended `quantity-core` with separate surface build-up rows for net geometric membrane area and linear build-up rows for counter-batten/batten visible lengths. Structural timber, linear build-up and surface build-up retain distinct units and meanings.
- Replaced the old Builder preset row with a five-task ribbon: `Konstrukcja`, `Otwory`, `Warstwy`, `Cięcia`, `Zestawienie`. `Warstwy` provides transient `Przegląd`, `Membrana`, `Kontrłaty`, `Łaty` subviews, compact summary metrics, selectable masked roof surfaces, selectable counter-batten axes and contextual inspectors with exact numeric section inputs.
- Moved the task ribbon above the compact context path, collapsed the legend by default and coordinated stale opening/cut/schedule state when changing tasks. Layer toggles and dimensions are canonical/undoable; navigation, grouping and drawing/schedule switches create no history.
- Reworked Schedule with element/section perspectives, separate membrane square metres from counter-batten/batten metres, a wide drawing/schedule split and a narrow local surface switch. The schedule/inspector module now builds as a separate lazy-loaded chunk.
- Expanded the professional desktop grid and responsive rules: dominant canvas, compact sidebars, horizontally reachable task/layer ribbons, one major Schedule surface on narrow screens, 44 px primary task targets and 16 px mobile numeric inputs. Quick Calc remains unchanged and does not expose Builder task navigation.
- Added Polish/English copy, `ARCHITECTURE_V16_WORKBENCH_AND_ROOF_BUILDUP.md` and the repository iteration contract.

**Validation:**

- Final `pnpm typecheck`: PASS.
- Final `pnpm test`: PASS — **339 tests across 36 files**.
- Final `pnpm lint`: PASS with no warnings/errors.
- Final production build: PASS — web main **554.23 kB / 156.87 kB gzip**, lazy Material Schedule **8.34 / 2.25 kB**, CSS **90.96 / 17.81 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **15.18 / 3.35 kB**; API ESM **1.11 kB**. Vite retains the known advisory that the main chunk exceeds 500 kB.
- Built production URL `http://localhost/projects/RoofCalc/apps/web/dist/`: HTTP 200.
- Final changed-file Prettier check and `git diff --check`: PASS.

**Browser, responsive and device QA:**

- Automated jsdom coverage verifies task reachability, Quick/Builder boundary, layer subviews, membrane and counter-batten drawing geometry, separate schedule quantities, transient navigation/history, accepted framing quantities and a `360 px` schedule workspace observer.
- The explicitly requested in-app Browser was initialized according to its skill protocol, but this environment returned `Browser is not available: iab` before a tab could be opened.
- No live claim is made for visual hierarchy, text clipping, horizontal page overflow, native pointer/touch behavior or desktop/tablet/mobile screenshots.

**Known V16 boundaries:**

- Membrane area is net geometric surface only. It excludes laps, upstands, roll widths, allowances, waste and manufacturer requirements.
- Counter-batten and batten results are visible geometric axes/rows, not stock or purchasing pieces. Hip counter-battens remain explicitly limited until compound face/reference geometry is researched.
- Products, prices, suppliers, procurement, cut optimization, export/PDF, persistence services and structural verification remain out of scope. Ridge volume remains partial until a complete canonical ridge section exists.
- The existing main-bundle size advisory remains; Schedule is now isolated in a lazy chunk, while further splitting requires a dedicated performance pass.

**Files changed:**

- `packages/timber-model/src/index.ts`
- `packages/roof-math/src/index.ts`
- `packages/roof-math/src/roof-surface.ts`
- `packages/roof-math/src/roof-surface.test.ts`
- `packages/roof-math/src/counter-battens.ts`
- `packages/roof-math/src/counter-battens.test.ts`
- `packages/calculator-core/src/project-document.ts`
- `packages/calculator-core/src/project-document.test.ts`
- `packages/quantity-core/src/index.ts`
- `packages/quantity-core/src/index.test.ts`
- `apps/web/src/assembly/BuildUpWorkspace.tsx`
- `apps/web/src/assembly/Inspector.tsx`
- `apps/web/src/assembly/MaterialSchedule.tsx`
- `apps/web/src/assembly/Page.tsx`
- `apps/web/src/assembly/Page.test.tsx`
- `apps/web/src/assembly/SkeletonCanvas.tsx`
- `apps/web/src/assembly/Toolbox.tsx`
- `apps/web/src/assembly/WorkbenchContextBar.tsx`
- `apps/web/src/assembly/WorkbenchControls.tsx`
- `apps/web/src/assembly/store.ts`
- `apps/web/src/assembly/store.test.ts`
- `apps/web/src/assembly/styles.css`
- `apps/web/src/assembly/translations.ts`
- `apps/web/src/assembly/workbench.ts`
- `docs/ARCHITECTURE_V16_WORKBENCH_AND_ROOF_BUILDUP.md`
- `docs/PROMPT_ITERATION_016_WORKBENCH_ROOF_BUILDUP.md`
- `PROJECT_BLUEPRINT.md`

**NEXT ACTION:**

> When the in-app Browser becomes available, run the V16 visual matrix on gable and hip roofs at wide desktop, `1440 × 900`, tablet and `360 × 800`: verify ribbon/context hierarchy, all four layer subviews, overlapping-opening membrane masks, counter-batten selection/splits, Schedule perspectives and local mobile surface switch, no page overflow and native mouse/touch reachability. Fix only evidenced defects, rerun the definition-of-done suite, update this checkpoint, then wait for an explicit user-approved iteration; do not begin procurement, costing or hip counter-batten approximation automatically.

---

**Previous checkpoint — Iteration 015:**

> Updated 2026-09-11 from clean V14 commit `15b7984aeb3edc75d475031d4ceea7f9faa3a5d0`. The V14 framing/composition implementation was audited before V15; the attached Iteration 015 contract controlled this iteration.

**Iteration:** `015 — timber member schedule and quantity-engine foundation`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; REQUIRED LIVE BROWSER/DEVICE QA UNAVAILABLE`

**Completed V15 architecture and behavior:**

- Added pure `@cieslacalc/quantity-core`, independent of React, DOM, Express, persistence, translations, prices and suppliers. It projects deterministic schedule rows, section groups, summaries and finite validation issues from the accepted composed `RoofSkeleton`.
- Structural lengths use exact Euclidean physical 3D member axes in canonical millimetres. Equality grouping uses an explicit `1e-7 mm` computational tolerance and never rounded display text. Source physical instance IDs and shared prototype IDs remain traceable.
- The schedule counts K1 common rafters, H1 hips, unequal J1 groups, wall plates, ridge, each purlin family and accepted O1/O2 opening headers plus lower/upper rafter segments. One physical instance is counted once.
- V14 composition semantics are preserved: framing proposals and `needs-review`/unsupported/invalid/conflicting results do not enter quantities. Applying valid accepted framing removes the interrupted full K1 and adds actual composed headers/segments; Undo restores the previous schedule. Two independent openings are deterministic.
- Rectangular volume is calculated only for complete valid sections. The current ridge contributes its geometric length but, because the domain exposes no complete ridge section, is excluded from volume and makes the total explicitly `partial`; no section fact is invented.
- Optional battens are a separate roof-build-up projection of resolved visible clipped rows. V15 reports their row/segment geometry and section, not stock pieces or purchasing quantities.
- Builder now has the fifth transient `Zestawienie` / `Schedule` preset and toolbox entry, with summary cards, family/length groups, expandable source instances, section aggregation, batten groups and a contextual inspector. Selecting timber or batten rows highlights the corresponding existing skeleton geometry without changing the project document or undo history.
- Millimetres remain both canonical and the default workshop display unit. Aggregate schedule presentation uses metres and cubic metres only for readability. Quick Calc remains intentionally unchanged.
- Added Polish/English UI copy and responsive rules for scrollable narrow preset navigation, stacking summaries/cards and mobile-friendly schedule rows.

**V14 audit result before implementation:**

- Canonical `RoofOpeningFramingSpec`, backward-compatible V1 project parsing, pure status resolver, accepted-composition pipeline and delete/apply/Undo/Redo semantics were present and matched their tests.
- Accepted framing removed the affected full K1 and introduced deterministic lower/upper segments and two headers; proposal/review/conflict states did not change the composed physical assembly.
- The clean baseline passed typecheck, 305 tests across 33 files, build and `git diff --check`; lint exited successfully with one old `proposalMembers` hook-dependency warning. V15 removed that warning by stabilizing the proposal-member derivation.

**Validation:**

- Final `pnpm typecheck`: PASS.
- Final `pnpm test`: PASS — **324 tests across 34 files**.
- Final `pnpm lint`: PASS with no warnings/errors.
- Final production build: PASS — web main **536.23 kB / 151.73 kB gzip**, CSS **85.31 / 16.87 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **13.57 / 2.97 kB**; API ESM **1.11 kB**. Vite reports the known advisory that the main chunk exceeds 500 kB.
- `git diff --check`: PASS.
- Prettier check for all V15 changed source/docs: PASS. Repository-wide `pnpm format:check` remains non-zero because 75 pre-existing, untouched files are not formatted to the current Prettier configuration; those files were not rewritten as unrelated cleanup.

**Browser, responsive and device QA:**

- The production URL `http://localhost/projects/RoofCalc/apps/web/dist/` responds with HTTP 200 after the final build.
- The explicitly requested in-app Browser was initialized according to its skill protocol, but the environment returned `Browser is not available: iab` before any tab could be opened.
- Automated jsdom coverage verifies the fifth preset in Polish and English, Quick/Builder boundary, partial-volume warning, section and batten UI, row-to-skeleton highlighting, schedule-state history isolation, applied-framing/Undo effects, unequal J1 groups and reachability with a `360 px` drawing observer.
- No live claim is made for actual layout, occlusion, text clipping, horizontal overflow or native mouse/touch behavior at desktop/tablet/mobile widths.

**Known V15 boundaries:**

- All lengths and volumes are geometric. V15 does not include stock lengths, cutting allowances, kerf, waste, splice strategy, optimization, prices, suppliers, purchasing, PDF/export or structural verification.
- Ridge volume stays partial until a complete canonical ridge section exists.
- Batten rows are resolved visible geometry, not commercial pieces. Tiles, sheets, membranes and covering quantities remain out of scope.
- Quantity reports are derived and transient; they are intentionally absent from serialized project documents.

**Files changed:**

- `packages/quantity-core/package.json`
- `packages/quantity-core/src/index.ts`
- `packages/quantity-core/src/index.test.ts`
- `apps/web/package.json`
- `apps/web/src/assembly/MaterialSchedule.tsx`
- `apps/web/src/assembly/Page.tsx`
- `apps/web/src/assembly/Page.test.tsx`
- `apps/web/src/assembly/SkeletonCanvas.tsx`
- `apps/web/src/assembly/Toolbox.tsx`
- `apps/web/src/assembly/WorkbenchControls.tsx`
- `apps/web/src/assembly/store.ts`
- `apps/web/src/assembly/store.test.ts`
- `apps/web/src/assembly/workbench.ts`
- `apps/web/src/assembly/workbench.test.ts`
- `apps/web/src/assembly/styles.css`
- `apps/web/src/assembly/translations.ts`
- `docs/ARCHITECTURE_V15_QUANTITY_ENGINE_AND_MEMBER_SCHEDULE.md`
- `docs/PROMPT_ITERATION_015_QUANTITY_ENGINE_TIMBER_SCHEDULE.md`
- `pnpm-lock.yaml`
- `PROJECT_BLUEPRINT.md`

**NEXT ACTION:**

> When the in-app Browser becomes available, run the V15 visual matrix on gable and hip roofs at wide desktop, `1440 x 900`, tablet and `360 x 800`: verify all family/section cards, partial ridge volume, accepted opening replacement, timber and batten highlighting, expanded source lists, no horizontal page overflow and touch reachability. Record and fix only evidenced UI defects, rerun the definition-of-done suite, and then wait for an explicit user-approved next iteration; do not begin procurement/costing work automatically.

---

**Previous checkpoint — Iteration 014:**

> Updated 2026-09-11 from clean base `a3f2facc6253315d6f60f574a498f0d024db8db8`. The V13 contract was audited against the implementation; architecture documents were not treated as proof of behavior.

**Iteration:** `014 — opening framing and composed roof adaptation`

**Status:** `COMPLETE IN SOURCE — AUTOMATED VALIDATION PASS; BROWSER/DEVICE QA NOT YET RECORDED`

**Verified V14 repository state before Iteration 015:**

- The clean repository is at `15b7984aeb3edc75d475031d4ceea7f9faa3a5d0` and contains the V14 canonical `RoofOpeningFramingSpec`, backward-compatible V1 project parsing, pure framing resolver/status model and accepted-composition pipeline.
- Accepted/current framing removes interrupted full K1 instances from the composed skeleton and adds deterministic lower/upper segments plus upper/lower headers. Proposal, `needs-review`, unsupported and conflicting results do not alter the composed physical assembly.
- Apply/remove/delete and Undo/Redo operate on the complete versioned project document; deleting a roof window removes its dependent framing intent in the same transaction.
- Multiple independent openings resolve deterministically; overlapping/shared interrupted regions are rejected as conflicts. The fabrication package adds only valid accepted header lengths and explicitly leaves header joinery unresolved.
- Baseline validation on 2026-09-11: typecheck PASS; **305 tests across 33 files** PASS; build PASS; `git diff --check` PASS. Lint exits successfully with one pre-existing `proposalMembers` hook-dependency warning in `Page.tsx`.
- Browser and physical-device QA were not completed before V15 and are not claimed here.

**NEXT ACTION:**

> Implement the explicitly approved Iteration 015 quantity-engine/member-schedule contract from the attached prompt. Use the accepted composed skeleton as the physical source, keep procurement/costing out of scope, add the fifth transient schedule preset, test opening effects and responsive UI, then replace this checkpoint with the final V15 state.

---

**Previous checkpoint — Iteration 013:**

**Iteration:** `013 — interaction layer and professional roof workbench`

**Status:** `PARTIAL — IMPLEMENTATION AND AUTOMATED VALIDATION COMPLETE; REQUIRED BROWSER/DEVICE QA UNAVAILABLE`

**Verified V13 implementation:**

- Builder has a cancellable choose-plane/click-location roof-window tool with a live ghost, active-plane feedback and no project/history write until placement. Window dimensions and batten inputs use editable drafts with Enter/blur commit and Escape restore.
- Roof windows support direct local-plane drag as one transaction, keyboard nudge at `10 mm`, `Shift = 100 mm`, `Alt = 1 mm`, one-step Undo/Redo and exact numeric fallback in Inspector.
- Collision feedback derives from canonical K1/H1/J1 geometry, identifies concrete physical rafter instances, visually coordinates the colliding member, and offers a geometric `Umieść między krokwiami` action with explicit success/failure feedback.
- Batten rows remain derived from canonical roof/build-up/window data, are selectable, show contextual row/segment data, and preserve the existing tested multi-window clipping behavior.
- `Konstrukcja / Otwory / Łacenie / Cięcia` are semantic view presets. Selection moves to the relevant preset, member selection does not unnecessarily abandon the current useful preset, and roof selection returns to construction.
- `Widok`, Fit, zoom controls, pointer-centred wheel zoom, Space-pan, double-click focus, three-state Detail Dock and responsive workbench composition are present in production code. Quick Calc remains intentionally free of roof-window/batten authoring.

**Closeout fixes and added regression coverage:**

- Fixed placement hover cleanup so leaving a roof plane clears both the local ghost and transient `placementTool.roofPlaneId`; an inactive plane can no longer remain semantically emphasized.
- Fixed Escape during an active SVG drag so it cancels the canonical transaction, clears the local drag session and releases pointer capture. A later pointer move can no longer mutate the project after cancellation.
- Added UI regression coverage for roof-window drag with multiple moves -> exactly one history entry -> exact Undo, plus Escape rollback and ignored later movement.
- Added UI regression coverage for exact window nudge modifiers (`10 / 100 / 1 mm`), successful between-rafter placement, exact `K1-01` collision warning and coordinated warning state.
- Added store coverage for a failed too-wide placement preserving the feature and history while reporting the exact bay/width data, and for contextual preset transitions remaining outside the project document/history.
- Existing multiple-window batten splitting tests were retained rather than duplicated.

**Validation:**

- Clean-HEAD preflight before edits: `typecheck` PASS; **289 tests across 32 files** PASS; lint PASS with no warnings/errors; production build PASS; `git diff --check` PASS.
- Final worktree validation: `typecheck` PASS; **294 tests across 32 files** PASS; lint PASS with no warnings/errors; production build PASS; `git diff --check` PASS.
- Final production bundle: main **499.11 kB / 142.64 kB gzip**, CSS **77.86 / 15.58 kB**, React **51.29 / 18.04 kB**, localization **49.54 / 16.09 kB**, icons **12.22 / 2.64 kB**. The main chunk remains below the Vite advisory threshold.

**Browser, responsive and touch QA:**

- The XAMPP production URL `http://localhost/projects/RoofCalc/apps/web/dist/` responds with HTTP 200; the older path without `/projects/RoofCalc/` responds with 404.
- The required in-app Browser inventory returned no available browser instances (`[]`). Under the Browser control protocol no alternative browser automation was substituted, so gable/hip review at wide desktop, `1440 x 900`, `768 px` and `360 x 800` could not truthfully be performed in this iteration.
- No claim is made for native mouse, pen or touch behavior. In particular, Space-pan, pointer-centred wheel zoom, placement ghost, collision emphasis, two-window/batten composition, Detail Dock occlusion and mobile sheet reachability still require visual/device verification.
- Because that QA is a stated V13 completion requirement, the iteration remains `PARTIAL`; no speculative polish or V14 work was started.

**Files changed in this closeout:**

- `apps/web/src/assembly/SkeletonCanvas.tsx`
- `apps/web/src/assembly/Page.test.tsx`
- `apps/web/src/assembly/store.test.ts`
- `PROJECT_BLUEPRINT.md`

**Known boundaries:**

- Roof-window openings, clearances, collision checks and between-rafter placement are generic geometric guidance, not manufacturer installation requirements or structural approval.
- Battens remain generic geometric rows and quantities, not a covering/product system. No opening framing, dormer, chimney, statics, prices/estimating, auth/database, PDF or full 3D was added.

**NEXT ACTION:**

> When an in-app browser or physical device is available, run the V13 matrix on gable and hip at wide desktop, `1440 x 900`, `768 px` and `360 x 800`: inspect width use and panel/dock occlusion; exercise placement hover/ghost/cancel, O1 collision and successful placement, two windows with split battens, all presets, Space-pan, pointer-centred wheel zoom, Fit, focus, Undo/Redo and mobile sheet reachability. Record actual observations, fix only evidenced V13 polish defects, rerun the definition-of-done suite, then change this checkpoint to `COMPLETE` or retain `PARTIAL` with exact failures. Do not begin Iteration 014 automatically.

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
