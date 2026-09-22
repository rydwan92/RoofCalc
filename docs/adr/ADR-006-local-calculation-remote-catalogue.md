# ADR-006 — Calculations stay local; the backend supplies catalogue data

## Status

Accepted.

## Context

The users are on roofs, in vans and in workshops, on Polish mobile coverage. A
calculator that needs a round trip to compute a rafter length is useless there.
At the same time, manufacturer catalogues are large, shared and need a database.

## Decision

All geometry, fabrication, covering layout, quantity and procurement computation
runs **in the client**, from pure packages, with no network call.

The backend owns exactly one thing today: the covering catalogue, exposed as a
**read-only** REST surface. It performs no calculation and contains no second
geometry engine.

`DATABASE_URL` is optional. Without it the server still starts, health and the
static web app still work, and catalogue routes return a structured
`catalog-unavailable` 503.

The offline invariant, proven by `apps/api/src/app.test.ts`, fixture 09 and E2E
scenario D:

> Database unavailable → existing projects still calculate (from their
> snapshots) → the manual product path still works → only catalogue *browsing*
> becomes unavailable.

## Consequences

V58 adds an optional authenticated business workspace beside the public
catalogue: customer, estimation, quote and membership persistence. Standard
calculators and local technical projects still require neither a session nor
a database. Business mutations require same-origin requests, a live session,
active organization membership and a capability. No calculation moves to the
server; its technical snapshot validation invokes no geometry solver.

- No feature may move a calculation server-side.
- The catalogue picker must always offer the manual fallback.
- A future project sync service is additive; it must not become a prerequisite
  for calculating.
- API responses are validated on the way in as untrusted data, exactly like
  manual input.
