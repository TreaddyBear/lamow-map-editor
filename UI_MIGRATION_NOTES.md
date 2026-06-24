# UI Migration Notes

The editor is still a DOM-string renderer, but the code is now closer to a future React or similar UI migration:

- Domain modules are independent of DOM rendering:
  - `src/domain/model.ts`
  - `src/domain/geometry.ts`
  - `src/domain/validation.ts`
  - `src/domain/normalization.ts`
  - `src/domain/importExport.ts`
  - `src/domain/blueprints.ts`
  - `src/domain/editHandles.ts`
- The next migration boundary should be `src/main.ts`, split into:
  - editor state/actions
  - viewport rendering and pointer wiring
  - inspector rendering
  - sidebar rendering
  - context menu rendering
  - import/export pane rendering
- A React migration should preserve the domain modules as-is and replace one surface at a time.
- First React target: viewport component, because pointer/handle behavior is the highest-value interactive surface.
- Second React target: inspector component, because local input state would solve the remaining focus/scroll friction more naturally than whole-app DOM replacement.
- Third React target: sidebar and import/export panes.

Do not rewrite the map format or import/export behavior as part of the UI migration. Treat those as stable domain services.
