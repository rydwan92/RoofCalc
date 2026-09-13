# V23 — Local project lifecycle

## Boundaries and versions

`RoofProjectDocumentV1` remains the canonical technical document. It contains the roof template, features, framing, build-up and covering assignments in millimetres, and its `schemaVersion: 1` belongs to the technical document only. Covering technical snapshots keep their own independent schema versions. No name, timestamp, UI state, camera, selection, Undo history or display preference enters the technical document.

`packages/project-core` owns the pure `ProjectRecordV1` envelope with its own `schemaVersion: 1`, stable ID, trimmed name, ISO timestamps and nested document. Zod validates both layers. The package contains lifecycle helpers, a metadata summary, a JSON import/export boundary and the async `ProjectRepository` (`list/get/save/delete`) interface. It has no browser, React or network dependency. A future `ApiProjectRepository` can implement the same four methods without changing the session or editor.

## Local repository

`LocalProjectRepository` is the browser adapter. It owns all project-local `localStorage` access, using `cieslacalc.projects.v1` index/record keys and `cieslacalc.activeProject.v1`. The versioned index holds metadata only, so normal `list()` neither loads documents nor runs geometry. Each record stores only the envelope and canonical document. A corrupt index can be reconstructed from individually valid records; a bad record does not stop other records from opening. Unavailable storage and quota failures reject saves while the editor keeps the working document in memory. Display-unit preference remains in its existing separate preference adapter.

## Active session and autosave

`ProjectSession` keeps active ID/name, summaries, and `saved/saving/dirty/error` outside roof history. Builder initializes the session on entry. It restores the last valid active ID, tries another valid local project if needed, and otherwise creates a named project from the exact current Quick document. If Quick inputs changed before Builder entry, they become a dirty edit of the restored project rather than being silently discarded. Explicit **New project** uses the canonical default template. Quick mode by itself never creates or saves a project; a Quick-to-Builder handoff enters the Builder project workflow.

The session observes canonical `projectDocument` identity and transaction completion. View, camera, task, selection and unit changes never schedule a write. A changed document becomes dirty, then the newest snapshot is written after 800 ms of inactivity. During an active gesture transaction, writing waits for commit/cancel. Autosave adds no Undo entry. Write failure leaves the document editable, shows an error and offers JSON export. Opening another project first flushes any dirty committed edit, then replaces the document atomically. If that flush fails, switching is blocked to avoid losing the in-memory work.

`replaceProjectDocument` validates the incoming technical document and derives template/spec through the existing assembly path. It resets Undo/Redo, active transactions, drafts, selection, placement, measurement, proposal and view state together. The currently selected display unit survives. Language/appearance preferences live outside the store and also survive.

## Lifecycle operations and archive

Rename changes only name and `updatedAt`; duplicate uses a new ID, deep-copies the exact technical document and resets timestamps. Active deletion requires UI confirmation, then opens the first remaining valid project or creates a fresh default. Inactive deletion leaves the current session alone. Project archives use `.cieslacalc.json` and contain a validated record only; file names are sanitized. Import validates the complete archive or a bare legacy `RoofProjectDocumentV1` before touching the active session, assigns a new local ID, and saves before activation. No implicit technical migration is invented: the existing technical parser performs only its established optional-field normalization. Unknown envelope or document versions fail validation.

The header owns a compact global manager. Desktop uses a dialog; mobile reuses `MobileSheet`. The footer reports persistence separately from **Obliczenia lokalne**, which describes where calculations run. There is no project task, dashboard, backend, auth or cloud sync in V23.

## Known limitation

Browser storage is local to one browser/profile and has no backup or sync. Export is the user-controlled backup path. The localStorage record and metadata index are two writes rather than a transactional database; a quota failure can leave the last record payload unavailable from the index until index recovery. The repository contract allows a transactional adapter later.
