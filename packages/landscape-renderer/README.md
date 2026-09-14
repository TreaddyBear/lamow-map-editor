# @lamow/landscape-renderer

Shared Babylon-native landscape rendering helpers for LaMow.

This package is scene-host agnostic:

- callers provide an existing Babylon `Scene`
- callers own engine, canvas, camera, lights, render loop, UI, input, and gameplay
- this package owns shared mesh/material/thin-instance construction for ground-attached landscape
  rendering

The package is compartmentalized: it does not import from the game `src/` tree. Its runtime
dependency is Babylon (`@babylonjs/core`) supplied by the parent app.

The first extracted vertical slice is field-flower rendering. More ground, grass, road/path, and
LOD code should move here incrementally.

Use `createVegetationSpeciesLayer` for portable authored recipes. It is shared by the editor
closeup, population previews, and mowing playtest. `compileVegetationPlant` exposes deterministic
CPU geometry for validation. Playtest now accepts field flowers and authored clover.
The main game has not yet been migrated; follow the [current interface audit](../../docs/GAME_EDITOR_INTERFACE.md).

The package also provides coverage calibration/placement, continuous growth-path math,
and the extracted game slat shader and texture bake. Hosts can share a geometry compilation
cache across layers; the editor uses it for five simultaneous camera viewports.

`createReferenceGrass` uses the game's long blade and grass tuning. Ground grass, dirt and
dirt-normal textures are exported from `@lamow/landscape-renderer/assets/*`. Refresh the
snapshot with `pnpm sync:game-assets` at the repository root; `assets/game-reference.json`
records source hashes. Builds consume the snapshot and do not need an adjacent game folder.
Mixed slats use opaque world-space stripes or dots with an adjustable scale; pattern edits
only change shader uniforms.

See `docs/editor-integration.md` for the current editor-facing API.
See `docs/porting.md` for the earlier field-flower wrapper sketch and its current-plan caveat.
