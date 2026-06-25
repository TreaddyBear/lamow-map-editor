# UI Migration Notes

The editor now uses React for the app shell, sidebar, inspector, viewport, context menu, and import/export pane.

- Domain modules are independent of DOM rendering:
  - `src/domain/model.ts`
  - `src/domain/geometry.ts`
  - `src/domain/validation.ts`
  - `src/domain/normalization.ts`
  - `src/domain/importExport.ts`
  - `src/domain/blueprints.ts`
  - `src/domain/editHandles.ts`
- The former `src/main.ts` renderer was replaced by a small `src/main.tsx` entry and split into:
  - editor state/actions
  - viewport rendering and pointer wiring
  - inspector rendering
  - sidebar rendering
  - context menu rendering
  - import/export pane rendering
- The React migration preserved the domain modules as-is.
- Next target: move the remaining state/action orchestration from `components/App.tsx` into `src/editor` reducer/action modules.

## SVG Styling Note

The map SVG no longer relies on broad SVG rules in `src/styles.css`. Most SVG styling was moved closer to the rendering code:

- Map-object cursor and selected-object drop-shadow styling live as Tailwind class constants in `src/components/viewport/MapObjects.tsx`.
- Spawn uses the same exported SVG class constants from `MapObjects.tsx`.
- Edit-handle visuals are direct SVG attributes created by `src/components/viewport/sceneController.ts`.
- `.edit-handles` remains as a DOM query hook for live drag/preview updates, not as a visual CSS contract.

If viewport UI bugs appear around selection shadows, SVG cursors, handle hit targets, or non-scaling handle strokes, this migration is a likely place to inspect. Reverting SVG styling back to explicit SVG attributes is acceptable if Tailwind utility classes prove unreliable on SVG elements in a browser.

Do not rewrite the map format or import/export behavior as part of the UI migration. Treat those as stable domain services.
