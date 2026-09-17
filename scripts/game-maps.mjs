import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Matches LaMow's baker/staleness check, including its floating-point multiply.
export function mapSourceHash(value) {
  const text = JSON.stringify(value); let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = ((hash ^ text.charCodeAt(i)) * 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

export async function readGameMaps(directory) {
  const pack = JSON.parse(await readFile(resolve(directory, "map-exports/lawn-maps.json"), "utf8"));
  if (pack.version !== 1 || !Array.isArray(pack.levels) || !pack.levels.length) throw new Error("LaMow's authored map source is not a nonempty version 1 pack.");
  const revision = mapSourceHash(pack);
  let baked = { status: "missing", codes: [] };
  try {
    const artifact = JSON.parse(await readFile(resolve(directory, "map-exports/lawn-maps.baked.json"), "utf8"));
    if (!Array.isArray(artifact.maps)) throw new Error("Invalid baked maps");
    baked = { status: artifact.sourceHash === revision ? "current" : "stale", codes: artifact.maps.map(map => map.code), defaultLevelCode: artifact.defaultLevelCode };
  } catch (error) { if (error.code !== "ENOENT") baked.status = "unreadable"; }
  return { pack, revision, source: "LaMow / lawn-maps.json", baked };
}

export function gameMapsPlugin(directory) {
  const middleware = (req, res, next) => {
    if (req.url?.split("?")[0] !== "/api/game-maps") return next();
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET") { res.statusCode = 405; res.end(JSON.stringify({ error: "Game maps are read-only in the editor." })); return; }
    readGameMaps(directory).then(value => res.end(JSON.stringify(value))).catch(error => {
      res.statusCode = error.code === "ENOENT" ? 404 : 422;
      res.end(JSON.stringify({ error: error.code === "ENOENT" ? "LaMow map source unavailable. Import lawn-maps.json or set LAMOW_PROJECT_DIR before starting the editor." : "Could not read LaMow maps: " + error.message }));
    });
  };
  return { name: "lamow-game-maps", configureServer(server) { server.middlewares.use(middleware); }, configurePreviewServer(server) { server.middlewares.use(middleware); } };
}
