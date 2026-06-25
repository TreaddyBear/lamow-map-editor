# UI Migration Notes

The editor now uses React for the app shell, sidebar, inspector, viewport, context menu, and import/export pane.

Source is organized under `frontend/source`:

- `Pages/`: page-level state, data wrangling, import/export I/O, and orchestration. `EditorPage.tsx` currently owns most editor state.
- `Views/`: large visual surfaces and spatial breakdowns for the editor page and dialogs.
- `Components/Base/`: reusable UI primitives, Radix wrappers, form controls, and small semantic surfaces.
- `Contexts/`: reserved for shared React context providers when they become useful.
- `utilities/`: non-React TypeScript modules, including `domain/` and `editor/`.

- Domain modules are independent of DOM rendering:
  - `frontend/source/utilities/domain/model.ts`
  - `frontend/source/utilities/domain/geometry.ts`
  - `frontend/source/utilities/domain/validation.ts`
  - `frontend/source/utilities/domain/normalization.ts`
  - `frontend/source/utilities/domain/importExport.ts`
  - `frontend/source/utilities/domain/blueprints.ts`
  - `frontend/source/utilities/domain/editHandles.ts`
- The former single-file renderer was replaced by a small `frontend/source/main.tsx` entry and split into:
  - editor state/actions
  - viewport rendering and pointer wiring
  - inspector rendering
  - sidebar rendering
  - context menu rendering
  - import/export pane rendering
- The React migration preserved the domain modules as-is.
- Next target: move the remaining state/action orchestration from `Pages/EditorPage.tsx` into `utilities/editor` reducer/action modules or a context-backed page controller.

## SVG Styling Note

The map SVG no longer relies on broad SVG rules in `frontend/source/styles.css`. Most SVG styling was moved closer to the rendering code:

- Map-object cursor and selected-object drop-shadow styling live as Tailwind class constants in `frontend/source/Views/Viewport/MapObjects.tsx`.
- Spawn uses the same exported SVG class constants from `MapObjects.tsx`.
- Edit-handle visuals are direct SVG attributes created by `frontend/source/Views/Viewport/sceneController.ts`.
- `.edit-handles` remains as a DOM query hook for live drag/preview updates, not as a visual CSS contract.

If viewport UI bugs appear around selection shadows, SVG cursors, handle hit targets, or non-scaling handle strokes, this migration is a likely place to inspect. Reverting SVG styling back to explicit SVG attributes is acceptable if Tailwind utility classes prove unreliable on SVG elements in a browser.

Do not rewrite the map format or import/export behavior as part of the UI migration. Treat those as stable domain services.
