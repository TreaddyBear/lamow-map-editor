# Vegetation vertical slice

September 10 update: the comparison workspace has been restored to five simultaneous views
on one engine/scene. Species now carry optional `coverage.plantsPerSquareMeter`, used by both
population previews and Playtest. Grow supports continuous arcs with explicit legacy
compatibility. Slat shader/detail were extracted from the game; full environment/transition
parity and the game baker's coverage adoption remain outstanding. See
`VEGETATION_CONTROL_AUDIT.md` for current verification rather than the earlier one-view pass.

## Direction recovered from recent work

The June editor commits progressed from map editing and UI cleanup to a vegetation authoring
tool. The uncommitted July work added OBJ primitives, recipe controls, and a copied landscape
package. Main-game commits `4b82b78`, `09dc027`, `98bec9a`, and `565ca15` establish the intent:
project-global species, deterministic procedural variation, and the same generated plants in
the editor and game. The next useful slice is the complete field-flower authoring loop.

## Drift repaired

- The population panes used a renderer that accepted only height, petal count and color. Most
  recipe and primitive edits could never reach them. Closeup geometry separately flattened the
  recipe and ignored execution order. Both now use the portable recipe renderer.
- Loaded OBJ petals bypassed cup/curl controls. Deformation now composes with source geometry.
- Thin petals rendered dark from their back faces. Shared materials now light both sides.
- Export omitted edited primitives; exports now carry their library and round-trip it.
- Asset-page state was lost on navigation or refresh; drafts now persist locally, with storage
  errors reported instead of claiming a save succeeded.
- Package builds relied on pre-existing ignored output; root workflows now build the package.
- Package documentation incorrectly said the current game was already migrated; porting notes
  now identify the real game boundary and the remaining work.

## Reviewable outcome

Edit a field flower, compare the closeup, 50%/100% populations and 50%/100% LOD views, export it, reload the editor, open
Playtest, import the export, mow/restore the patch, and return with the draft intact. The shared
package owns asset types, parsing/migration, primitives, transform helpers, recipe construction,
and the scene-host-independent thin-instance layer. Existing map editing remains available.

The first main-game port should replace rendering for one existing flower species while
retaining the game's placement policy and gameplay wrapper. Follow
`packages/landscape-renderer/docs/porting.md` and `editor-integration.md`.

## Deliberate limits

- The main game has been inspected, not modified or merged.
- The shared layer uses 16 deterministic geometry variants per species to bound draw calls.
  Profile the chosen count against the real game's grass, shadows and LOD load before shipping.
- Clover and tulip now execute the same recipe controls in the editor. Their protected-plant
  gameplay and automatic LOD transitions remain outside the field-flower handoff.
- Grass controls drive an editor preview; they do not implement the game's grass/LOD system.
- OBJ vertex colors and ordinary material colors are supported; richer surface/emissive
  metadata remains a future renderer feature.
- The user authorized a branch checkpoint after verification. The editor work is preserved
  on `codex/vegetation-editor-vertical-slice`; it has not been merged into the main game.

## Verification

See `VEGETATION_CONTROL_AUDIT.md` for the corrective control/performance pass and its measured
limits. The browser coverage includes actual renderer geometry and resource identity, input
behavior, idle rendering, OBJ edits, and the export/reload/playtest/mow round trip.

The first slice's passing round-trip tests did not establish that the rest of the editor felt
responsive or that every displayed recipe control worked. The current corrective pass keeps
all five previews on one engine and scene, shares compiled geometry, and stops rendering while
idle. Clover and tulip use the shared recipe renderer too. Edits reuse meshes/materials and
preserve camera angle and zoom; coverage is calibrated per species and survives export.
