# V42 — shared DEV MariaDB and additive metal catalogue

## Definition of Ready

1. **User problem:** local development and the public test site need the same current catalogue; metal selections need truthful module and batten data.
2. **Domain owner:** `covering-core` owns technical sheet meaning and layout checks; `catalog-core` validates snapshots; `apps/api` owns both SQL adapters and HTTP transports.
3. **Persistence:** `battenGaugeMm` and advisory metal facts are optional in technical snapshots. Camera and connection state remain transient.
4. **Schema:** `CoveringTechnicalSpec` V1 and `CatalogImportBatchV1` gain optional fields only. SQL tables remain unchanged because the technical spec is JSON. Old projects continue to parse.
5. **History:** editing an exact metal field remains one existing project edit; catalogue reads and camera changes create no history entry.
6. **Quantity:** existing layout results remain the source, trusted only at their existing completion status.
7. **Procurement:** no blank or allowance rule changes.
8. **Catalogue:** new immutable V42 revisions, additive after V39, with snapshots; V39 T18 is deactivated as a mutable family without altering its revision.
9. **Cost:** price entries remain in `pricing-core`; no price enters geometry, quantities or procurement.
10. **Offline:** saved project snapshots and pure geometry still work without SQL or network.
11. **Mobile:** the existing covering inspector exposes exact module and batten gauge fields in its mobile sheet at 390×844.
12. **Research:** V41 fact ledger and data quality policy govern new data. Coverage and overlap follow `FUTURE_EXECUTION_SEMANTICS_AUDIT.md`.
13. **Regression:** unit tests cover old-snapshot fallback, additive seed coexistence, price references and shared HTTP semantics; DB bootstrap replay uses a disposable MariaDB, plus relevant desktop/mobile browser QA.
14. **Multi-structure:** IDs remain opaque; no new single-roof assumption.

## Runtime boundary

Local Node uses private `DATABASE_URL` with the existing Drizzle/mysql2 pool. The Cloudflare Worker uses a `HYPERDRIVE` binding with a per-request mysql2 connection, `disableEval: true`, and the same Drizzle schemas, repositories, services and endpoint handler. The public browser keeps same-origin `/api`; it never receives SQL credentials. Migrations and seeds run only through the explicit developer bootstrap command.

Cloudflare Hyperdrive acceptance requires a reachable SEOHost origin and validated TLS. A compiled Worker is not proof that the origin passes this gate. Production can later use another binding/database with the same schema.

## Historical Ruukki snapshot

The supplied 2026-04-28 net price entries remain write-once history. The
[manufacturer price page](https://www.ruukki.com/pol/dachy/wsparcie/dokumenty-do-pobrania/cennik)
now advertises a list valid from 2026-08-28, so the older list's mutable
validity metadata ends on 2026-08-27. That end date is an inference from the
new list's start date. Default current-price lookup therefore returns no
Ruukki price; `GET /api/pricing/variants?ids=...&at=2026-07-01` can inspect
the historical entry. No current Ruukki price is invented. The 2026-04-28
amounts come from the supplied handoff snapshot; the old downloadable PDF is
no longer reliably served at the manufacturer's stable download URL.
