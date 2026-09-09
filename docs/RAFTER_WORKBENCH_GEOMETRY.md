# Common-rafter fabrication model 2.0.0

This contract implements Iteration 002. It supersedes the contradictory lower-edge placement in the iteration prompt, with the user's explicit agreement on 2026-09-09. The old reference-line calculator remains available as `common-rafter@1.0.0`; the launched workbench is `common-rafter@2.0.0`.

## Coordinates and placement

All lengths are millimetres. Angles are degrees at public interfaces, radians inside trigonometric functions. No intermediate rounding.

World `x` increases horizontally toward the ridge; `y` increases upward. Roof pitch is `θ`, run to ridge axis is `r`, horizontal overhang is `e`, seat length is `s`, member normal depth is `d`, ridge thickness is `t`.

The wall plate occupies horizontal interval `[0, width]` below `y=0`. The seat occupies `[0,s]` at `y=0`.

**Approved correction:** the uncut lower edge is `y=(x−s)tan(θ)`. It is below the origin by `s·tan(θ)`, meeting the seat at `(s,0)`. The upper edge is `y=(x−s)tan(θ)+d/cos(θ)`. Its shortest separation from the lower edge is exactly `d`.

If the lower edge had instead passed through `(0,0)` while retaining a rightward seat at `y=0`, the proposed notch would have been outside the timber. That inconsistent placement is not implemented.

The heel is the vertical face at `x=0`. Its lower point is `(0,−s·tanθ)` and its upper point is `(0,0)`. The seat toe is `(s,0)`. The triangle between those three points is actually removed from the profile.

Member-local coordinates have `u` along the timber and `v` from lower to upper edge. The origin is the uncut eave/lower-edge intersection `(-e,(-e−s)tanθ)`. With `c=cosθ` and `q=sinθ`:

```text
world.x = origin.x + u·c − v·q
world.y = origin.y + u·q + v·c
```

The fabrication view renders these local coordinates directly, putting the timber axis horizontally on the screen. Assembly and detail views apply the rigid world transform to the same profile.

## Birdsmouth

```text
verticalRiseAcrossSeat = s·tanθ
normalDepth           = s·sinθ
remainingDepth        = d − s·sinθ
removedDepthRatio     = (s·sinθ)/d
removedArea           = s²·tanθ/2
```

The retained polygon travels from the lower eave edge, up the lower edge to the heel bottom, up the heel cut to `(0,0)`, along the horizontal seat to `(s,0)`, along the lower edge to the ridge face, up the ridge cut, back along the upper edge, then down the eave plumb cut. This is a concave polygon, not an overpainted triangle. With zero overhang, its start is the heel/seat corner to avoid a backtracking degenerate edge.

Seat length must be positive, no greater than plate width, and must remove strictly less than the full member depth. No percentage is classified as safe or unsafe. The UI reports the ratio and the need for project-specific structural requirements.

## Ridge and eave cuts

The ridge board is vertical and symmetric about `x=r`:

```text
near face x                     = r − t/2
horizontal deduction            = t/2
deduction along a member edge   = t/(2·cosθ)
vertical cut length             = d/cosθ
top/bottom longitudinal offset  = d·tanθ
acute plumb-line/member angle   = 90° − θ
```

Both upper and lower retained edges end at the same world `x=r−t/2`. Thickness zero means cutting at the axis and drawing only a ridge reference, with no zero-width support polygon. The eave cut is also vertical, at `x=−e`.

The near ridge face must be beyond the entire plate width so that support and end cut cannot overlap.

## Datums and manufacturing distances

All four marking datums are **on the upper member edge**, at intersections with these world verticals:

| Datum | World x | Meaning                                                |
| ----- | ------- | ------------------------------------------------------ |
| A     | `−e`    | Eave end, upper corner                                 |
| B     | `0`     | Vertical projection of the heel cut / outer plate face |
| C     | `s`     | Vertical projection of the seat toe                    |
| D     | `r−t/2` | Ridge cut, upper corner                                |

After the user-approved correction, **the physical vertical notch cut is at B, not C**. C is a construction reference for the seat toe, not an additional vertical cut. The blueprint and UI document this consequence explicitly.

At an arbitrary world `x`, the upper-edge local station is `(x+e)/cosθ + d·tanθ`. Differences between upper-edge stations cancel the final offset:

```text
A→B = e/cosθ
B→C = s/cosθ
C→D = (r−t/2−s)/cosθ
A→D = (r−t/2+e)/cosθ
```

The first three sum to A→D. **B→C is not the horizontal seat length.** The fabrication summary labels it as an upper-edge distance and reports the horizontal seat separately.

The minimum enclosing rectangular stock has local length `A→D + d·tanθ`. This differs from A→D because both ends are plumb cuts across a sloping member. The displayed stock length has **no kerf, trimming, defect or machining allowance** and is not a purchase recommendation.

Marking instructions refer to A along the upper edge. The heel and ridge use the acute `90−θ` line angle. To locate the seat toe, project C vertically to the lower edge, then mark the horizontal seat toward B, at acute angle `θ` to the member axis. Angles describe geometric lines, not controls on a particular saw.

## Limits and visual conventions

- Pitch: 1–80°.
- Run: 1–100000 mm; horizontal overhang: 0–10000 mm.
- Timber width: 1–1000 mm; depth: 1–2000 mm.
- Plate width and seat length: 1–2000 mm, subject to joint validation.
- Ridge thickness: 0–1000 mm.
- These are numerical model limits, not approved construction dimensions.
- Timber width is out of the side-elevation plane. It is editable and preserved but does not change the side profile.
- Plate block depth (140 mm) and the visual ridge block extension below the joint (70 mm) are schematic. They do not drive any cut or manufacturing length and are recorded as `visualExtentOnly`.
- No additional supports, compound bevels, birdsmouth tolerances, structural checks or persistence.
- At compact canvas widths, long-view dimension labels reduce to A→D to prevent crowding; the full chain remains in the fabrication strip. Joint detail views retain their dimensions.
- Detail polygons are geometrically clipped to a local viewport. The displayed notch is the same retained profile as the assembly/member, not a separate drawing formula.

## Validation

Reference tests cover the 30° / 100 mm seat / 200 mm depth case, removed polygon area, world/local transforms, plate contact, actual near-face intersections, datum chain, stock envelope, zero overhang, zero ridge thickness, pitch boundaries and invalid geometries. UI tests cover reactive timber/seat changes, display-only unit switching, invalid-state recovery, keyboard selection and view/language controls. Browser visual QA is a separate check.
