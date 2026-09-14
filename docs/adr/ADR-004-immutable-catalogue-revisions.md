# ADR-004 — Catalogue technical revisions are immutable

## Status

Accepted.

## Context

ADR-003 makes a saved project cite a `technicalRevisionId` as provenance. If the
row behind that ID could be edited, the provenance would be a lie: two projects
citing the same revision could have been calculated from different numbers, and
nobody could tell. Imports run repeatedly from provider feeds, so "re-import
updates the row" is the natural default — and the wrong one.

## Decision

`TechnicalProductRevision` rows are **write-once**. The importer:

- treats byte-order-independent identical canonical data as `unchanged`;
- treats a changed technical specification, product reference, revision code or
  provenance under an existing revision ID as a **conflict**, writing nothing;
- accepts a genuinely changed product only as a **new revision ID**.

Mutable under a stable ID: manufacturer display metadata; product family name,
slug and active flag; variant name, SKU, colour, finish, metadata, active flag.
Immutable: family → manufacturer, family covering kind, variant → product.

Records are never implicitly deleted. Schema changes ship as committed
migrations. Rollback is backup/restore or a reviewed forward migration.

## Consequences

- A revision ID in a saved project is a real, checkable fact.
- Provider feeds that mutate values in place produce loud conflicts, not drift.
- The catalogue accumulates revisions; listing must pick the current one
  deliberately.
