# PROMPT_ITERATION_021

# Professional Workbench Hardening, Covering Assignment Management, Design Token Correctness and Fixed Modular Sheet Engine

Continue RoofCalc / CieślaCalc from commit `3efa87c3c919b7e17bfc2f1af9eb78171cd68601` (`V20`). This checked-in contract records the user-approved V21 iteration. Its ordered goals are: (A) harden the visual/workbench UX after real screenshot review, then (B) implement only fixed-size modular-sheet roofing. Do not implement cut-to-length layout, standing seam, prices, catalogue/backend or persistence.

## Mandatory contract

1. Read the repository blueprint, North Star, domain roadmap, covering product research, V18–V20 architecture and catalogue/pricing boundary; inspect the workbench, covering, build-up, canvas, store, project schema, `covering-core`, `quantity-core` and UI tokens. Run and record the exact clean V20 baseline without discarding user work.
2. Treat the almost-black Covering plane as a blocking CSS/token regression. Confirm the missing assembly custom-property bridge and repair tokens before touching geometry.
3. Establish explicit semantic tokens for background, surface, canvas, panel, normal/strong line, text/muted text, accent, selection, related state, warning, danger, timber, full/cut covering and opening. Preserve the current visual identity.
4. Add an automated token/fallback guard so critical SVG fills cannot silently fall back to black.
5. Accept the Covering drawing only when the plane is light and full positions, cuts, openings and battens remain distinguishable for gable/hip and zero/one/multiple openings. If Browser is unavailable, state that honestly.
6. Keep technical roof-plane IDs internal. Present localized human labels through one web/i18n helper.
7. Keep installation-mode IDs stable and language-neutral. Present the known manual mode as `Standardowy`/`Standard`; never branch math on its display label.
8. Compact the Builder desktop introduction so the workbench starts higher; retain Quick Calc onboarding.
9. Make the desktop Toolbox task-aware by default while retaining a clear `Wszystkie narzędzia`/full-model escape and reusing existing actions.
10. Give the Covering centre responsibility for identity, compatibility, selected plane, drawing, result summary and geometric quantity. Give the Inspector responsibility for exact product/mode/dimension/alignment/plane/advanced/remove controls. Do not duplicate the full result dashboard.
11. Make assignment totals primary and selected-plane totals explicitly local. Keep consumption and no-waste boundaries secondary.
12. Improve Membrane, counter-batten and batten projection contrast without restoring clutter.
13. Add transient, zero-history `selectedCoveringAssignmentId`; it must never serialize. Removal selects a deterministic neighbour or the empty state.
14. Refactor Page from first-tile assumptions to all assignments → strategy results → active assignment/layout → workspace/Inspector.
15. Enforce one primary covering per roof plane with a pure structured conflict resolver. Old overlapping data still parses, is marked conflicted and never produces duplicate trusted quantity.
16. Add a compact assignment selector and only real V21 add choices: roof tile and modular sheet. Selection is zero-history; add/remove/edit is one canonical Undo step.
17. Reverify multiple fixed modular-sheet products from current official manufacturer material, record total/effective dimensions, module, pitch and batten/overlap implications, and do not create a production catalogue or manufacturer branches.
18. Support only `modular-sheet` plus `fixed-sheet`; report cut-to-length as explicitly limited/incomplete.
19. Document why variable-length sheets require separate decisions about segmentation, manufacturing/transport limits, transverse joints, module constraints, openings and multi-panel slopes.
20. Extend layout intent additively to a discriminated tile/modular union. Modular U alignment is centred, from-U-min or manual; V remains eave-based.
21. Implement pure `resolveModularSheetLayout` in `covering-core` over neutral plane/opening/batten inputs, without React, DOM, database, price or manufacturer logic.
22. Use effective width and effective fixed length for the coverage grid; total dimensions are physical/reference data only.
23. Use one deterministic grid per plane. Keep U coherent through rows and hip narrowing and V stepped from the eave.
24. Validate only defensible generic module/batten compatibility. Do not generate or silently alter battens; leave manufacturer-specific first/eave/ridge offsets explicit.
25. Return structured status, planes, rows, stable positions, totals and issues with `full`, `cut-roof-edge`, `cut-opening` and `split-by-opening` classifications.
26. Clip roof-window voids while preserving the coherent grid. Never claim disconnected fragments imply reusable/purchasable sheet logic.
27. Support hips through generic polygon clipping only; otherwise report a limitation.
28. Report below-minimum pitch as incompatible, not unsafe.
29. A resolved layout may emit `piece` quantity equal to geometric sheet positions, labelled as geometric sheets/modules—not purchase quantity—with no waste/offcut/spares/packaging/stock/price claim.
30. Integrate through the existing covering quantity boundary. Keep tile and sheet rows distinct and never combine unlike units into one total.
31. Reuse one Covering shell for tile and modular sheet, with strategy-specific drawing, summary and Inspector parameters.
32. Allow a manual fixed-sheet snapshot with working identity, effective width/length, module and optional pitch plus advanced total width/length, profile, thickness and material. All canonical lengths remain millimetres.
33. Manual and future catalogue snapshots must enter the same engine; no separate manual/database calculators.
34. Render a technical plane-local sheet grid, openings and cuts with light batten context, not photorealistic corrugation.
35. Share visible legend semantics for full, cut and opening states across tile and sheet.
36. Clearly distinguish whole-assignment and selected-plane results.
37. Preserve the V20 drawing-first mobile architecture at 360, 390, 430 and phone landscape widths; parameters stay in the Inspector sheet.
38. At desktop widths, keep the drawing dominant, Inspector exact and Toolbox contextual without page-level scrolling for ordinary inspection.
39. Old V20 projects and tile assignments remain parse-compatible. Derived positions and active assignment never serialize.
40. Add UI regressions for critical tokens, human labels, hidden raw manual ID, centre/Inspector responsibility, contextual Toolbox and full-model access.
41. Test empty, tile, sheet, distinct-plane combinations, conflicts, zero-history selection, active removal, Undo and non-serialization.
42. Test fixed-sheet parsing/grid dimensions/alignments, hips/edges/openings/splits, stable IDs/order, multiple planes, pitch and batten failures, finite output, trusted geometric quantity, no purchase claim, cut-to-length limitation and absence of manufacturer branching.
43. Verify schedule separation, no conflict double-counting, Undo/opening/geometry rederivation and absence of price fields.
44. Keep layouts memoized and derived; simplify large SVG projections without losing exact domain results or V20 touch/camera performance.
45. Preserve `ProjectDocument` as the future named-project/save/autosave/version/import/export/repository payload boundary, but implement none of those persistence features in V21.
46. Also exclude nesting, offcut optimization, waste percentage, purchase quantity, SQL/API, pricing/VAT/discounts, Cost Engine, PDF/XLSX, gutters, flashings/accessories, new topology, extra structure and structural verification.
47. Create the V21 architecture and this iteration-contract document; update covering research.
48. If Browser exists, test the prescribed desktop/tablet/mobile matrix across all tasks, gable/hip, token visibility, labels, toolbox, layers, mobile assignment/Inspector and overflow. Never claim unavailable QA.
49. Run repository-pinned typecheck, tests, lint, build, Prettier validation and `git diff --check`; record exact counts, bundles, warnings and QA status.
50. Update `PROJECT_BLUEPRINT.md` with the audit, defect/fix, UX, assignment/conflict, research, strategy, quantity, responsive/performance, validation and known limitations. Set V22 as variable-length metal-covering architecture from verified rules. Do not start it, commit or push.
