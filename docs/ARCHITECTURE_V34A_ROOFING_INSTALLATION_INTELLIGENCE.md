# V34A - Roofing installation intelligence

Status: COMPLETE. Required V34A desktop flows and mobile smoke pass; final full
gates are recorded in the work checkpoint. Builds on completed V33; no replacement solver.

## Definition of Ready

1. **User problem:** Roofers need to distinguish calculated regular spacing,
   product incompatibility and edge details that they still own.
2. **Domain owner:** `covering-core` evaluates tile technical constraints and
   mode selection. The web composition combines these with neutral `roof-math`
   results; neither package imports the other geometry engine.
3. **Persistence:** Authority, capability, explanations and repair previews are
   derived. Existing project offsets and mode selection remain canonical intent.
4. **Schema:** No persisted field is added. Preferred gauge and edge technical
   fields are deferred until supported snapshots have verified semantics.
5. **History:** Mode selection or repair is one existing canonical action.
   Explanation disclosure and preview create none; no gesture is introduced.
6. **Quantity:** Existing geometric evidence remains unchanged. Compatibility
   and partial automation are not purchase or fabrication readiness.
7. **Procurement:** No blank or allowance changes; procurement receives nothing new.
8. **Catalogue:** Stored snapshots only; manual technical edits retain the existing
   detach policy. No invented catalogue values or declared default are added.
9. **Cost:** No price, currency, waste, margin or commerce concept is introduced.
10. **Offline:** All decisions and previews run from the saved snapshot locally.
11. **Mobile:** The existing Layers > batten > Edit sheet exposes exact gauge,
    edge offsets, capability, explanation and repair at 390x844.
12. **Research:** A concise manufacturer-manual rule matrix precedes code; generic
    eave/ridge constants and physical/effective dimension assumptions are rejected.
13. **Regression:** Pure rule/guardrail tests, composition recomputation tests,
    existing reference fixture 09, targeted UI/history and desktop E2E plus one
    mobile smoke. Existing architecture tests remain authoritative.
14. **Multiple structures:** Plane/member IDs remain opaque explicit references;
    no new single-roof inference or ID parsing is introduced.

## Decision boundaries

Automatic regular gauge uses the selected snapshot range and V33 whole-course
solver. A single installation mode can be inferred; several require explicit
selection. Missing pitch data is unknown, not approval. A declared minimum pitch
is a hard constraint within that snapshot's selected mode, not structural or
waterproofing certification. The range midpoint is only a deterministic target.

Eave/ridge offsets are retained project inputs measured in plane-local slope
coordinates, not inferred manufacturer details. Edge automation and optional
manual-reason persistence are deferred. H1 counter-batten detail stays partial.

## Implemented contract

`covering-core/roof-tile-installation.ts` supplies small typed evaluations with
authority, hard/information issues, unambiguous mode selection and independent
regular-gauge / pitch / edge capabilities. Manual product data never claims
manufacturer authority. Declared technical conditions remain explicitly
unverified. The existing persisted technical schemas are unchanged.

The V33 solver adds factual target/range/interval-count bounds and target origin
to its derived result; selection mathematics and exact station references are
preserved. A 100,000-interval resource ceiling returns a named capacity issue,
not a guessed roofing rule. Invalid section, offset, product or roof values
return structured incomplete/partial evidence rather than crashing row iteration.

The web evaluator combines technical and geometric evidence into ready, partially
automatic, decision required, incompatible and no-data states. The explanation
and typed execution export copy per-plane facts; a scalar gauge is omitted for
unequal planes. Physical/effective dimension concerns remain advisory.

Auto repair previews the exact next intent and named affected planes. Layer
Inspector retains its current scope; covering repair explicitly shows the
assignment scope. Both preserve gauge intent, section and edge values and create
one history entry. Separate hard failures and missing pitch/condition decisions
suppress a misleading complete repair. Product replacement preserves assignment
identity, planes and compatible layout intent instead of adding a conflicting
assignment; multiple new modes require a new explicit selection.

Browser plugin entry points returned no browsers and `iab` unavailable. QA uses
real Chromium through the requested Playwright suite and inspected screenshots,
without claiming a native Browser session.
