# Architecture V20 — Mobile Professional Workbench

Status: implemented in source in Iteration 020. Live browser/device acceptance remains unverified because the requested in-app Browser has no available session.

## Shell and breakpoints

Desktop above 1100px retains Toolbox | Workspace | Inspector. At 801–1100px the same three columns narrow. At <=800px Builder switches to a compact header, a context row, the primary workspace, and a fixed six-task dock. A coarse-pointer device below 480px viewport height uses that shell in landscape even when its width exceeds 800px. At <=600px spacing tightens, and at <=430px the brand wordmark yields to its icon. The mobile dock uses short visible labels plus full accessible task names and bottom safe-area padding. The page is the normal scroll owner; large tools and exact forms appear only inside a sheet with its own scrolling. Quick Calc keeps its simpler input/result flow and receives the compact header, without a task dock.

## View state and sheet ownership

`WorkbenchViewState.mobilePanel` is `none | tools | inspector | view`. It is transient session state: task and panel changes do not call the canonical history boundary, and `ProjectDocument` serialization excludes it. `useMobileWorkbench` centralizes the <=800px media query without storing viewport width in the project. Task changes close the active panel and irrelevant cut detail while preserving canonical selection. A cut Detail Drawer becomes content in the same `MobileSheet` surface; opening normal Tools or Inspector closes the detail. Closing the detail retains meaningful selection context. A selected canvas entity first produces a compact peek with an Edit action; it does not open an Inspector over the drawing.

`MobileSheet` owns the mobile dialog boundary, title, close and expand controls, safe-area bottom, bounded internal scroll, Escape dismissal, initial focus and focus restoration. Desktop Inspector and Detail Drawer continue to use their established positions. On mobile, the Detail Drawer has local Drawing / Dimensions / Steps tabs and its drawing, facts and instructions stay in one column. The mobile View sheet contains isolation, dimension density, layer visibility, Fit and legend; the legend is absent from persistent mobile chrome.

## Toolbox and task context

The existing `Toolbox` and registry/actions remain the only business-logic path. `mobileTask` filters its sections to construction, openings, build-up, cuts or quantities and offers All Tools as an explicit expansion. The opening row keeps its accessible group-selection button; no hover or modifier key is needed for multi-select. Desktop Toolbox keeps its collapsible groups. The previous mobile `display: contents` flattening and horizontally scrolling task ribbon were removed. Layer sub-navigation remains visible directly above the active layer workspace. Materials retains its schedule/drawing segmented surface.

## Covering responsibility

The Covering workspace now carries product identity, compatibility diagnostics, geometric counts, plane selection and the coverage drawing. All exact technical product, mode, alignment, assigned-plane and removal controls live in `CoveringInspector` through the same canonical update path as V19. The Parametry / Popraw action opens that Inspector on mobile. A batten issue switches to Layers/Battens and closes the Covering sheet. No Tile Engine or quantity semantics changed.

## Touch camera and edit boundary

`SkeletonCanvas` owns a transient pointer map and pinch start camera. One background finger pans. Two fingers zoom about their midpoint and pan together. A second touch during an edit cancels and restores that canonical transaction before camera motion. The remaining finger can continue panning after one finger lifts. `pinchViewport` is a pure, clamped viewport helper; camera values never enter project history.

Touch edits on roof windows and direct-manipulation handles first select the object. They begin a canonical transaction only after movement exceeds six screen-space pixels. A tap or smaller movement changes no geometry and creates no Undo entry; an activated drag commits one entry or restores exactly on cancel. Mouse editing retains immediate drag behavior. Member axes receive a transparent 15px non-scaling hit corridor, while selected handles and roof-window interaction remain above member rendering. The corridor changes selection affordance, not physical geometry.

## Accessibility and performance boundary

Dock tasks expose full `aria-label` and `aria-selected`; sheets use dialog semantics and focus restoration; touch actions target approximately 44px. Screen width, panel state, camera, legend, task and sheet mode remain outside canonical project data. `Page` memoizes roof-window and tile-assignment arrays so opening a panel or switching task does not invalidate opening-framing or Tile Engine memo dependencies. Domain packages and V19 covering calculations remain untouched.

## Validation boundary

Pure camera tests cover midpoint zoom, two-finger pan, clamping and the activation threshold. Store/UI tests cover six tasks, panel exclusivity, history isolation, mobile sheet opening and selection peek. JSDOM Pointer Events are not native-touch verification. In-app Browser selection returned no available browser instance, so visual viewport, safe-area, keyboard and physical pinch QA are pending.
