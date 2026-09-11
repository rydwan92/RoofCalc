# Codex Prompt — Iteration 010: Member Instance Workflow, Spatial Detail Overlays and Workbench UX Hardening

This is the approved Iteration 010 contract for the local `rydwan92/RoofCalc` repository.

Reference baseline:

- branch: `main`
- commit: `7f98a858f13e7d1d2b13e6538cdb15f02f8a7f1c`
- commit title: `V9 prompt 11.09`
- Iteration 009 status: complete, with 252 tests across 29 files

The two user-supplied V10 briefs are combined here. The complete `Member Instance Workflow` brief controls naming and execution details; the additional `Spatial Detail Overlays and Workbench Architecture` requirements remain additive where they do not conflict.

Do not discard user changes. Do not commit or push without a separate request.

## 1. Mandatory preparation

Read in full, in order:

1. `AGENTS.md`
2. `PROJECT_BLUEPRINT.md`, especially `WORK CHECKPOINT`
3. `docs/ROOFCALC_PRODUCT_NORTH_STAR.md`
4. `docs/ARCHITECTURE_V3_WORKBENCH.md`
5. `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`
6. `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`
7. `docs/ARCHITECTURE_V6_HIP_ROOF_AND_RAFTER.md`
8. `docs/ARCHITECTURE_V7_JACK_RAFTERS_AND_FABRICATION.md`
9. `docs/ARCHITECTURE_V8_CUT_PREVIEWS_AND_DETAIL_DRAWER.md`
10. `docs/ARCHITECTURE_V9_PROJECT_WORKBENCH_AND_VIEW_SYSTEM.md`
11. `docs/HIP_RAFTER_GEOMETRY.md`
12. `docs/JACK_RAFTER_GEOMETRY.md`
13. `docs/DOMAIN_RESEARCH_ROADMAP.md`
14. `docs/PROMPT_ITERATION_009.md`
15. current Workbench, store, skeleton, selection, Detail Drawer and fabrication-package implementation and tests

Before source edits run:

```bash
git status
git diff --stat
git diff
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 build
```

Record the baseline test count and build output. Preserve all local work.

Before implementation, create `docs/ARCHITECTURE_V10_MEMBER_INSTANCE_WORKFLOW.md` and establish the model contract first.

## 2. First close the V9 QA gap

If a real browser is available, run the outstanding V9 desktop/tablet/mobile acceptance matrix against a production build. Cover gable, rectangular and square hip roofs, one/multiple purlins, Construction/Cuts, isolation, dimensions, K1/H1/J1, Detail Drawer, Before/After, Undo/Redo, pan/zoom/Fit, Quick-to-Builder handoff and horizontal overflow.

Fix only evidenced V9 defects. If no browser surface is available, record that honestly and continue with DOM, geometry and CSS analysis. Do not claim visual QA.

## 3. Product outcome

The user must be able to select one physical roof member and immediately understand:

1. which physical instance it is,
2. where it is in the roof,
3. which K1/H1/J1 prototype and length group it uses,
4. which preparation operations apply and where they occur,
5. how to move from roof to member to operation/detail and back without losing orientation.

Continue the precise reactive SVG/2.5D workbench. Do not build full CAD or a second geometry engine.

## 4. Physical member-instance contract

Add a pure renderer-neutral projection equivalent to:

```ts
interface MemberInstanceContext {
  instanceId: string;
  prototypeId: string;
  familyCode: 'K1' | 'H1' | 'J1';
  memberKind: string;
  instanceIndex: number;
  instanceCount: number;
  side?: string;
  roofPlaneId?: string;
  buildingStationMm?: number;
  lengthMm: number;
  lengthGroupId?: string;
  section: { widthMm: number; depthMm: number };
  relatedInstanceIds: string[];
  relatedOperationIds: string[];
}
```

Names may follow the current architecture. The projection must come from the current `RoofTemplateSpec`, resolved roof/skeleton and `RoofFabricationPackage`; contain no React, DOM, pixels, translations or camera state; preserve stable IDs; distinguish instance from fabrication prototype; map every J1 to its exact length group; keep four spatial H1 instances; and avoid duplicating K1 fabrication calculations.

Provide pure selectors for all instances in a family, current/previous/next instance, length group, preparation package, supported operations and family-specific limitations. Selection/navigation must not mutate the project document or Undo/Redo history.

## 5. Semantic selection and context

The application must distinguish:

- whole roof,
- member family/prototype,
- one physical instance,
- support,
- preparation operation/joint,
- local detail.

Use one shared selection/context source across Skeleton, Toolbox, Inspector, Preparation Plan, Detail Drawer and a compact interactive breadcrumb such as:

```text
Dach kopertowy › H1 Krokiew narożna › Egzemplarz 2 z 4 › Z3 Cięcie górne
```

Breadcrumb ancestors return to the wider context without changing roof parameters. Clicking empty canvas may return to roof, but must not accidentally discard an active detail workflow.

## 6. Instance navigator

Add a compact contextual navigator with:

- Previous member,
- Next member,
- family/index such as `H1 2/4`,
- Show on roof,
- Isolate,
- shared-prototype information,
- length-group information when applicable.

Navigation order must be spatially logical and deterministic. It must select exactly one member, preserve a sensible view, update J1 length group and keep an active operation only when it remains valid. It must not change geometry, history or `RoofProjectDocumentV1`.

Desktop placement may be in the Inspector or a light strip above the canvas. Mobile placement must remain compact and must not obscure the drawing.

## 7. Spatial orientation

For an active instance show side/roof plane/corner, building station when available, instance number, family/prototype, length group and a small roof locator/minimap.

The locator must reuse the existing skeleton geometry and semantic selection. It must not create a second roof model or imply unavailable precision.

## 8. Semantic preparation-operation overlays

Add clickable markers on the selected physical member using only domain-derived data:

- operation code/name,
- actual member station or endpoint,
- related support,
- reference direction/datum when unambiguous,
- material-removal semantics,
- status: supported, partially supported or incomplete geometry.

Typical K1 markers are `Z1 Murłata`, `Z2 Płatew P1`, `Z3 Płatew P2`, `K1 Kalenica`.

Clicking a marker must select the canonical fabrication operation, switch to Cuts, preserve the instance, update/open the correct Detail Drawer when a real preview exists, show dimensions/instructions and synchronize Preparation Plan.

Overlay positions must derive from member/world geometry plus viewport projection, never hard-coded operation pixels. Use a small deterministic collision policy: prioritize the active operation, compact secondary markers, and simplify labels at narrow widths while keeping exact data in Inspector/Drawer. Markers must work by pointer and keyboard (`Enter`/`Space`).

## 9. Local detail boundaries

K1 must clearly show top/bottom edge, datum, eave-to-ridge direction, support/notch, active operation and Before/After states.

H1 must retain coordinated plan/elevation/top-face views, explicitly name every angle reference and keep the backed-versus-dropped warning. Do not present it as a complete saw-face model.

J1 must show instance position, length and group while retaining the theoretical H1 centre-plane basis. Surface the unresolved physical H1-face deduction and J1–purlin joinery. Do not invent a cut drawing or value.

Every overlay value must come from an existing solver result, resolved operation or fabrication package.

## 10. Instance Inspector

For a physical instance show:

- family code/name,
- instance X of Y,
- stable ID,
- side/roof plane/corner,
- building station if present,
- exact length,
- section,
- length group,
- shared fabrication prototype,
- related operations,
- geometry limitations.

Do not add per-instance fabrication overrides. Explain that editing shared roof/prototype values affects multiple pieces. Exact edits continue through existing canonical actions and validation.

## 11. Workbench architecture hardening

Refactor by product responsibility without rewriting the app. Preferred shape:

```text
AssemblyPage
├── QuickWorkspace
└── BuilderWorkbench
    ├── WorkbenchContextBar
    ├── Toolbox
    ├── CanvasWorkspace
    │   ├── SkeletonCanvas
    │   ├── MemberInstanceOverlay
    │   └── OrientationMiniMap
    ├── Inspector
    │   └── MemberInstanceInspector
    ├── DetailDrawer
    └── PreparationPlan
```

The page composes rather than accumulating domain logic. Instance/operation mappings are pure and testable. Resolve/memoize the roof, skeleton, fabrication package and previews once. Camera/hover remain local. Instance navigation belongs to `WorkbenchViewState`; the canonical document remains project-only. View operations create no project history. Keep React, translations and icons outside domain packages. Split CSS only where responsibility improves.

Add a measurable guard that transient workbench changes do not rerun the expensive roof resolver.

## 12. UX and accessibility

Keep Quick Calc simpler than Builder and the canvas visually dominant. Avoid another permanent wall of controls. Use outline, line weight, opacity, badges and labels so selection does not rely on colour alone.

All new controls require hover, focus-visible, active and disabled states; correct accessible names; keyboard use; and approximately 44 px mobile targets. `Escape` steps operation → instance → roof without losing canonical data, and global shortcuts must not fire while editing a form field. Maintain full PL/EN coverage.

Desktop retains Toolbox / canvas / Inspector. At 768 px and 360×800 there must be no horizontal overflow; navigator/breadcrumb must not push out the canvas; Drawer and Inspector must not jointly consume nearly the whole screen; exact values remain accessible.

## 13. Required tests

Add pure tests for:

- K1 instance → prototype/package,
- all four H1 instances,
- multiple J1 instances and length groups,
- mirrored members,
- deterministic previous/next ordering,
- instance → operation mapping,
- safe operations without a detail preview,
- selection exclusion from `RoofProjectDocumentV1`,
- no Undo/Redo entries for navigation/detail actions.

Add UI tests for exact member click/`instanceId`, instance count, previous/next, locator, breadcrumb, operation marker, automatic Cuts, correct detail opening, return to the same instance, keyboard use, narrow behavior, Quick/Builder consistency, 940/800 spacing, multiple purlins and unchanged K1/H1/J1 geometry.

Do not update snapshots without explaining the cause.

## 14. Browser QA

If available, validate:

- desktop 1440×900: gable with at least two purlins, rectangular hip, square hip, K1/all H1/several J1, navigator, overlays, breadcrumb, locator, isolation, presets, Before/After, Undo/Redo, pan/zoom/Fit;
- tablet about 768 px: navigator/Inspector readability, overlay collisions and instance transitions;
- mobile 360×800: no horizontal overflow, unobscured canvas, bottom-sheet behavior, readable instance context, tappable operation badges and correct return to roof.

Only fix issues confirmed by tests or inspection. If Browser is unavailable, record that fact and make no visual claim.

## 15. Excluded scope

Do not implement authentication, database/backend persistence, project list/revisions, cloud sync, PDF/export, costing, roof covering, new roof types, valleys, openings/windows/chimneys/dormers, collar ties/posts/struts, structural verification or safety claims, Three.js/full CAD, per-instance production overrides, unverified H1/J1 geometry or a second calculation engine.

## 16. Final validation and checkpoint

Run:

```bash
npx pnpm@10.15.1 typecheck
npx pnpm@10.15.1 test
npx pnpm@10.15.1 lint
npx pnpm@10.15.1 build
git diff --check
git status
git diff --stat
```

Do not mark complete with TypeScript/test/build failures, NaN/Infinity, project mutation from selection, divergent Quick/Builder math, preview-only cut math, untranslated copy, horizontal mobile overflow, lost instance context or hidden H1/J1 limitations.

Update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT` with real status, completed functions, final `MemberInstanceContext`, instance/prototype/group/operation mapping, UI architecture changes, changed files, baseline/final test counts, validation, browser QA, performance, limitations, incomplete items and one precise `NEXT ACTION`.

Final report should state what users can do, architecture added, geometry-consistency verification, QA, limitations, changed files and readiness for manual review/commit.

Do not start Iteration 011. Do not commit or push.
