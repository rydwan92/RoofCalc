# ADR-002 — Canonical project state is separate from transient view state

## Status

Accepted.

## Context

The workbench holds a great deal of state: geometry, selection, hover, camera,
open panels, task view, isolation, drawing detail, sheet mode, half-typed
numbers. One undifferentiated store would put "the user panned the canvas" into
Undo history and into saved projects, and would make a saved project depend on
the screen it was drawn on.

## Decision

Four kinds of state, kept apart:

1. **Canonical project** — `AssemblyState.projectDocument`. Serialized,
   schema-versioned, and the only thing Undo/Redo snapshots.
2. **Derived** — recomputed with `useMemo` from canonical inputs. Never stored,
   never serialized. A procurement `CuttingPlan` is derived.
3. **Transient view/session** — `AssemblyState.workbench` plus component-local
   state (camera, pointer maps, hover). Never serialized, never in history.
4. **Remote/server** — catalogue responses, held in the query cache, never
   copied into the canonical store.

A direct-manipulation gesture is a transaction: `beginTransaction` → many
canonical updates → one `commitTransaction` (a single history entry) or
`cancelTransaction` (exact restore).

## Consequences

- Selecting an object, switching task, opening a sheet, panning or changing
  drawing detail creates no Undo entry and no autosave write.
- Autosave observes canonical document identity only.
- New UI state must be classified before it is added; transient state goes in
  `workbench` and gets no schema entry.
- A future server-side project store persists kind 1 only.
