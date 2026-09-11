# Architecture V15 — Quantity Engine and Timber Member Schedule

## Status

Iteration 015 introduces a geometry-based quantity projection over the accepted, composed roof assembly. It is the first quantity-engine foundation. It is deliberately not a procurement, pricing, stock-length, cutting-allowance or cutting-optimization system.

The canonical project remains the source of construction intent. Quantity results are derived and are never serialized into the project document.

## Dependency boundary

```text
canonical project
  -> roof/template resolvers
  -> base roof skeleton
  -> accepted opening-framing composition
  -> composed physical RoofSkeleton
  -> quantity-core projection
  -> schedule rows / section groups / summaries
  -> Builder material UX
```

`@cieslacalc/quantity-core` is a pure TypeScript package. It depends on timber-domain types, but not on React, DOM, Express, persistence, translations or commercial data. The web application supplies the accepted composed skeleton and optional resolved roof-build-up rows.

## Length semantics

Every structural timber length is the Euclidean length of the member's physical three-dimensional world-space axis:

```text
sqrt((x2 - x1)^2 + (y2 - y1)^2 + (z2 - z1)^2)
```

These values are geometric member-axis lengths. They do not include:

- stock-length rounding,
- saw kerf,
- end or cutting allowances,
- splice strategy,
- nesting or cut optimization,
- waste factors,
- order quantities.

Display formatting is applied only in the UI. Grouping never uses rounded display text. Rows are grouped by category, family, member kind/role, fabrication prototype, section completeness, length basis and a deliberately small numeric equality tolerance. Source instance IDs are retained so a row can be traced back to physical members.

## Counted structural families

The projection counts physical instances present in the composed skeleton:

- `K1` common rafters,
- `H1` hip rafters,
- `J1` jack rafters, with distinct geometric length groups preserved,
- `M` wall plates,
- `R` ridge members,
- `P1`, `P2`, … purlins,
- `O1`, `O2`, … accepted opening headers and upper/lower rafter segments.

An opening-framing proposal is not material. Only a valid, accepted framing specification changes the composed skeleton and therefore the schedule. Applying a framing specification removes the interrupted full rafter from the projection and introduces the actual replacement segments and headers. Undo restores the preceding schedule from the restored canonical project.

## Sections and volume

Rectangular volume is calculated only when both section dimensions are known and valid:

```text
volume = width * depth * physical axis length
```

Section summaries aggregate quantity, exact total geometric length and volume. A missing section dimension does not receive an invented default. The current ridge model exposes only a canonical thickness, so ridge length is included while ridge volume is excluded and the timber-volume summary is marked `partial`. Invalid axes, lengths or sections become deterministic issues and are excluded; non-finite values never leak into output.

## Roof build-up boundary

Battens are an optional, separate `roof-build-up` category. The web layer passes the already resolved, clipped visible rows to the quantity package. V15 reports derived row count, total visible geometric length, section and segment count. It does not call those rows purchasable pieces and does not convert them to commercial stock.

## Workbench state and UX

Builder gains the transient fifth view preset `materials` (`Zestawienie`). It combines:

- the existing canonical skeleton projection,
- total timber quantity and geometric length,
- explicitly partial geometric volume when appropriate,
- family cards with length groups and source instances,
- section summaries,
- optional batten geometry,
- a contextual inspector.

Selecting a schedule row highlights all source members on the existing skeleton. Selecting one source focuses that physical instance when an instance context exists. Schedule selection, expanded UI state, viewport and preset are transient workbench state: they do not modify the project document and do not add undo history.

Quick Calc remains intentionally unchanged. Millimetres remain the canonical and default display unit; schedule totals may additionally be presented in metres and cubic metres for readability without changing source precision.

## Invariants

- Quantities derive from the same physical assembly as the drawing.
- Accepted composition, not a proposal overlay, is counted.
- One physical instance is counted once.
- Equal pieces are grouped only by geometric equality rules, never UI rounding.
- All row ordering and IDs are deterministic for equal input.
- Quantity and commercial concerns never enter `roof-math`.
- A missing fact produces a partial/unavailable result, never a guessed value.
- No V15 result claims structural safety or procurement readiness.

## Deferred work

Future iterations may add stock catalogues, length allowances, waste, splice rules, cutting optimization, prices, suppliers, sheets/PDF exports and persisted project reports. Those modules must consume this geometric projection; they must not replace or duplicate the roof geometry engine.
