# Database recovery and Cloudflare deployment — 2026-10-17

This runbook supersedes V45's shared-local-database instructions. There are two
independent databases. Local `.env` points to XAMPP; the deployed Worker uses
Hyperdrive's remote database. Never copy data or synchronize these databases.
Both use `db/schema-bundle.ts`, the same eight SQL migrations, repository classes,
HTTP contracts and Better Auth tables. Only connection creation differs.

**Everyday setup lives in [KONFIGURACJA.md](KONFIGURACJA.md)** (Polish):
`pnpm configure:local` / `pnpm check:local` for the root `.env` and the local
database, `pnpm configure:cloudflare` / `pnpm check:cloudflare` for the Worker.
This runbook keeps the recovery history and the remote maintenance sequence.

## Local recovery performed

MariaDB 10.4.27 reported `explicit_defaults_for_timestamp=0` with `NO_ZERO_DATE`.
The first statement of `0005_damp_squadron_supreme.sql` failed with
`ER_INVALID_DEFAULT`, errno 1067, SQLSTATE 42000:
`Invalid default value for 'refresh_token_expires_at'`. No tables from 0005 had
been created, so there was no partial DDL to reconcile. Migrations 0000–0004
and their hashes were intact.

The existing XAMPP `C:/xampp/mysql/bin/my.ini` already contained
`explicit_defaults_for_timestamp=ON` under `[mysqld]`, but the running process
had not loaded it. A graceful shutdown/restart loaded that setting. No SQL mode
was relaxed, no migration was edited and no journal entry was reset. MariaDB
10.4 has no session override for this variable; newer MariaDB/MySQL versions
support the runner's session setting. The CLI explains a required server restart
before any DDL when an old server cannot enable it per session.

Before writes, a complete `mysqldump --single-transaction --routines --triggers
--hex-blob` backup was saved outside tracked files at
`.git/cieslacalc-before-repair-20261017.sql` (21308 bytes). It contains private
database data; do not publish it. Recovery then applied 0005, 0006 and 0007 and
ran the catalogue, pricing and Business seeds. Replaying setup was successful.

Use Node 22 or newer, with the pinned pnpm 10.15.1:

```powershell
pnpm db:doctor
pnpm db:setup:local
pnpm db:status -- --require-ready
pnpm dev
```

`db:bootstrap` is now an alias for guarded local setup. `db:migrate` verifies
that the applied journal is an exact prefix of this checkout (timestamps AND
hashes), normalizes TIMESTAMP behavior when possible, then uses the standard
Drizzle migrator. It never swallows duplicate-table/column/index errors. DDL is
not transactional: on failure, back up and inspect actual objects before retrying;
never delete journal rows or use `IF NOT EXISTS` to hide a differing schema.

The local `.env` now also has an independent generated `ROOFCALC_BOOTSTRAP_TOKEN`.
Open `http://127.0.0.1:5173`, select Business, and create the first owner using
that setup code. Use your own name, email and password. The starter company is
explicitly DEMO; edit its profile after login. Real first-owner creation,
password login and session lookup were exercised within a transaction that was
rolled back: no test account or consumed bootstrap marker was retained.

## Readiness and runtime boundaries

- `/api/health` remains application liveness plus SQL reachability. HTTP 200 does
  not certify the schema or the presence of Worker auth secrets.
- `/api/readiness` returns 200 only for the exact eight migration timestamps and
  hashes and all physical columns required by the shared Drizzle schema; otherwise
  it returns 503. It exposes only `schema: current|outdated|unavailable`.
- Node and Worker reject Business, authentication and first-owner requests when
  this check fails. They perform read-only checks, never migrations or seeds.
- `db:status -- --require-ready` additionally requires all seed categories.
  Column presence detects incomplete DDL; it is not a full audit of manually
  altered column types, constraints or indexes. Do not make manual schema edits.
- Schema readiness is checked against each environment's own database. Standard
  calculators and saved local roof documents remain independent of SQL/auth.

## Remote maintenance, then deployment

The normal CI gate and browser QA use Node 22. No push workflow mutates a remote
database. `Database maintenance - shared DEV` is an explicit workflow_dispatch
operation protected by the `shared-dev` GitHub environment and its acknowledgement.

1. Back up the remote database using its provider's backup facility. Supply the
   remote URL privately in the maintenance process as `DATABASE_URL`, with
   `ROOFCALC_DB_ENV=shared-dev`. Do not replace the local XAMPP `.env` or place the
   URL in Git. Confirm this is the database configured in `roofcalc-dev` Hyperdrive.
2. Run `pnpm db:doctor` and `pnpm db:status`. For approved shared DEV maintenance:

   ```text
   pnpm db:setup:shared-dev -- --apply --confirm shared-dev
   pnpm db:status -- --require-ready
   ```

   The standalone guarded migration command also requires
   `pnpm db:migrate -- --apply --confirm shared-dev`. Production migrations require
   separate approval; this repository's mutating convenience commands refuse
   non-local targets unless explicitly acknowledged as shared DEV.
3. In Workers Builds, configure **Node 22**, build command
   `pnpm cloudflare:build`, and deploy command `pnpm deploy:cloudflare`. Supply a
   private remote `DATABASE_URL` build secret and `ROOFCALC_DB_ENV=shared-dev`.
   These commands check schema AND seed readiness before deployment; they never
   migrate. Local XAMPP cannot satisfy the deployment gate. These dashboard
   settings could not be inspected or changed without Cloudflare authentication.
4. Keep `HYPERDRIVE` bound to the existing `roofcalc-dev` ID in `wrangler.jsonc`.
   Verify origin TLS and credentials in Cloudflare. Node remote access defaults to
   certificate/hostname-verified TLS; do not use `ssl=disabled` for a remote target.
   Worker mysql2 uses the binding fields, `disableEval: true`, `nodejs_compat` and
   one connection per request, closed in `finally`. Hyperdrive owns origin TLS
   and pooling; never add the local DATABASE_URL to Worker code or browser assets.
5. **Disable Hyperdrive query caching for this binding before enabling Business**:
   sessions, membership changes and bootstrap state must not use stale cached
   SELECT results. The old V45 catalogue-only caching advice no longer applies.
6. `BETTER_AUTH_URL` is the deployed HTTPS origin in `wrangler.jsonc`. Configure
   independent `BETTER_AUTH_SECRET` and `ROOFCALC_BOOTSTRAP_TOKEN` Worker secrets
   (at least 32 random characters each). Build secrets and Worker secrets are
   separate settings. Do not reuse the local setup code or auth secret remotely.
7. After the separately authorized push/deploy, inspect `/api/health`,
   `/api/readiness` and `/api/setup/status`. Run `tools/verify-shared-dev.mjs` with
   `ROOFCALC_DEV_APP_URL=https://roofcalc.michal-rydwanski.workers.dev` and
   `ROOFCALC_EXPECT_AUTH_CONFIGURED=true`. Then provision the first real owner
   and inspect Administration → System status.

## Verified remote state and limitations

Read-only probes on 2026-10-17: the deployed Worker returned database connected,
50 catalogue products and auth unconfigured. Setup reported first owner unknown,
bootstrap unavailable. This proves live Worker-to-origin SQL access, not a complete
Business schema. Wrangler had no authenticated account; no independent remote
maintenance URL was available. Remote migration state, TLS mode, caching setting,
Worker secrets and Workers Builds dashboard settings remain unverified. No remote
mutation, commit, push or deployment was performed.

Read-only re-check on 2026-10-18 (`pnpm check:cloudflare`): `wrangler.jsonc`
passes every static rule; the deployed Worker still answers `/api/readiness`
with 404 (the deployed revision predates it — `main` has not received this
work) and reports auth unconfigured. Wrangler was not logged in on this
machine, so secret names and the Hyperdrive caching flag were not read.

References: [MariaDB system variables](https://mariadb.com/docs/server/server-management/variables-and-modes/server-system-variables),
[session variable availability](https://jira.mariadb.org/browse/MDEV-29225),
[Cloudflare mysql2](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/mysql-drivers-and-libraries/mysql2/),
[Hyperdrive MySQL/TLS](https://developers.cloudflare.com/hyperdrive/examples/connect-to-mysql/).
[Hyperdrive caching and authentication](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/).
