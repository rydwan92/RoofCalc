# ADR-009 — Fabrication geometry is resolved upstream of procurement

## Status

Accepted (V26).

## Context

Procurement needs one number per physical member: the length of material that
must be obtained. That number is the end of a chain of domain decisions —
theoretical length, overhang, plumb and seat cuts, compound end cuts, fabrication
allowance, kerf policy for the *cut list* — each of which belongs to a different
domain owner and each of which has its own references and tests.

If the optimizer were allowed to add its own allowance ("add 50 mm for safety",
"round up to the next module"), the same roof would produce different material
requirements depending on which layer you asked, and no layer would be
answerable for the number. The V26C research (`docs/FUTURE_EXECUTION_SEMANTICS_AUDIT.md`)
makes the same point for coverage: one length cannot describe design,
installation, fabrication, execution, procurement and cost at once.

## Decision

Every fabrication allowance is resolved **before** procurement. `procurement-core`
receives an explicit required blank length and treats it as final and
indivisible.

Procurement owns only the physics of getting blanks out of commercial stock:

- kerf between two adjacent blanks on one stock item,
- end trim removed from each end of every opened stock item,
- reusable-remnant threshold,
- finite availability,
- objective and search budget.

It does not infer installation rules, overlap, waste factors, module steps,
species or treatment. `stockClassId` is opaque compatibility identity.

Consequently `procurement-core` depends on **no** workspace package. It cannot
import geometry, so it cannot be tempted to re-derive it.

## Consequences

- The number is answerable: it comes from the fabrication layer and can be
  traced there.
- A future quantity → procurement adapter must do the allowance resolution
  explicitly and visibly; that adapter is the right place to review it.
- Procurement can be tested exhaustively with synthetic lengths, with no roof.
- A procurement result is derived, never persisted in a project document.
