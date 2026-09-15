# Resume in LaMow

September 15, 2026 · editor branch `codex/vegetation-editor-vertical-slice`.

The editor is the authoring source. Saved archetype versions, defaults, recipes, embedded
primitives, coverage calibration, and cut appearance are ready to consume. **LaMow still
needs an asset loader and rendering/mowing adapter.** Pushing this branch does not install
editor assets in the game. The sibling game's existing working changes were left untouched.

## What this checkpoint provides

- Five inspection views; interactive painting/mowing lives only in **▶ Playtest**.
- Game grass geometry and grass/dirt textures, plus Natural breakup for distant slats.
- Cut hover pushes plants from their roots; clicking cuts. Flowers/Grass paint without
  pressure, with adjustable size and softness. Cut state never changes ground texture.
- Cut appearance saved on each species: stems or grass stubble, height, and optional color.
  Even a fully flower-covered patch keeps stubble when mowed. The grass silhouettes come
  from the game's four existing cut-grass meshes.
- Reusable renderer modules with retained instance buffers. Hidden standing plants are
  removed from the drawn instance count. Idle editor/Playtest scenes stop drawing.

## First game integration

1. **Consume one renderer.** Build `packages/landscape-renderer` with `pnpm build:renderer`
   in this repo. Add it to LaMow as a local file dependency for adjacent development, or
   pack/install a pinned artifact for reproducible builds. Its Babylon peer must resolve to
   the game's single Babylon installation. Do not copy the compiler into the game.
2. **Load a selected saved standard.** Validate the complete asset with
   `parseVegetationAsset`. Keep its stable species ID and saved version ID in an installed
   manifest; reject invalid assets without replacing the last good snapshot. The editor's
   `dist/vegetation-standards.json` contains the defaults selected at build time. Rebuild
   after changing defaults. That bundle contains asset snapshots; the installed version-ID
   manifest still needs to be built from the library's standard selections. A portable archetype export also contains its current asset
   and version archive; the parser reads that current asset, not an automatic default
   selection. Preserve recipes and embedded primitives rather than converting to old shapes.
3. **Adapt one near species at a time.** Start at `src/cloverPatch.ts`'s
   `createCloverPatch` boundary using `createVegetationSpeciesLayer`. Supply map placements,
   deterministic seeds and terrain heights. One accepted placement means one complete
   authored plant/cluster; do not also apply the old two-leaf expansion. Keep the game-facing
   `place/update/syncVisibility/dispose` contract. The old game methods take **radius squared**;
   the shared layer's `mowCircle` and `syncVisibility` take **radius**.
4. **Connect cut appearance to game state.** Keep mowing, scoring, protected plants and
   terrain masks in the game. Drive standing visibility and remnants from the same cut
   state. Keep cut texture unchanged, and maintain a cut-grass base where flowers displaced
   all standing grass. Reuse existing game stubble where it already supplies that base;
   avoid drawing two copies there.

Coverage is `species.coverage.plantsPerSquareMeter` (complete clusters, not individual
leaves). The game baker and runtime fallback need an explicit calibration migration; old
baked anchors cannot silently take on the new units. Appearance-only changes should not
require rebaking. See the [interface audit](GAME_EDITOR_INTERFACE.md) for the existing map
pipeline, density mismatch, protected-tulip boundary and eventual far-LOD integration.

## Shared cut-rendering contract

```ts
import { createCutRemnants } from "@lamow/landscape-renderer/vegetation/cutRemnants";

const appearance = asset.species.cutAppearance ?? { style: "stems" as const, height: 0.085 };
const remnants = createCutRemnants(scene, placements.map(p => ({
  x: p.x, z: p.z, y: groundHeightAt(p.x, p.z), yaw: p.yaw,
})), {
  ...appearance,
  color: appearance.color ?? (appearance.style === "stems"
    ? asset.species.materials.stem?.baseColor : undefined),
});

// Call when cut state or the visible region changes, not unconditionally each frame.
remnants.setVisible(i => cutState[i] && inVisibleRegion(placements[i]));
// Dispose/recreate when placements or cut appearance change, and on map unload.
remnants.dispose();
```

`height` is 0.01–0.3 meters; `color` is optional six-digit RGB hex. Placement Y is the
ground height and yaw is radians. The API starts hidden, retains its buffers, and owns
only its meshes/material. The predicate index always refers to the original placement
array, even when visible instances are compacted. Stems use one mesh; grass uses four
variant meshes. Reset must clear both standing cut state and remnant visibility.

The API alone does not fill the ground between plant roots. Playtest composes a grass
base at reference-grass positions plus optional stems at plant positions. For Stems it
uses a 0.05-meter grass base; Grass style uses the configured height and tint. Follow the
same composition against the game's terrain/grass coverage, using terrain height for
every placement. Primitive stems are a starting cut style, not clipped copies of an
arbitrary branching recipe.

In the audited game, `src/grass.ts` already uses four varied cut meshes at nominal height
0.085. `src/fieldFlowers.ts:update` collapses petals, centers and stems, while
`src/cloverPatch.ts:update` collapses leaves completely. Their visibility loops skip mowed
plants. Add remnant visibility handling explicitly; calling the existing shared
`mowCircle` alone also hides plants without creating remnants.

## Verify before adopting a game standard

This checkpoint passed 52 core tests and all 40 browser scenarios (37 in the full run,
then the three remaining checks in a targeted rerun after correcting test timing/selectors
and avoiding a development reload). After fixing per-blade color compaction, the 52 core
tests and all seven Playtest/handoff browser scenarios passed again, including GPU color
buffer checks. Screenshots of cutting, soft painting, out-of-bounds
brushes and the authored clover were inspected. Sampled brush updates were 0.3–0.9 ms;
five-view edits with 1,008 plants were 4.5–6.5 ms on this machine. These are CPU samples,
not a GPU frame-time guarantee.

Run `pnpm test`, `pnpm test:e2e`, and `pnpm build` in this repo. `pnpm audit:modifiers`
produces the detailed geometry/range report. The authored-clover fixture exercises 2,448
clusters and export/import; generation tests preserve 48 established recipe outputs.
Brush browser tests inspect actual instance buffers, cut meshes, ground material,
pressure, soft edges, cancellation and idle rendering. These are editor checks, not a
claim of full-game performance or parity.

In LaMow, verify both baked and fallback placement, 100% flower coverage after mowing,
reset/map switching, terrain height, near/far transitions and protected plants. Profile
with the game's full grass, shadows and wind workload before calling the port complete.

Playtest masks are temporary and intentionally do not export. Archetype versions and
cut appearance do persist. The local library under `assets/vegetation/` and the user's
root clover export were not added to this code checkpoint; back up/export that library
separately. [Run/build and authoring guide](../README.md) ·
[Renderer API](../packages/landscape-renderer/docs/editor-integration.md).
