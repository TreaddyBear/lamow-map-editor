# Porting the field-flower slice into LaMow

This is the earlier field-flower port sketch. The September 12
[interface audit](../../../docs/GAME_EDITOR_INTERFACE.md) supersedes its priority and
packaging proposal: use the user's authored clover as the first game fixture and one
maintained renderer package, rather than another editable source copy. The wrapper contract
and radius conversion below remain relevant. No game port has been applied yet.

Reviewed against editor HEAD `b77e0fd` plus the current working changes and main-game HEAD
`c35d779`. The game is still using its own `src/fieldFlowers.ts`; earlier notes claiming a
completed shared-package migration were inaccurate for this checkout.

## Install

Copy `packages/landscape-renderer` into the game under the same path. Include `src`,
`package.json`, and `tsconfig.json`; generated `dist` can be rebuilt. Add `packages/*` to the
game's pnpm workspace and `"@lamow/landscape-renderer": "workspace:*"` to its dependencies.
The game already provides Babylon 8. Run:

```sh
pnpm install
pnpm --filter @lamow/landscape-renderer build
```

Ensure the game builds this package before its own TypeScript/Vite build. In this editor,
`pnpm build`, `pnpm dev`, and `pnpm test` do that automatically, so a clean checkout no longer
depends on an untracked stale `dist` folder. During package development rerun
`pnpm build:renderer` after source changes.

## First game port

1. Export an edited `flowerBlue` from the editor, and place it in the game's species asset
   directory. Load it with `parseVegetationAsset`. Keep species IDs as the map references.
2. Retain the placement policy in the game's `src/fieldFlowers.ts` (`buildFlowers`, baked
   instance selection, fallback sampling, showcase exclusions). Replace the hard-coded mesh
   construction for the selected species with `createVegetationSpeciesLayer`.
3. Pass its placements to `setPlants`. Use stable baked seed/position-derived seeds; do not
   seed from the frame clock. Map `Flower.variant` to `flowerBlue`/`flowerWhite`/`flowerYellow`/
   `flowerRed`. Use one layer per authored species. Other species can remain on the existing
   renderer during the first port; exclude the migrated species there to prevent double draws.
4. Keep the existing `place`, `update`, `syncVisibility`, and `dispose` wrapper used by
   `src/main.ts`. `place` calls `setPlants`; `update(x,z,radiusSquared)` calls
   `mowCircle(x,z,Math.sqrt(radiusSquared))`; `syncVisibility` uses the same radius conversion.
   `dispose` disposes the layer. Omit old randomly chosen height/petal counts so the authored
   recipe controls those dimensions. Pass explicit yaw/scale only when intentionally overriding
   the species ranges.
5. Verify a baked map and an unbaked fallback map; mow, restart, approach/leave the near range,
   and switch maps repeatedly. Check protected species still use their own gameplay systems.

Current call sites are `src/main.ts` creation, `fieldFlowers.place()` on map setup,
`fieldFlowers.syncVisibility(...)`, and `fieldFlowers.update(...)` in the loop. No change to
scoring, map serialization, or mower controls is required for the first flower port.

## Evidence before porting

`pnpm test` runs domain tests plus scene-independent recipe tests and Babylon NullEngine
checks for exact exported/imported geometry and instance buffers across separate hosts,
deterministic variation, mowing, visibility, reset, update, empty populations and disposal.
`pnpm test:e2e` exercises editing, export, reload, independent playtest import and mowing,
return navigation, primitive editing and camera/control stability.

In the editor choose **Assets → edit a field flower → Playtest**. Drag across the patch to
mow, restore the flowers, and return. Importing the exported file in this scene exercises the
same package boundary the game will consume. This scene is an integration harness, not the
main LaMow game; full-game performance and gameplay remain to be verified during the port.
