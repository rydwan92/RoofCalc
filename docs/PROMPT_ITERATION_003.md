# Codex Prompt — Iteration 003: Dual Mode + Interactive Purlin Proof

You are continuing the existing `rydwan92/RoofCalc` project.

Do not rewrite the repository.

Before code:
1. read `PROJECT_BLUEPRINT.md`,
2. read `docs/ARCHITECTURE_V3_WORKBENCH.md`,
3. read `docs/DOMAIN_RESEARCH_ROADMAP.md`,
4. run `git status`, `git diff --stat`, `git diff`,
5. run current typecheck/tests/build to establish baseline.

Objective:
**Quick Calc and Visual Builder are two UIs over the exact same parametric assembly and fabrication engine.**

Do NOT add hip/valley, database, auth, PDF or 3D.

## A. Refactor fixed datums

The current `timber-model` uses `DatumId = 'A' | 'B' | 'C' | 'D'`.

Refactor to stable dynamic datum IDs.

Letters A/B/C/D remain optional generated display labels only.

Introduce semantic roles:
- member-start,
- member-end,
- support-heel,
- support-toe,
- cut-intersection,
- reference.

Update fabrication stations/instructions accordingly.

## B. Introduce AssemblySpec / ResolvedAssembly

Create a small editable domain model for one common rafter assembly.

Minimum:
- roof geometry,
- one rafter member,
- wall plate,
- ridge,
- zero or one intermediate purlin,
- requested joint behavior.

Separate:
`AssemblySpec` — editable user intent
from
`ResolvedAssembly` — calculated exact geometry.

Do not duplicate formulas.

## C. Purlin proof-of-generalization

Implement one optional intermediate `purlin`.

The purlin:
- has width/height,
- has a stable ID,
- has editable placement,
- can be added/removed,
- initially uses a horizontal top/contact plane in side elevation,
- uses generic support/joint logic rather than a special calculator.

Placement:
support a canonical exact mode such as horizontal X from wall/reference or station along member.

The purlin automatically produces/updates its seat-notch joint when moved.

Tests:
- moving purlin changes joint station,
- notch geometry recalculates,
- wall-plate notch remains unaffected,
- invalid placement is rejected/clamped by documented rule.

## D. Dragging in Visual Builder

Add direct manipulation on SVG.

User selects and drags the purlin along its allowed axis.

Rules:
- Pointer Events,
- mouse + touch,
- screen → world transform,
- update domain placement, not pixels,
- clamp to valid span,
- simple snapping,
- show live numeric position.

Numeric inspector remains available.

## E. Simplify UI hierarchy

Replace prominent permanent `Konstrukcja / Element / Detal` hierarchy with:

Top-level application mode:
- `Szybkie`
- `Kreator`

Visual Builder default canvas = assembly.

Selecting:
- rafter → member properties/dimensions,
- wall plate → support/joint inspector,
- purlin → position/section/joint inspector,
- notch/cut → contextual detail.

Remove permanent Detail tab from primary UI.

Use contextual `Powiększ detal`.

## F. Quick Calc

Create a genuinely fast Quick Calc view using the same assembly engine.

Initially show:
- run,
- pitch,
- overhang.

Progressive disclosure:
- rafter section,
- wall plate width,
- seat length,
- ridge thickness.

Show:
- compact reactive drawing,
- stock/minimum length,
- main member/reference length,
- wall-plate notch dimensions,
- ridge cut,
- distance from datum to notch/cut.

Actions:
- `Pokaż trasowanie`
- `Otwórz w kreatorze`

`Otwórz w kreatorze` preserves exact same model values.

## G. Contextual detail lens

When a cut/notch is selected:
- focus/highlight it,
- show enlarged inset/context panel,
- show relevant local dimensions only,
- inspector edits controlling values.

Avoid making user switch whole canvas into a Detail mode.

## H. Dimension lanes

Current drawing code has fixed presentation offsets.

Introduce semantic dimension intent:
- primary,
- support,
- joint,
with priority.

Drawing layer assigns non-overlapping lanes.

No offsets keyed to fixed A/B/C/D.

Mobile may hide low-priority dimensions until selected.

## I. Toolbox

Visual Builder gets a collapsible toolbox.

Initial actions:
- add/remove purlin,
- select geometry,
- select rafter,
- select wall plate,
- select ridge.

Do not expose unimplemented fake tools as active.

## J. Optional libraries

You may add `react-resizable-panels` if it materially improves desktop UX.

Prefer native SVG + Pointer Events for canvas interaction.

Do not add a large CAD/canvas dependency without a concrete need.

## K. FabricationPlan

Generate fabrication summary from dynamic datums/joints.

For each support joint include:
- support type/name,
- exact station from chosen datum/edge,
- seat/contact length,
- notch depth,
- plumb/cut information,
- ordered marking instruction.

Multiple joints ordered along the member.

## L. Visual quality

Make the tool feel less like an administration form and more like a professional technical workbench.

Priorities:
- canvas dominant in Builder,
- Quick Calc compact,
- collapsible toolbox,
- contextual inspector,
- stronger hierarchy of key results,
- fewer persistent toggles,
- obvious selection,
- immediate purlin drag,
- discoverable detail/zoom,
- usable at 360px mobile width.

Do not solve this merely by recoloring.

## M. Tests

Add tests for:
- dynamic datums,
- purlin placement,
- purlin notch resolution,
- fabrication station ordering,
- Quick/Builder same-model equivalence,
- unit preservation,
- drag coordinate transform helper,
- invalid purlin positions,
- existing wall plate/ridge regressions.

Run:
- pnpm typecheck
- pnpm test
- pnpm lint
- pnpm build

## N. Checkpoint

Update `PROJECT_BLUEPRINT.md` WORK CHECKPOINT before stopping.

Record:
- AssemblySpec shape,
- dynamic datum strategy,
- canonical purlin placement,
- drag transform approach,
- dimension lane strategy,
- limitations.

Do not begin hip rafters automatically.
