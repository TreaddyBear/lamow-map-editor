# Authored vegetation integration

The supported handoff slice is a field-flower asset with an ordered construction recipe,
materials, and an optional embedded OBJ primitive library. The editor's closeup and population views
and `/playtest` use `createVegetationSpeciesLayer`. The game checkout has **not** yet
been moved onto this renderer. The older `createFieldFlowerLayer` export remains available
for compatibility, but its fixed dimensions cannot reproduce authored recipes.

```ts
import { parseVegetationAsset, createVegetationSpeciesLayer } from "@lamow/landscape-renderer";

const asset = parseVegetationAsset(exportedJsonText);
const flowers = createVegetationSpeciesLayer({ scene, asset, groundHeightAt });
flowers.setPlants([
  { x: 0, z: 0, seed: 1 },
  { x: 1, z: 0, seed: 2, yaw: 0.4, scale: 1.1 },
]);
flowers.mowCircle(mowerX, mowerZ, mowerRadius);
flowers.syncVisibility(mowerX, mowerZ, nearDistance);
flowers.resetMowed();
flowers.setAsset(nextDraft); // preserves current mowing/visibility state
flowers.setPlants(nextPlacements); // replaces population and resets its state
flowers.dispose();
```

Distances and positions are in meters, yaw in radians. The host supplies terrain height,
engine, scene, camera, lights, render loop, input, and gameplay. The layer owns its meshes and
materials only. An optional `parent` and `layerMask` let the editor partition a scene.
`mowCircle` returns newly cut plant count; it does not award score or implement protected-plant
interactions. Both circle methods take **radius**, whereas the current game's old API takes
**radius squared**.

## Determinism and geometry

`compileVegetationPlant(asset, seed)` creates CPU geometry without a scene. The thin-instance
layer uses a bounded pool of 16 seeded geometries (`uint32(seed) % 16`), grouped by material.
The full seed controls placement scale/yaw when those values are omitted. A given asset,
primitive library, seed, and placement reproduce the same buffers in either host. Explicit
placement scale/yaw override the species ranges. The editor's Plant view uses the selected
seed at scale 1, with a camera fitted to its bounds. Patch starts with that same seed and
uses the species' placement ranges. Edits preserve the camera until Fit is clicked.

Shape edits update existing buffers; material-only edits keep geometry untouched. The editor
renders five camera viewports on one engine/scene, sharing a compilation cache between plant
layers. It suspends drawing while idle/offscreen and coalesces edits to the next animation
frame. These are editor policies, not requirements imposed on the game host.

`species.coverage.plantsPerSquareMeter` calibrates density 1.0 (default 25 when omitted).
`createVegetationPatchPlacements(asset, { width, depth, density, seed })` creates a stable
rectangular patch: count = round(rate × width × depth × density). The half-density preview
retains the first half of the full patch's placements. Playtest uses the same helper.
The unmodified game still has its own spacing calibration; its baker must explicitly adopt
this field before changes here affect existing game maps.

`grassBake.ts` and the shader in `slats.ts` were extracted from game commit c35d779.
`createVegetationSlatLayer` supplies bounded patch geometry and inputs without importing game
globals. The editor inspects far slats with wind/distance fading disabled. Terrain/mowing
masks, mixed-species spatial tint masks and near/far transition calibration remain integration
work. Nearby grass context is a lightweight editor representation.

Recipes execute in order. Continue moves the cursor and optionally skins the segment; steer
changes its local orientation/scale; fork and branch execute nested copies; choose samples
one weighted option; form stamps a primitive; color sets the material for subsequent growth.
Branch positions refer to the most recent growth segment. The editor disables `fromForm`:
the runtime compatibility fallback uses the cursor, not arbitrary surface sampling. New Grow
segments use `pathMode: "arc"`: circular-arc travel, transported endpoint orientation, curved
skin, and branch frames on the path. Old segments retain their direction-only behavior until
explicitly converted. See the editor's `docs/VEGETATION_PROCEDURAL_GEOMETRY.md`.
Cup/curl add deformation to the source primitive, so OBJ vertex edits remain effective.

Budgets: 64 offshoots per phrase, 16 nesting levels, 2048 forms and 8192 executed steps per
plant. Exceeding a budget reports an error rather than freezing the editor.

## Portable files and compatibility

Exports retain the `assetVersion: 1`, `kind: "vegetationSpecies"` envelope and add optional
`primitives`. Each entry contains local vertices/colors, polygon faces, smoothing groups and
sharp-edge keys. Missing embedded primitives use the package's built-in source library.
Old shape-only field flowers migrate to a recipe and receive missing stem/center materials.
`constructionRecipe` is authoritative; `parts[0].shape` is a compatibility summary and cannot
represent arbitrary branching or transforms. The old game importer alone cannot reproduce
this slice: port the renderer as well as the JSON.

Flat base color, alpha, emissive color/strength and OBJ vertex colors render. Surface-gradient
metadata and per-vertex emissive definitions are retained but are not implemented here.
Grass/slat tint previews remain editor approximations. Automatic LOD switching, protected
tulip interactions, and other shape-only species are outside this handoff slice.

Drafts persist locally across page changes and reloads; exported JSON remains the portable
handoff. Primitive edits currently affect the shared library in the editor workspace, so each
export embeds the current library. The playtest imports that library into an independent scene.
