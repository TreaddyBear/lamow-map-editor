import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, utimes } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { createVegetationLibrary, vegetationLibraryMiddleware, vegetationLibraryPlugin } from "../scripts/vegetation-library.mjs";

const fixture = JSON.parse(await readFile(new URL("./fixtures/authored-clover.lamow-vegetation.json", import.meta.url), "utf8"));
async function setup() {
  await mkdir(resolve(".tmp/library-tests"), { recursive: true });
  const directory = await mkdtemp(resolve(".tmp/library-tests/run-"));
  return { directory, library: createVegetationLibrary(directory) };
}
const input = (expectedRevision = 0, label = "First version", asset = structuredClone(fixture)) => ({ expectedRevision, label, asset });

test("initial versions are idempotent; duplicate and archive import preserve the full family without overwriting history", async () => {
  const { library, directory } = await setup();
  const first = await library.ensure({ asset: fixture });
  const edited = structuredClone(fixture); edited.species.coverage.plantsPerSquareMeter = 42;
  assert.deepEqual(await library.ensure({ asset: edited }), first);
  const original = first.archetypes[0].versions[0];
  const second = await library.save({ ...input(1, "Denser", edited), parentVersionId: original.id });
  const dirty = structuredClone(edited); dirty.species.coverage.plantsPerSquareMeter = 55;
  const duplicate = await library.transfer({ expectedRevision: 2, asset: dirty, sourceSpeciesId: "clover", targetId: "cloverCopy", displayName: "Clover Copy", currentVersionId: second.version.id });
  const entry = duplicate.index.archetypes.find(e => e.speciesId === "cloverCopy");
  assert.equal(entry.versions.length, 2);
  assert.equal(entry.standardVersionId, entry.versions[0].id);
  assert.equal(duplicate.currentVersionId, entry.versions[1].id);
  assert.equal(entry.versions[1].parentVersionId, entry.versions[0].id);
  assert.equal(duplicate.asset.species.coverage.plantsPerSquareMeter, 55);
  const records = await Promise.all(entry.versions.map(v => library.snapshot(v.id)));
  assert.deepEqual(records.map(v => v.asset.species.coverage.plantsPerSquareMeter), [153, 42]);
  assert.ok(records.every(v => v.asset.species.id === "cloverCopy" && v.asset.editor.tags.includes("custom")));
  const bytes = await readFile(join(directory, "versions", original.id + ".json"), "utf8");
  const bundle = { versions: records, standardVersionId: entry.standardVersionId, currentVersionId: duplicate.currentVersionId };
  const imported = await library.transfer({ expectedRevision: 3, asset: duplicate.asset, bundle });
  const importedEntry = imported.index.archetypes.find(e => e.speciesId === "cloverCopy");
  assert.equal(importedEntry.versions.length, 4);
  assert.equal(imported.currentVersionId, importedEntry.versions[3].id);
  assert.equal(importedEntry.standardVersionId, importedEntry.versions[2].id);
  assert.equal(await readFile(join(directory, "versions", original.id + ".json"), "utf8"), bytes);
  const invalid = structuredClone(bundle); invalid.versions[1].asset.species.id = "wrong";
  await assert.rejects(library.transfer({ expectedRevision: 4, asset: duplicate.asset, bundle: invalid }), { status: 400 });
  assert.deepEqual(await library.readIndex(), imported.index);
});

test("immutable versions, independent standards, and embedded meshes survive a new server instance and build", async () => {
  const { directory, library } = await setup();
  const first = await library.save(input());
  const original = await readFile(join(directory, "versions", first.version.id + ".json"), "utf8");
  const edited = structuredClone(fixture); edited.species.coverage.plantsPerSquareMeter = 42;
  const second = await library.save({ ...input(1, "Alternative", edited), parentVersionId: first.version.id });
  assert.equal(second.version.number, 2);
  const standard = await library.makeStandard({ expectedRevision: 2, speciesId: "clover", versionId: first.version.id });
  assert.equal(standard.revision, 3);
  const reopened = createVegetationLibrary(directory);
  assert.equal((await reopened.readIndex()).archetypes[0].standardVersionId, first.version.id);
  assert.equal((await reopened.snapshot(second.version.id)).asset.species.coverage.plantsPerSquareMeter, 42);
  assert.deepEqual((await reopened.standards())[0].primitives, fixture.primitives);
  assert.equal((await reopened.standards())[0].species.coverage.plantsPerSquareMeter, 153);
  assert.equal(await readFile(join(directory, "versions", first.version.id + ".json"), "utf8"), original);
  let emitted;
  await vegetationLibraryPlugin(directory).generateBundle.call({ emitFile: file => { emitted = file; } });
  assert.equal(emitted.fileName, "vegetation-standards.json");
  assert.equal(JSON.parse(emitted.source).standards[0].species.coverage.plantsPerSquareMeter, 153);
});

test("two server instances serialize saves and reject stale revisions without losing either accepted version", async () => {
  const { directory, library } = await setup();
  const other = createVegetationLibrary(directory);
  const results = await Promise.allSettled([library.save(input(0, "Window A")), other.save(input(0, "Window B"))]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.status, 409);
  const retry = await other.save(input(1, "Retry"));
  assert.equal(retry.index.archetypes[0].versions.length, 2);
  await assert.rejects(library.makeStandard({ expectedRevision: 0, speciesId: "clover", versionId: retry.version.id }), { status: 409 });
});

test("invalid saves and cross-archetype references cannot change existing history", async () => {
  const { library } = await setup();
  const first = await library.save(input());
  await assert.rejects(library.save(input(1, " ")), { status: 400 });
  const invalid = structuredClone(fixture); delete invalid.primitives;
  await assert.rejects(library.save(input(1, "Missing mesh", invalid)), { status: 400 });
  await assert.rejects(library.save(input(1, "Bad asset", {})), { status: 400 });
  const another = structuredClone(fixture); another.species.id = "another";
  await assert.rejects(library.save({ ...input(1, "Bad parent", another), parentVersionId: first.version.id }), { status: 400 });
  await assert.rejects(library.makeStandard({ expectedRevision: 1, speciesId: "another", versionId: first.version.id }), { status: 400 });
  await assert.rejects(library.snapshot("../../library.json"), { status: 400 });
  assert.deepEqual(await library.readIndex(), first.index);
});

test("corrupt index and tampered snapshot are reported without overwriting the stored work", async () => {
  const { directory, library } = await setup();
  const first = await library.save(input());
  const snapshotPath = join(directory, "versions", first.version.id + ".json");
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  snapshot.asset.species.displayName = "Tampered";
  await writeFile(snapshotPath, JSON.stringify(snapshot));
  await assert.rejects(library.makeStandard({ expectedRevision: 1, speciesId: "clover", versionId: first.version.id }), /integrity/);
  assert.equal((await library.readIndex()).revision, 1);
  await writeFile(join(directory, "library.json"), "broken index");
  await assert.rejects(library.save(input(1)));
  assert.equal(await readFile(join(directory, "library.json"), "utf8"), "broken index");
  assert.equal(JSON.parse(await readFile(snapshotPath, "utf8")).asset.species.displayName, "Tampered");
});

test("an incomplete lock left by a crashed writer can be recovered", async () => {
  const { directory, library } = await setup();
  const lock = join(directory, ".write-lock");
  await writeFile(lock, "");
  const old = new Date(Date.now() - 60_000); await utimes(lock, old, old);
  assert.equal((await library.save(input())).index.revision, 1);
});

test("HTTP writes require same-origin JSON and return actionable conflicts; Unicode labels survive", async t => {
  const { library } = await setup();
  const middleware = vegetationLibraryMiddleware(library);
  const server = createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const post = (body, headers = {}) => fetch(origin + "/api/vegetation-library/versions", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, ...headers }, body });
  assert.equal((await post(JSON.stringify(input()), { Origin: "https://unrelated.example" })).status, 403);
  assert.equal((await post(JSON.stringify(input()), { "Content-Type": "text/plain" })).status, 403);
  assert.equal((await post("broken")).status, 400);
  const oversized = await post(JSON.stringify({ padding: "x".repeat(8 * 1024 * 1024) }));
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /8 MB/);
  const response = await post(JSON.stringify(input(0, "Trèfle 🌱")));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).version.label, "Trèfle 🌱");
  assert.equal((await post(JSON.stringify(input()))).status, 409);
  assert.equal((await fetch(origin + "/api/vegetation-library")).headers.get("cache-control"), "no-store");
  assert.equal((await library.readIndex()).revision, 1);
});
