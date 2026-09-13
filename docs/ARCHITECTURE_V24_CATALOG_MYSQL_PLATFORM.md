# Architecture V24 — versioned covering catalogue platform

## Scope and dependency direction

V24 proves one path:

```text
MySQL/MariaDB catalogue
  → read-only Express API
  → lazy Product Picker
  → CoveringProductSelection
       catalogRef
       displaySnapshot
       technicalSpecSnapshot
  → existing tile / fixed-sheet / standing-seam engines
```

There is no catalogue-specific calculation. Existing projects calculate from
their stored snapshot and never require a catalogue request.

`@cieslacalc/catalog-core` owns pure, serializable Zod contracts for
manufacturers, technical product families, immutable technical revisions,
commercial variants, the canonical import batch and read API payloads. It may
reuse `CoveringTechnicalSpec` from `covering-core`; it has no React, HTTP,
Express, database, translation, local storage or pricing dependency. Drizzle
tables and repositories live only in `apps/api`.

## Identity and immutable revisions

`TechnicalProductFamily.id` is the stable `catalogRef.productId`.
`TechnicalProductRevision.id` is `catalogRef.technicalRevisionId`, and an
optional commercial finish/SKU uses `catalogRef.variantId`.

A revision ID is immutable. Re-importing byte-order-independent identical
canonical data is `unchanged`; changing the technical specification, product
reference, revision code or provenance under the same revision ID is a
conflict. The importer never updates that row. A changed technical product
requires a new revision ID. This is stricter than silently updating metadata
and protects saved-project reproducibility.

Commercial variants may update name, SKU, colour, finish, metadata and active
state under the same ID. Their `productId` is immutable. Product family name,
slug and active state may update, while manufacturer ownership and covering
kind are immutable. Manufacturer display metadata may update. Imports never
delete records implicitly.

## Database and validation boundary

The deterministic migration creates:

- `manufacturers`;
- `technical_product_families`;
- `technical_product_revisions`;
- `commercial_variants`;
- `catalog_import_batches`.

IDs are stable strings. Foreign keys prevent orphaned families, revisions and
variants. Unique manufacturer slugs and per-manufacturer family slugs protect
identity. Focused indexes cover active manufacturer/name lookup, family kind,
manufacturer, family name, product revision lookup, active variants, SKU and
import audit lookup.

Technical specifications use a JSON column because covering families differ.
The repository first decodes string-valued MariaDB JSON columns (MariaDB's
`mysql2` behavior differs from native MySQL here), then parses every row with the same
`coveringTechnicalSpecSchema` used by manual/project calculation. Arbitrary DB
JSON is never trusted and the schema is not duplicated into API- or DB-specific
roof product types. Prices do not exist in these tables or technical schemas.

Configuration is optional `DATABASE_URL`. Without it the server still starts,
health and the local calculator remain available, while catalogue routes return
the structured `catalog-unavailable` 503 response.

## Canonical imports

Provider-specific data has this future boundary:

```text
Manufacturer XML / XLSX / CSV / JSON / API
  → ProviderAdapter
  → CatalogImportBatchV1
  → cross-reference + duplicate validation
  → immutable conflict plan
  → one repository transaction
```

V24 deliberately implements only canonical JSON input. Future adapters such as
`KoramicXlsxAdapter`, `BmiXmlAdapter`, `BudmatCsvAdapter` or
`RuukkiApiAdapter` must end at `CatalogImportBatchV1`; manufacturer logic must
not enter the importer.

The CLI defaults to dry-run and reports a batch ID, SHA-256 checksum and
new/unchanged/updated/conflict counts per entity. `--apply` writes all accepted
upserts, new immutable revisions and a completed audit row in one database
transaction. A validation error or conflict writes no catalogue data. A
transaction error leaves no partial batch. Raw source files are not stored.

Commands:

```text
pnpm --filter @cieslacalc/api db:generate
pnpm --filter @cieslacalc/api db:migrate
pnpm --filter @cieslacalc/api catalog:import src/data/demo-catalog.v1.json
pnpm --filter @cieslacalc/api catalog:import src/data/demo-catalog.v1.json --apply
```

Production uses committed migrations, never automatic schema synchronization.
Rollback policy is backup/restore or a reviewed forward recovery migration;
dropping immutable catalogue rows automatically is unsafe.

## Repository and read API

`CatalogService` depends on `CatalogRepository`, not Drizzle. The MySQL adapter
and in-memory implementation share list/search/detail/revision operations, so
normal API tests need no external database.

Read-only routes are:

```text
GET /api/catalog/manufacturers
GET /api/catalog/products?q=&kind=&manufacturerId=&limit=&cursor=
GET /api/catalog/products/:productId
GET /api/catalog/products/:productId/revisions/:revisionId
```

Search returns summaries and a deterministic opaque offset cursor, with a
default of 20 and maximum of 50. Full validated technical JSON is returned only
by detail/revision endpoints. Query parameters and IDs are bounded by Zod.
Errors use stable language-neutral codes. There is no unauthenticated write or
import route.

## Web server-state and snapshot flow

The web uses a typed `CatalogClient` and TanStack Query for cached manufacturer,
search, detail and exact revision requests. Catalogue data is not copied to
Zustand. Search is debounced and requests receive Query cancellation signals.
The picker is lazy-loaded with the Covering task and uses a focused desktop
dialog or the established mobile sheet. It presents loading, empty and
unavailable states; unavailable catalogue data always offers the manual path.

Applying a product fetches and validates the exact displayed revision, then
creates one `CoveringProductSelection` containing a small display snapshot and
a deep-copied technical snapshot. This becomes one normal canonical project
edit, so existing V23 dirty/autosave behavior applies. The Inspector identifies
catalogue/manual source. The stored snapshot—not a latest-revision lookup—feeds
the existing engine after reload or offline. V24 never auto-upgrades a saved
project.

## Security, prices and non-goals

All SQL values go through parameterized Drizzle operations. API responses hide
database details. Limits, IDs, API data and database JSON are validated. The
DEMO fixture proves all three implemented covering kinds and is explicitly not
an authoritative manufacturer catalogue.

Future commercial data remains separate:

```text
PriceList { supplier/owner, currency, region/tax context, validFrom, validTo }
PriceListEntry { priceListId, commercialVariantId, saleUnit, netAmount,
                 validFrom, validTo }
```

Price lists and a Cost Engine are not implemented. V24 also excludes auth,
public administration, scraping, automatic provider imports, cloud projects,
purchase optimization, exports and billing.
