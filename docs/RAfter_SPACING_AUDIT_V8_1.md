# RoofCalc — Rafter Spacing Audit & UX Contract (V8.1)

## Purpose

This document is a focused audit/specification for rafter-spacing semantics.

It exists because the current UI can make a mathematically valid layout look wrong.

Example visible in the current app:

```text
building length = 940 mm
requested spacing = 800 mm
mode = fit-evenly
```

The current solver uses:

```ts
bayCount = ceil(buildingLength / requestedSpacing)
stationCount = bayCount + 1
actualSpacing = buildingLength / bayCount
```

Therefore:

```text
ceil(940 / 800) = 2 bays
2 bays + both end stations = 3 rafter pairs
actual spacing = 940 / 2 = 470 mm
```

So **3 rafter pairs are mathematically consistent with the current interpretation**:

> `800 mm` means “maximum spacing not to be exceeded while keeping rafters at both ends”.

The problem is that the UI label “Rozstaw krokwi 800 mm” can be interpreted by a user as:

> “place rafters approximately every 800 mm”.

Those are different intents.

Do not fix this by blindly changing `3` to `2`.

---

# 1. Current implementation audit

The current `resolveRafterSpacing()` behavior has two modes:

## `fit-evenly`

Current meaning:

> Keep a station at both building ends, do not exceed the requested spacing, and distribute bays evenly.

Current algorithm is valid for that contract.

Example:

```text
L = 8100
max spacing = 800

ceil(8100 / 800) = 11 bays
12 stations / rafter pairs
actual spacing = 736.36 mm
```

Example:

```text
L = 940
max spacing = 800

ceil(940 / 800) = 2 bays
3 stations / rafter pairs
actual spacing = 470 mm
```

## `fixed-spacing`

Current behavior:

```text
0, spacing, 2*spacing, ..., building end
```

If there is a remainder, the solver adds the building-end station.

Example:

```text
L = 940
spacing = 800

stations = [0, 800, 940]
```

This creates a final bay of only 140 mm.

This is mathematically explicit, but it may be undesirable as an automatic default and must be made visible to the user.

---

# 2. Required semantic change

Rename the current spacing concepts so the user's intent is unambiguous.

Recommended domain modes:

```ts
type RafterSpacingMode =
  | 'max-even-spacing'
  | 'fixed-module'
  | 'target-even-spacing';
```

Backward compatibility/migration may temporarily map:

```text
fit-evenly     -> max-even-spacing
fixed-spacing  -> fixed-module
```

Do not silently reinterpret old saved state.

---

# 3. Mode A — Maximum even spacing

Polish UI:

```text
Maksymalny rozstaw
```

Meaning:

> Use both end stations. Add enough bays so no actual bay exceeds the selected maximum. Distribute the bays evenly.

Formula:

```ts
bayCount = max(1, ceil(L / maxSpacing))
stationCount = bayCount + 1
actualSpacing = L / bayCount
```

For:

```text
L = 940
max = 800
```

result:

```text
2 bays
3 rafter pairs
470 mm actual spacing
```

This is CORRECT.

UI must explicitly show:

```text
Zadany maksymalny: 800 mm
Rzeczywisty rozstaw: 470 mm
Liczba pól: 2
Liczba par krokwi: 3
```

Optional helper:

```text
Dodano środkową parę, aby nie przekroczyć maksymalnego rozstawu 800 mm.
```

---

# 4. Mode B — Fixed module

Polish UI:

```text
Stały moduł od początku
```

Meaning:

> Place stations at the requested module from the selected datum.

Example:

```text
L = 2500
module = 800
```

base stations:

```text
0, 800, 1600, 2400
```

The building-end behavior must be an explicit option, not hidden.

Add:

```ts
type EndStationPolicy =
  | 'require-both-ends'
  | 'allow-open-end';
```

With `require-both-ends`:

```text
0, 800, 1600, 2400, 2500
```

and show:

```text
ostatnie pole: 100 mm
```

With `allow-open-end`:

```text
0, 800, 1600, 2400
```

and show:

```text
od ostatniej osi do końca: 100 mm
```

Do not decide structural suitability automatically.

---

# 5. Mode C — Target even spacing

Polish UI:

```text
Docelowy rozstaw
```

Meaning:

> Treat the entered value as a preferred spacing and choose an evenly distributed number of bays close to it.

Recommended initial candidate:

```ts
preferredBayCount = max(1, round(L / targetSpacing))
actualSpacing = L / preferredBayCount
```

However, this mode MUST expose deviation:

```ts
deviationRatio = abs(actualSpacing - targetSpacing) / targetSpacing
```

Example:

```text
L = 940
target = 800

round(940/800) = 1 bay
2 rafter pairs
actual = 940 mm
deviation = +17.5%
```

UI:

```text
Docelowy: 800 mm
Rzeczywisty: 940 mm
Odchylenie: +17.5%
```

IMPORTANT:

Do not claim this is structurally acceptable.

If the requested spacing comes from a structural design, the user should use `Maksymalny rozstaw` or `Stały moduł` according to the design intent.

---

# 6. Recommended default

For professional safety/clarity, keep the default behavior conservative:

```text
Maksymalny rozstaw
```

not `Docelowy rozstaw`.

Reason:

If the user enters `800 mm` as a maximum required spacing, RoofCalc must not automatically return `940 mm`.

The UX problem should be solved by explanation and explicit modes, not by violating the requested maximum.

---

# 7. UI changes

Replace:

```text
Rozstaw krokwi
800 mm

Sposób rozstawu
Równomiernie między ścianami
```

with something clearer:

```text
Rozstaw krokwi

Tryb:
[ Maksymalny ] [ Docelowy ] [ Stały moduł ]

Wartość
[ 800 mm ]

─────────────────────
Rzeczywisty rozstaw   470 mm
Liczba pól              2
Pary krokwi              3
─────────────────────
```

For very short roofs, add a contextual explanation:

```text
ℹ 3 pary: skrajne przy obu końcach + 1 para pośrodku.
  Dzięki temu rozstaw nie przekracza 800 mm.
```

This is much better than making the user infer why the skeleton contains “too many” rafters.

---

# 8. Visual skeleton improvements for spacing

When editing spacing:

- highlight rafter stations,
- show spacing dimension between adjacent station axes,
- show the first 2–4 dimensions only if many exist,
- show an overall “× N pól @ X mm” annotation,
- avoid visually duplicating dozens of labels.

Example:

```text
| R |------470------| R |------470------| R |
          2 pola × 470 mm
```

For long roofs:

```text
11 pól × 736.4 mm
12 par krokwi
```

---

# 9. Domain result improvements

Extend `ResolvedRafterSpacing` with explicit semantics:

```ts
interface ResolvedRafterSpacing {
  mode: RafterSpacingMode;
  requestedSpacingMm: number;
  actualSpacingMm: number;
  bayCount: number;
  stationCount: number;
  endBaySpacingMm?: number;
  deviationMm?: number;
  deviationRatio?: number;
  endPolicy?: EndStationPolicy;
  stations: RafterStation[];
}
```

Do not infer `stationCount` only in UI.

---

# 10. Required regression tests

Add tests covering at minimum:

### Maximum-even mode

```text
L=940, max=800
=> bayCount=2
=> stationCount=3
=> actualSpacing=470
=> stations=[0,470,940]
```

```text
L=800, max=800
=> bayCount=1
=> stationCount=2
=> actualSpacing=800
```

```text
L=801, max=800
=> bayCount=2
=> stationCount=3
=> actualSpacing=400.5
```

```text
L=8100, max=800
=> bayCount=11
=> stationCount=12
=> actualSpacing≈736.36
```

### Fixed module

```text
L=2500, module=800, requireBothEnds=true
=> [0,800,1600,2400,2500]
=> lastBay=100
```

```text
L=940, module=800, requireBothEnds=false
=> [0,800]
=> remainderToEnd=140
```

### Target-even mode

```text
L=940, target=800
=> bayCount=1
=> stationCount=2
=> actualSpacing=940
=> deviation=+17.5%
```

Also test:
- invalid zero/negative spacing,
- spacing greater than building length,
- very small building lengths,
- unit conversions,
- gable and hip templates using the same spacing resolver.

---

# 11. Hip-roof consistency

The same spacing contract must drive:

- gable common-rafter stations,
- hip-roof common-rafter stations where applicable,
- jack-rafter generation.

Do not implement one spacing rule for gable and another hidden rule for hip.

For hip roofs, account for the ridge/hip transition geometry explicitly when deriving which stations host full common rafters vs jack rafters.

---

# 12. Important product rule

RoofCalc must distinguish:

```text
requested spacing
```

from:

```text
actual resolved spacing
```

These two values must never be presented as if they are the same.

This is the primary issue exposed by the `940 mm / 800 mm` example.

---

# 13. Implementation instruction

Before changing behavior:

1. inspect current `resolveRafterSpacing`,
2. inspect every call site,
3. inspect hip/jack generation,
4. verify whether current UI means maximum, target, or fixed spacing,
5. update model names/migrations carefully,
6. add tests FIRST for the 940/800 case,
7. only then change UI/domain semantics.

Do not simply reduce the current station count until the intended spacing policy is explicit.
