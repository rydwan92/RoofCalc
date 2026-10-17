# ADR-013 — A bundled technical catalogue as an explicit offline choice

## Status

Accepted (VNext-2). Amends ADR-006, which made catalogue browsing
unavailable whenever the database is.

## Context

The technical starter catalogue (manufacturers, product families, immutable
technical revisions, sale variants) is versioned in the repository and seeded
into SQL. Many real installations — a static build behind Apache, a laptop on
a roof, a database not yet migrated — have no catalogue API, so the picker
could only say "catalogue unavailable" even though the same data ships with
the source.

## Decision

1. The technical batches live in `packages/catalog-data` (data only). The
   API seed and the web app read the same files; price lists stay in the API.
2. `catalog-core` provides `createOfflineCatalogue`, a pure read model that
   answers the API read contracts from those batches.
3. The web app offers the bundled catalogue **only as an explicit user
   choice** where the server catalogue is unavailable. While it is in use,
   every picker and the Material Plan say so, with the data date, and offer
   the way back. The choice is transient session state.
4. A product picked offline stores the same immutable revision IDs and
   technical snapshot as one picked through the API (ADR-003, ADR-004).
5. The server remains the source of truth: the default behaviour, the manual
   path and ADR-006's offline invariant are unchanged.

## Consequences

- The client bundle gains lazily loaded data chunks (~2 kB gzip each),
  downloaded only after the user's choice, from the app's own origin.
- Offline data can be older than the server's. The data date is always
  visible; a newer server catalogue is one click away.
- Business mode keeps its company assortment from the server; the bundled
  catalogue never invents an assortment or a price.
