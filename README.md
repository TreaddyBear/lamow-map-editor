# LaMow Map Editor

React map and vegetation authoring tools for LaMow. The editor runs separately from the game.
Vegetation can be edited, exported, and checked in an independent Playtest scene. **The main
game does not yet load these vegetation exports.** Start with the [LaMow handoff](docs/LAMOW_HANDOFF.md) when continuing in the game.

## Run and build

From this directory, with Node.js and pnpm installed:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open [the editor](http://127.0.0.1:5191/) or [Vegetation Assets](http://127.0.0.1:5191/assets).
Stop the server with Ctrl+C. The package declares pnpm 11.1.3; the September 12 checks used
Node 24.19.0 and pnpm 11.19.0. The installed Vite requires Node `^20.19.0 || >=22.12.0`.

For a production build and local preview:

```sh
pnpm build
pnpm preview
```

The build is written to `dist/`. Preview serves that built output at port 5191; it does not
rebuild when source changes. Stop the development server before starting preview on that port.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Builds the local renderer package, then starts the editor with live reload. |
| `pnpm build` | Builds the renderer, checks editor TypeScript, then creates `dist/`. |
| `pnpm build:renderer` | Rebuilds only `packages/landscape-renderer/dist/`. |
| `pnpm preview` | Serves the last production build. Run `pnpm build` first. |
| `pnpm test` | Builds the renderer and runs domain, rendering, and version-storage tests. |
| `pnpm test:e2e` | Runs browser workflows on port 5192 with a separate profile and test library. |
| `pnpm audit:modifiers` | Measures modifier ranges against independent geometry calculations; open `.tmp/modifier-audit/index.html` for plots and individual results. |

If browser tests report a missing Chromium installation, run `pnpm exec playwright install chromium`.
The renderer is compiled once when `dev` starts; after editing its source, run
`pnpm build:renderer` again. Frontend source changes reload automatically. Keep files unchanged
during browser verification so development reloads do not interrupt interactions.

## Assets, drafts and versions

Click the **asset name** for selection, **New**, **Duplicate**, **Import**, and **Export**.
Duplicate copies the whole archetype: saved versions, default selection and active draft.

- **v2** is an unchanged saved version. **v2*** has working changes; the autosave status
  appears to the left of the name only while those changes exist.
- Open the version button and choose **Save draft** to keep changes as a new version.
  **Create new version** also lets you name a snapshot. Saved versions are never overwritten.
- Each version card has two fixed icons on the right: **star = default**, **check = current**.
  Click an inactive icon to make that version default or current. Filled icons indicate
  the existing state. The current check can discard its draft when there are changes.
- Only discarding a modified draft asks for confirmation. **Cancel** keeps it. Opening a
  version or replacing/deleting a draft resets that asset's Undo stack.
- **Undo / Redo** keeps up to 100 local steps per asset; a held control is one step.
  Switching assets preserves their separate stacks and never becomes an Undo step.
  Reload resets Undo, but retains drafts and saved versions. **Remove draft** keeps saved history.

Versions live in **assets/vegetation/** and survive closing the editor or clearing browser
storage. Back up that entire folder. Starters get an initial version when first opened.
Autosave writes the active draft to this browser's storage after a short pause and on leaving.
Different browsers, ports, localhost and 127.0.0.1 have separate drafts. **Autosave unavailable**
means browser storage failed; save a version or export before leaving.

**Export** downloads a whole archetype as **<id>.lamow-vegetation.json**: the current asset,
embedded meshes, saved versions, default and current version references. The browser chooses
the download folder. **Import** restores that archive; matching IDs append history without
overwriting saved versions. Replacing a modified current draft asks first. Older single-asset
files still import and become a saved version. Export does not send anything to the game.

The local server supports the library in both **pnpm dev** and **pnpm preview**. A static
copy of dist includes defaults chosen at build time; browsing/saving history requires the
local server. [Storage details](assets/vegetation/README.md).

## Preview and coverage

The left sidebar starts with **100% coverage · plants/m²**: complete generated plants or
clusters per square meter. A 4 × 4 m patch at 153 clusters/m² has 2,448 clusters at 100%.
Expand **Slat editor** below it to edit distant appearance. **Cut appearance** chooses stems
or grass stubble, height, and color/tint for Playtest; it saves with the archetype. **Add** and the recipe follow.
The inspector on the right edits the highlighted recipe element. **Add** appends to the
recipe; right-click a recipe item for **Add before / inside / after** submenus and Delete.

Direction and deviance are edited on Grow and Branch components. **Any direction**
selects a 360° random span (±180°) for a Grow's bend direction or a Branch's around-axis
angle. [Direction, bend and deviation explained](docs/VEGETATION_MODIFIERS.md#a-turn-a-bend-and-a-random-heading).

Five views share one rendering engine and stop drawing while idle. The mixed near patch
uses the game's long blade geometry, color variation, height tuning and calibrated density.
LOD views show the interior of a wider field. Their vegetation palette is independent of
the game's grass reference. Per-view menus provide camera angles and ground backgrounds;
LOD menus also let you compare **100% grass**, **50% vegetation**, and **100% vegetation**.
Mixed LOD defaults to **Natural**: irregular, overlapping scales of breakup instead of a
regular grid. **Stripes** and **Dots** remain available. Pattern scale is in meters; coverage
uses an opaque spatial mask, with a narrow smoothed edge on Natural.

The builder's five panes are inspection views. Left-drag orbits, right-drag pans, and the
wheel zooms; camera Reset asks in a small popover. Their ground and coverage menus customize
the display. They do not paint or mow.

Open **▶ Playtest** in the top bar for the interactive preview. It starts with the authored
patch and a surrounding lawn using the game's grass geometry and grass/dirt textures:

- **Cut** (default): hover pushes plants away; click or drag mows flowers and grass.
- **Flowers / Grass** paint that population and regrow the area, without pushing plants.
- **Camera** lets left-drag turn the camera. Right-drag pans and the wheel zooms in every mode.
- The small/large dots adjust brush size; the sharp/blurred circles adjust paint softness.
- A red striped brush outside the lawn marks where painting/cutting cannot act.
- **Restore plants** resets painted and cut areas after confirmation.

Paint can add plants in the surrounding lawn as well as regrow the initial patch. Mowing
retains the planted mask and ground texture. Cut grass remains under every cut area, including
100% flowers; the Stems style also leaves short stalks. Playtest strokes are temporary:
leaving Playtest, importing a species, or reloading resets them. They never alter the builder's
comparison views, saved archetype versions, or Undo history.

The grass/dirt textures and grass reference live in **packages/landscape-renderer**.
Refresh them from the adjacent game working tree with:

```sh
pnpm sync:game-assets
pnpm build:renderer
```

An optional path selects another LaMow folder. The command reads the game and updates only
the reference snapshot; ordinary editor builds need no game checkout. The snapshot manifest
records source hashes. This is a flat, stationary reference: game terrain masks, decorative
grass, shadows, wind animation and mowing transitions still belong to the game.

**Back to assets** returns to the draft. Playtest is independent of the main game; the
game-side asset loader and mowing adapter remain the next integration boundary.

## Maps are a separate export

The map editor at `/` exports a draft-v1 map pack: levels, areas, terrain, and vegetation
type/density references. Its download is not a vegetation species asset. Map edits currently
live in page state and do **not** have the vegetation draft autosave; export before navigating
away or refreshing. An asset export does not embed a map, and a map export does not embed your
custom clover recipe.

The game's production map source is `map-exports/lawn-maps.json`. Its own `pnpm bake` produces
`map-exports/lawn-maps.baked.json`, which the game loads. Map integration requires validating
the edited pack in the game, rebaking, and rebuilding it. The old `import-maps.cmd` generates
a TypeScript file that is not the current normal game loading path.

## Project layout and next steps

- `frontend/source/Pages/` — map editor, vegetation editor, and Playtest.
- `frontend/source/Components/Base/` — this project's React controls and layout components.
- `packages/landscape-renderer/` — asset parsing, recipe compilation, geometry and scene layers;
  currently local to this repository, despite the intended shared role.
- `public/vegetation-primitives/` — starter OBJ meshes loaded by the editor.
- `assets/vegetation/` — saved archetype versions and standard selections;
  [storage details](assets/vegetation/README.md).
- `tests/fixtures/authored-clover.lamow-vegetation.json` — unchanged snapshot of the clover
  export supplied September 12, used to verify the real handoff. It does not replace defaults.
- [LaMow handoff](docs/LAMOW_HANDOFF.md) — where to resume game integration, shared APIs, and checks.
- [Game/editor interface audit](docs/GAME_EDITOR_INTERFACE.md) — actual connections, gaps,
  and the eventual game integration path.
- [Renderer API](packages/landscape-renderer/docs/editor-integration.md) — embedding in a host.
- [Geometry contract](docs/VEGETATION_PROCEDURAL_GEOMETRY.md) — transforms and signed randomness.
- [Modifier reference](docs/VEGETATION_MODIFIERS.md) — each control's range, units, effect, expected no-ops, and known quirks.
- [Control verification](docs/VEGETATION_CONTROL_AUDIT.md) — prior fixes and measured limits.

`pnpm audit:modifiers` produces a searchable report at `.tmp/modifier-audit/index.html`.
It checks control ranges, random distributions, and component combinations. The normal
test suite also protects 48 established outputs under `generationVersion: 1`, so later
generator changes cannot silently redefine refined assets. See the modifier reference
for the compatibility rules and remaining authoring limitations.

Older root contracts and planning notes document earlier formats and decisions; this README
and the dated interface audit describe the current workflow. The editor's version library
establishes the asset source for future game integration. A cross-project React component
library is a separate future effort.
