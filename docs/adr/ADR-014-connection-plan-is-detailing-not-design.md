# ADR-014 — The connection plan records decisions and checks detailing, never capacity

## Status

Accepted (VNext-2).

## Context

Carpenters need to plan how members are joined (fastener type, diameter,
count, connector) and to see which standard governs each joint. Capacity —
how many fasteners a node needs — depends on loads, timber grade, service
class and combinations, which RoofCalc does not model. A tool that computed
a "number of nails" from geometry alone would look authoritative and be
wrong.

## Decision

1. `project.connectionPlan` stores decisions per **node kind** (structured
   fact, ADR-007): fastening type, diameter, pieces per node, connector, note.
   No counts, spacings or capacities are stored.
2. `connection-core` derives a schedule: node occurrences, the carpentry
   interface the solvers already model, the planned fastening, references to
   PN-EN standards (with edition or a verify flag) and a **detailing check**
   where EN 1995-1-1 defines one (Tables 8.4/8.5 row fit). The UI always says
   the check is placement geometry, not capacity.
3. Numeric rules enter the package only with two independent sources and
   hand-checked vectors (`docs/domain/ROOF_TIMBER_CONNECTIONS_AND_STANDARDS.md`).
   Table 8.2 (nails) is referenced, not computed, until verified.
4. Carpentry interfaces with a canonical home elsewhere are shown, never
   duplicated in the plan.
5. Roof-to-roof junctions are vocabulary only until the multi-structure
   document of ADR-008 exists.

## Consequences

- A plan is portable and reviewable by a designer; nothing in it can be
  mistaken for a structural verification.
- Adding a rule (nails, screws, connector ETA data) is a data/test change in
  `connection-core`, not a UI rewrite.
- `connection-core` stays free of solvers, renderers, translations, the
  network and commercial concepts (architecture test).
