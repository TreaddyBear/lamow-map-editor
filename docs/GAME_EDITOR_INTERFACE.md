# Editor ↔ LaMow interface audit

Audited September 12, 2026 against editor checkpoint `7dbdefe` and sibling game HEAD
`c35d779` plus its current working changes (`../LaMow`). The game has local edits in its main loop, grass, settings and sky
files; these were inspected, not changed. No live project-to-project synchronization exists.

September 13 update: `pnpm sync:game-assets` now refreshes a checked-in, read-only snapshot
of game blade geometry, tuning, color/noise helpers and grass/dirt textures inside the
renderer package. Its manifest records source hashes. This closes the editor reference-asset
gap; the game still does not consume editor-authored vegetation or depend on the package.

September 15 update: the separate **▶ Playtest** now has **Cut** (default), **Flowers**, **Grass**, and **Camera**.
Cut adapts the game's mower pressure/re-aim/release behavior to a circular editor footprint;
hover bends at fixed roots, while clicking mows. Flowers/Grass painting has no pressure effect;
these are editor authoring tools,
not game controls. Playtest-only coverage and cut masks are separate; the builder's comparison
views remain inspection-only. These masks do not export to the game. The game retains its own mower footprint,
terrain logic and runtime implementation; this is an interaction preview, not full parity.

Cutting preserves the grass ground texture and leaves stubble even at 100% flower coverage.
Optional `species.cutAppearance` saves stems/grass style, height, and color. The shared
`createCutRemnants` API uses stem stumps or the game's four cut-grass silhouettes. Game grass
already has stubble, but `fieldFlowers.ts` and `cloverPatch.ts` currently collapse their cut
instances entirely. They still need integration; see the [current handoff](LAMOW_HANDOFF.md).

## Finding

The map data has a real, manual path into the game. Authored vegetation currently stops at
the editor's shared-renderer Playtest. **The exported clover cannot yet replace game clover
by copying JSON.** Its file is valid; the missing piece is the consuming game code.

| Interface | Editor today | Game today | Consequence |
| --- | --- | --- | --- |
| Map pack | `frontend/source/utilities/domain/importExport.ts` exports draft-v1 JSON. | `tools/bake-maps.ts` validates `map-exports/lawn-maps.json`; `src/bakedMapLoader.ts` loads its baked output. | Manual transfer, game validation and rebake; no automatic apply command. |
| Species identity | Species IDs such as `clover`; recipes and primitives exported separately. | `src/mapFormat.ts` has fixed foliage keys; baked instances carry a type and position. | Existing IDs provide a join key, but custom IDs need registration. |
| Asset loading | `parseVegetationAsset` reads the export, including recipe and primitives. | `src/vegetationDefinitions.ts` defines older shapes. Its lookup has no runtime callers in `src` or `tools`; no authored-asset loader exists. | A matching JSON envelope is not an implemented loader or geometry contract. |
| Near clover | `compileVegetationPlant` executes ordered Grow/Fork/Branch/Form construction. | `src/cloverPatch.ts` builds pentagonal and domed leaf meshes with fixed dimensions. | Your edited clover geometry is never read by the game. |
| Placement | Calibrated clusters/m²; deterministic placements and 16 geometry variants. | Poisson baked anchors, then random leaf expansion; separate runtime fallback sampling. | Different density units, counts, seeds, and variation. |
| Mowing / visibility | Species layer accepts circle **radius** and owns plant visibility. | Clover wrapper's `update` and `syncVisibility` accept **radius squared**. | Requires an explicit adapter, not a direct method substitution. |
| Grass / far LOD | Extracted slat shader/detail and bounded preview patches. | Terrain masks, grass thinning, mower state, wind and distance transitions. | Matching shader ancestry does not establish visual or gameplay parity. |
| Packaging | Local workspace package `@lamow/landscape-renderer`. | Game depends on Babylon directly; no dependency on that package. | The two projects do not actually share the renderer yet. |

## Editor-owned versions are the source of truth

The editor now keeps named, immutable versions per archetype in `assets/vegetation/`, with
an explicit standard selection. Browser drafts, saved versions, and portable exports have
separate roles; see the [root guide](../README.md). Ordinary authoring should go through this
library without a manual asset-moving task or Git operation. Existing browser work is never
replaced simply because another version becomes standard.

The future game pipeline should consume selected standard version IDs and their complete
snapshots, validate them, and record the installed IDs. Making an editor standard does not
yet publish it to LaMow. The game sequence below is an integration proposal, not completed work.

## The supplied clover is a representative integration fixture

`clover.lamow-vegetation.json` was found in the editor root and left unchanged. A byte-identical
snapshot is in `tests/fixtures/authored-clover.lamow-vegetation.json` (SHA-256
`5f23c21db76170000bb3e13bc568ed98684af19fca236d6c833747b545125021`).

The file contains species ID `clover`, a curved lift and three saddle-petal leaflets, embedded
primitives, and calibration **153 clusters/m²**. All 16 renderer variants compile: four forms
per cluster, 38–50 triangles. The 4 × 4 m full preview is therefore 2,448 clusters, roughly
93,000–122,000 triangles. Those are geometry counts, not an FPS measurement.

Its `parts[0].shape` still describes an older clover summary. That summary cannot express
the saddle-petal recipe, its randomized curvature, or custom primitive geometry. Converting
the export to only those old shape fields would lose the user's work.

This audit also fixes the editor's field-flower-only Playtest gate. Clover can now enter and
be imported into the same independent scene, using the exact exported asset and calibration.
The harness proves loading/rendering/mowing/reset; it is not the original game.

Verification: 33 domain/runtime tests pass, including exact clover geometry and instance-buffer
round trips between independent scene hosts. Two browser handoff scenarios pass: the supplied
clover import/Playtest/mow/reset/return and the existing flower edit/export/reload workflow.
The clover Playtest screenshot was visually inspected. Production build verification is
recorded with this change; no real-game visual/performance parity is claimed.

## Why density cannot be copied blindly

The game's `tools/vegetation-sampler.ts` uses 0.30 m base spacing for the groundcover tier,
remaps density through `PLACEMENT_DENSITY_HEADROOM = 2`, and competes with other species in
that tier. `src/cloverPatch.ts` expands each baked anchor into two small leaves plus a 25%
chance of one large leaf. Its fallback instead samples 32 small and six large leaves/m²
before masks and probability weighting.

The editor counts complete authored clusters. Reusing that old expansion for each authored
cluster would multiply populations again. Equally, replacing a leaf with an entire cluster
while ignoring coverage would not reproduce the 153-cluster calibration. Establish one
authored cluster per accepted placement, then explicitly migrate the placement calibration.
Old baked maps must retain an identified compatibility policy until rebaked; silently
reinterpreting every old anchor as the new calibrated density would change maps unpredictably.

## Integration sequence

1. **One maintained renderer and asset source.** For these adjacent personal repositories,
   first use the editor package as a local file dependency of LaMow; do not make another
   editable copy of the compiler. Package it as a versioned artifact for isolated/CI builds.
   Keep Babylon as a peer so a host has one engine implementation. Install editor standards
   through a manifest keyed by stable ID and saved version ID; validate before replacing
   the last good asset. Reuse the editor library rather than manually maintaining exports.
2. **Port clover near geometry first.** At the `createCloverPatch` boundary, load the authored
   clover and supply map placements and terrain height to `createVegetationSpeciesLayer`.
   Retain `place/update/syncVisibility/dispose` for `src/main.ts`, converting squared radii.
   `main.ts` currently creates it near line 293, places it near 674, and calls visibility and
   mowing near 1646/1654. These are locations in the audited working checkout, not stable APIs.
   Replace the old two-leaf expansion for this path; do not draw both systems.
3. **Share placement calibration.** Make the baker and fallback explicitly consume species
   coverage and deterministic seeds. Version/record the calibration used in baked artifacts.
   Preserve map density masks, tier competition, exclusions and grass thinning. A rectangular
   editor patch sampler alone cannot substitute for the game's map sampler.
4. **Integrate far appearance and mowing.** Feed authored far color/strength into the game's
   spatial masks, and verify near/far transitions and cut state. Preserve protected tulip
   gameplay while clover is migrated. Profile the shared layer's material/variant batches
   against the old two-mesh clover renderer under the game's full grass/shadow load.
5. **Make transfer routine.** An explicit “apply to game” workflow should validate and install
   the exported asset, report which ID was updated, build the consuming package, and state
   whether a map rebake is required. Appearance-only edits should not force placement rebakes;
   coverage changes should. A visible last-applied asset revision should prevent stale builds
   from being mistaken for ignored controls.

Acceptance: the supplied clover must retain its recipe/mesh/colors, calibrated coverage and
seeded variation in a real game map, mow and reset correctly, survive map changes and range
transitions, and meet an observed frame-time budget. Test both baked and fallback placement.
The main game's unrelated local changes must be preserved throughout the port.

## Map transfer details

September 17 editor update: a read-only `/api/game-maps` bridge opens the adjacent game's
authored source in dev and preview. The top-bar level selector and game-startup star expose
pack navigation/default selection. Browser drafts persist, source refresh never overwrites
edits, and the bridge compares the authored hash with the baked artifact. This is file-state
reporting, not live synchronization with the level currently selected in a running game.
Exports preserve `defaultLevelCode` and `fullCode`, download the whole pack as `lawn-maps.json`,
and reject baked artifacts on import. The transfer/rebake step below remains explicit.

The normal game path is:

```text
Editor map JSON → game/map-exports/lawn-maps.json
               → game: pnpm bake
               → game/map-exports/lawn-maps.baked.json
               → game: pnpm build / pnpm dev
```

This is an entire pack replacement unless deliberately merged. The game validator remains
the acceptance gate; the two projects' map types/normalizers are duplicated rather than
installed from one package. `import-maps.cmd` runs `tools/import-maps.mjs` and generates
`lawn-levels.generated.ts`; the normal game config imports the baked loader instead.
`src/devMapLoader.ts` is an explicit development escape hatch, not automatic JSON hot reload.

## React component direction (deferred)

The game currently uses Babylon and DOM code, not React; the editor uses React, Radix and
Tailwind. A common token set and interaction conventions can span both. A React base library
can serve React projects and optional game UI islands, without requiring the renderer/game
to be rewritten in React. Start later with the controls the user actually approves here,
their behavior contracts and theme tokens. Do not freeze the currently disliked UX into a
cross-project dependency. This remains separate from the game/editor integration work.
