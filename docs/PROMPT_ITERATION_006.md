# Codex Prompt — Iteration 006: Hip Roof + Hip Rafter H1

You are continuing the existing `rydwan92/RoofCalc` project after validated Iteration 005.

Do not rewrite the repository.
Do not replace the existing gable/common-rafter path.
Do not create an unrelated standalone hip calculator with duplicated formulas.

Before editing code:

1. read `AGENTS.md`,
2. read `PROJECT_BLUEPRINT.md`,
3. read `docs/ARCHITECTURE_V3_WORKBENCH.md`,
4. read `docs/ARCHITECTURE_V4_ROOF_SKELETON.md`,
5. read `docs/ARCHITECTURE_V5_INTERACTIVE_SKELETON.md`,
6. read `docs/ARCHITECTURE_V6_HIP_ROOF_AND_RAFTER.md`,
7. read `docs/HIP_RAFTER_GEOMETRY.md`,
8. read `docs/DOMAIN_RESEARCH_ROADMAP.md`,
9. inspect the current `PROJECT_BLUEPRINT.md` WORK CHECKPOINT,
10. run the full preflight from `AGENTS.md`.

The newer explicit Iteration 006 prompt supersedes the old checkpoint instruction saying not to begin Iteration 006. Update the checkpoint accordingly once work begins and again before stopping.

---

# Goal

Introduce the first new roof/member family without damaging the architecture proven in Iterations 001–005.

RoofCalc must support:

```text
GABLE / DACH DWUSPADOWY
  → existing K1 common-rafter workflow

HIP / DACH KOPERTOWY
  → same common-rafter K1
  → new H1 hip-rafter prototype
  → four physical hip instances in the skeleton
```

The user must be able to understand **why the hip rafter differs from a common rafter** through plan/elevation/cut visualization, not only through a table of angles.

This iteration is about a **regular rectangular equal-pitch hip roof** only.

---

# 1. Preserve V5 first

Before adding anything, verify that existing V5 behavior remains intact:

- Quick Calc common rafter,
- gable Builder,
- 2.5D solid skeleton,
- unique rafter instances,
- multiple purlins,
- purlin direct manipulation,
- pitch/span/building-length handles,
- pan/zoom/fit,
- undo/redo,
- common-rafter fabrication view,
- PL/EN and mm/cm/m.

Do not regress these to simplify the new implementation.

---

# 2. Generalize roof-template typing

Introduce a union such as:

```ts
type RoofTemplateSpec =
  | GableRoofTemplateSpec
  | HipRoofTemplateSpec;
```

Do not turn the store into `any` or a loose bag of optional fields.

Keep template-specific schemas discriminated by `type`.

The common editable values should remain easy to preserve when switching template:

- building length,
- span / half-span,
- pitch,
- overhang,
- common-rafter section,
- units.

Hip-specific state includes at least:

- hip-rafter section,
- hip roof/ridge metadata required by the geometry contract.

For V6 require:

```text
buildingLength >= full span
```

Support equality as a pyramid/zero-ridge case.

Show a local understandable validation message instead of producing negative ridge geometry.

---

# 3. Implement pure hip-rafter math

Create a dedicated pure module in `roof-math`, for example:

```text
packages/roof-math/src/hip-rafter.ts
```

Use `docs/HIP_RAFTER_GEOMETRY.md` as the normative project geometry contract for this iteration.

Calculate at least:

- common rise,
- exact hip plan run,
- hip tail plan run,
- theoretical hip centerline length,
- tail line length,
- total theoretical outer-eave-to-ridge line,
- hip slope angle,
- plumb-line angle relative to member axis,
- seat/level-line angle relative to member axis,
- hip cheek/side-cut/layout angle,
- backing/bevel angle,
- ridge plan deduction,
- ridge axis deduction,
- physical line length to ridge face.

Use exact `Math.SQRT2` / `sqrt(2)`.

Never use rounded `17/12` internally.

Never round intermediate calculations.

Do not put translations in `roof-math`.

---

# 4. Required mathematical regressions

Add strong Vitest references.

## 1000 mm / 30°

Input:

```text
run = 1000 mm
pitch = 30°
overhang = 0
ridge thickness = 0
```

Expected approximately:

```text
rise                    577.3502691896 mm
hip plan run            1414.2135623731 mm
hip line length         1527.5252316519 mm
hip slope               22.2076542986°
plumb-to-member         67.7923457014°
cheek/layout            42.7941371071°
backing/bevel           20.7048110546°
```

## Exact 6/12 cross-check

Use:

```text
pitch = atan(6/12)
common run = 12 units
```

Expected:

```text
hip plan run            16.9705627485
hip line length         18.0
hip slope               19.4712206345°
cheek/layout            43.3138566583°
backing/bevel           18.4349488229°
```

Add additional tests for:

- zero overhang,
- nonzero overhang,
- zero ridge thickness,
- nonzero ridge deduction,
- low and high supported pitches,
- invalid run/pitch/section/ridge values,
- no NaN/Infinity.

---

# 5. Add hip fabrication domain types

The current common `EndCut` is not sufficient to explain all H1 geometry.

Extend `timber-model` minimally with renderer-independent structured hip fabrication data.

Prefer explicit concepts such as:

- `HipRafterSpec`,
- `HipRafterResult`,
- `CompoundEndCut`,
- `HipBackingDetail`,
- hip fabrication datums/stations where required.

A compound ridge operation must be able to state separately:

- plumb/reference angle,
- cheek/side-cut angle,
- whether the regular detail is symmetric/double-cheek,
- ridge deduction/reference station.

Do not represent these only as strings.

Do not build arbitrary solid boolean CAD if it is not needed for the regular V6 case.

---

# 6. Add HipRoofTemplateSpec and pure resolver

Create a pure hip template resolver.

For V6 coordinate system:

```text
X = span direction
Y = building length / ridge direction
Z = vertical
```

Use the exact plan geometry in `HIP_RAFTER_GEOMETRY.md`.

Resolve:

- ridge height,
- theoretical ridge length,
- ridge endpoints/apex,
- four hip axes,
- common-rafter placement region along the central ridge where applicable,
- four physical hip instances linked to one H1 prototype,
- common-rafter K1 cross-section calculation from the same pitch/span state.

For square building:

```text
ridge length = 0
```

and all four hips terminate at one apex.

Do not create duplicate full fabrication calculations for each identical physical hip instance.

---

# 7. Skeleton: add the real hip roof template

Reuse the V5 solid-member/prism renderer.

Builder must be able to show:

- gable skeleton unchanged,
- hip skeleton for a regular rectangular hip roof.

Hip skeleton minimum:

- wall/perimeter support context sufficient to read the footprint,
- ridge solid when ridge length > 0,
- four visually strong hip rafter solids,
- common rafters where the central ridge geometry makes them valid,
- existing compatible purlin representation only if it remains geometrically honest,
- unique physical IDs for each hip.

Suggested instance identity:

```text
instance:hip:front-left
instance:hip:front-right
instance:hip:rear-left
instance:hip:rear-right
```

Suggested prototype:

```text
member:hip-rafter-H1
```

Clicking one hip must select only that physical hip but expose its shared H1 fabrication prototype.

Do NOT fill the end planes with fake jack rafters in this iteration.

If the missing jacks make the roof visually ambiguous, use subtle roof-plane/boundary guide polygons or outlines clearly marked as guides, not fabricated timber members.

---

# 8. Builder roof-type selector

Add an intuitive roof-template choice in the geometry context, for example:

```text
Typ dachu
[ Dwuspadowy ] [ Kopertowy ]
```

Requirements:

- no new application shell,
- switching is one undoable transaction,
- preserve compatible canonical values,
- initialize hip section explicitly,
- update skeleton immediately,
- no backend request,
- PL/EN translations.

Keep the main canvas dominant.

---

# 9. Quick Calc: common vs hip

Quick mode now needs a compact calculation/member selector.

At minimum:

```text
Krokiew zwykła
Krokiew narożna
```

Do not make Quick Calc look like Builder.

## Hip Quick Calc default inputs

Show only:

- common run / half-span,
- pitch,
- overhang.

Expandable `Cięcia i przekrój`:

- hip-rafter width/depth,
- ridge thickness,
- optional explanatory framing-square reference if useful.

## Immediate H1 results

Prioritize:

- required/theoretical hip length,
- physical length to ridge face,
- hip plan run,
- hip slope,
- cheek/layout angle,
- backing/bevel angle,
- plumb marking angle.

Each non-obvious angle gets a small visual cue or tooltip explaining **where it is measured**.

`Otwórz w kreatorze` must open/preserve the corresponding hip template state.

No duplicate Quick-only math.

---

# 10. Hip fabrication drawing sheet

A hip rafter cannot be explained professionally using only the existing one-plane common-rafter drawing.

Create a coordinated H1 fabrication presentation using the same pure result.

It should include:

## Plan view

Show:

- square corner,
- common run,
- exact diagonal hip plan run,
- 45° plan direction,
- theoretical ridge center/end,
- ridge face/deduction,
- overhang diagonal if nonzero.

## Elevation along hip

Show:

- rise,
- hip slope,
- line length,
- tail length,
- ridge deduction,
- plumb and seat references.

## Cut/top-face detail

Show:

- cheek/layout angle,
- ridge-end cut concept,
- backing/bevel detail in a separate local cross-section/glyph.

These are coordinated subviews of H1, not new global application modes.

Make the drawings clear enough that a non-expert understands why `30° common pitch` does not mean `30° hip pitch`.

---

# 11. Contextual Builder flow

When hip template is active:

- click common rafter → existing K1 context,
- click hip rafter → H1 instance/prototype context,
- inspector identifies corner/instance,
- result rail switches to H1 values,
- action `Przygotuj krokiew narożną` opens H1 fabrication sheet,
- clear `Wróć do szkieletu` returns to construction.

Avoid adding permanent `Plan / Bok / Góra / Detal` app tabs.

The H1 sheet itself may contain coordinated mini-view headings because they explain one physical member.

---

# 12. Reactive shared state

When hip template is active, editing:

- pitch,
- span/half-span,
- building length,
- overhang,
- ridge thickness,
- hip section,

must update the appropriate:

- hip skeleton,
- ridge geometry,
- K1 common rafter,
- H1 hip rafter,
- fabrication results,
- cut/detail drawings,

from one canonical state flow.

Existing V5 pitch/span/building-length direct handles should work for hip template where semantically valid.

Do not create a separate history store.

---

# 13. Improve usability while touching this area

This iteration should also polish the product rather than only add formulas.

Required UX improvements:

- `Krokiew zwykła` page title should no longer make Builder feel limited to one member when a hip roof is selected; use context-aware title such as roof/workbench + selected member subtitle.
- selected member type must be obvious on canvas and inspector,
- hip members must be visually distinct without relying on color alone,
- show concise live explanation of selected hip geometry,
- maintain compact controls,
- avoid more permanent toggles,
- keep canvas large,
- preserve keyboard accessibility,
- maintain 360 px mobile usability.

On mobile Hip Quick Calc should be the primary practical path; Builder remains available but must not become a vertically stacked desktop admin interface.

---

# 14. Do not implement yet

Do NOT implement in Iteration 006:

- jack-rafter fabrication,
- jack cut lists,
- valley rafter,
- unequal-pitch/irregular hips,
- dormers/openings,
- arbitrary polygon roofs,
- structural load/capacity checks,
- database/auth,
- project persistence,
- PDF/e-mail,
- payment,
- Three.js/full 3D CAD.

Do not fake these as completed tools.

The likely next geometry iteration after user review is jack rafters + complete regular hip-roof infill.

---

# 15. Tests

In addition to pure math regressions, add tests for:

- `RoofTemplateSpec` discrimination,
- gable regression after union/generalization,
- hip ridge length for rectangle,
- zero ridge for square/pyramid,
- four unique hip instance IDs,
- one shared H1 prototype,
- hip instance axes matching ridge endpoints,
- hip Quick and Builder same canonical result,
- template switch preserving compatible values,
- pitch edit changing both K1 and H1 correctly,
- span change changing hip run/length/ridge length,
- building length changing ridge length but not the cross-sectional H1 run for fixed span,
- undo/redo of template switch and hip dimension edits,
- unit-display invariance,
- no NaN/Infinity.

Keep existing 171+ tests passing.

---

# 16. Visual QA

After build, perform browser QA if the available environment supports it.

Desktop:

- gable still works,
- switch to hip,
- rectangular hip skeleton reads clearly,
- square/pyramid case reads clearly,
- select each physical hip,
- open H1 fabrication sheet,
- change pitch and see H1/K1/skeleton update,
- test undo,
- test zoom/pan/fit.

Mobile around 360 px:

- Quick common/hip selector usable,
- H1 result values readable,
- no horizontal page overflow,
- coordinated H1 drawing does not become unreadable,
- Builder selection/inspector remains usable.

Do not claim visual QA if no browser is actually available.

---

# 17. Validation and checkpoint

Before stopping:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check
git status
git diff --stat
```

Fix implementation errors.

Update `PROJECT_BLUEPRINT.md` → `WORK CHECKPOINT` with:

- Iteration 006 status,
- exact `HipRoofTemplateSpec` / union decision,
- exact H1 formulas and naming,
- ridge-deduction convention,
- skeleton identity model,
- Quick/Builder UX changes,
- tests and counts,
- visual/mobile QA status,
- known limitations,
- exact `NEXT ACTION`.

If context/token budget gets low, follow `AGENTS.md` interruption protocol.

Do not start Iteration 007 automatically.

---

# Expected final report

Report:

1. how the template architecture changed,
2. exact hip formulas implemented,
3. how H1 differs from K1,
4. how ridge deduction is defined,
5. how hip skeleton is generated,
6. how physical hip instances map to one prototype,
7. how Quick Hip Calc works,
8. how the H1 fabrication sheet works,
9. which UX improvements were made,
10. test/typecheck/lint/build results,
11. remaining limitations,
12. exact checkpoint `NEXT ACTION`.
