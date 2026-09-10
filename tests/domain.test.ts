import test from "node:test";
import { advanceNumberHold, createNumberHoldCurve } from "../frontend/source/Components/Base/numberHold";
import assert from "node:assert/strict";

test("number holds smoothly match timing points and cap speed across small and enormous ranges", () => {
  const curve = createNumberHoldCurve(1, -180, 180, {
    startRate: 2, maxRate: 50,
    fine: { seconds: 1, stepsPerSecond: 3 }, coarse: { seconds: 6, stepsPerSecond: 40 },
  });
  assert.ok(Math.abs(curve.rateAt(1) - 3) < 1e-10);
  assert.ok(Math.abs(curve.rateAt(6) - 40) < 1e-10);
  for (const [step, min, max] of [[1, -180, 180], [0.005, 0, 0.8], [0.01, -1, 1], [1, 0, 4294967295], [1, 0, 0]]) {
    const c = createNumberHoldCurve(step, min, max);
    let previous = c.rateAt(0);
    assert.ok(c.rateAt(0.001) - previous < 0.001, "gentle initial acceleration");
    for (let t = 0; t <= 20; t += 0.01) {
      const rate = c.rateAt(t);
      assert.ok(Number.isFinite(rate) && rate >= previous && rate <= c.maxRate);
      previous = rate;
    }
    assert.ok(c.maxRate <= 120);
    assert.ok(c.rateAt(10) > c.maxRate * 0.9);
    assert.equal(c.rateAt(1e100), c.maxRate);
  }
  assert.throws(() => createNumberHoldCurve(0));
  assert.throws(() => createNumberHoldCurve(1, 0, 100, { maxRate: NaN }));
  assert.throws(() => createNumberHoldCurve(1, 0, 100, { fine: { seconds: 8, stepsPerSecond: 3 } }));
});

test("number holds integrate time consistently and never repay stalled frames in a burst", () => {
  const curve = createNumberHoldCurve(1, -180, 180);
  const simulate = (hz: number) => {
    let progress = { elapsedMs: 0, remainder: 0 }, total = 0;
    for (let i = 0; i < hz * 10; i++) {
      const next = advanceNumberHold(progress, 1000 / hz, curve);
      progress = next; total += next.steps;
    }
    return total;
  };
  assert.ok(Math.abs(simulate(30) - simulate(144)) <= 1);
  assert.ok(Math.abs(simulate(5) - simulate(144)) <= 1, "ordinary slow frames preserve the timing curve");
  const paused = advanceNumberHold({ elapsedMs: 300, remainder: 0 }, 60_000, curve);
  assert.equal(paused.elapsedMs, 550);
  assert.equal(paused.steps, 0);
  assert.equal(advanceNumberHold({ elapsedMs: 0, remainder: 0 }, 16, curve).steps, 0);
});
import { Vector3 } from "@babylonjs/core";

import { blueprintFromArea, createAreaFromBlueprint } from "../frontend/source/utilities/domain/blueprints";
import { moveAreaShapeHandle, movePathShapeHandle } from "../frontend/source/utilities/domain/editHandles";
import { exportJsonValue, importJsonText } from "../frontend/source/utilities/domain/importExport";
import { rectFromCenter, shapeBounds, translateShape } from "../frontend/source/utilities/domain/geometry";
import { clone, defaultPack, type AreaShape } from "../frontend/source/utilities/domain/model";
import { normalizePack } from "../frontend/source/utilities/domain/normalization";
import { snapMoveDelta, snapPoint } from "../frontend/source/utilities/domain/snapping";
import { validateLevel } from "../frontend/source/utilities/domain/validation";
import { defaultObjPrimitiveLibrary, edgeKey, objPrimitiveEdges, objPrimitiveToRenderData, parseObjPrimitiveMesh, replaceObjPrimitiveVertex, serializeObjPrimitiveMesh, setObjPrimitiveEdgeSharp } from "../frontend/source/utilities/assets/objPrimitives";
import { composePetalMatrix, composeStemMatrix, degreesToRadians, petalAxes, petalPose, rotateYVector, stemGrowthVector, stemOrientationMatrix } from "../frontend/source/utilities/assets/vegetationGeometry";

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

test("custom editor blueprints are saved and instantiate as areas", () => {
  const pack = clone(defaultPack);
  const source = pack.levels[0].areas[0];
  const blueprint = blueprintFromArea(source, "Yard Archetype");
  pack.editor = { blueprints: [blueprint], theme: "dark" };
  const exported = exportJsonValue(pack);
  assert.equal(exported.editor?.blueprints?.[0].label, "Yard Archetype");
  assert.equal(exported.editor?.theme, "dark");

  const area = createAreaFromBlueprint(blueprint.key, [10, 10], (base) => `${base}1`, () => 1, exported.editor?.blueprints);
  assert.ok(area);
  assert.equal(area?.kind, "area");
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

test("moving a Bezier end node carries its segment handles", () => {
  const shape = { type: "cubicBezierPath" as const, start: [0, 0] as [number, number], curves: [{ c1: [1, 0] as [number, number], c2: [2, 0] as [number, number], end: [3, 0] as [number, number] }] };
  const moved = movePathShapeHandle(shape, "bezier", 2, [4, 1], 1, 1);

  assert.equal(moved.type, "cubicBezierPath");
  assert.deepEqual(moved.curves[0], { c1: [2, 1], c2: [3, 1], end: [4, 1] });
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

test("vegetation geometry basis values are explicit", () => {
  assertVectorClose(stemGrowthVector(2, 0, 123), [0, 2, 0]);
  assertVectorClose(stemGrowthVector(2, 90, 0), [2, 0, 0]);
  assertVectorClose(stemGrowthVector(2, 90, 90), [0, 0, 2]);
  assertVectorClose(rotateYVector(0, 0, 1, Math.PI / 2), [1, 0, 0]);

  const tiltedStem = stemGrowthVector(1, 45, 0);
  const rotatedUp = Vector3.TransformNormal(new Vector3(0, 1, 0), stemOrientationMatrix(tiltedStem)).normalize();
  assertVectorClose(rotatedUp, vectorToTuple(tiltedStem.normalizeToNew()));

  const forwardAxes = petalAxes(0, 0);
  assertVectorClose(forwardAxes.x, [1, 0, 0]);
  assertVectorClose(forwardAxes.y, [0, 1, 0]);
  assertVectorClose(forwardAxes.z, [0, 0, 1]);

  const rightAxes = petalAxes(Math.PI / 2, 0);
  assertVectorClose(rightAxes.x, [0, 0, -1]);
  assertVectorClose(rightAxes.y, [0, 1, 0]);
  assertVectorClose(rightAxes.z, [1, 0, 0]);
});

test("vegetation geometry composes stem arc, yaw, fork radius, petal theta, and pitch", () => {
  const root = new Vector3(0.5, 0, -0.25);
  const localStem = stemGrowthVector(0.8, 30, 45);
  const yaw = degreesToRadians(60);
  const worldStem = rotateYVector(localStem.x, localStem.y, localStem.z, yaw);
  const head = root.add(worldStem);
  const theta = degreesToRadians(90);
  const pitch = degreesToRadians(-35);
  const baseRadius = 0.12;
  const petal = petalPose(head, theta + yaw, baseRadius, pitch);

  assertFiniteVector(worldStem);
  assertFiniteVector(petal.position);
  assertOrthonormal(petal.axes);
  assertClose(horizontalDistance(petal.position, head), baseRadius);
  assert.ok(petal.axes.z.y > 0, "negative pitch should elevate the petal forward axis");

  const stemMatrix = composeStemMatrix(root, worldStem, new Vector3(0.01, 0.8, 0.01));
  const stemBase = Vector3.TransformCoordinates(Vector3.Zero(), stemMatrix);
  assertVectorClose(stemBase, vectorToTuple(root));

  const petalMatrix = composePetalMatrix(head, theta + yaw, baseRadius, pitch, new Vector3(0.04, 0.09, 0.09));
  const petalBase = Vector3.TransformCoordinates(Vector3.Zero(), petalMatrix);
  assertVectorClose(petalBase, vectorToTuple(petal.position));
});

test("vegetation geometry sampled ranges stay finite and meaningful", () => {
  const heights = [0, 0.14, 0.8];
  const arcs = [0, 15, 90, 150, 180];
  const azimuths = [0, 90, 180, 270, 360];
  const yaws = [0, Math.PI / 3, Math.PI];
  const forkRadii = [0, 0.04, 0.3];
  const thetas = [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const pitches = [degreesToRadians(-80), degreesToRadians(-30), 0, degreesToRadians(45)];

  for (const height of heights) {
    for (const arc of arcs) {
      for (const azimuth of azimuths) {
        const stem = stemGrowthVector(height, arc, azimuth);
        assertFiniteVector(stem);
        for (const yaw of yaws) {
          const worldStem = rotateYVector(stem.x, stem.y, stem.z, yaw);
          assertFiniteVector(worldStem);
          for (const radius of forkRadii) {
            for (const theta of thetas) {
              for (const pitch of pitches) {
                const head = new Vector3(worldStem.x, worldStem.y, worldStem.z);
                const pose = petalPose(head, theta + yaw, radius, pitch);
                assertFiniteVector(pose.position);
                assertFiniteQuaternion(pose.rotation);
                assertOrthonormal(pose.axes);
                assertClose(horizontalDistance(pose.position, head), radius);
              }
            }
          }
        }
      }
    }
  }
});

test("OBJ vegetation primitives parse vertex colors, smoothing, and sharp seams", () => {
  const mesh = parseObjPrimitiveMesh(`# lamow: id testPetal
# lamow: displayName Test Petal
# lamow: sharpEdge 1 2
o testPetal
v 0 0 0 1 0 0
v 1 0 0 0 1 0
v 0 0 1 0 0 1
v 1 0 1 1 1 1
s 2
f 1 2 4 3
`, { id: "fallback", displayName: "Fallback" });

  assert.equal(mesh.id, "testPetal");
  assert.equal(mesh.displayName, "Test Petal");
  assert.equal(mesh.vertices[0].color, "#ff0000");
  assert.equal(mesh.faces[0].smoothingGroup, "2");
  assert.deepEqual(mesh.sharpEdges, [edgeKey(0, 1)]);
  assert.deepEqual(objPrimitiveEdges(mesh), [edgeKey(0, 1), edgeKey(0, 2), edgeKey(1, 3), edgeKey(2, 3)]);

  const edited = replaceObjPrimitiveVertex(mesh, 1, { x: 1.25, color: "#336699" });
  assert.equal(edited.vertices[1].x, 1.25);
  assert.equal(edited.vertices[1].color, "#336699");

  const smooth = setObjPrimitiveEdgeSharp(edited, edgeKey(0, 1), false);
  assert.deepEqual(smooth.sharpEdges, []);
  const sharp = setObjPrimitiveEdgeSharp(smooth, edgeKey(2, 3), true);
  assert.deepEqual(sharp.sharpEdges, [edgeKey(2, 3)]);

  const serialized = serializeObjPrimitiveMesh(sharp);
  assert.match(serialized, /# lamow: id testPetal/);
  assert.match(serialized, /# lamow: sharpEdge 3 4/);
  assert.match(serialized, /v 1.25 0 0 0.2 0.4 0.6/);
});

test("OBJ vegetation primitive render data triangulates and splits sharp normals", () => {
  const saddle = defaultObjPrimitiveLibrary().find((primitive) => primitive.id === "saddlePetal");
  assert.ok(saddle);
  const renderData = objPrimitiveToRenderData(saddle);
  assert.equal(renderData.positions.length % 3, 0);
  assert.equal(renderData.colors.length, (renderData.positions.length / 3) * 4);
  assert.equal(renderData.indices.length % 3, 0);
  assert.ok(renderData.indices.length > saddle.faces.length * 3);

  const smooth = parseObjPrimitiveMesh(`o smooth
v 0 0 0
v 1 0 0
v 0 0 1
v 1 0 1
s 1
f 1 2 3
f 2 4 3
`, { id: "smooth", displayName: "Smooth" });
  const sharp = setObjPrimitiveEdgeSharp(smooth, edgeKey(1, 2), true);
  assert.ok(objPrimitiveToRenderData(sharp).positions.length > objPrimitiveToRenderData(smooth).positions.length);
});

function assertClose(actual: number, expected: number, epsilon = 0.000001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

function assertVectorClose(actual: Vector3, expected: [number, number, number], epsilon = 0.000001) {
  assertClose(actual.x, expected[0], epsilon);
  assertClose(actual.y, expected[1], epsilon);
  assertClose(actual.z, expected[2], epsilon);
}

function vectorToTuple(vector: Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function assertFiniteVector(vector: Vector3) {
  assert.ok(Number.isFinite(vector.x));
  assert.ok(Number.isFinite(vector.y));
  assert.ok(Number.isFinite(vector.z));
}

function assertFiniteQuaternion(quaternion: { x: number; y: number; z: number; w: number }) {
  assert.ok(Number.isFinite(quaternion.x));
  assert.ok(Number.isFinite(quaternion.y));
  assert.ok(Number.isFinite(quaternion.z));
  assert.ok(Number.isFinite(quaternion.w));
}

function assertOrthonormal(axes: { x: Vector3; y: Vector3; z: Vector3 }) {
  assertClose(axes.x.length(), 1);
  assertClose(axes.y.length(), 1);
  assertClose(axes.z.length(), 1);
  assertClose(Vector3.Dot(axes.x, axes.y), 0);
  assertClose(Vector3.Dot(axes.x, axes.z), 0);
  assertClose(Vector3.Dot(axes.y, axes.z), 0);
}

function horizontalDistance(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
