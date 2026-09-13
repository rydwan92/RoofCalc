# PROMPT_ITERATION_023

# Professional Project Lifecycle Foundation

# Local Projects, Autosave, Import/Export and Repository Abstraction

Continue RoofCalc / CieślaCalc from CURRENT HEAD.

Expected HEAD:

cac4b5106b255a51f39bb1f02a426b1bd0af0ef0
"V22"

IMPORTANT:

Remaining agent budget is limited.

Do NOT start another covering solver.
Do NOT implement cloud/backend/database/auth.
Do NOT implement cut-to-length metal in this iteration.

The objective is:

> turn the current single unsaved working session into a professional,
> safe, local-first project workflow designed from day one for a future API
> repository.

================================================== 0. PREFLIGHT
==================================================

Read:

- AGENTS.md
- PROJECT_BLUEPRINT.md
- docs/ROOFCALC_PRODUCT_NORTH_STAR.md
- ARCHITECTURE V20
- ARCHITECTURE V21
- ARCHITECTURE V22
- current project-document.ts
- assembly/store.ts
- App/Page/header/footer
- unit preference persistence
- current Undo/Redo implementation

Run:

git status
git log -1 --oneline
git diff
git diff --stat

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Record actual baseline.

V22 reports approximately:

475 tests across 48 files.

Use actual checkout values.

Do not discard user work.

==================================================

1. V22 RECOVERY GATE
   \==================================================

Quickly verify V22 is genuinely present:

- standing seam assignment,
- multiple width modes,
- panel runs,
- opening interruption,
- length limits,
- quantity rows,
- compact exact-length disclosure,
- serialization regressions.

Do NOT redo V22.

Only fix a demonstrated blocker.

================================================== 2. PROJECT VS TECHNICAL DOCUMENT
==================================================

Preserve:

RoofProjectDocumentV1

as the canonical technical roof document.

Do NOT add:

project name
createdAt
updatedAt
save status
UI preferences

inside RoofProjectDocument.

Introduce a separate project envelope.

Conceptually:

ProjectRecordV1 {
schemaVersion: 1
id: string
name: string
createdAt: ISO timestamp
updatedAt: ISO timestamp
document: RoofProjectDocumentV1
}

Use a validated Zod schema.

================================================== 3. PROJECT CORE BOUNDARY
==================================================

Create a clean pure project lifecycle boundary.

Preferred architecture:

packages/project-core

if doing so remains small and clean.

It may contain:

- ProjectRecordV1 schema/types,
- ProjectSummary,
- ProjectRepository interface,
- import/export parser,
- pure lifecycle helpers.

No React.
No DOM.
No localStorage.
No HTTP.
No database.
No translations.

If analysis demonstrates that a new package would be disproportionate,
place only the pure contracts in calculator-core,
but do NOT put storage/browser code there.

Document the choice.

================================================== 4. REPOSITORY INTERFACE
==================================================

Define an async interface suitable for BOTH local and future API storage.

Conceptually:

interface ProjectRepository {
list(): Promise<ProjectSummary[]>
get(id: string): Promise<ProjectRecordV1 | undefined>
save(record: ProjectRecordV1): Promise<void>
delete(id: string): Promise<void>
}

Optional clean additions:

exists(id)
rename(...)
etc.

Prefer the smallest useful contract.

Do NOT expose localStorage semantics through the interface.

================================================== 5. LOCAL REPOSITORY
==================================================

Implement web adapter:

LocalProjectRepository

using browser localStorage.

All localStorage access must live behind this adapter.

Do not scatter:

localStorage.getItem(...)
localStorage.setItem(...)

through components/stores.

Use one versioned storage namespace.

For example conceptually:

cieslacalc.projects.v1
cieslacalc.activeProject.v1

Do not store transient UI state.

================================================== 6. FUTURE API COMPATIBILITY
==================================================

Repository consumers should not care whether storage is:

localStorage
IndexedDB
REST API
cloud

Prefer Promise-based methods even for localStorage.

This is deliberate future architecture.

================================================== 7. PROJECT IDENTITY
==================================================

Use stable unique project IDs.

Prefer:

crypto.randomUUID()

with a safe fallback suitable for test/runtime environments.

Do not derive identity from project name.

Renaming must not change ID.

================================================== 8. PROJECT CREATION
==================================================

Implement:

Nowy projekt

Create from the current canonical default template.

Give a sensible default name:

Projekt 1
Projekt 2
...

or another deterministic local default.

Do not require a large blocking wizard.

Immediately activate the new project.

================================================== 9. ACTIVE PROJECT SESSION
==================================================

Introduce project-session state separate from canonical roof history.

At minimum:

activeProjectId
activeProjectName
saveStatus

Save status:

saved
saving
dirty
error

This state:

is not part of RoofProjectDocument
is not part of roof Undo/Redo
is not exported as technical geometry.

================================================== 10. OPEN PROJECT
==================================================

Opening another project must:

1. load and validate its ProjectRecord,
2. replace canonical RoofProjectDocument,
3. clear old project Undo/Redo history,
4. clear transient editing state,
5. clear selected physical/member/window/schedule IDs,
6. cancel placement/measure/proposal tools,
7. retain user preferences:
   - display unit,
   - language,
   - appearance preference where applicable,
8. rederive all geometry normally.

Do not carry Undo history between projects.

================================================== 11. STORE REPLACE BOUNDARY
==================================================

Add one explicit action such as:

replaceProjectDocument(...)

or:

loadProjectDocument(...)

Do not simulate project opening by calling twenty individual setters.

The action must reset history safely and atomically.

Add tests.

================================================== 12. AUTOSAVE
==================================================

After canonical ProjectDocument changes:

mark project dirty.

Debounce persistence approximately:

600–1000 ms.

Persist only the newest document snapshot.

After success:

saved.

During write:

saving.

On write failure:

error.

Never falsely show saved.

Avoid needless writes when serialized canonical document has not changed.

Unit/view/selection/camera/task changes must NOT autosave the technical project.

================================================== 13. DRAG / TRANSACTION BEHAVIOR
==================================================

Autosave must cooperate with current interaction transactions.

Do not save every pointer pixel unnecessarily.

A debounce of the canonical document is acceptable,
but ensure the final committed state is persisted.

One drag remains one Undo entry.

Autosave itself creates ZERO Undo entries.

================================================== 14. ACTIVE PROJECT RESTORE
==================================================

Remember the last active project ID locally.

On next application session:

if the project still exists and parses:
restore it.

If it no longer exists/corrupts:
fall back safely.

Never crash startup because one stored project is invalid.

================================================== 15. PROJECT MANAGER UX
==================================================

Add a compact project control to the main header/workbench.

Example:

Dach Kowalski
● Zapisano lokalnie

Click opens:

PROJEKTY

current project
recent local projects

- Nowy projekt

Actions for current project:
Zmień nazwę
Duplikuj
Eksportuj
Usuń

Importuj projekt

Do not build a huge dashboard page yet.

Desktop:
popover/dialog.

Mobile:
reuse the established MobileSheet/dialog strategy.

================================================== 16. RENAME
==================================================

Allow project rename.

Trim whitespace.

Reject empty names.

Rename updates:

name
updatedAt

but not technical RoofProjectDocument.

It creates no roof Undo history.

================================================== 17. DUPLICATE
==================================================

Duplikuj projekt:

creates NEW ID
copies technical document exactly
uses a derived name, e.g.:

Dach Kowalski — kopia

createdAt = now
updatedAt = now

Opening/creation behavior should be deterministic.

No shared mutable references.

================================================== 18. DELETE
==================================================

Deleting a project requires an explicit confirmation.

If deleting inactive project:
current session unchanged.

If deleting active project:
select/open another deterministic project,
or create a fresh default project if none remain.

Never leave activeProjectId referencing a deleted record.

================================================== 19. EXPORT
==================================================

Export one self-contained JSON project file.

Suggested extension:

.cieslacalc.json

The exported payload should be ProjectRecordV1 or a small explicit archive
envelope containing it.

Do not export:
camera
selected task
Inspector state
Undo history
unit preference.

File name must be safely derived from project name.

================================================== 20. IMPORT
==================================================

Importer should accept:

A. current ProjectRecordV1 archive,
B. legacy/bare RoofProjectDocumentV1.

For legacy technical documents:
wrap them into a new ProjectRecord.

IMPORT SAFETY:

- validate before replacing anything,
- malformed JSON must not damage current project,
- invalid schema must produce understandable feedback,
- imported project gets a NEW local ID by default to avoid accidental overwrite,
- preserve the imported technical document exactly.

================================================== 21. SCHEMA VERSIONING
==================================================

ProjectRecord has its OWN envelope schemaVersion.

Do not confuse:

ProjectRecord schema version

with:

RoofProjectDocument schema version

or:

Covering technical schema version.

Document these three version boundaries explicitly.

================================================== 22. NO AUTOMATIC TECHNICAL MIGRATION INVENTION
==================================================

Do not mutate old technical data merely because it is imported.

Use existing RoofProjectDocument parser/default normalization.

Future migrations should have explicit migration functions.

Prepare the architecture but do not invent migrations that are unnecessary today.

================================================== 23. SAVE STATUS UX
==================================================

Replace:

"Sesja robocza · bez zapisu"

with meaningful status when an active local project exists:

Zapisano lokalnie
Zapisywanie…
Niezapisane zmiany
Błąd zapisu

Keep:

Obliczenia lokalne

separate from persistence status.

"Obliczenia lokalne" means calculations happen locally.

"Zapisano lokalnie" means the project is persisted locally.

Do not merge these concepts.

================================================== 24. FAILURE HANDLING
==================================================

Handle:

localStorage unavailable
quota exceeded
invalid stored record
missing active record
corrupted project index

without crashing the calculator.

For save failure:
keep working document in memory.

Show non-blocking but clear error.

Encourage export if local persistence is failing.

================================================== 25. STORAGE FORMAT
==================================================

Keep stored records understandable/versioned.

Do not store derived:

skeleton
surface geometry
tile positions
sheet positions
standing seam runs
quantity schedule
fabrication projection

because all are derivable.

Store the canonical ProjectDocument only.

================================================== 26. PROJECT LIST PERFORMANCE
==================================================

Project summaries should not require re-running roof geometry.

list() should return stored metadata.

Do not load/resolve every roof just to show names and dates.

================================================== 27. UI/UX
==================================================

Keep project management simple.

Do not add another permanent side panel.

Project actions are global application actions,
not Builder task preset.

Do not create a new main ribbon task named "Projekty".

Header/global project control is correct.

================================================== 28. QUICK MODE
==================================================

Decide explicitly how Quick interacts with project persistence.

Preferred V23 scope:

Quick remains ephemeral/simple.

Builder/Kreator owns project lifecycle.

Do NOT make every Quick calculation auto-create a project.

Quick -> Builder handoff may enter the active project as currently designed,
but avoid scope explosion.

Document this decision.

================================================== 29. TESTS — PROJECT CORE
==================================================

At minimum:

- valid ProjectRecord parse,
- invalid name/id/date rejected,
- record roundtrip,
- RoofProjectDocument remains nested unchanged,
- repository interface fixture,
- legacy technical document import,
- invalid import rejected,
- duplicate receives new ID,
- rename preserves ID,
- project envelope version independent from roof document version.

================================================== 30. TESTS — LOCAL REPOSITORY
==================================================

Test:

- empty storage,
- save/get/list,
- update,
- delete,
- active project persistence,
- corrupted storage isolation,
- storage write failure,
- deterministic summaries,
- no derived geometry stored.

Mock storage cleanly.

================================================== 31. TESTS — SESSION
==================================================

Test:

- create,
- open,
- rename,
- duplicate,
- delete,
- active project fallback,
- open resets Undo/Redo,
- open resets transient selections/tools,
- unit preference survives project change,
- canonical edit marks dirty,
- autosave reaches saved,
- view-only edit creates no dirty project write,
- save error state.

Use fake timers for debounce.

================================================== 32. TESTS — IMPORT/EXPORT
==================================================

Test:

- export/import ProjectRecord,
- export excludes transient state,
- import old RoofProjectDocument,
- malformed JSON,
- unsupported schema,
- import does not overwrite current project before successful validation,
- imported local ID collision cannot overwrite another project.

================================================== 33. TESTS — UI
==================================================

Test:

- old "Sesja robocza · bez zapisu" disappears for active local project,
- active project name visible,
- Saved/Saving/Dirty/Error states,
- manager opens,
- New Project,
- Rename,
- Duplicate,
- Delete confirmation,
- Import failure feedback,
- mobile manager remains usable,
- project actions create no roof history entries except loading/replacing document
  resets that history.

================================================== 34. DO NOT ADD CLOUD YET
==================================================

Explicit non-goals:

- login/auth,
- user accounts,
- SQL database,
- REST API,
- cloud sync,
- multi-device sync,
- multi-user projects,
- collaboration,
- revision history UI,
- thumbnails,
- server backups,
- sharing links,
- PDF/XLSX,
- pricing.

The repository abstraction prepares for these.

================================================== 35. DOCUMENTATION
==================================================

Create:

docs/ARCHITECTURE_V23_LOCAL_PROJECT_LIFECYCLE.md

Document:

- ProjectRecord vs RoofProjectDocument,
- repository interface,
- LocalProjectRepository,
- active session,
- autosave,
- dirty/saving/error states,
- opening/replacing document,
- Undo reset,
- transient-state reset,
- user-preference preservation,
- import/export,
- schema versions,
- future ApiProjectRepository boundary.

Create:

docs/PROMPT_ITERATION_023_LOCAL_PROJECT_LIFECYCLE.md

with this actual contract.

================================================== 36. FINAL VALIDATION
==================================================

Run:

pnpm typecheck
pnpm test
pnpm lint
pnpm build
git diff --check

Run changed-file Prettier validation.

Record exact:

tests/files
bundle sizes
warnings
QA limitations.

Do not spend remaining quota on broad formatting unrelated to V23.

================================================== 37. BLUEPRINT
==================================================

Update PROJECT_BLUEPRINT.

Record truthful V23 state.

If all local lifecycle requirements are complete, NEXT ACTION should be:

Iteration 024 — cut-to-length metal covering strategy on the V22 variable-panel
kernel, OR catalogue/backend foundation after user review.

Do not automatically begin it.

Do not commit or push unless explicitly requested.
