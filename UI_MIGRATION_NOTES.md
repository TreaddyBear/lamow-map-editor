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

Do not rewrite the map format or import/export behavior as part of the UI migration. Treat those as stable domain services.
