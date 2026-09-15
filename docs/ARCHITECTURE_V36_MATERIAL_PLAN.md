# V36 — Material plan and database runtime

Status: complete, uncommitted on main at 7946b4d, 2026-09-15.

## Definition of Ready

1. User problem: roofers need one list explaining requirements, selected products, certainty and known prices instead of inspecting separate schedules.
2. Domain owner: apps/web composes already resolved facts; API owns environment initialization and diagnostics. No geometry moves into the plan.
3. Canonical persistence: no technical document changes. Accepted prices remain in the existing cost sidecar; planner and price selection drafts are session state.
4. Schema/migration: optional CostLine.priceProvenance retains accepted source/variant/unit without changing version 1 readers. A renderer-neutral material-list document section is additive; no database migration.
5. History: numeric technical product edits use existing roof history. Plan navigation, price drafts and costing edits create no roof history entries. No new gesture.
6. Quantity: basis and completeness remain explicit; tile positions never become purchase pieces. Only a complete K1 plan is exact procurement evidence.
7. Procurement: reads existing result; no inference or added allowances.
8. Catalogue: existing technical snapshots remain authoritative; section-only timber compatibility is retained and grade/treatment are disclosed as selected commercial facts.
9. Cost: pricing and integer money remain downstream in web/cost-core; no commercial concepts enter geometry or procurement.
10. Offline: local projects, quantities, manual product/price inputs and exports remain usable without database/network.
11. Mobile: Materials opens the same plan at 390×844; cards wrap and every price/product dimension has numeric input through the existing layers inspector.
12. Research: no new geometry/overlap/connection algorithm. Existing V34C membrane limitations and consumption semantics are preserved.
13. Regression: focused environment/doctor, projection, price safety, update ownership, CSV/document and UI tests; existing reference corpus plus desktop/offline/mobile Playwright.
14. Multi-structure: all source references stay opaque; composition reads supplied sources and introduces no ID parsing.

## Local database evidence

Baseline: only user git.txt modified; pnpm verify passed before code changes.
XAMPP MariaDB 10.4.32: mysql.db and mysql.columns_priv were corrupt. Scoped
online REPAIR TABLE followed by CHECK TABLE and FLUSH PRIVILEGES succeeded.
mysql.db recovered 2 of 5 rows; other local account grants may need restoration.
Pre-repair physical files copied to the local temporary directory (not a full
consistent server backup). catalog_user remains able to access cieslacalc.
Root .env is ignored by Git. Doctor: 3/3 migrations, 12 active products, 6 prices.
Bootstrap twice: no new rows/conflicts, stable final catalogue (older tile batch
metadata is reapplied then superseded by V35; no duplicate technical revisions).

## Boundaries

MaterialPlanRow is application composition of ExportFacts, selected technical
snapshots and explicit compatible prices. It retains ranges, partial states and
warnings. Material list export is distinct from the accepted cost scenario.
Multiple offers require user choice. No network refresh replaces manual prices.
Accepted cost rows require a visible proposed update; manual quantities remain
owned by the user. The material list is physical/estimate evidence, not an order.

## Validation

### Runtime follow-up — 2026-09-15

The local Apache entry `/RoofCalc/apps/web/dist/` has a different origin from
Node API. Web API composition explicitly detects a loopback Apache build path
and uses `http://127.0.0.1:3001/api`; Vite and Node hosting retain same-origin
`/api`. `VITE_API_BASE_URL` is an optional build-time override. Read-only CORS
allows exact HTTP/HTTPS loopback origins, never arbitrary remote origins,
credentials or writes. No Apache server configuration is changed.

`tools/dev.mjs` checks CieślaCalc health and branded Vite HTML, reuses running
services and starts only missing workspace services. An unrelated service is
never terminated. Root .env is loaded before child CLI startup.

Follow-up baseline: 945/946 pass; pre-existing J1 UI workflow exceeded 5s and
Vitest reported a task-update timeout on this machine. No assertions changed.
Focused API origin/client routing and live XAMPP browser regression added.

Follow-up results: final verify passes typecheck/lint/format and 947/948 tests;
the unchanged H1 smart-detail UI workflow exceeds the default 5s limit in the
full suite, but passes isolated in 778ms. Both builds and architecture 25/25 pass.
Full live/offline/XAMPP browser suite: 41 pass, 3 deliberate skips. Exact Apache
desktop/mobile catalogue/pricing and unchanged local project origin verified.
Screenshots inspected; Git diff check clean. No test assertions/timeouts widened.

### Initial V36 validation

Full verify: typecheck, lint, formatting, 946 tests and both builds pass.
Final verification uses VITEST_MAX_FORKS=2 / VITEST_MIN_FORKS=1 to avoid
machine contention; the unrestricted run timed out in the unchanged project
manager workflow, which passes isolated. Architecture: 25 tests pass.
Full desktop/mobile Playwright: 39 pass, 3 deliberate desktop-only skips.
Live XAMPP catalogue/price selection, K1, membrane, estimate and BOM pass;
offline/manual flows pass. Mobile and material document screenshots inspected.
Git diff check clean; only the existing large bundle warning remains.
