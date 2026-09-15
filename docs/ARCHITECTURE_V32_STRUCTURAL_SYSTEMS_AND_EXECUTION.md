# V32 — Structural Systems, Ridge Connections & Execution Workbench

Status: implemented, 2026-09-15. V32 introduces two explicit domain concepts
that previously lived as unstated assumptions inside K1/gable geometry: a roof
**structural system** (rafter vs. rafter + collar tie) and a K1 **ridge
connection** (ridge board, direct meeting, half-lap). It changes no H1/J1
math, no covering solver and no persisted schema version.

## Roof shape vs. structural system vs. ridge connection

These are three independent facts, and V32 keeps them independent on purpose:

- **Roof shape** — `gable` / `hip` (`RoofTemplateSpec.type`, unchanged).
- **Structural system** — `rafter` / `rafter-collar-tie`
  (`GableRoofTemplateSpec.structure?.system`, new). Gable roofs only; a hip
  template never carries `structure` and always resolves to `rafter` via
  `roofStructureSystem(template)`.
- **Ridge connection** — `ridge-board` / `direct-meeting` / `half-lap`
  (`AssemblySpec['ridge'].connection`, new; also present on
  `GableRoofTemplateSpec.ridge` / `HipRoofTemplateSpec.ridge`, which reuse the
  same type). Applies to K1 (common rafter) only, on both roof shapes; H1/J1
  keep their own pre-V32 ridge-deduction math untouched.

No connection is ever inferred from roof shape or structural system. A hip
roof with `direct-meeting` and a gable roof with `rafter-collar-tie` and
`half-lap` are both legal, independent combinations.

## Persistence

Both fields are additive and optional, defaulting to the exact pre-V32
behavior when absent (`system: 'rafter'`, `connection: 'ridge-board'`). No
`schemaVersion` bump; see `docs/SCHEMA_REGISTRY.md` §1's V32 note. Editing
roof pitch/span through the existing numeric edit pipeline
(`editedTemplate` → `roofTemplateFromAssembly` → `gableTemplateFromAssembly`)
now threads `structure` through and re-clamps an existing collar-tie height
into the new legal range, so a geometry edit that would otherwise invalidate
the collar tie clamps it instead of throwing; a direct edit of the collar-tie
height field itself is validated (and rejected as invalid input, not silently
clamped) the same way every other numeric field already is.

## Collar tie (Jętka)

`packages/roof-math/src/collar-tie.ts` is a small, self-contained pure module:

- `calculateCollarTie({ halfRunMm, pitchDeg, heightAboveWallPlateMm })` — the
  horizontal segment between the two theoretical rafter axes (outer wall-plate
  top to ridge apex — the same simplified centerline the 3D skeleton already
  draws for rafters) at the given height above the wall-plate/seat-plane
  reference (`z = 0` in skeleton coordinates). Returns `lengthMm` and a
  derived `positionAlongRafterMm` (distance along the rafter's slope from the
  wall-plate reference to the tie), never two independently-editable position
  values.
- `maxCollarTieHeightMm` / `clampCollarTieHeightMm` — the single positioning
  guard: a tie must stay strictly below the ridge apex.

This is theoretical/centerline geometry, not a finished, notch-aware
fabrication result — it does not account for birdsmouth, ridge-board
deduction or a bevel at the rafter contact face. It carries no structural
section sizing; the default section (100×38 mm) offered when the system is
first enabled is a starting value, not an engineering recommendation.

**Family depth.** Collar tie deliberately follows the shallower purlin/ridge
pattern (a `SkeletonMemberKind` + a schedule family code), not the deeper
K1/H1/J1 pattern (own `ResolvedMemberPrototype`, own `FabricationPlan`,
detail-preview marking steps). A collar tie is a plain, un-notched horizontal
member; the K1/H1/J1 depth exists for members whose finished geometry
involves cuts, notches and connections. Per the Definition of Ready, collar
ties enter the member schedule as a truthful geometric family (`C1`, one
instance per rafter station, `resolveCollarTies` / `createGableRoofSkeleton`)
with a distinct 3D visual style (`--a-collar-tie` token, `kind-collar-tie` CSS
class) and full selection/inspector support (`isCollarTie` branch in
`Inspector.tsx`, editable height/section shared by the whole family), but they
are **not** wired into `RoofFabricationPackage`, `createMemberInstanceContexts`
or K1-style procurement — there is no blank, no cutting plan and no
`requiredBlankLengthMm` for a collar tie. `docs/domain/EXECUTION_SEMANTICS_MATRIX.md`'s
`axis-geometric` semantic already describes exactly this boundary for generic
skeleton members.

## Ridge connection

`RIDGE_BOARD` is the exact pre-V32 default, renamed to an explicit,
user-visible choice instead of an implicit assumption baked into
`thicknessMm`. `calculateRidgeCut` (`packages/roof-math/src/cuts/ridge-cut.ts`)
now takes an optional `connection` (default `ridge-board`) and echoes it back
on its result:

- `ridge-board` — uses the declared `thicknessMm`, byte-identical to the
  pre-V32 result.
- `direct-meeting` — the *same* near-face-to-axis plumb-cut geometry with the
  declared `thicknessMm` ignored (treated as zero): two opposing rafters meet
  directly on the run axis, no board. This is not a new geometric model; it is
  the pre-V32 `thicknessMm === 0` degenerate case, made an explicit,
  independently-selectable connection instead of an implicit side effect of
  setting the thickness field to zero.
- `half-lap` — same reference axis geometry for the 3D skeleton (so the
  drawing stays renderable and honest about where the theoretical meeting
  point is), but **no modeled overlap/engagement geometry**. Per
  `docs/domain/TIMBER_CONNECTION_EXECUTION_RESEARCH.md`, a half-lap needs an
  explicit engagement depth, which face is removed from each rafter, and how
  that interacts with the roof pitch and section — none of which the current
  research or 3D member model resolves. V32 does not guess it.

`resolveK1FabricationBlank` (`packages/roof-math/src/k1-fabrication-blank.ts`)
is the single gate between "connection selected" and "fabrication-ready":

| Connection | Blank | `ridgeConnection` literal |
| --- | --- | --- |
| `ridge-board`, `thicknessMm > 0` | resolved | `centered-vertical-ridge-board-near-face-butt` |
| `ridge-board`, `thicknessMm <= 0` | unresolved, `ridge-board-not-modeled` | — |
| `direct-meeting` | resolved | `direct-opposing-rafter-plumb-meeting` |
| `half-lap` | **always unresolved**, `ridge-connection-not-modeled` | — |

An unresolved K1 blank already propagates through the exact pre-V32 gates: the
`member-fabrication` and `cutting-plan` export sections become `unavailable`
(`apps/web/src/assembly/export-adapter.ts`), and the workbench K1 preparation
panel and cutting-plan dialog stay unreachable — the same mechanism that
already handled a missing ridge board. Choosing `half-lap` therefore hides K1
preparation and cutting entirely (including its birdsmouth details, which is
a coarser gate than strictly necessary, but reuses a proven, tested mechanism
instead of adding a second one) rather than showing a guessed cut.

**Cache invalidation.** `k1RequirementSignature`
(`apps/web/src/assembly/k1-cutting-adapter.ts`) now hashes
`blank.ridgeConnection` alongside the required-piece lengths, so a connection
change that happens to produce the same `requiredBlankLengthMm` as the
previous connection still invalidates the cached `CuttingPlan` — the plan
always gets rederived when the connection differs, never silently reused
across a different ridge geometry.

## Export truthfulness

`packages/document-core`'s `ProjectSummarySection` gained `structuralSystem`;
`MemberFabricationSection` gained `ridgeConnection: 'ridge-board' |
'direct-meeting'` (present only when the section exists, i.e. only when
resolved — `half-lap` never produces this section); `AssumptionsSection.codes`
gained `ridge-direct-meeting`, `ridge-half-lap-unresolved` and
`collar-tie-geometric`. The assumptions section — always shown regardless of
K1 status — is where a `half-lap` selection explains *why* member preparation
and cutting are unavailable, instead of the carpenter just seeing a missing
section with no reason.

## Not implemented (explicit boundary, matching V26C/domain research)

No load capacity, required section, fastener count, connector adequacy or
snow/wind check. No half-lap cut geometry (engagement depth, removed face,
interaction with pitch/section) — implementing that requires the parameter
model the domain research explicitly says is missing, not a guess. No H1/J1
ridge-connection or joinery change — H1/J1 keep their pre-V32 math verbatim.
No cost engine, no pricing, no database. No `ProjectDocument` V2.

## Workbench perspectives (deferred)

The prompt that opened this iteration also asked for a five-perspective
top-level navigation layer (Projekt / Wykonanie / Materiały / Kosztorys /
Dokumenty) over the existing six-task workbench. That UI layer was not built
in this iteration: the domain work above (new persisted fields, a new member
family, a new K1 fabrication branch, cache-invalidation correctness, exports)
already touches project-document.ts, gable-roof.ts, k1-fabrication-blank.ts,
k1-cutting-adapter.ts, document-core, export-adapter.ts, quantity-core,
store.ts, Inspector.tsx, Inputs.tsx, workbench.ts, translations.ts and
styles.css. Adding a second, independently risky change — a navigation
rearchitecture across `WorkbenchControls.tsx`, `MobileTaskDock.tsx`,
`Toolbox.tsx` and the workbench visual system, on top of that — was assessed
as more likely to produce a half-finished, undertested UI layer than a
genuine improvement, and was cut from this iteration rather than shipped
partially. See the V32 final report for the recommended next slice.

## Files touched

- `packages/timber-model/src/index.ts` — `RidgeConnectionType`,
  `CollarTieSpec`, `RoofStructureIntent`, `GableRoofTemplateSpec.structure`,
  `SkeletonMemberKind` gains `'collar-tie'`, `ResolvedCollarTie`.
- `packages/roof-math/src/collar-tie.ts` (new), `cuts/ridge-cut.ts`,
  `assembly.ts`, `gable-roof.ts`, `hip-roof.ts` (ridge schema only, no
  behavior change), `k1-fabrication-blank.ts`, `roof-template.ts`, `index.ts`.
- `packages/quantity-core/src/index.ts` — `familyFor` gains `'collar-tie' → 'C1'`.
- `packages/document-core/src/index.ts` — new section fields described above.
- `apps/web/src/assembly/` — `store.ts` (`setRoofStructureSystem`,
  `setRidgeConnection`, collar-tie edit fields), `Inputs.tsx`
  (`StructureSystemSelector`, `RidgeConnectionSelector`, `CollarTieInputs`),
  `Inspector.tsx`, `workbench.ts` (legend/tool registry entries),
  `k1-cutting-adapter.ts`, `export-adapter.ts`, `ExecutionExport.tsx`,
  `translations.ts`, `styles.css`.
- `fixtures/projects/10-gable-collar-tie-direct-meeting.cieslacalc.json` (new).
