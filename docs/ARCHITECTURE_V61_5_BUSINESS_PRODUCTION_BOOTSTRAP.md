# V61.5 — Business production bootstrap and readiness

## Scope

The deployed Worker and local Node server share the same first-owner service and Business handler. Standard calculations and local projects do not call these services. V61B IFC conversion is paused.

## First owner

`BETTER_AUTH_URL` is the exact browser origin, with no `/api` path. `BETTER_AUTH_SECRET` and `ROOFCALC_BOOTSTRAP_TOKEN` are independent private values of at least 32 characters. Better Auth keeps `disableSignUp: true`. The public setup status exposes only coarse readiness and the number-of-organizations choice (`new`, `existing`, `ambiguous`, `unknown`), never an ID or identity. The browser sends the operator-entered setup code only to same-origin `POST /api/setup/first-owner`.

The transaction inserts/locks a reserved row in `auth_rate_limits` before checking owner memberships. This serializes competing requests even when no organization exists. It counts attempts in a 60-second window, checks the token digest without data-dependent early exit, attaches to the one active organization or creates the named first company, then inserts the Better Auth user, credential and active owner membership. Success permanently marks the reserved row consumed. The private owner provisioning path uses the same lock and consumes the marker after a successful owner membership. A second browser request returns `bootstrap-closed`, including after an owner is deactivated. More than one active organization returns `bootstrap-organization-ambiguous`; the operator uses the existing private provisioning CLI to choose an organization. No schema migration is needed. The DEMO starter organization keeps its test-data label until its profile is deliberately edited.

Business mutations in both transports require an exact trusted Origin, a live Better Auth session, active membership in the requested organization and the route capability. `GET /api/business/system/status` additionally requires owner/admin membership. The legacy local capability helper is not a production authorization gate.

## Readiness evidence

`GET /api/health` reports application availability, a live database probe and auth configuration. Public `GET /api/setup/status` reports database/auth/first-owner/bootstrap state. If the database answers but Business tables cannot be read, `firstOwner` is `unknown` and bootstrap stays unavailable; this does not mislabel a live connection as a database outage. The authenticated system endpoint reads `__drizzle_migrations.created_at` and completed import batches from the connected database. A Worker-safe manifest snapshot records expected journal times and seed checksums; its parity test compares the snapshot with the SQL journal and source seed files. The UI reports current, missing or outdated categories. Neither UI nor endpoint runs a migration or seed.

`pnpm db:status` uses the same database readiness service. A guarded `pnpm db:setup:shared-dev -- --apply --confirm shared-dev` waits, doctors, migrates, seeds catalogue/pricing/business, smoke-checks and requires all readiness categories to be current before printing `DATABASE READY`. The shared DEV sync workflow no longer runs on push; it is a manual read-only deployed verifier. Mutations remain in the separately guarded `Database maintenance - shared DEV` workflow.

## Operator sequence

1. Configure the Worker `HYPERDRIVE` binding; set `BETTER_AUTH_URL` to the exact deployed HTTPS origin; set `BETTER_AUTH_SECRET` and `ROOFCALC_BOOTSTRAP_TOKEN` as Cloudflare Secrets. Never put either secret in `wrangler.jsonc`, a `VITE_` variable or the repository.
2. Repair the private shared DEV database credentials outside Git. Run the guarded setup command or dispatch the `bootstrap` maintenance operation with `apply_confirmation=shared-dev`.
3. Check `/api/health`, `/api/setup/status` and the public catalogue. Run `node tools/verify-shared-dev.mjs` with `ROOFCALC_DEV_APP_URL` set; optionally set `ROOFCALC_EXPECT_AUTH_CONFIGURED=true` to require auth in that check.
4. In Business mode, enter the first owner details and setup code. After creation, sign in and review **Administracja → Stan systemu**. Add further users through **Administracja → Użytkownicy**.

The current checkout's private remote `DATABASE_URL` was read-only checked during V61D work and was denied access. The deployed pre-V61D Worker reported `database: connected` and served a catalogue read; migration and seed state were not proven from the local CLI. No shared database mutation was performed during this iteration.
