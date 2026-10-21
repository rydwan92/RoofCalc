# Mono-pitch roof (dach jednospadowy / pulpitowy) — VNext-7A

Status: **surface geometry only.** VNext-7A adds a pure solver
(`packages/roof-math/src/mono-pitch-roof.ts`) for one planar roof. Nothing
else is resolved yet. Rafters, cuts, supports, covering, drainage,
quantities, cost and documents for this roof are VNext-7B.

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

- `x`: along the eave (building length `L`); the plane spans `−v … L + v`.
- `y`: horizontal, uphill, perpendicular to the eave. The low bearing line is
  at `y = 0` and the high bearing line at `y = R` (the **run**).
- Plane local frame (as for every roof-math plane): origin at the low-left
  corner of the plane, `u` along the eave (`+x`), `v` uphill along the slope.

How the reference plane relates to the top or underside of a rafter, or to
the seat on a wall plate, is **not defined in VNext-7A**. That is the
"semantics of eaves, wall plates and rafters" the brief defers.

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
| eave line | `y = −e_low`, `z_eave = −e_low · t` |
| top line | `y = R + e_high`, `z_top = (R + e_high) · t` |
| plane width (along the eave) | `W = L + 2v` |
| plane slope length | `S = (R + e_low + e_high) / c` |
| plan area | `A_p = W · (R + e_low + e_high)` |
| gross sloped area | `A = W · S = A_p / c` |
| eave length = top length | `W` |
| each verge length | `S` |
| upward unit normal | `n = (0, −sin α, cos α)` |
| uphill axis | `v̂ = (0, cos α, sin α)` |

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
