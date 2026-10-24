# Asymmetric gable roof (dach dwuspadowy niesymetryczny) — VNext-9

Two planes of different pitch meeting in one ridge; both wall plates at the
same height. A family of its own (ADR-016), resolved by the same rafter
solver as the gable, once per side.

## 1. Frame and inputs

Same frame as the gable: x across the span with x = 0 on the ridge axis,
y along the building, z up, z = 0 on the heel–seat corner of the plates.
The left plane (A) slopes down to −x, the right plane (B) to +x.

| Input | Meaning |
| --- | --- |
| `spanMm` | S — outer face of the left wall plate to the outer face of the right one |
| `pitchDeg` | α — left plane |
| `rightPitchDeg` | β — right plane |
| `eaveOverhangMm` | e — horizontal, both eaves |
| `wallPlate` | the left plate with its seat (or notch depth); the right plate has the same section |
| `rafterSection`, `rafterSpacing`, `ridge` | as for the gable |

Not in the first version: purlins, collar ties, different eave heights,
different overhangs per side.

## 2. The ridge and the equal heel height

The ridge sits where both reference lines (through each plate's heel–seat
corner) reach the same height H:

- x_L · tan α = x_R · tan β = H, with x_L + x_R = S
- x_L = S · tan β / (tan α + tan β), x_R = S − x_L

The roof surfaces (rafter tops) must meet in the same ridge line too.
Carpenters keep the **height above the plate** — the plumb distance from the
seat level to the rafter top at the plate's outer face — equal on both
sides ([Fine Homebuilding, "Dutch gable layout"](https://finehomebuilding.com/forum/dutch-gable-layout));
with equal heel heights the two top surfaces lie exactly that height above
the two reference lines, so they meet over the same ridge axis.

For a rafter of depth d with seat s at pitch θ the heel height is

- h = d / cos θ − s · tan θ

so the right seat follows from the left one:

- s_R = (d / cos β − d / cos α + s_L · tan α) / tan β

The steeper side needs the deeper seat. s_R must be positive and fit the
plate (≤ its width); both notches must leave the rafter whole. Each side's
run to the ridge-board face is x − t / 2, exactly as the gable's half run.

Per side the rafter is the gable rafter of run x and pitch θ: K1 on the
left, K2 on the right, each with its own length, notch and ridge cut.

## 3. Reference vectors (hand-checked)

| # | Input | Expected |
| --- | --- | --- |
| A1 | S 8000, α 45°, β atan(3/5) = 30.9638°, d 200, s_L 100, t 40, e 500, length 10 000 | x_L 3000, x_R 5000, H 3000; heel height 282.843 − 100 = 182.843; s_R (233.238 − 182.843)/0.6 = 83.992; notch normal depths 70.711 and 43.214; plane slope lengths (3000 + 500)·√2 = 4949.747 and (5000 + 500)·√34/5 = 6414.047; areas 49.497 m² and 64.140 m² |
| A2 | α = β | exactly the gable of half run S/2: s_R = s_L, K1 = K2 = the gable rafter |
| A3 | d 200, s_L 100, α 20°, β 60°, plate 120 wide | heel height 212.836 − 36.397 = 176.439; s_R (400 − 176.439)/1.732 = 129.073 > 120 → refused (`right_seat_exceeds_plate`) |
| A4 | d 200, s_L 100, α 60°, β 20° | heel height 400 − 173.205 = 226.795 > d / cos 20° = 212.836: s_R = −38.353 → refused (`right_seat_not_positive`); a deeper left seat lowers the heel height |

A1 is the asymmetric scene of `roof-topology-core` (10 × 8 m, ridge 3 m
from the front at 3 m height).

## 4. Out of scope

No structural check (ADR-014): an asymmetric roof loads its plates and the
ridge unevenly; sizing is the designer's.

## 5. In the application (VNext-9)

- `roof-math/src/asymmetric-gable.ts` is the only place these formulas
  live; the Creator, workbench, skeleton, surface, layers, schedule and
  documents read its resolved result.
- The workbench canvas edits K1's assembly (the left side); the span, the
  right pitch and the ridge follow from the template, so a drag on the left
  rafter keeps the right pitch exact. A new left pitch keeps the span (the
  building) and moves the ridge; only a new left run moves the right plate.
- `asymmetricGableSeatRefusal` is the one check for §2's refusals: the
  schema, the Creator and the workbench name the same code.
- Not yet: purlins and collar ties, recognition of "niesymetryczny" in an
  imported document, a cutting plan for K2 of its own.
