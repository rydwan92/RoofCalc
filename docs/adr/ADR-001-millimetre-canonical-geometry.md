# ADR-001 — Canonical geometry uses millimetres

## Status

Accepted.

## Context

Carpentry and roofing in Poland mix millimetres, centimetres and metres.
Manufacturer data sheets use millimetres; site talk uses centimetres; areas use
square metres. Storing whatever unit the user last typed would make every
comparison, tolerance and regression test ambiguous, and would make a saved
project depend on the display preference of whoever created it.

## Decision

Every length, offset, station and coordinate in canonical project data, in every
domain package and in every persisted document is a count of **millimetres**.
Angles are degrees; areas are derived (mm² internally).

Display units are a presentation concern only. They live in a separate
preference adapter, never in `RoofProjectDocumentV1`, and are applied at the
formatting boundary (`apps/web/src/format.ts`).

Tolerances are expressed in millimetres too — the domain uses `1e-7` for exact
comparison, and `procurement-core` uses a `1e-9` floating-point normalization
epsilon that is explicitly **not** a fabrication tolerance — never in rounded UI
values.

## Consequences

- A project archive means the same thing regardless of who opens it.
- Comparing two lengths never needs a unit check.
- Every numeric input converts on entry and formats on display; there is one
  place to get this right and it is covered by unit tests.
- Anything that reads a rounded display value back into the domain is a bug.
