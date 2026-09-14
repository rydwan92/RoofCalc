# ADR-007 — Geometry IDs are opaque and must not encode domain decisions

## Status

Accepted.

## Context

Generated IDs are readable by design: `roof-plane:left`,
`instance:rafter-pair-4:left`,
`instance:opening-rafter-segment:feature:roof-window-1:…:upper`. Readable IDs
invite parsing, and parsing spread: the counter-batten solver derived a member
*side* from an ID suffix (defaulting silently to `right`), and the quantity
schedule derived opening role and provenance with regular expressions.

Two things break when domain logic reads ID shape. First, renaming a generated
ID silently changes results instead of failing to compile. Second — and
decisively — a future compound project (house + garage,
`docs/ARCHITECTURE_FUTURE_COMPOUND_ROOF_SCENE.md`) contains the *same* local IDs
in two structures, so parsed decisions would merge or mis-assign geometry across
buildings.

## Decision

Geometry IDs are **opaque identity**. Domain code compares them and looks them up
in explicitly supplied collections; it never recovers meaning from their text.

- Facts a consumer needs are carried as structured fields:
  `SkeletonMember3D.sourceMemberId`, `.sourceFeatureId`, `.openingRole`;
  `MemberInstanceContext.roofPlaneRole` (a role word, deliberately *not* named
  like an ID).
- Set membership over a supplied list (`planeIds.includes(id)`) is correct usage
  and stays allowed.
- Only `roof-math` holds the roof-plane ID vocabulary, because it generates it.
  Its table lookup (`roofPlaneIds`, `roofPlaneSide`, `resolveRoofPlaneBasis`) is
  the single interpretation point and returns `undefined` for an unknown plane
  rather than defaulting.
- A module that *mints* IDs in a namespace it owns may read that namespace to
  allocate the next free ordinal (`addPurlin` scanning `support:purlin-<n>`).
  That is generation, not inference, and is allowlisted by name.
- Presentation may map an ID to a label, but through one lookup table with a
  translated generic fallback (`roofPlaneLabelKey`, `roofPlaneShortLabelKey`),
  never by slicing the ID into a translation key.
- `procurement-core` never parses `RequiredPieceSource.referenceId`.

One documented exception: `quantity-core/src/schedule-family-code.ts` derives the
display codes `O<n>` and `P<n>` from generated IDs, because the single-roof
skeleton carries no ordinal. It is isolated, commented and allowlisted, and is a
ProjectDocument V2 migration item.

## Consequences

- ID formats can change without changing results.
- New domain code must add a field rather than a parse; the architecture test
  rejects the parse.
- A V2 multi-structure document can scope IDs per structure without rewriting
  solvers.
- Serialization is unaffected: the new fields are optional and derived, so
  existing `RoofProjectDocumentV1` archives keep parsing unchanged.
