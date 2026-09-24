# V29 — Guided project workflow and workbench UX

V29 is an application presentation layer over the existing canonical project,
resolved roof, surface, covering, schedule and K1 requirement. It changes no
geometry, quantity, procurement or persistence semantics.

## Definition of Ready

1. **User problem:** A roofer can calculate useful results but must discover their location and missing inputs by visiting six separate tasks. A compact status and one next action make that work visible.
2. **Domain owner:** `apps/web/src/assembly` owns the pure workflow projection and its presentation because it combines outputs from several domain packages without changing them.
3. **Canonical persistence:** Workflow status, current summary view and cutting dialog activity are derived or transient. They never enter `ProjectDocument`.
4. **Schema / migration:** No registry entry or migration changes. Existing saved projects resolve the same projection when opened.
5. **History:** Stage navigation, summary selection, disclosures and cutting dialog opening make no undo entry. Existing canonical edits keep their current history boundaries.
6. **Quantity:** The summary reuses the complete/trusted schedule and covering rows. It does not generate a new quantity source or count incomplete covering layouts.
7. **Procurement:** The existing V28 K1 adapter remains the sole source of required blank evidence. The workflow never infers an allowance or purchase amount.
8. **Catalogue:** No new technical field. Stored product snapshots continue to drive covering layouts.
9. **Future cost:** No price, currency, margin or waste concept enters the projection.
10. **Offline:** All stages, summary, local navigation and K1 planning work from the current project without database or network.
11. **Mobile:** At 390×844 and 360×800 the status is compact/scrollable, the next action remains visible, and existing tools, exact inputs and K1 planning open through mobile sheets.
12. **Research:** No new geometry or coverage semantics; no new domain research document is needed. Existing V26 execution semantics remain unchanged.
13. **Regression:** Pure workflow tests cover precedence/status; UI tests cover summary, navigation, empty states and K1 entry; browser tests cover desktop and phone flows. Existing reference fixtures and architecture tests must remain green.
14. **Multi-structure:** Stage status uses typed canonical collections and domain results, never parses IDs or assumes one roof from an ID string. The present UI still displays the active supported roof model.

## Ownership and behavior

The workflow projection takes already resolved application facts. Stages are
`construction`, `openings`, `layers`, `covering`, `cutting`, and `summary`, each
with a status and optional action/summary. Completion means workflow readiness,
not structural safety. No stage blocks another task. The next action chooses a
meaningful missing or warning state before returning the user to the summary.
Geometry must have a positive resolved roof area and physical timber rows to
count as complete. Opening collisions, framing review and surface issues are
warnings; absent openings and layers stay optional. Layer warnings come from
the resolved build-up evidence. Covering completes only when each assignment
has a resolved layout and no ownership conflict. K1 is only available when the
V28 adapter proves a whole-member blank. The next action prioritizes geometry,
opening/layer warnings, absent or unresolved covering, then K1 planning or the
summary.

The strip gives status and recommendation; the existing task ribbon/dock remains
the navigation control. The summary is a view inside the Materials task. The
Toolbox exposes objects/actions, the Workspace shows drawings and derived
results, and the Inspector remains for exact editing/context. Schedule level 1
shows timber, layers and covering; level 2 groups families; level 3 reveals
exact lengths on demand. The summary K1 CTA opens the existing V28 planner.
The summary and schedule show covering warnings instead of treating a mere
assignment as complete. If opening geometry invalidates net area, the summary
withholds that figure and points to the opening issue.

Desktop keeps the technical drawing dominant; data tasks may use more width.
Mobile uses one task at a time, scrollable stage status, a clear next action and
the existing sheet routing. New text is translated in Polish and English, and
status is communicated by words as well as color.


## Guided Workbench update after V61B

The current six-stage visible overview, root start, device-local recent-project
list and direct geometry/structure input routing extend V47/V53 rather than the
historical V29 status vocabulary. See
[Guided Workbench / Project Journey](ARCHITECTURE_GUIDED_WORKBENCH_JOURNEY.md).
The existing Materials summary now includes dimensions, cost/document status,
readiness warnings and the same central next action. All status remains derived.
