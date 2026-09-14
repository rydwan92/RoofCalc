# ADR-003 — Covering technical snapshots make saved projects reproducible

## Status

Accepted.

## Context

Covering quantities depend on manufacturer technical values: effective width,
cover width, gauge range, panel length limits, minimum pitch. Those change when a
manufacturer publishes a new revision. If a saved project looked up the current
catalogue entry at open time, reopening a quotation could silently change
quantities the user already gave a customer — and the project would not open at
all without network access.

## Decision

A covering assignment stores an immutable **`technicalSpecSnapshot`**, deep-copied
at selection time. That snapshot is the only calculation input.

It may additionally carry `catalogRef` (`{ productId, technicalRevisionId,
variantId? }`, provenance only) and `displaySnapshot` (labels only, never a
calculation input).

Manually entered products use the same snapshot contract with no `catalogRef`,
so manual and catalogue products share one calculation path.

Editing a catalogue-derived technical value detaches `catalogRef` in the same
canonical edit, so a modified snapshot can never claim an exact revision.
Adopting a newer revision is an explicit user action and one project transaction.

## Consequences

- A saved project calculates identically offline, forever.
- The catalogue can advance without touching existing projects.
- The snapshot must stay small, serializable and schema-validated.
- "Which revision is this project on?" is answerable from the document alone.
