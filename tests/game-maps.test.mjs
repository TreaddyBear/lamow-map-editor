import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGameMaps, mapSourceHash, gameMapsPlugin } from "../scripts/game-maps.mjs";

test("game bridge reports authored versus baked state without modifying either file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lamow-map-bridge-"));
  try {
    await mkdir(join(directory, "map-exports"));
    const pack = { version: 1, pack: { prefix: "test" }, defaultLevelCode: "first", levels: [{ code: "first" }, { code: "second" }] };
    const file = join(directory, "map-exports/lawn-maps.json"), source = JSON.stringify(pack);
    await writeFile(file, source);
    assert.equal((await readGameMaps(directory)).baked.status, "missing");
    const artifact = join(directory, "map-exports/lawn-maps.baked.json");
    await writeFile(artifact, JSON.stringify({ sourceHash: mapSourceHash(pack), maps: [{ code: "testFirst" }] }));
    const current = await readGameMaps(directory); assert.equal(current.baked.status, "current"); assert.deepEqual(current.pack, pack);
    pack.levels[1].code = "new"; await writeFile(file, JSON.stringify(pack));
    assert.equal((await readGameMaps(directory)).baked.status, "stale");
    await writeFile(artifact, "bad json"); assert.equal((await readGameMaps(directory)).baked.status, "unreadable");
    assert.equal(await readFile(file, "utf8"), JSON.stringify(pack));
    await writeFile(file, "bad json"); await assert.rejects(readGameMaps(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("game bridge exposes only the fixed read route in dev and preview", () => {
  for (const hook of ["configureServer", "configurePreviewServer"]) {
    let handler; gameMapsPlugin("unused")[hook]({ middlewares: { use(value) { handler = value; } } });
    const headers = {}, response = { setHeader(k,v) { headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
    handler({ method: "POST", url: "/api/game-maps" }, response, () => assert.fail());
    assert.equal(response.statusCode, 405); assert.match(response.body.error, /read-only/);
    let next = false; handler({ method: "GET", url: "/unrelated" }, response, () => { next = true; }); assert.ok(next);
  }
});
