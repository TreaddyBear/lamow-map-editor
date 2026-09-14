# Archetype library

Open the **v1 / v2 / …** button beside the asset name. A star marks unsaved working changes.
**Save draft** creates another immutable version; **Create new version** lets you name it.
Each card has a **star** for default and a **check** for current, fixed on its right edge.
Only discarding a dirty draft asks for confirmation. Opening a version resets that asset's
local Undo stack. Switching assets preserves their independent Undo/Redo stacks.

Back up this entire folder:

- **library.json** indexes archetypes, version metadata and default selections.
- **versions/<id>.json** holds complete immutable snapshots, hashes and parent references.

An original version is created when a starter is first opened. Browser drafts remain separate.
Export in the asset-name menu includes every saved version and the active draft. Import appends
history with new internal IDs; Duplicate creates a separate archetype with the same history.
Older recovery snapshots remain readable, but switching versions no longer creates automatic
recovery versions. Saved history is never deleted by Remove draft.

## Maintainer notes

`scripts/vegetation-library.mjs` supplies the local Vite development and preview API.
Writes require same-origin JSON on the local host, validate the asset and compile 16 variants,
then serialize through a process lock. Each write checks the index revision; a stale window
refreshes and asks the user to retry. Snapshots are flushed before the index is atomically
replaced. A failed index update may leave an unreferenced snapshot, never an intentional
overwrite of a previous version. Reads validate snapshot hashes. Corrupt data is reported
rather than reset. The request size limit is 8 MB.

To restore a backup, stop the local editor server, preserve the current folder separately,
and restore the complete library folder. Do not edit an immutable snapshot in place: import
an edited export and save it as a new version. If a machine restart left a lock, the server
recovers it after verifying the owning process no longer exists.

Production builds embed only the selected standards in `dist/vegetation-standards.json`.
Static hosting can read those defaults; history and writes require the local server and this
folder. Game installation is not implemented: selecting a standard affects the editor.
The API/index schema is version 1; it is independent of the asset's own format version.

Browser tests run with Vite mode `e2e` and store versions in `.tmp/e2e-vegetation-library/`.
Storage tests use unique `.tmp/library-tests/` directories. Neither writes into this library.
