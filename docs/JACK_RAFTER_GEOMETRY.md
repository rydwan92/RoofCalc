# RoofCalc — Jack Rafter Geometry Contract (V7 regular equal-pitch hip)

## Purpose and boundary

This contract defines the first real `kulawka` / hip-jack family for the existing regular rectangular hip template. It covers a square-cornered footprint, equal pitch on all four planes, uniform horizontal overhang and jack axes parallel to the common rafters.

It is geometric and fabrication-oriented. It does not verify member sizing, load capacity, fasteners or code compliance.

Historical terminology and layout sequence were cross-checked against Ira Samuel Griffith's public-domain _Carpentry_, especially sections 28–29: a hip jack runs from plate to hip, is treated as a portion of a common rafter, keeps the common plumb/seat layout, varies by position on the plate and adds a side/cheek cut. The same source distinguishes theoretical center/top-edge lengths from reductions for hip thickness. See [Project Gutenberg, lines 474–493](https://www.gutenberg.org/cache/epub/70226/pg70226-images.html). A second practical terminology cross-check is the U.S. military construction-manual excerpt reproduced by [Integrated Publishing](https://constructionmanuals.tpub.com/14044/css/Rafter-55.htm), which distinguishes hip, valley and cripple jacks and their bearing members.

These sources are used for geometry vocabulary and independent checks, not as present-day structural authority.

## 1. Coordinate and position model

Use the existing V6 world axes:

```text
X = building span direction
Y = building/ridge direction
Z = vertical
```

Let:

```text
r = common run / half-span
e = uniform horizontal overhang
θ = common roof pitch
d = jack station measured along the wall plate from its hip corner
```

Each hip divides two perpendicular roof planes. For every interior station:

```text
0 < d < r
```

there is one jack on each adjacent plane. The endpoints `d = 0` and `d = r` are excluded because they belong to the H1 hip and the full K1/common direction respectively.

The current spacing resolver is applied to the interval `r`; its two endpoint stations are removed. For `n` interior stations, the regular roof therefore resolves:

```text
4 hips × 2 adjacent planes × n = 8n jack instances
```

## 2. Stable identity

All physical jacks share the family prototype:

```text
member:jack-rafter-J1
```

Each placement has a deterministic physical ID:

```text
instance:jack:<hip-corner>:<roof-plane>:<ordinal-from-corner>
```

Example:

```text
instance:jack:front-left:left:2
```

`J1` means a fabrication family with a shared section and cut semantics. It does **not** mean every physical piece has the same length. Each instance retains its own exact station and length; the prototype reports a length range and `variable-by-instance` fabrication mode.

## 3. Axis geometry and length

For a regular hip, the theoretical hip center plane advances equally in both plan axes. A jack at wall station `d` therefore has horizontal run from wall line to that plane:

```text
wallToHipHorizontalRun = d
```

Including the common horizontal overhang:

```text
outerEaveToHipHorizontalRun = d + e
```

Because J1 is parallel to K1 on its roof plane:

```text
wallToHipLineLength       = d / cos(θ)
tailLineLength            = e / cos(θ)
outerEaveToHipLineLength  = (d + e) / cos(θ)
riseFromOuterEave         = (d + e) tan(θ)
```

For increasing stations on one hip/plane group, length is strictly increasing. No intermediate value is rounded.

## 4. Wall seat

J1 uses the same pitch, section and wall-plate support intent as K1. The V7 plan therefore reuses the exact resolved K1 wall-joint summary:

- station from the outer-eave datum,
- seat length,
- normal notch depth,
- remaining member depth.

This is shared resolved domain output, not a duplicated UI formula.

## 5. Meeting cut at H1

V7 resolves the meeting reference as the **vertical plane through the theoretical H1 center axis**.

The explicit references are:

```text
plumb line on jack side face to jack axis = 90° - θ
plan angle between jack axis and H1 plane = 45°
top-face trace to jack longitudinal axis  = atan(cos(θ))
```

The last relation follows by intersecting the vertical 45° hip plane with the jack's sloping top face. It agrees with the traditional framing-square relation described by Griffith: use common run on one leg and common-rafter unit length on the other, whose ratio reduces to `cos(θ)`.

These are marking/layout references, not an ambiguous generic saw setting.

## 6. Deliberate V7 limitations

The resolved reference length ends at the theoretical H1 center plane. V7 does not silently subtract a guessed half-width/diagonal allowance for the physical H1 face because that depends on the selected H1 backing/drop and long-point measurement convention. The domain records:

```text
hipFaceDeduction = not-applied
lengthBasis = outer-eave-axis-to-theoretical-hip-center-plane
```

Likewise, current hip purlins exist only on the long planes and their individual notch/cut interaction with generated J1 members is not resolved. When purlins are present, every affected J1 fabrication plan records:

```text
intermediateSupportJoinery = not-resolved
```

The UI must surface both limitations. Allowance and kerf are also excluded.

## 7. Regression contract

For a representative instance:

```text
d = 800 mm
e = 500 mm
θ = 30°
```

the exact basis is:

```text
outer-eave horizontal run = 1300 mm
outer-eave line length    = 1300 / cos(30°)
plumb-to-axis             = 60°
plan meeting angle        = 45°
top-face trace            = atan(cos(30°))
```

Tests must also cover station-count rules, stable unique IDs, strict monotonic length, square/pyramid geometry, low/high pitch, non-finite rejection and explicit purlin limitations.
