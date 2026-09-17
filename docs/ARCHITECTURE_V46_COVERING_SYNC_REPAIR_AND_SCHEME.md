# V46 — covering/batten sync, one-step repair and roof-aware covering scheme

Status: IMPLEMENTED. Builds on V43B (covering → battens → counter-battens)
and V37 (covering studio). No solver was replaced; the audit found no
quantity defect.

## 1. Reported problems

1. Switching **Kopertowy ↔ Dwuspadowy** left coverings and build-up layers
   pointing at planes the new roof does not have. A hip covering on
   `left/right/front/rear` became "Nie znaleziono przypisanej połaci ·
   dotyczy 2 połaci"; the reverse switch covered only half of the hip.
2. Battens then showed **Niezgodne / Nieprawidłowe dane łat** with no action:
   `geometry-invalid` (including `roof-plane-not-found`) returned an empty
   action list — a dead end.
3. Picking a tile left the battens layer off, so the plane showed 0 tiles
   and the material view was a flat brown shape.
4. The covering drawing was visually crude: an 18 px non-scaling plane stroke,
   a uniform tile colour and no ridge/hip/eave context.

## 2. Root cause and fix

Roof-plane IDs are owned by the template (`roof-math.roofPlaneIds`). The
store rebuilt the document on `setRoofType` but copied plane lists verbatim.

`packages/calculator-core/src/plane-scope.ts` — pure, tested:

| Stored scope before switch | After switch |
| --- | --- |
| covering on **every** plane of the old roof | every plane of the new roof |
| covering subset | planes that still exist |
| covering subset that vanished | free planes of the new roof; removed and reported only if none are free |
| layer (`membrane`, `counterBattens`, `battenLayout`) on every plane or emptied | whole roof (`roofPlaneIds` absent) |
| layer subset | surviving planes |

`setRoofType` applies it in the **same undoable history entry** as the
template change. Loading an old project never rewrites it silently; the
repair below is explicit.

## 3. One-step repair — "Dopasuj pokrycie i łaty do dachu"

`apps/web/src/assembly/installation-repair.ts` → store `fitInstallationToRoof`
(one history entry, no entry when nothing changes):

- a single primary covering takes every plane of the current roof; several
  coverings are a deliberate split and only lose planes that do not exist;
- battens/counter-battens/membrane follow the whole roof;
- battens become AUTO when the tile data can derive a gauge, or take the
  sheet's fixed support gauge as a MANUAL value.

It never edits product data or geometry: a pitch below the product minimum
or an impossible gauge range stays visible.

`BattenWorkflowAction` gains `fit-roof`, offered for: stale plane references,
`awaiting-covering-scope` (single covering), manual unverified with uncovered
planes, and a fixed-support sheet mismatch. Numeric geometry problems in
Manual offer `fit-auto` when the covering supports it. The covering warning
panel and the covering inspector show the same action for
`roof-plane-not-found` and `batten-layout-required`.

## 4. Covering → automatic battens

`withBattensForNewCovering`: the first batten-supported covering in a
project whose batten layer was **never configured** creates the layer
(AUTO for tiles, fixed MANUAL gauge for modular sheet) in the same history
entry. A configured layer, including one switched off, is never touched.
This realises the V43B product order
`GEOMETRY → COVERING → AUTOMATIC BATTENS` without an extra click.

## 5. Overlap audit (independent, `overlap-audit.test.ts`)

Resolver chain used by the app: surface → auto batten composition →
battens → tile courses/positions → membrane course fit. Reference roof
10 × 8 m, 40°, 50 cm eave overhang, swissporTON KODA (cover 260 mm,
gauge 390–430 mm), eave reference 250 mm, ridge 0:

| Check | Independent value | Resolver |
| --- | --- | --- |
| rafter slope | 4500 / cos 40° = 5874 mm | 5874 mm |
| batten intervals | ⌈(5874 − 250) / 430⌉ = 14 → 15 rows | 15 rows |
| regular gauge | 5624 / 14 = 401,7 mm, inside 390–430 | 401,7 mm |
| gable area | 2 × 10 m × 5,874 m = 117,49 m² | 117,49 m² |
| gable positions | 117,49 / (0,260 × 0,4017) = 1124 ideal | 1170 (60 cut at verges) |
| declared consumption | 8,9–9,9 szt./m² → 1046–1163 | brackets 1 / (cover × gauge) |
| hip area (overhang on 4 sides) | 11 × 9 / cos 40° = 129,24 m² | 129,24 m² |
| hip positions | — | 1360 (254 cut along hips, ≤ declared max + 10 %) |
| membrane courses | ⌈(slope − roll) / (roll − lap)⌉ + 1 | equal on every plane |

Counted positions include every cut position; they are coverage positions,
never a purchase quantity (unchanged semantics).

## 6. Covering scheme presentation

`covering-scheme-geometry.ts` (view only, tested) classifies plane polygon
edges as `eave | ridge | hip | verge` and gives deterministic tile tones and
the regular course gauge.

- **Podgląd materiału:** tile tone variation, ridge and hip cap bands with
  piece joints, eave line with an illustrative gutter, verge edge, thin
  outline. Illustrative only; counts are unchanged.
- **Widok techniczny:** course numbers beside the plane, battens drawn above
  the coverage cells, and a status line `Rzędy · Rozstaw łat · Szerokość
  krycia` from the resolver.
- The plane stroke is 1,5 px instead of 18 px.

## 7. Verification

Unit 1165 passed; Playwright 66 passed / 14 skipped (desktop + mobile),
including the new "switching hip ↔ gable keeps the tile covering and Auto
battens in sync" flow; typecheck, lint and build with edge bundle check.
