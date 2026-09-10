# Vegetation OBJ Primitives

Vegetation primitive meshes are OBJ-backed editor assets. The current built-in primitive set is loaded from:

```txt
public/vegetation-primitives/manifest.json
public/vegetation-primitives/*.obj
```

## Supported OBJ Subset

- `o name`
- `v x y z`
- `v x y z r g b`
- `f i j k`
- `f i j k ...`
- `s <group>`
- `s off`

Faces may be triangles or simple polygons. The renderer triangulates polygons as a fan.

## Local Primitive Basis

Primitive OBJ files use the vegetation geometry basis:

- local `+X`: width
- local `+Y`: growth height or surface lift/cup/curl
- local `+Z`: outward length or radial depth

Recipe transforms scale, rotate, and place the primitive. The primitive file defines the local editable source mesh.

The built-in primitive source set currently includes:

- `stemSkin`: local `Y` spans root-to-tip from `0..1`.
- `saddlePetal`: local `Z` spans base-to-tip from `0..1`; local `Y` carries cup/curl.
- `leafBlade`: local `Z` spans base-to-tip from `0..1`; local `Y` carries lift/curl.
- `centerDisc`: local `Y` spans base-to-dome from `0..1`.
- `quadSlat`: local `Y` spans ground-to-top from `0..1`.
- `seedFuzz`: small crossed triangular fuzz source for future tall-flower/dandelion parts.

## Vertex Colors

The editor supports the common OBJ vertex color extension:

```txt
v x y z r g b
```

Color values are stored as normalized `0..1` RGB values in OBJ text and edited as hex in the UI.

## Sharp Seams

OBJ smoothing groups are face-level. The editor additionally preserves per-edge seam intent with comments:

```txt
# lamow: sharpEdge 1 2
```

Those indices are OBJ-style one-based vertex indices. At render time, vertices on that edge are split in the render buffer so Babylon computes separate normals across that seam.

## Metadata

The editor preserves these Lamow metadata comments:

```txt
# lamow: id saddlePetal
# lamow: displayName Saddle Petal
```

Unknown OBJ content outside the supported subset is currently ignored rather than round-tripped.
