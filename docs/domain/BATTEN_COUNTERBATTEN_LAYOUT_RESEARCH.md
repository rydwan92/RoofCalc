# Batten and counter-batten layout — V33 research note

## Scope and evidence boundary

This note turns the existing manufacturer-backed covering research into a
small executable model. Product examples and sources remain in
`COVERING_PRODUCT_MODEL.md` and
`COVERING_INSTALLATION_SEMANTICS_RESEARCH.md`. V33 introduces no universal
manufacturer dimension and no structural sizing rule.

## Regular batten gauge

For a selected tile installation mode, `gaugeRangeMm` is the allowed distance
between consecutive regular-course batten axes. It is an effective installation
step: physical tile length, declared pieces/m² and cover width must not be used
to derive it. Given the exact regular span `S`, valid integer interval counts
satisfy `ceil(S / gMax) <= n <= floor(S / gMin)`. After choosing one `n`, the
exact gauge is `S / n` and station `i` is `first + S * i / n`; the last station
is the exact last reference. This prevents accumulated rounded-step drift.

The preferred gauge is product data only when the snapshot explicitly provides
it. Current snapshots do not, so V33 targets the range midpoint. A tie chooses
the smaller interval count (larger actual gauge) deterministically.

## Eave and ridge references

The existing offsets remain explicit project/detail inputs:

- `eaveOffsetMm`: plane-local uphill distance from the eave boundary to the
  first regular-course batten axis;
- `ridgeOffsetMm`: plane-local downhill distance from the upper/ridge boundary
  to the last regular-course batten axis.

They are not regular gauge intervals and are not inferred from physical tile
length. Eave support, ridge accessories and family-specific boundary courses
remain outside the generic V33 model.

### When no interval count fits (VNext-14)

A narrow range leaves gaps: with 402–418 mm (Koramic V9), 10 intervals
cover 4020–4180 mm and 11 cover 4422–4598 mm, so a 4300 mm span has no
solution. The model does not stretch the range; one end batten moves.
`fitBattenEndOffset` takes every plane's span and the current offset of one
end: changing it by `d` leaves `s − d`, which fits `n` intervals for `d` in
`[s − n·gMax, s − n·gMin]`. The nearest feasible `d` on either side of zero
is an endpoint of one of those intervals (all planes share the offset), so
only endpoints are tested, within one maximum gauge. The offset is rounded
to whole millimetres toward the inside of the feasible interval, never
below zero. Hand-checked: 4300 mm, top gap 200 mm → 320 mm (10 × 418) or
78 mm (11 × 402). Which end moves is the user's choice; the last batten is
offered first on a tie, because the eave detail usually fixes the first.

## Counter-batten direction and provenance

Counter-battens follow the fall-line axes of supporting rafters, rather than a
user-entered transverse spacing. Gable K1, hip K1 and hip J1 members already
carry structured `kind`, `side` and optional `sourceMemberId` provenance. V33
projects those axes into the explicitly addressed roof plane, groups opening
segments back to one physical source axis and subtracts roof-window intervals.
No decision is recovered from an ID string.

The current H1 solid/face model does not define which hip-rafter face owns the
counter-batten boundary detail, backing/drop treatment or duplicate ownership
between adjacent planes. V33 therefore does not draw a guessed H1 counter-
batten. Interior K1/J1 axes resolve and the result reports one structured
`hip-boundary-detail-unresolved` fact per physical H1 boundary.

## Result and quantity boundary

Resolved rows and visible segments are geometric installation evidence.
Counter-batten and batten totals are visible geometric lengths, not stock,
purchase or order quantities. Section values are user material intent only and
must never be described as structurally selected.

