# Mono-pitch roof (dach jednospadowy / pulpitowy) — VNext-7A / 7B

Status: **surface (7A) and framing, battens and covering (7B-1), domain
only.** `packages/roof-math/src/mono-pitch-roof.ts` resolves the plane;
`mono-pitch-framing.ts` the rafters on two supports through the shared
rafter solver (§8); `calculator-core`'s `resolveMonoPitchRoofSystem`
adds battens and the covering through the same engines as a gable. No UI,
no persistence, no documents yet.

## 1. What the solver resolves and what it does not

| Resolved now | Deliberately not resolved (VNext-7B or later) |
| --- | --- |
| the reference plane: polygon, frame, normal, pitch | rafter positions, spacing, count |
| rise, slope lengths, eave / top / verge lines | birdsmouth, plumb and seat cuts, height above plate |
| gross sloped area, plan area | wall plates, ledgers, purlins as members; spans; any structural check |
| bearing-line elevations (wall heights) | covering, battens, membrane, drainage, accessories |
| the roof scene graph via the existing adapter | quantities, procurement, cost, execution documents |

The solver produces **no fabrication data**. A rafter list would need the
seat geometry, the height above the plate and the support semantics fixed
first, and generating member positions without them would be fiction.
`MONO_PITCH_SOLVER_SCOPE` records this in code.
Since VNext-7B-1 a separate framing solver (§8) resolves the rafters,
birdsmouths, plumb ends, plate heights and the rafter layout; the surface
solver itself still emits no members.

## 2. Reference frame

The convention is the same as the gable and hip solvers
(`resolveRoofPlaneBasis` in `roof-features.ts`): millimetres, `z` up, the
roof surface is the **reference plane**, `z = 0` lies on the low bearing
line, and overhangs are measured **horizontally** beyond the bearing lines.

```text
 section (looking along +x)                        plan (from above)

                       top edge  ── z_top          x=−v                 x=L+v
                    ╱│                             ┌───────────────────────┐ y=R+e_high
                 ╱   │ high bearing  ── H          │   high bearing line   │ y=R
              ╱      │ line, y = R                 │                       │
           ╱  α      │                             │        plane          │
 eave ──╱────────────┘ low bearing, y=0, z=0       │   low bearing line    │ y=0
     ╱ (−e_low, z_eave)                            └───────────────────────┘ y=−e_low
```

- `x`: horizontal, uphill, perpendicular to the eave (the gable/hip axis
  across the span since VNext-7B-2). The low bearing line is at `x = 0` and
  the high bearing line at `x = R` (the **run**).
- `y`: along the eave (building length `L`); the plane spans `−v … L + v`.
- Plane local frame (as for every roof-math plane): origin at the eave corner
  `(−e_low, −v)`, `u` along the eave (`+y`), `v` uphill along the slope.

The section figure below is drawn across the span (x horizontal).

How the reference plane sits on the rafters is fixed in §8 (VNext-7B): it
passes through the heel–seat corner of the birdsmouth on the low plate —
the same convention the gable and hip solvers already use.

## 3. Inputs and legal ranges

| Field | Meaning | Range |
| --- | --- | --- |
| `buildingLengthMm` `L` | length along the eave between the gable ends | 1 – 100 000 mm |
| `runMm` `R` | horizontal distance between the bearing lines | 1 – 100 000 mm |
| `pitchDeg` `α` | slope of the reference plane | 1° – 80° (geometry; a covering's minimum pitch is a covering rule) |
| `lowEaveOverhangMm` `e_low` | horizontal overhang below the low bearing line | 0 – 10 000 mm |
| `topEdge` | `free` (the roof ends in a top edge) or `abutment` (it meets a higher wall) | — |
| `highOverhangMm` `e_high` | horizontal overhang beyond the high bearing line | 0 – 10 000 mm; **must be 0 for `abutment`** |
| `vergeOverhangMm` `v` | horizontal overhang beyond each gable end | 0 – 10 000 mm |
| `lowBearingElevationMm` `h_low` | optional elevation of the low bearing line above the project datum (e.g. ±0.00) | −100 000 – 100 000 mm, default 0 |

The ranges match the gable/hip schema, so the same exact numeric inputs and
validation messages can serve all three families.

**Wall heights.** A designer often knows two bearing elevations instead of a
pitch. `monoPitchFromBearingElevations({ lowMm, highMm, runMm })` returns
`pitchDeg = atan((high − low) / R)` and refuses a non-rising or out-of-range
result. It is the exact inverse of `H = R·tan α` (§4), so editing either form
keeps one canonical value: the pitch.

**Top edge.**

- `free` — the high side ends in a top edge (in Polish practice, a
  monopitch "ridge" finished with a top flashing). It may overhang the high
  wall by `e_high`. In the scene graph it is a single-plane horizontal edge
  at the top. ADR-015 accepts it as `ridge` (a mono-pitch "kalenica") or
  `abutment`; the solver emits `ridge` for `free`.
- `abutment` — the roof meets the face of a higher wall at the high bearing
  line (a wall flashing; the high support is a ledger or a plate against
  that wall). An overhang would penetrate the wall, so `e_high = 0`. The
  solver emits `abutment`.

**Supports.** The low support is a wall plate along `y = 0`. The high
support is a wall plate on a higher wall, a ledger on an existing wall
(`abutment`), or a purlin. Intermediate purlins, spans and connections are
**not modelled** in VNext-7A. They belong to the structural model (V-series
"supports"), and no geometry here claims a member is adequate.

## 4. Formulas

With `t = tan α` and `c = cos α`:

| Quantity | Formula |
| --- | --- |
| rise between the bearing lines | `H = R · t` |
| slope length between the bearing lines | `S_b = R / c` |
| high bearing elevation | `h_high = h_low + H` |
| eave line | `x = −e_low`, `z_eave = −e_low · t` |
| top line | `x = R + e_high`, `z_top = (R + e_high) · t` |
| plane width (along the eave) | `W = L + 2v` |
| plane slope length | `S = (R + e_low + e_high) / c` |
| plan area | `A_p = W · (R + e_low + e_high)` |
| gross sloped area | `A = W · S = A_p / c` |
| eave length = top length | `W` |
| each verge length | `S` |
| upward unit normal | `n = (−sin α, 0, cos α)` |
| uphill axis | `v̂ = (cos α, 0, sin α)` |

World `z` values are relative to the low bearing line. Add `h_low` for
elevations above the datum (`elevations` in the result).

## 5. Reference vectors (hand-checked)

Exact values: `tan 15° = 2 − √3 = 0.267949192…`,
`cos 15° = (√6 + √2) / 4 = 0.965925826…`, `tan 10° = 0.176326980…`,
`cos 10° = 0.984807753…`.

| # | Input | Expected |
| --- | --- | --- |
| V1 | `L` 6000, `R` 4000, 15°, no overhangs, `abutment` | `H` = 1071.796770 mm; `S_b` = 4141.104722 mm; `A_p` = 24.000000 m²; `A` = 24/cos 15° = **24.846628 m²** |
| V2 | V1 + `e_low` 500, `v` 300 | `z_eave` = −133.974596 mm; `W` = 6600; `S` = 4658.742812 mm; `A_p` = 29.700000 m²; `A` = 30.747703 m² |
| V3 | `L` 6000, `R` 4000, 10°, `e_low` 600, `free` with `e_high` 400, `v` 250 | `H` = 705.307923 mm; `z_eave` = −105.796188; `z_top` = 775.838715; `S` = 5077.133059; `A` = 33.001365 m² |
| V4 | bearing elevations 2600 / 3400 mm, `R` 4000 | `α` = atan(0.2) = 11.309932°; `S_b` = √(4000² + 800²) = 4079.215611 mm |
| V5 | `abutment` with `e_high` 200 | rejected (`abutment_overhang`) |
| V6 | bearing elevations 3000 / 3000 | rejected (`not_rising`) |

V1 is the brief's demonstration project. It also matches the topology
fixture built independently in VNext-6
(`packages/roof-topology-core/src/scenes.test.ts`, "mono-pitch roof"). The
solver and the hand-built graph agree on plane, area and line lengths.

## 6. Topology and calculation status

The solver's planes and lines have the same structural shape as the
gable/hip surface. The existing adapter `roofSceneFromResolvedRoof`
(template `mono-pitch`) turns them into the scene graph without recomputing
anything. `assessRoofScene` then returns:

- `geometry: complete` — planar, every boundary side classified, the line
  kinds agree with the geometry;
- `calculation: not-supported` with `template-not-calculated` — a correct
  plane is not a calculated roof. Covering, drainage and fabrication
  report `not-supported`, and documents stay blocked for this roof.

## 7. Persistence

`RoofProjectDocumentV1` cannot hold a mono-pitch roof and is unchanged.
`MonoPitchRoofSpec` appears only in the designed V2 document
(`packages/calculator-core/src/project-document-v2.ts`): the V1 → V2 adapter
and the V2 → V1 inverse are tested over every reference project. The app
neither reads nor writes V2. Writing V2 is a separate, explicit gate after
the downstream adapters exist (ADR-015, `SCHEMA_REGISTRY.md` §19).

## 8. Framing (VNext-7B-1)

### 8.1 Frame and definitions

The rafter is solved by the shared single-rafter solver
(`resolveAssemblyGeometry`, upper end `top`) — the one behind every gable
and hip rafter; `resolveMonoPitchFraming` only builds its input.

- `x = 0`: the **outer face of the low wall plate**. `runMm` (R) runs to the
  **outer face of the high support** — the outside of the high wall's plate,
  or the face of the higher wall for an abutment.
- Each support carries a birdsmouth: heel (plumb) on the support's
  downslope face, seat horizontal on its top, seat length `s` ≤ support
  width. The low plate occupies `0 … w_low`, the high support
  `R − w_high … R`.
- The rafter's lower edge passes through the low seat's toe `(s_low, 0)`.
  The **roof reference plane** of §2 passes through the low heel–seat corner
  `(0, 0)` parallel to the rafter: the top of the rafter lies
  `d − s_low·sin α` above it, square to the slope. This is the gable/hip
  convention, now stated.
- Ends: the eave is cut plumb at `x = −e_low`; the top end plumb at
  `x_end = R + e_high` (free top edge) or `x_end = R` at the wall face
  (abutment).
- Supports: the low support is a wall plate; a free top edge rests on the
  high wall's plate; an **abutment rests on a ledger** fixed to the higher
  wall (`abutment_needs_ledger` / `ledger_needs_abutment`).

### 8.2 Formulas (t = tan α, c = cos α)

| Quantity | Formula |
| --- | --- |
| top edge between the plumb cuts | `(x_end + e_low) / c` |
| straight stock per rafter | `(x_end + e_low) / c + d·t` |
| heel station on the top edge, from the eave | `(x_heel + e_low) / c` |
| notch depth square to the edge | `s·sin α` (remaining `d − s·sin α`) |
| high plate top above the low plate top | `(R − w_high + s_high − s_low)·t` |
| pitch from two plate tops | `atan(Δh / (R − w_high + s_high − s_low))` |
| rafters | `resolveRafterSpacing` along `L`, as for a gable |

The surface slope length (§4) equals the rafter's top edge between the same
plan lines — a test checks it.

### 8.3 Reference vectors (hand-checked, independent of the solver)

| # | Input | Expected |
| --- | --- | --- |
| F1 | `L` 6000, `R` 4000, 15°, `e_low` 500, free top `e_high` 300, rafter 80×200, plates 140×140 with 100 seats, max-even 900 | top edge 4969.326 mm; stock 5022.916 mm; heels at 517.638 / 4513.804 mm; notch 25.882 mm (174.118 left); high plate 1034.284 mm higher; 8 rafters at 857.14 mm |
| F2 | `L` 5000, `R` 3000, 10°, `e_low` 400, abutment, rafter 60×180, low plate 120 (seat 80), ledger 60×160 (seat 50) | rafter ends at the wall (x 3000); top edge 3452.450; stock 3484.189; notches 13.892 / 8.682; ledger seat 513.112 mm above the low plate |

### 8.4 Battens and covering (one engine each)

- Battens: `resolveMonoPitchBattens` calls the plane-generic
  `resolveBattenLayoutOnPlanes` that the gable/hip wrapper now uses too.
  `ridgeOffsetMm` is measured below the top edge.
- Covering: `resolveCoveringLayout` (`calculator-core`) is the one dispatch
  to the tile / modular / cut-to-length / standing-seam engines, used by the
  workbench and by `resolveMonoPitchRoofSystem`; compatibility (minimum
  pitch, gauge) is the same `checkCoveringCompatibility`.
- Example (test): F1 at 25° with the roof tile of reference project 05
  (≥ 20°, 9.8–10.7 pcs/m²), battens every 340 mm from 50 mm: 16 courses,
  105.6 m of battens, 22 × 16 = 352 tile positions on 34.955 m² (declared
  band 342.6–374.0). At 15° the same tile is refused
  (`below-minimum-pitch`).

### 8.5 Still not resolved

Spans and load capacity (no structural check, ADR-014), drainage, the
execution document and cost, and persistence (V2 writer gate). The
skeleton, counter-battens, membrane and timber schedule followed in 7B-2
(§9), the workspace in 7B-3 (§10), intermediate purlins in 7B-5 (§11).
`MONO_PITCH_FRAMING_SCOPE` states it in code; the topology assessment keeps
the roof `not-supported` until documents can show it.

## 9. Skeleton, schedule and layers (VNext-7B-2)

- Frame: since 7B-2 the mono-pitch plane uses the gable/hip axes — `x`
  across the span from the low plate's outer face, `y` along the
  building, `z` up (§2 updated). The upward
  normal is `(−sin α, 0, cos α)`; the eave runs `−y` so the roof lies on
  its left.
- `createMonoPitchSkeleton`: plates as lines along the building at their
  outer face and seat level (the gable convention), rafters as lines on the
  reference plane from the eave to the top plumb end (length = the top edge
  between the cuts), the roof plane as a guide.
- The generic `createRoofMemberSchedule` lists 8 × K1 at 4969.33 mm and
  the two plates (6 m each) for F1; the technical 3D scene draws 8 rafters,
  2 plates, 8 counter-battens and the plane without any mono-pitch code.
- Counter-battens: `counterBattenRowsOnPlane` + `summarizeCounterBattens`
  (shared with gable/hip) — one row per rafter over the whole slope (F1:
  8 × 4969.33 mm). Membrane: `resolveMembraneLayoutOnPlanes` — F1 with a
  1500 mm roll and a 100 mm lap: 4 courses, 39.6 m² gross, 1.98 m² of laps.

## 10. The workspace (VNext-7B-3)

- Entry: the start dialog card "Dach jednospadowy" and a link under the
  quick calculator's element switch. A lazy overlay
  (`apps/web/src/mono-pitch/`), like the CAD import.
- Every number on screen comes from `resolveMonoPitchRoofSystem` and
  `createRoofMemberSchedule`; the section drawing is
  `createAssemblyDrawing` of the same rafter; the marking steps are the
  solver's fabrication plan. No formula lives in the UI.
- Exact inputs in the app's display unit (decimal comma accepted); a
  blocking value is named at its field (seat wider than the support, notch
  through the rafter, supports overlapping, out of range) and the last valid
  result stays visible. "Przy wyższej ścianie" switches to a ledger and
  hides the high overhang.
- Phones: one column with a sticky bar of the key numbers (rafters × stock,
  how much higher the high support sits).
- Persistence: a draft of this browser only (SCHEMA_REGISTRY §21). The
  screen says that saving as a project, the cost estimate and the execution
  document come later; load capacity is never claimed.

## 11. Intermediate purlins (VNext-7B-5)

- `intermediateSupports`: up to four purlins, each with its horizontal
  distance from the low plate's outer face to its downslope face (the
  birdsmouth heel), width, height and seat. The shared rafter solver
  notches the rafter on every support by the same rule; the rafter length,
  the plate heights and the end cuts do not change.
- Validation: a purlin lies between the plates with at least 1 mm to each
  (`support_outside_span`), never touches another (`supports_overlap`),
  and its seat obeys the same seat and notch rules as the plates. Purlins
  are read along the slope whatever order they were entered in, and named
  P1, P2… in that order (`support:purlin-N`, the gable family code).
- Seat level above the low plate top: `(x_p + s_p − s_low) · tan α`.
- Skeleton: a line along the building at the purlin's downslope face and
  seat level; the timber schedule lists it as P1 (6 m for F1).

| # | Input | Expected |
| --- | --- | --- |
| F3 | F1 + a 100 × 160 purlin at `x_p` 2000 with a 60 mm seat | heel at (2000 + 500)/cos 15° = 2588.190 mm from A; notch 60·sin 15° = 15.529 mm (184.471 mm left); seat 525.180 mm above the low plate; stock 5022.916 mm as F1 |

A purlin shortens the rafter span; whether that span, the purlin's section
and the support spacing carry the load is the designer's (ADR-014).

## 12. From a document and from site measurement (VNext-7C)

- **Import.** A document naming a mono-pitch roof ("jednospadowy",
  "pulpitowy", shed, lean-to, skillion) is recognised as `mono-pitch`,
  not refused. After the same review as any import it becomes a project
  (VNext-8, §13): building length → `buildingLengthMm`, building width →
  `runMm` (the outer faces of the supports), pitch, eave → the low eave
  overhang, spacing and section.
- **Pitch from the plate tops.** On site the two tops are measured from one
  level. The pitch is the exact inverse of the plate difference (§8):
  `α = atan((h_high − h_low) / (R − w_high + s_high − s_low))` with the
  same supports as the framing (`monoPitchFromPlateTops`). The high top
  must be above the low one; the result must lie in 1–80°.

| # | Input | Expected |
| --- | --- | --- |
| P1 | example supports, tops 2600 / 3634 mm | atan(1034 / 3860) = 14.996° |
| P2 | tops = low + the plate difference F1 reports | exactly 15° (round trip) |
| P3 | carport 7200 × 4200 mm, 12°, 80 × 200 at ≤ 800 mm | 10 rafters; plate difference (4200 − 140)·tan 12° |

## 13. The mono-pitch roof as a project (VNext-8, ADR-016)

- `MonoPitchRoofTemplateSpec` is a `RoofTemplateSpec`: the inputs of
  `MonoPitchFramingSpec`. `resolveMonoPitchRoofTemplate` delegates to
  `resolveMonoPitchFraming` — the project and the quick workspace share
  one solver; reference project 11 reproduces F1 (stock 5022.916 mm, 8 K1).
- The workbench edits the rafter cross section with a top end
  (`upperEnd: 'top'`): the low plate at x = 0, purlins between, the high
  plate (or ledger) last; edits map back by position.
- Surface: one plane (`mono-pitch-plane:main`), metrics per family; the top
  line is a ridge when free and a declared `abutment` against a wall, so
  ridge components never bind to a wall junction.
- Downstream: layers, coverings, materials, cost and the execution document
  run through the plane-generic engines; the document names the K1 top cut
  and the span instead of a half run.

| # | Project 11 (F1 + layers) | Expected |
| --- | --- | --- |
| R1 | net area | 6.6 m × 4800/cos 15° = 32.8 m² |
| R2 | battens 60 × 40 at 340, first 50 from the eave | 15 rows × 6.6 m = 99 m |
| R3 | counter-battens 40 × 40 on 8 rafters | 8 × 4969.3 mm = 39.8 m |
