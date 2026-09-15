# ADR-011 — The catalog's `coveringKind` field is a general technical-product kind

## Status

Accepted.

## Context

V35 asked the technical catalog (`packages/catalog-core`) to also store
membrane and timber-stock products, not only the three primary-covering
kinds (roof-tile, modular-sheet, standing-seam) it started with. Membrane and
timber-stock are not primary coverings — a membrane never competes for
roof-plane ownership (V34C), and timber stock has no roof-plane geometry
concept at all — so `covering-core`'s own `coveringTechnicalSpecSchema` union
correctly stays scoped to the three covering kinds.

The catalog's own discriminant field, `technicalProductFamilySchema.coveringKind`
(DB column `technical_product_families.covering_kind`), predates that
distinction and is named for it. Two ways to keep it honest once it also
carries `'membrane'`/`'timber-stock'` values:

1. Rename the field/column to something general (`productKind`), with a
   legacy migration and every dependent query/schema/test updated.
2. Keep the existing field/column name and widen only the accepted values.

## Decision

Option 2. `coveringKind` keeps its name at the Zod-schema, TypeScript-type and
`covering_kind` DB-column level; its accepted values widen to a new
`CATALOG_PRODUCT_KINDS`/`CatalogProductKind` set (`packages/catalog-core/src/index.ts`)
that is a strict superset of `covering-core`'s `CoveringKind`. No migration:
the column was already a plain `varchar(32)` and
`technical_product_revisions.technical_spec` was already an unconstrained
`json` column, so nothing about the DB shape needed to change — only the Zod
validation widened.

A separate, wider `catalogTechnicalSpecSchema` union lives in `catalog-core`
(`coveringTechnicalSpecSchema | membraneTechnicalSpecSchema |
timberStockTechnicalSpecSchema`) and is used only at the catalog/revision
boundary. `covering-core`'s own union is untouched, so nothing about a
primary covering's own type space changed. `isCoveringKind`
(`packages/catalog-core/src/index.ts`) stays narrow on purpose — it answers
"is this one of the three primary-covering kinds," which is a real,
still-meaningful question distinct from "is this a valid catalog kind at
all." A new `isCoveringTechnicalSpec` narrows a wide `CatalogTechnicalSpec`
back down to `CoveringTechnicalSpec` for consumers (like
`CatalogProductPicker.tsx`) that are always scoped to primary coverings by
construction.

## Consequences

- Zero data migration for the catalog generalization itself; the only V35
  migration is pricing-core's own (ADR-005/`docs/SCHEMA_REGISTRY.md`), unrelated
  to this field.
- `coveringKind`/`covering_kind` is now a legacy name for what is really "the
  catalog technical product kind." Anyone reading the schema fresh should
  consult this ADR, not assume the name is literally scoped to coverings.
- A future rename remains possible if the churn is ever worth it, but is not
  forced by V35.
