import { mkdir, readFile, rename, unlink, stat, open } from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { parseVegetationAsset, compileVegetationPlant } from "../packages/landscape-renderer/dist/index.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const empty = () => ({ schemaVersion: 1, revision: 0, archetypes: [] });
export class LibraryError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const requireValue = (condition, message) => { if (!condition) throw new LibraryError(400, message); };
const hash = asset => createHash("sha256").update(JSON.stringify(asset)).digest("hex");

/** Immutable snapshots + one atomically replaced index. Both local servers use
 * the same lock; a failed index write leaves at most an unreferenced snapshot. */
export function createVegetationLibrary(directory) {
  const root = resolve(directory), indexPath = join(root, "library.json"), lockPath = join(root, ".write-lock");
  const readIndex = async () => {
    let text;
    try { text = await readFile(indexPath, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return empty(); throw error; }
    const index = JSON.parse(text);
    if (index.schemaVersion !== 1 || !Number.isSafeInteger(index.revision) || index.revision < 0 || !Array.isArray(index.archetypes)) throw new Error("Invalid library index; existing data retained.");
    const species = new Set(), ids = new Set();
    for (const entry of index.archetypes) {
      if (typeof entry.speciesId !== "string" || species.has(entry.speciesId) || !Array.isArray(entry.versions)) throw new Error("Invalid archetype index.");
      species.add(entry.speciesId);
      for (const version of entry.versions) {
        if (!UUID.test(version.id) || ids.has(version.id) || typeof version.label !== "string" || !Number.isInteger(version.number) || !/^[a-f0-9]{64}$/.test(version.assetHash)) throw new Error("Invalid version index.");
        ids.add(version.id);
      }
      if (entry.standardVersionId !== null && !entry.versions.some(v => v.id === entry.standardVersionId)) throw new Error("Missing standard version.");
    }
    return index;
  };
  const snapshot = async (id, index = undefined) => {
    requireValue(typeof id === "string" && UUID.test(id), "Invalid version ID.");
    index ??= await readIndex();
    const entry = index.archetypes.find(entry => entry.versions.some(v => v.id === id));
    if (!entry) throw new LibraryError(404, "Saved version not found.");
    const metadata = entry.versions.find(v => v.id === id);
    const saved = JSON.parse(await readFile(join(root, "versions", id + ".json"), "utf8"));
    if (saved.id !== id || saved.asset?.species?.id !== entry.speciesId || hash(saved.asset) !== metadata.assetHash) throw new Error("Saved version failed integrity validation.");
    saved.asset = parseVegetationAsset(JSON.stringify(saved.asset));
    return saved;
  };
  const locked = async operation => {
    await mkdir(root, { recursive: true });
    let handle;
    const deadline = Date.now() + 5000;
    while (!handle) {
      try {
        handle = await open(lockPath, "wx");
        try { await handle.writeFile(JSON.stringify({ pid: process.pid })); }
        catch (error) { await handle.close(); await unlink(lockPath); handle = undefined; throw error; }
      }
      catch (error) {
        if (error.code !== "EEXIST") throw error;
        // Recover locks left by a dead server, without stealing a live writer's lock.
        try {
          const info = await stat(lockPath);
          if (Date.now() - info.mtimeMs > 5000) {
            let owner;
            try { owner = JSON.parse(await readFile(lockPath, "utf8")); }
            catch { if (Date.now() - info.mtimeMs > 30000) await unlink(lockPath); }
            if (Number.isInteger(owner?.pid) && owner.pid > 0) {
              try { process.kill(owner.pid, 0); }
              catch (error) { if (error.code === "ESRCH") await unlink(lockPath); }
            }
          }
        } catch { /* Another process may just have released the lock. */ }
        if (Date.now() > deadline) throw new LibraryError(503, "The version library is busy. Try again shortly.");
        await new Promise(resolve => setTimeout(resolve, 30));
      }
    }
    try { return await operation(); }
    finally { await handle.close(); await unlink(lockPath); }
  };
  const commitIndex = async index => {
    const temp = join(root, ".index-" + randomUUID() + ".tmp");
    try {
      const file = await open(temp, "wx");
      try { await file.writeFile(JSON.stringify(index, null, 2) + "\n"); await file.sync(); }
      finally { await file.close(); }
      await rename(temp, indexPath);
    } finally { await unlink(temp).catch(() => {}); }
  };
  const currentIndex = async expected => {
    const index = await readIndex();
    if (expected !== index.revision) throw new LibraryError(409, "The library changed in another window. It has been refreshed; try again.");
    return index;
  };
  const validateAsset = raw => {
    const asset = parseVegetationAsset(JSON.stringify(raw));
    requireValue(asset.species.id.length > 0 && asset.species.id.length <= 120 && asset.primitives?.length, "Invalid archetype or missing meshes.");
    for (let seed = 0; seed < 16; seed++) requireValue(compileVegetationPlant(asset, seed).every(part => part.positions.every(Number.isFinite)), "Invalid geometry.");
    return asset;
  };
  const writeSnapshot = async saved => {
    await mkdir(join(root, "versions"), { recursive: true });
    const file = await open(join(root, "versions", saved.id + ".json"), "wx");
    try { await file.writeFile(JSON.stringify(saved, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
  };
  const appendSnapshot = async (entry, asset, label, parentVersionId = null, kind = "saved", createdAt = new Date().toISOString()) => {
    const version = { id: randomUUID(), number: entry.versions.length + 1, label, createdAt, assetHash: hash(asset), parentVersionId, kind };
    await writeSnapshot({ schemaVersion: 1, ...version, asset }); entry.versions.push(version); return version;
  };
  return {
    readIndex, snapshot,
    async ensure(input) {
      let asset; try { asset = validateAsset(input.asset); } catch (error) { throw new LibraryError(400, error.message); }
      return locked(async () => {
        const index = await readIndex();
        let entry = index.archetypes.find(e => e.speciesId === asset.species.id);
        if (!entry) {
          entry = { speciesId: asset.species.id, displayName: asset.species.displayName, standardVersionId: null, versions: [] };
          const first = await appendSnapshot(entry, asset, "Original"); entry.standardVersionId = first.id;
          index.archetypes.push(entry); index.revision++; await commitIndex(index);
        }
        return index;
      });
    },
    async transfer(input) {
      return locked(async () => {
        const index = await currentIndex(input.expectedRevision);
        let active; try { active = validateAsset(input.asset); } catch (error) { throw new LibraryError(400, error.message); }
        const source = input.sourceSpeciesId ? index.archetypes.find(e => e.speciesId === input.sourceSpeciesId) : null;
        requireValue(!input.sourceSpeciesId || source, "Source archetype not found.");
        const records = source ? await Promise.all(source.versions.map(version => snapshot(version.id, index))) : input.bundle?.versions ?? [];
        requireValue(Array.isArray(records) && records.length <= 1000, "Invalid version archive.");
        const targetId = input.targetId ?? active.species.id;
        requireValue(typeof targetId === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,119}$/.test(targetId), "Invalid archetype ID.");
        let entry = index.archetypes.find(e => e.speciesId === targetId);
        requireValue(!source || !entry, "That archetype ID already exists.");
        if (!entry) { entry = { speciesId: targetId, displayName: input.displayName ?? active.species.displayName, standardVersionId: null, versions: [] }; index.archetypes.push(entry); }
        const copyAsset = raw => {
          const copied = structuredClone(raw);
          copied.species.id = targetId;
          if (input.displayName) copied.species.displayName = input.displayName;
          if (source) copied.editor = { ...copied.editor, tags: [...(copied.editor?.tags ?? []).filter(tag => tag !== "starter"), "custom"] };
          try { return validateAsset(copied); } catch (error) { throw new LibraryError(400, error.message); }
        };
        const ids = new Map();
        const prepared = records.map(record => {
          requireValue(UUID.test(record.id) && !ids.has(record.id) && record.asset?.species?.id === active.species.id, "Invalid archived version.");
          requireValue(typeof record.label === "string" && record.label.length > 0 && record.label.length <= 80, "Invalid version name.");
          ids.set(record.id, randomUUID());
          return { record, asset: copyAsset(record.asset) };
        });
        const draft = copyAsset(active);
        for (const { record, asset } of prepared) {
          const version = { id: ids.get(record.id), number: entry.versions.length + 1, label: record.label, createdAt: Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : new Date().toISOString(), assetHash: hash(asset), parentVersionId: ids.get(record.parentVersionId) ?? null, kind: record.kind === "recovery" ? "recovery" : "saved" };
          await writeSnapshot({ schemaVersion: 1, ...version, asset }); entry.versions.push(version);
        }
        let currentVersionId = ids.get(input.currentVersionId ?? input.bundle?.currentVersionId);
        if (!records.length) currentVersionId = (await appendSnapshot(entry, draft, "Imported")).id;
        entry.standardVersionId = ids.get(source?.standardVersionId ?? input.bundle?.standardVersionId) ?? entry.standardVersionId ?? entry.versions[0].id;
        currentVersionId ??= entry.standardVersionId;
        entry.displayName = draft.species.displayName; index.revision++; await commitIndex(index);
        return { index, asset: draft, currentVersionId };
      });
    },
    async standards() {
      const index = await readIndex();
      return Promise.all(index.archetypes.filter(e => e.standardVersionId).map(async e => (await snapshot(e.standardVersionId, index)).asset));
    },
    async save(input) {
      requireValue(typeof input.label === "string" && input.label.trim().length > 0 && input.label.trim().length <= 80, "Name this version (up to 80 characters).");
      let asset;
      try {
        asset = parseVegetationAsset(JSON.stringify(input.asset));
        requireValue(typeof asset.species.id === "string" && asset.species.id.length > 0 && asset.species.id.length <= 120, "Invalid archetype ID.");
        requireValue(Array.isArray(asset.primitives) && asset.primitives.length > 0, "Save the primitive library with this version.");
        for (let seed = 0; seed < 16; seed++) {
          const parts = compileVegetationPlant(asset, seed);
          requireValue(parts.every(p => p.positions.every(Number.isFinite)), "The recipe produces invalid geometry.");
        }
      } catch (error) { throw new LibraryError(400, error.message); }
      return locked(async () => {
        const index = await currentIndex(input.expectedRevision);
        let entry = index.archetypes.find(e => e.speciesId === asset.species.id);
        if (!entry) { entry = { speciesId: asset.species.id, displayName: asset.species.displayName, standardVersionId: null, versions: [] }; index.archetypes.push(entry); }
        requireValue(input.parentVersionId == null || entry.versions.some(v => v.id === input.parentVersionId), "The parent must be a saved version of this archetype.");
        const version = { id: randomUUID(), number: entry.versions.length + 1, label: input.label.trim(), createdAt: new Date().toISOString(), assetHash: hash(asset), parentVersionId: input.parentVersionId ?? null, kind: input.kind === "recovery" ? "recovery" : "saved" };
        await mkdir(join(root, "versions"), { recursive: true });
        const file = await open(join(root, "versions", version.id + ".json"), "wx");
        try { await file.writeFile(JSON.stringify({ schemaVersion: 1, ...version, asset }, null, 2) + "\n"); await file.sync(); }
        finally { await file.close(); }
        entry.versions.push(version); entry.displayName = asset.species.displayName; index.revision++;
        await commitIndex(index);
        return { index, version };
      });
    },
    async makeStandard(input) {
      return locked(async () => {
        const index = await currentIndex(input.expectedRevision);
        const entry = index.archetypes.find(e => e.speciesId === input.speciesId);
        requireValue(entry?.versions.some(v => v.id === input.versionId), "Choose a saved version of this archetype.");
        await snapshot(input.versionId, index);
        entry.standardVersionId = input.versionId; index.revision++;
        await commitIndex(index);
        return index;
      });
    },
  };
}

export function vegetationLibraryMiddleware(library) {
  return async (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (!path?.startsWith("/api/vegetation-library")) return next();
    const respond = (status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
    try {
      let hostname; try { hostname = new URL("http://" + req.headers.host).hostname; } catch { /* Rejected below. */ }
      if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) throw new LibraryError(403, "The version library is available only on the local editor host.");
      if (req.method === "GET" && path === "/api/vegetation-library") return respond(200, await library.readIndex());
      if (req.method === "GET" && path.startsWith("/api/vegetation-library/versions/")) return respond(200, await library.snapshot(path.slice("/api/vegetation-library/versions/".length)));
      if (req.method !== "POST") throw new LibraryError(405, "Unsupported library operation.");
      let origin; try { origin = new URL(req.headers.origin ?? ""); } catch { /* Rejected below. */ }
      if (!origin || origin.host !== req.headers.host || !/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? "")) throw new LibraryError(403, "Library writes must come from this editor.");
      const chunks = []; let bytes = 0;
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { req.resume(); throw new LibraryError(413, "This version exceeds the 8 MB save limit."); }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      let input; try { input = JSON.parse(body); } catch { throw new LibraryError(400, "Invalid save request."); }
      requireValue(input && typeof input === "object", "Invalid save request.");
      if (path === "/api/vegetation-library/versions") return respond(201, await library.save(input));
      if (path === "/api/vegetation-library/ensure") return respond(200, await library.ensure(input));
      if (path === "/api/vegetation-library/transfer") return respond(201, await library.transfer(input));
      if (path === "/api/vegetation-library/standard") return respond(200, await library.makeStandard(input));
      throw new LibraryError(404, "Unknown library operation.");
    } catch (error) { respond(error.status ?? 500, { error: error.status ? error.message : "The project version library could not be read or written. Existing versions have been retained. Check the local server." }); }
  };
}

export function vegetationLibraryPlugin(directory) {
  const library = createVegetationLibrary(directory);
  return {
    name: "lamow-vegetation-library",
    configureServer(server) { server.watcher.unwatch(resolve(directory)); server.middlewares.use(vegetationLibraryMiddleware(library)); },
    configurePreviewServer(server) { server.middlewares.use(vegetationLibraryMiddleware(library)); },
    async generateBundle() { this.emitFile({ type: "asset", fileName: "vegetation-standards.json", source: JSON.stringify({ standards: await library.standards() }) }); },
  };
}
