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
CPU geometry for validation. The main game has not yet been migrated; follow the porting guide.

The package also provides coverage calibration/placement, continuous growth-path math,
and the extracted game slat shader and texture bake. Hosts can share a geometry compilation
cache across layers; the editor uses it for five simultaneous camera viewports.

See `docs/editor-integration.md` for the current editor-facing API.
See `docs/porting.md` for the exact copy/install/build method for another project.
