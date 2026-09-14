# Architecture Decision Records

One short record per decision that would be expensive to reverse. Each has
**Status**, **Context**, **Decision**, **Consequences** — and nothing else. They
do not restate the architecture documents; they record *why* a boundary exists.

Write a new ADR when a choice constrains future work. Do not edit an accepted
ADR to change its meaning: add a new one that supersedes it and mark the old one
`Superseded by ADR-nnn`.

Several ADRs here are executable: `tools/architecture/*.test.ts` fails
`pnpm verify` when the code stops matching them.

| ADR | Decision | Enforced by |
| --- | --- | --- |
| [001](ADR-001-millimetre-canonical-geometry.md) | Canonical geometry uses millimetres | review + unit tests |
| [002](ADR-002-canonical-vs-view-state.md) | Canonical project state is separate from transient view state | store tests |
| [003](ADR-003-covering-technical-snapshots.md) | Covering technical snapshots make saved projects reproducible | fixtures 05–09 |
| [004](ADR-004-immutable-catalogue-revisions.md) | Catalogue technical revisions are immutable | importer tests |
| [005](ADR-005-geometry-quantity-procurement-commerce.md) | Geometry, quantity, procurement and commerce are separate layers | `layering.test.ts` |
| [006](ADR-006-local-calculation-remote-catalogue.md) | Calculations stay local; the backend supplies catalogue data only | `layering.test.ts`, `app.test.ts`, fixture 09 |
| [007](ADR-007-opaque-geometry-ids.md) | Geometry IDs are opaque | `opaque-ids.test.ts` |
| [008](ADR-008-compound-roofs-as-composed-structures.md) | Compound roofs are composed structures, not secondary roof fields | review |
| [009](ADR-009-fabrication-geometry-upstream-of-procurement.md) | Fabrication geometry is resolved upstream of procurement | `layering.test.ts` |
| [010](ADR-010-required-piece-is-a-fabrication-blank.md) | `RequiredPiece` means one required physical fabrication blank | `opaque-ids.test.ts` |
