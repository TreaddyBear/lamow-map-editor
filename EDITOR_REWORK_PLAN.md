# LaMow Map Editor Rework Plan

## Baseline

- Initial project snapshot was committed and pushed to `origin/master`.
- Follow-up work in this plan should remain uncommitted until reviewed.

## Phase 1: Modularize the Existing Editor

- Split the current single-file editor into domain, state, geometry, import/export, viewport, inspector, sidebar, context menu, and wiring modules.
  - Done so far: domain model, geometry, validation, normalization, blueprint definitions, and edit-handle mutation math.
- Keep behavior stable during the first pass so later UI fixes are easier to isolate.
- Prefer pure functions for map/domain operations and keep DOM rendering/wiring at the edge.
- Add lightweight tests once pure modules exist.
  - Done: dependency-free domain smoke tests for normalization, validation, blueprints, geometry, and rectangle rotation handles.

## Phase 2: Viewport Usability

- Replace the giant selected-object stroke with subtle selection styling plus dedicated handles.
- Add edit handles for rectangle center/size/rotation, circle center/radius, polygon vertices, path vertices, Bezier controls, spawn heading, and hill controls.
  - Done: rotation handles added for rectangles.
- Cap auto-pan/viewport-follow speed while dragging near edges.
- Improve hit targets without visually overwhelming the map.
  - Done: edit handles now have larger invisible hit targets while keeping the visible handles small.
- Add direct polygon/path editing tools so routine edits do not require text/JSON editing.

## Phase 3: Sidebar and Panels

- Convert the import/export area into a collapsible pane inside the sidebar.
- Add collapse/expand controls for sidebar panes.
- Collapse the whole sidebar when every pane is collapsed, and provide a button to restore it.
- Clean up stacked button layout into grouped toolbars/actions.

## Phase 4: Context Menu and Archetypes

- Move all creation actions into one `Add` submenu.
- Remove the standalone `Replace clover` concept from the context menu.
- Introduce archetypes/blueprints as a separate model concept before exposing pinned archetypes in the UI.
  - Done: area blueprints now live in a domain module and are instantiated through an explicit helper.
- Consider user-pinned archetypes only after the base add flow is clean.

## Phase 5: Editing Stability

- Stop full rerenders from stealing focus, scroll, cursor, or text selection while typing.
- Decouple JSON/import text from map state edits.
- Move state mutation through explicit editor actions so text edits can be local until committed.
- Audit render calls and event wiring for unnecessary whole-app redraws.

## Phase 6: Longer-Term UI Rewrite

- Once modules are clean, evaluate React or a similarly modular UI layer.
- Preserve the domain/import/export/geometry modules so a future UI rewrite does not restart the whole project.
- Migrate incrementally by replacing one surface at a time: viewport, inspector, sidebar, import/export.
