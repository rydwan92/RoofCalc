# V45 — one shared DEV database for local Node and Cloudflare

V45 finishes what V42 prepared: local development and the public
`roofcalc.michal-rydwanski.workers.dev` DEV site read **the same** MariaDB
database. There is no second copy and no synchronisation.

```
LOCAL                                   CLOUDFLARE
Browser (Vite :5173)                    Browser
   │  /api (Vite proxy)                    │  same-origin /api/*
   ▼                                       ▼
Node API :3001 (Express)                Worker (apps/api/src/edge/worker.ts)
   │  DATABASE_URL (private root .env)     │  env.HYPERDRIVE (binding)
   │  mysql2 pool, verified TLS            ▼
   │                                    Cloudflare Hyperdrive (pooling, TLS)
   ▼                                       ▼
          alwaysdata MariaDB 11.4 — database rydwan92_roofcalc_dev
```

Both transports call the same `handleApiRequest` (`apps/api/src/http/handler.ts`),
the same `CatalogService`/`PricingService`, the same Drizzle repositories and
the same schema bundle. Only the connection factory differs.

## Provider facts (verified 2026-09-17)

| Fact | Value |
| --- | --- |
| Host | `mysql-<account>.alwaysdata.net` (note the **hyphen**; `mysql.<account>…` does not resolve) |
| Server | MariaDB 11.4.13 |
| TLS | account is `REQUIRE SSL`; plaintext logins are rejected as "access denied" |
| Certificate | publicly trusted (WebPKI), hostname-valid, TLS 1.3 |
| Auth plugin | `mysql_native_password` (Hyperdrive-supported) |
| Grants | `ALL PRIVILEGES` on the DEV database only |

These satisfy Hyperdrive's default `REQUIRED` TLS mode, unlike the earlier
SEOHost candidate (self-signed certificate) documented in
`CLOUDFLARE_SEOHOST_V42.md`, which is now historical.

## Local development with the shared database

1. Put one line in the **private** root `.env` (ignored by Git):
   `DATABASE_URL=mysql://<user>:<password>@mysql-<account>.alwaysdata.net:3306/<database>`.
   Percent-encode special characters in the password (`@` → `%40`).
2. `pnpm db:doctor` — read-only: DNS, TCP, TLS policy, authentication,
   server version, active database, grants (password hashes stripped),
   table count, migration state, catalogue/pricing counts.
3. Once for a fresh database: `pnpm db:bootstrap` (wait → migrate → seed →
   smoke check). Replaying it is safe; see *Bootstrap* below.
4. `pnpm dev:remote` (doctor + dev) or `pnpm dev`. `GET /api/health` shows
   `"database": "connected"`.
5. Optional acceptance test: `pnpm test:shared-db` — read-only, compares the
   Node transport and the Worker handler against the real database.

### `DATABASE_URL` parsing and TLS policy

`apps/api/src/db/config.ts` is the single parser used by the API, bootstrap
CLIs, doctor and `drizzle.config.ts`:

- loopback hosts (`127.0.0.1`, `localhost`, `::1` — XAMPP, Docker, CI) use
  plain TCP by default;
- every other host uses TLS with certificate **and** hostname verification;
- `?ssl=required` / `?ssl=disabled` override explicitly;
- parse errors never contain the URL, user or password;
- the server logs only `host:port/database (TLS verified)`.

A malformed `DATABASE_URL` disables the catalogue but never stops the API
from serving geometry and the SPA.

## Bootstrap and seed

`pnpm db:bootstrap` = `db:wait` → `drizzle-kit migrate` (3 committed
migrations) → `db:seed` (9 ordered, checksummed import batches) →
`db:smoke-check`. Importers compare each canonical record with the stored
one: equal → unchanged, mutable fields changed → updated, immutable revision
changed → conflict (the run fails, nothing is overwritten). Each run appends
an audit row to `catalog_import_batches` / `pricing_import_batches`; those
are history, not catalogue data.

Seeded state after the first run on the fresh alwaysdata database:

| Table | Rows |
| --- | --- |
| manufacturers | 11 |
| technical_product_families / revisions | 52 / 52 (50 active) |
| commercial_variants | 40 |
| price_lists / price_list_entries | 4 / 30 |

Active kinds: roof-tile 7, modular-sheet 32, standing-seam 6, membrane 1,
timber-stock 4. The replay produced 0 new rows and 0 conflicts. The tile
batches report transient "updated" mutable rows because the V35 correction
batch re-applies the KODA rebrand after the original September batch; the
final state is identical.

## Cloudflare Worker with Hyperdrive

`wrangler.jsonc` is committed (it holds no secret; a Hyperdrive ID is a
resource identifier). Workers Builds deploys it on every push to `main`.

- `/api/*` runs the Worker first (`run_worker_first`); everything else is
  static SPA assets with `single-page-application` fallback.
- `nodejs_compat` is required by mysql2.
- The Worker opens one short-lived mysql2 connection per request from
  `env.HYPERDRIVE.{host,user,password,database,port}` with
  `disableEval: true` and closes it in `finally`. Hyperdrive pools and
  encrypts the origin connection. Only text-protocol queries are used
  (Hyperdrive does not support protocol-level prepared statements); the
  importer transactions run only in Node.
- Driver errors are never forwarded: catalogue/pricing respond
  `503 {"error":{"code":"database-unavailable"}}`.
- API responses are `Cache-Control: no-store`.

### Creating the Hyperdrive configuration (manual, once)

Cloudflare dashboard → **Storage & databases → Hyperdrive → Create
configuration** → name `roofcalc-dev`, database **MySQL**, host
`mysql-<account>.alwaysdata.net`, port `3306`, database, user and password.
Query caching may stay enabled (catalogue reads can then lag database writes by up to the cache max-age, 60 s by default). Copy the configuration **ID**, paste it into
`wrangler.jsonc` in the commented `hyperdrive` block, uncomment the block,
commit and push. Until then `/api/health` reports
`"database": "not-configured"` and the calculator works without the online
catalogue.

### Local Worker runtime caveat

`wrangler dev` with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`
cannot log in to a `REQUIRE SSL` MariaDB account: Miniflare 4.x's local MySQL
TLS proxy sends an `SSLRequest` with only `CLIENT_SSL | CLIENT_PROTOCOL_41`,
and MariaDB rejects the login with `ER_NOT_SUPPORTED_AUTH_MODE`. This is a
local emulation limitation, not a Hyperdrive one. `wrangler dev` still
verifies routing, SPA fallback and graceful degradation; database parity of
the Worker handler is covered by `pnpm test:shared-db`.

## Health semantics

`GET /api/health` is HTTP 200 whenever the API answers:

```json
{ "status": "ok|degraded", "service": "cieslacalc-api", "version": "0.1.0",
  "runtime": "node|cloudflare-worker",
  "database": "connected|unavailable|not-configured" }
```

The database probe is `SELECT 1` with a 5 s timeout. A database outage is
`degraded`, never an API failure, because geometry, saved local projects and
pure calculations do not depend on it (ADR-006).

## Catalogue as the single source of material truth

The catalogue model stays as introduced in V24/V35 and is not duplicated in
calculators:

```
Manufacturer
 └─ TechnicalProductFamily      (kind: roof-tile | modular-sheet | standing-seam | membrane | timber-stock …)
     └─ TechnicalProductRevision (immutable, versioned CoveringTechnicalSpec JSON:
     │                            dimensions, cover width/length, effective area,
     │                            min pitch, overlaps, packaging/rolls, units, sources)
     └─ CommercialVariant        (SKU, colour, finish)
          └─ PriceListEntry      (pricing-core: net amount, currency, VAT context,
                                  source, validity dates, owner)
```

Projects store revision snapshots (stable IDs + spec), so saved projects,
documents and exports remain reproducible when the catalogue changes. Future
manufacturer/distributor feeds deliver `CatalogImportBatchV1` /
`PriceImportBatchV1` through the same importers, with the same checksum,
conflict and audit rules; no provider code touches calculators, UI or
renderers. Stable IDs (`manufacturer:*`, `product:*`, `revision:*`,
`variant:*`) are the anchors later document/export and IFC work can cite.

## Security

- The password exists only in the private `.env` and in the Hyperdrive
  configuration. It is not in Git, `.env.example`, docs, logs, the Worker
  bundle or the browser bundle.
- `tools/check-edge-bundle.mjs` fails the edge build if Node environment
  loading or `DATABASE_URL` enters the Worker bundle, or server DB code enters
  client assets.
- `wrangler dev` reads the root `.env` as local Worker variables; the Worker
  ignores them and nothing from `.env` is uploaded by `wrangler deploy`.
