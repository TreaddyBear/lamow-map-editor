import test from "node:test";
import assert from "node:assert/strict";

import { createAreaFromBlueprint } from "../src/domain/blueprints";
import { moveAreaShapeHandle } from "../src/domain/editHandles";
import { exportJsonValue, importJsonText } from "../src/domain/importExport";
import { rectFromCenter, shapeBounds, translateShape } from "../src/domain/geometry";
import { clone, defaultPack, type AreaShape } from "../src/domain/model";
import { normalizePack } from "../src/domain/normalization";
import { snapMoveDelta, snapPoint } from "../src/domain/snapping";
import { validateLevel } from "../src/domain/validation";

test("normalizes packs with a fallback level", () => {
  const normalized = normalizePack({ ...clone(defaultPack), levels: [] });

  assert.equal(normalized.version, 1);
  assert.equal(normalized.units, "meters");
  assert.equal(normalized.levels.length, 1);
});

test("validates duplicate authored ids", () => {
  const pack = clone(defaultPack);
  const level = pack.levels[0];
  level.roads.push({ ...level.roads[0], id: level.roads[0].id });

  assert.ok(validateLevel(pack, level).some((error) => error.includes("Duplicate authored id")));
});

test("validates draft v1 authored id and object constraints", () => {
  const pack = clone(defaultPack);
  const level = pack.levels[0];
  level.objects.push({ unsupported: true });
  level.roads[0].id = "1badRoad";

  const errors = validateLevel(pack, level);

  assert.ok(errors.some((error) => error.includes("Objects are reserved")));
  assert.ok(errors.some((error) => error.includes("id should start")));
});

test("validates polygon rules from the draft spec", () => {
  const pack = clone(defaultPack);
  const level = pack.levels[0];
  level.areas[0].shape = { type: "polygon", points: [[0, 0], [2, 2], [0, 2], [2, 0]] };

  assert.ok(validateLevel(pack, level).some((error) => error.includes("polygon edges must not cross")));
});

test("creates area blueprints with supplied ids and seeds", () => {
  let idIndex = 0;
  const area = createAreaFromBlueprint("flowers", [3, 4], (base) => `${base}${++idIndex}`, () => 42);

  assert.ok(area);
  assert.equal(area.id, "flowerScatter1");
  assert.equal(area.shape.type, "rectangle");
  assert.deepEqual(area.shape.center, [3, 4]);
  assert.equal(area.vegetation.length, 2);
});

test("geometry helpers preserve shape type while translating", () => {
  const shape: AreaShape = { type: "circle", center: [1, 2], radius: 3 };
  const translated = translateShape(shape, 2, -1);

  assert.deepEqual(rectFromCenter([0, 0], [4, 2]), { xMin: -2, xMax: 2, zMin: -1, zMax: 1 });
  assert.equal(translated.type, "circle");
  assert.deepEqual(shapeBounds(translated), { xMin: 0, xMax: 6, zMin: -2, zMax: 4 });
});

test("rectangle rotation handles update rotation degrees", () => {
  const shape: AreaShape = { type: "rectangle", center: [0, 0], size: [4, 2] };
  const rotated = moveAreaShapeHandle(shape, "rotate", undefined, [1, 0], 0, 0);

  assert.equal(rotated.type, "rectangle");
  assert.equal(rotated.rotationDegrees, 90);
});

test("import/export accepts draft v1 packs", () => {
  const exported = exportJsonValue(clone(defaultPack));
  const result = importJsonText(JSON.stringify(exported));

  assert.equal(result.pack.version, 1);
  assert.equal(result.pack.levels.length, exported.levels.length);
  assert.match(result.message, /draft v1 pack/);
});

test("normalization removes repeated final polygon points and clamps v1 scalars", () => {
  const pack = clone(defaultPack);
  pack.levels[0].areas[0].shape = { type: "polygon", points: [[0, 0], [1, 0], [1, 1], [0, 0]] };
  pack.levels[0].areas[0].vegetation[0].distribution = { type: "uniform", density: -1 };
  pack.levels[0].roads[0].width = -4;
  const normalized = normalizePack(pack);
  const shape = normalized.levels[0].areas[0].shape;

  assert.equal(shape.type, "polygon");
  if (shape.type === "polygon") assert.deepEqual(shape.points, [[0, 0], [1, 0], [1, 1]]);
  assert.equal(normalized.levels[0].areas[0].vegetation[0].distribution.density, 0);
  assert.equal(normalized.levels[0].roads[0].width, 0.1);
});

test("snapping supports grid targets and quantized movement", () => {
  assert.deepEqual(snapPoint([1.24, 2.76], { enabled: true, increment: 0.5, mode: "toGrid" }), [1, 3]);
  assert.deepEqual(snapMoveDelta([0.74, 1.26], [2.2, 2.2], { enabled: true, increment: 1, mode: "toGrid" }), [0.8, 0.8]);
  assert.deepEqual(snapMoveDelta([0.74, 1.26], [2.2, 2.2], { enabled: true, increment: 1, mode: "byIncrement" }), [1, 1]);
});
